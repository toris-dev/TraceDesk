use crate::devpulse_secrets::{load_devpulse_secrets, save_devpulse_secrets, DevPulseSecrets};
use crate::llm::secrets::load_secrets;
use crate::settings::{
    default_url_for_llm_provider, save_settings, uses_api_base_url, AppSettings,
};
use crate::settings_commands::SettingsState;
use chrono::{Datelike, Local, Timelike};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::env;
use std::fs;
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

const STATUS_SNIPPET: &str = r#"
import json
import os
import sys
from pathlib import Path

root = Path(os.getcwd())
sys.path.insert(0, str(root))
from pipeline.web.status import build_dashboard_payload

print(json.dumps(build_dashboard_payload(), ensure_ascii=False, default=str))
"#;

const INFRA_SERVICES: &[&str] = &["postgres", "redis", "minio", "qdrant"];

#[derive(Clone, Default)]
pub struct DevPulseState(pub Arc<Mutex<DevPulseRuntime>>);

#[derive(Default)]
pub struct DevPulseRuntime {
    daemon: Option<Child>,
    run_in_flight: bool,
    last_cron_key: Option<String>,
    last_run_at: Option<String>,
    last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DevPulseConfigView {
    pub root_dir: String,
    pub root_ready: bool,
    pub root_exists: bool,
    pub setup_hint: String,
    pub cron_enabled: bool,
    pub cron_expr: String,
    pub feeds: Vec<String>,
    pub topic_filters: Vec<String>,
    pub batch_size: u32,
    pub collect_limit: u32,
    pub idle_poll_sec: u32,
    pub backlog_pause_sec: u32,
    pub bundle_size: u32,
    pub sns_mode: String,
    pub mastodon_instance: String,
    pub has_mastodon_token: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct DevPulseRuntimeView {
    pub daemon_running: bool,
    pub daemon_pid: Option<u32>,
    pub run_in_flight: bool,
    pub last_run_at: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DevPulseDependencyView {
    pub key: String,
    pub label: String,
    pub target: String,
    pub ready: bool,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DevPulseInfraServiceView {
    pub name: String,
    pub running: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct DevPulseInfraStatusView {
    pub docker_available: bool,
    pub docker_daemon_ready: bool,
    pub compose_dir: String,
    pub services: Vec<DevPulseInfraServiceView>,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DevPulseStatusView {
    pub config: DevPulseConfigView,
    pub runtime: DevPulseRuntimeView,
    pub dependencies: Vec<DevPulseDependencyView>,
    pub payload: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDevPulseSettingsArgs {
    pub root_dir: Option<String>,
    pub cron_enabled: Option<bool>,
    pub cron_expr: Option<String>,
    pub feeds: Option<Vec<String>>,
    pub topic_filters: Option<Vec<String>>,
    pub batch_size: Option<u32>,
    pub collect_limit: Option<u32>,
    pub idle_poll_sec: Option<u32>,
    pub backlog_pause_sec: Option<u32>,
    pub bundle_size: Option<u32>,
    pub sns_mode: Option<String>,
    pub mastodon_instance: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDevPulseSecretsArgs {
    pub mastodon_access_token: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DevPulseSecretsStatusView {
    pub has_mastodon_token: bool,
}

fn fallback_root_candidates() -> Vec<PathBuf> {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let mut candidates = vec![cwd.join("../devPulse"), cwd.join("devPulse")];
    if let Some(parent) = cwd.parent() {
        candidates.push(parent.join("devPulse"));
    }
    candidates
}

fn configured_root_path(settings: &AppSettings) -> PathBuf {
    let from_settings = settings.devpulse_root_dir.trim();
    if !from_settings.is_empty() {
        return PathBuf::from(from_settings);
    }
    fallback_root_candidates()
        .into_iter()
        .find(|path| path.exists())
        .unwrap_or_default()
}

fn try_resolve_root(settings: &AppSettings) -> Option<PathBuf> {
    let candidate = configured_root_path(settings);
    if candidate.as_os_str().is_empty() || !candidate.exists() {
        return None;
    }
    candidate.canonicalize().ok()
}

fn resolve_root(settings: &AppSettings) -> Result<PathBuf, String> {
    try_resolve_root(settings).ok_or_else(|| {
        let configured = settings.devpulse_root_dir.trim();
        if configured.is_empty() {
            "devPulse root path is not configured".to_string()
        } else if !PathBuf::from(configured).exists() {
            format!("devPulse root does not exist: {configured}")
        } else {
            format!("failed to resolve devPulse root: {configured}")
        }
    })
}

fn empty_dashboard_payload() -> Value {
    serde_json::json!({
        "progress": {
            "phase": "setup",
            "step": "configure",
            "updated_at": null
        },
        "db": { "counts": {}, "bundle_total": 0, "recent_bundles": [] },
        "bundle": { "slots": [], "percent": 0, "ready": false },
        "artifacts": { "counts": { "cards": 0, "bundles": 0 }, "cards": [], "bundles": [] },
        "logs": { "tail": [] }
    })
}

fn python_bin(root: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let candidate = root.join(".venv").join("Scripts").join("python.exe");
        if candidate.exists() {
            return candidate;
        }
        PathBuf::from("python")
    }
    #[cfg(not(target_os = "windows"))]
    {
        let candidate = root.join(".venv").join("bin").join("python");
        if candidate.exists() {
            return candidate;
        }
        PathBuf::from("python3")
    }
}

fn output_dir(root: &Path) -> PathBuf {
    root.join("output")
}

fn infra_dir(root: &Path) -> PathBuf {
    root.join("infra")
}

fn bridge_pythonpath(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("devpulse_bridge");
        if bundled.exists() {
            return Some(bundled);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let sibling = parent.join("devpulse_bridge");
            if sibling.exists() {
                return Some(sibling);
            }
        }
    }
    std::env::current_dir()
        .ok()
        .map(|cwd| cwd.join("src-tauri").join("devpulse_bridge"))
        .filter(|path| path.exists())
}

fn allow_output_dir(app: &AppHandle, root: &Path) {
    let output = output_dir(root);
    if output.exists() {
        let _ = app.asset_protocol_scope().allow_directory(&output, true);
    }
}

fn build_config_view(settings: &AppSettings, root: Option<&Path>) -> DevPulseConfigView {
    let secrets = load_devpulse_secrets();
    let configured = configured_root_path(settings);
    let configured_text = settings.devpulse_root_dir.trim().to_string();
    let (root_dir, root_ready, root_exists, setup_hint) = match root {
        Some(path) => (
            path.display().to_string(),
            true,
            true,
            String::new(),
        ),
        None => {
            let display = if configured_text.is_empty() {
                String::new()
            } else {
                configured_text.clone()
            };
            let exists = !configured.as_os_str().is_empty() && configured.exists();
            let hint = if configured_text.is_empty() {
                "Set the devPulse project folder path in Pulse settings.".to_string()
            } else if !exists {
                format!("devPulse path not found: {configured_text}")
            } else {
                format!("Unable to access devPulse root: {configured_text}")
            };
            (display, false, exists, hint)
        }
    };
    DevPulseConfigView {
        root_dir,
        root_ready,
        root_exists,
        setup_hint,
        cron_enabled: settings.devpulse_cron_enabled,
        cron_expr: settings.devpulse_cron_expr.clone(),
        feeds: settings.devpulse_feeds.clone(),
        topic_filters: settings.devpulse_topic_filters.clone(),
        batch_size: settings.devpulse_batch_size,
        collect_limit: settings.devpulse_collect_limit,
        idle_poll_sec: settings.devpulse_idle_poll_sec,
        backlog_pause_sec: settings.devpulse_backlog_pause_sec,
        bundle_size: settings.devpulse_bundle_size,
        sns_mode: settings.devpulse_sns_mode.clone(),
        mastodon_instance: settings.devpulse_mastodon_instance.clone(),
        has_mastodon_token: !secrets.mastodon_access_token.trim().is_empty(),
    }
}

fn build_runtime_view(runtime: &mut DevPulseRuntime) -> DevPulseRuntimeView {
    let mut daemon_running = false;
    let mut daemon_pid = None;
    if let Some(child) = runtime.daemon.as_mut() {
        match child.try_wait() {
            Ok(Some(_)) => {
                runtime.daemon = None;
            }
            Ok(None) => {
                daemon_running = true;
                daemon_pid = Some(child.id());
            }
            Err(e) => {
                runtime.last_error = Some(format!("daemon status check failed: {e}"));
                runtime.daemon = None;
            }
        }
    }

    DevPulseRuntimeView {
        daemon_running,
        daemon_pid,
        run_in_flight: runtime.run_in_flight,
        last_run_at: runtime.last_run_at.clone(),
        last_error: runtime.last_error.clone(),
    }
}

fn read_devpulse_env(root: &Path) -> Vec<(String, String)> {
    let env_path = root.join("infra").join(".env");
    let Ok(raw) = fs::read_to_string(env_path) else {
        return Vec::new();
    };
    raw.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .filter_map(|line| line.split_once('='))
        .map(|(key, value)| {
            (
                key.trim().to_string(),
                value.trim().trim_matches('"').trim_matches('\'').to_string(),
            )
        })
        .collect()
}

fn env_lookup(entries: &[(String, String)], key: &str) -> Option<String> {
    entries
        .iter()
        .find(|(entry_key, _)| entry_key == key)
        .map(|(_, value)| value.clone())
}

fn probe_socket(host: &str, port: u16) -> Result<(), String> {
    let addrs: Vec<SocketAddr> = (host, port)
        .to_socket_addrs()
        .map_err(|e| format!("resolve failed: {e}"))?
        .collect();
    let Some(addr) = addrs.first().copied() else {
        return Err("no socket address resolved".to_string());
    };
    TcpStream::connect_timeout(&addr, Duration::from_millis(900))
        .map(|_| ())
        .map_err(|e| e.to_string())
}

fn parse_url_host_port(value: &str) -> Result<(String, u16), String> {
    let url = Url::parse(value).map_err(|e| format!("invalid url: {e}"))?;
    let host = url
        .host_str()
        .ok_or_else(|| "missing host".to_string())?
        .to_string();
    let port = url
        .port_or_known_default()
        .ok_or_else(|| "missing port".to_string())?;
    Ok((host, port))
}

fn parse_database_host_port(value: &str) -> Result<(String, u16), String> {
    let url = Url::parse(value).map_err(|e| format!("invalid database url: {e}"))?;
    let host = url
        .host_str()
        .ok_or_else(|| "missing host".to_string())?
        .to_string();
    Ok((host, url.port().unwrap_or(5432)))
}

fn dependency_view(
    key: &str,
    label: &str,
    target: String,
    probe: Result<(), String>,
) -> DevPulseDependencyView {
    match probe {
        Ok(()) => DevPulseDependencyView {
            key: key.to_string(),
            label: label.to_string(),
            target,
            ready: true,
            detail: "ready".to_string(),
        },
        Err(detail) => DevPulseDependencyView {
            key: key.to_string(),
            label: label.to_string(),
            target,
            ready: false,
            detail,
        },
    }
}

fn build_dependency_views(root: &Path, settings: &AppSettings) -> Vec<DevPulseDependencyView> {
    let env_entries = read_devpulse_env(root);
    let llm_provider = settings.llm_provider.trim().to_string();
    let llm_base_url = if uses_api_base_url(&llm_provider) {
        let configured = settings.api_base_url.trim();
        if configured.is_empty() {
            default_url_for_llm_provider(&llm_provider)
        } else {
            configured.to_string()
        }
    } else {
        let configured = settings.ollama_base_url.trim();
        if configured.is_empty() {
            default_url_for_llm_provider(&llm_provider)
        } else {
            configured.to_string()
        }
    };
    let database_url = env_lookup(&env_entries, "DATABASE_URL")
        .unwrap_or_else(|| "postgresql://devpulse:devpulse@localhost:5434/devpulse".to_string());
    let minio_endpoint =
        env_lookup(&env_entries, "MINIO_ENDPOINT").unwrap_or_else(|| "http://localhost:9000".to_string());
    let qdrant_url =
        env_lookup(&env_entries, "QDRANT_URL").unwrap_or_else(|| "http://localhost:6333".to_string());

    let python = python_bin(root);
    let python_target = python.display().to_string();
    let python_probe = if python.exists() {
        Ok(())
    } else {
        Err("python executable not found".to_string())
    };

    let database_target = database_url.clone();
    let database_probe = parse_database_host_port(&database_url).and_then(|(host, port)| probe_socket(&host, port));
    let minio_target = minio_endpoint.clone();
    let minio_probe = parse_url_host_port(&minio_endpoint).and_then(|(host, port)| probe_socket(&host, port));
    let qdrant_target = qdrant_url.clone();
    let qdrant_probe = parse_url_host_port(&qdrant_url).and_then(|(host, port)| probe_socket(&host, port));
    let llm_target = llm_base_url.clone();
    let llm_probe = parse_url_host_port(&llm_base_url).and_then(|(host, port)| probe_socket(&host, port));

    vec![
        dependency_view("python", "Python", python_target, python_probe),
        dependency_view("database", "Postgres", database_target, database_probe),
        dependency_view("minio", "MinIO", minio_target, minio_probe),
        dependency_view("qdrant", "Qdrant", qdrant_target, qdrant_probe),
        dependency_view(
            "llm",
            &format!("LLM / {}", llm_provider),
            llm_target,
            llm_probe,
        ),
    ]
}

fn docker_available() -> Result<(), String> {
    Command::new("docker")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("docker not found: {e}"))
        .and_then(|output| {
            if output.status.success() {
                Ok(())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                Err(if stderr.is_empty() {
                    "docker --version failed".to_string()
                } else {
                    stderr
                })
            }
        })
}

fn docker_daemon_ready() -> Result<(), String> {
    Command::new("docker")
        .arg("info")
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("docker info failed: {e}"))
        .and_then(|output| {
            if output.status.success() {
                Ok(())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                Err(if stderr.is_empty() {
                    "docker daemon is not ready".to_string()
                } else {
                    stderr
                })
            }
        })
}

fn docker_compose_command(root: &Path) -> Command {
    let mut cmd = Command::new("docker");
    cmd.current_dir(infra_dir(root))
        .arg("compose")
        .arg("-f")
        .arg("docker-compose.yml");
    cmd
}

fn list_running_infra_services(root: &Path) -> Result<Vec<String>, String> {
    let output = docker_compose_command(root)
        .arg("ps")
        .arg("--services")
        .arg("--status")
        .arg("running")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("docker compose ps failed: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "docker compose ps failed".to_string()
        } else {
            stderr
        });
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect())
}

fn build_infra_status_without_root() -> DevPulseInfraStatusView {
    let docker_check = docker_available();
    if let Err(detail) = docker_check {
        return DevPulseInfraStatusView {
            docker_available: false,
            docker_daemon_ready: false,
            compose_dir: String::new(),
            services: INFRA_SERVICES
                .iter()
                .map(|name| DevPulseInfraServiceView {
                    name: (*name).to_string(),
                    running: false,
                })
                .collect(),
            detail,
        };
    }

    let daemon_check = docker_daemon_ready();
    if let Err(detail) = daemon_check {
        return DevPulseInfraStatusView {
            docker_available: true,
            docker_daemon_ready: false,
            compose_dir: String::new(),
            services: INFRA_SERVICES
                .iter()
                .map(|name| DevPulseInfraServiceView {
                    name: (*name).to_string(),
                    running: false,
                })
                .collect(),
            detail,
        };
    }

    DevPulseInfraStatusView {
        docker_available: true,
        docker_daemon_ready: true,
        compose_dir: String::new(),
        services: INFRA_SERVICES
            .iter()
            .map(|name| DevPulseInfraServiceView {
                name: (*name).to_string(),
                running: false,
            })
            .collect(),
        detail: "Configure devPulse root to manage Postgres/Redis/MinIO/Qdrant.".to_string(),
    }
}

fn build_infra_status(root: &Path) -> DevPulseInfraStatusView {
    let compose_dir = infra_dir(root);
    let compose_dir_text = compose_dir.display().to_string();

    let docker_check = docker_available();
    if let Err(detail) = docker_check {
        return DevPulseInfraStatusView {
            docker_available: false,
            docker_daemon_ready: false,
            compose_dir: compose_dir_text,
            services: INFRA_SERVICES
                .iter()
                .map(|name| DevPulseInfraServiceView {
                    name: (*name).to_string(),
                    running: false,
                })
                .collect(),
            detail,
        };
    }

    let daemon_check = docker_daemon_ready();
    if let Err(detail) = daemon_check {
        return DevPulseInfraStatusView {
            docker_available: true,
            docker_daemon_ready: false,
            compose_dir: compose_dir_text,
            services: INFRA_SERVICES
                .iter()
                .map(|name| DevPulseInfraServiceView {
                    name: (*name).to_string(),
                    running: false,
                })
                .collect(),
            detail,
        };
    }

    match list_running_infra_services(root) {
        Ok(running) => {
            let services = INFRA_SERVICES
                .iter()
                .map(|name| DevPulseInfraServiceView {
                    name: (*name).to_string(),
                    running: running.iter().any(|item| item == name),
                })
                .collect::<Vec<_>>();
            let up_count = services.iter().filter(|service| service.running).count();
            DevPulseInfraStatusView {
                docker_available: true,
                docker_daemon_ready: true,
                compose_dir: compose_dir_text,
                services,
                detail: format!("{up_count}/{} services running", INFRA_SERVICES.len()),
            }
        }
        Err(detail) => DevPulseInfraStatusView {
            docker_available: true,
            docker_daemon_ready: true,
            compose_dir: compose_dir_text,
            services: INFRA_SERVICES
                .iter()
                .map(|name| DevPulseInfraServiceView {
                    name: (*name).to_string(),
                    running: false,
                })
                .collect(),
            detail,
        },
    }
}

fn configure_env(cmd: &mut Command, settings: &AppSettings, bridge_dir: Option<&Path>) {
    let provider = settings.llm_provider.trim();
    let base_url = if uses_api_base_url(provider) {
        settings.api_base_url.trim()
    } else {
        settings.ollama_base_url.trim()
    };
    let secrets = load_secrets();

    cmd.env("LLM_PROVIDER", provider)
        .env(
            "LLM_BASE_URL",
            if base_url.is_empty() {
                default_url_for_llm_provider(provider)
            } else {
                base_url.to_string()
            },
        )
        .env("LLM_MODEL", settings.llm_model.trim())
        .env("SNS_MODE", settings.devpulse_sns_mode.trim())
        .env(
            "MASTODON_INSTANCE",
            settings.devpulse_mastodon_instance.trim(),
        )
        .env("FEEDS", settings.devpulse_feeds.join(" "))
        .env(
            "DEVPULSE_TOPIC_FILTERS",
            settings.devpulse_topic_filters.join("\n"),
        )
        .env("BATCH_SIZE", settings.devpulse_batch_size.to_string())
        .env("COLLECT_LIMIT", settings.devpulse_collect_limit.to_string())
        .env("IDLE_POLL_SEC", settings.devpulse_idle_poll_sec.to_string())
        .env(
            "BACKLOG_PAUSE_SEC",
            settings.devpulse_backlog_pause_sec.to_string(),
        )
        .env("BUNDLE_SIZE", settings.devpulse_bundle_size.to_string());

    if let Some(bridge_dir) = bridge_dir {
        let mut parts = vec![bridge_dir.display().to_string()];
        if let Some(existing) = env::var_os("PYTHONPATH") {
            let existing = existing.to_string_lossy().trim().to_string();
            if !existing.is_empty() {
                parts.push(existing);
            }
        }
        let joined = env::join_paths(parts.iter().map(PathBuf::from))
            .ok()
            .and_then(|value| value.into_string().ok())
            .unwrap_or_else(|| parts.join(":"));
        cmd.env("PYTHONPATH", joined);
    }

    if !secrets.api_key.trim().is_empty() {
        cmd.env("OPENAI_API_KEY", secrets.api_key.trim());
    }

    let devpulse_secrets = load_devpulse_secrets();
    if !devpulse_secrets.mastodon_access_token.trim().is_empty() {
        cmd.env(
            "MASTODON_ACCESS_TOKEN",
            devpulse_secrets.mastodon_access_token.trim(),
        );
    }
}

fn absolutize_output_reference(root: &Path, value: &str) -> Option<String> {
    let relative = value
        .strip_prefix("/output/")
        .or_else(|| value.strip_prefix("output/"))?;
    let path = output_dir(root).join(relative);
    Some(path.display().to_string())
}

fn rewrite_payload_paths(root: &Path, value: &mut Value) {
    match value {
        Value::String(text) => {
            if let Some(path) = absolutize_output_reference(root, text) {
                *text = path;
            }
        }
        Value::Array(items) => {
            for item in items {
                rewrite_payload_paths(root, item);
            }
        }
        Value::Object(map) => {
            for item in map.values_mut() {
                rewrite_payload_paths(root, item);
            }
        }
        _ => {}
    }
}

fn run_status_payload(
    root: &Path,
    settings: &AppSettings,
    bridge_dir: Option<&Path>,
) -> Result<Value, String> {
    let python = python_bin(root);
    let mut cmd = Command::new(python);
    cmd.current_dir(root)
        .arg("-c")
        .arg(STATUS_SNIPPET)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure_env(&mut cmd, settings, bridge_dir);

    let output = cmd
        .output()
        .map_err(|e| format!("failed to run devPulse status: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "devPulse status command failed".to_string()
        } else {
            stderr
        });
    }

    let stdout = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;
    let mut payload = serde_json::from_str::<Value>(&stdout)
        .map_err(|e| format!("invalid devPulse status json: {e}"))?;
    rewrite_payload_paths(root, &mut payload);
    Ok(payload)
}

fn run_cli_json(
    root: &Path,
    settings: &AppSettings,
    args: &[&str],
    bridge_dir: Option<&Path>,
) -> Result<Value, String> {
    let python = python_bin(root);
    let mut cmd = Command::new(python);
    cmd.current_dir(root)
        .arg("pipeline/cli.py")
        .args(args)
        .arg("--json")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure_env(&mut cmd, settings, bridge_dir);

    let output = cmd
        .output()
        .map_err(|e| format!("failed to run devPulse command: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "devPulse command failed".to_string()
        } else {
            stderr
        });
    }

    let stdout = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;
    serde_json::from_str::<Value>(&stdout)
        .map_err(|e| format!("invalid devPulse command json: {e}"))
}

fn cron_key_now() -> String {
    let now = Local::now();
    format!(
        "{:04}-{:02}-{:02}-{:02}-{:02}",
        now.year(),
        now.month(),
        now.day(),
        now.hour(),
        now.minute()
    )
}

fn parse_atom(token: &str, value: u32, min: u32, max: u32) -> Result<bool, String> {
    if token == "*" {
        return Ok(true);
    }
    if let Some((base, step)) = token.split_once('/') {
        let step = step
            .parse::<u32>()
            .map_err(|_| format!("invalid cron step: {token}"))?;
        if step == 0 {
            return Err("cron step cannot be 0".to_string());
        }
        let start = if base == "*" {
            min
        } else {
            let parsed = base
                .parse::<u32>()
                .map_err(|_| format!("invalid cron number: {token}"))?;
            parsed.clamp(min, max)
        };
        return Ok(value >= start && (value - start).is_multiple_of(step));
    }
    if let Some((a, b)) = token.split_once('-') {
        let start = a
            .parse::<u32>()
            .map_err(|_| format!("invalid cron range: {token}"))?;
        let end = b
            .parse::<u32>()
            .map_err(|_| format!("invalid cron range: {token}"))?;
        return Ok(value >= start && value <= end);
    }
    let parsed = token
        .parse::<u32>()
        .map_err(|_| format!("invalid cron value: {token}"))?;
    if parsed < min || parsed > max {
        return Err(format!("cron value out of range: {token}"));
    }
    Ok(value == parsed)
}

fn cron_field_matches(field: &str, value: u32, min: u32, max: u32) -> Result<bool, String> {
    let mut matched = false;
    for token in field
        .split(',')
        .map(str::trim)
        .filter(|token| !token.is_empty())
    {
        if parse_atom(token, value, min, max)? {
            matched = true;
            break;
        }
    }
    Ok(matched)
}

fn cron_matches(expr: &str) -> Result<bool, String> {
    let parts: Vec<&str> = expr.split_whitespace().collect();
    if parts.len() != 5 {
        return Err("cron expression must have 5 fields".to_string());
    }

    let now = Local::now();
    Ok(cron_field_matches(parts[0], now.minute(), 0, 59)?
        && cron_field_matches(parts[1], now.hour(), 0, 23)?
        && cron_field_matches(parts[2], now.day(), 1, 31)?
        && cron_field_matches(parts[3], now.month(), 1, 12)?
        && cron_field_matches(parts[4], now.weekday().num_days_from_sunday(), 0, 6)?)
}

async fn spawn_run_now(
    app: AppHandle,
    settings_state: SettingsState,
    runtime_state: DevPulseState,
    mode: String,
) {
    let settings = match settings_state.0.read() {
        Ok(guard) => guard.clone(),
        Err(e) => {
            if let Ok(mut runtime) = runtime_state.0.lock() {
                runtime.run_in_flight = false;
                runtime.last_error = Some(e.to_string());
            }
            return;
        }
    };

    let root = match resolve_root(&settings) {
        Ok(root) => root,
        Err(e) => {
            if let Ok(mut runtime) = runtime_state.0.lock() {
                runtime.run_in_flight = false;
                runtime.last_error = Some(e);
            }
            return;
        }
    };

    allow_output_dir(&app, &root);
    let bridge_dir = bridge_pythonpath(&app);
    let args = match mode.as_str() {
        "collect" => vec!["collect", "--quiet"],
        "bundle" => vec!["bundle", "--quiet"],
        "cleanup" => vec!["cleanup", "--quiet"],
        _ => vec!["run", "--quiet"],
    };

    let result = tauri::async_runtime::spawn_blocking(move || {
        run_cli_json(&root, &settings, &args, bridge_dir.as_deref())
    })
            .await
            .map_err(|e| e.to_string())
            .and_then(|res| res);

    if let Ok(mut runtime) = runtime_state.0.lock() {
        runtime.run_in_flight = false;
        runtime.last_run_at = Some(Local::now().to_rfc3339());
        runtime.last_error = result.err();
    }
}

pub fn spawn_scheduler(
    app: AppHandle,
    settings_state: SettingsState,
    runtime_state: DevPulseState,
) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(20)).await;

            let settings = match settings_state.0.read() {
                Ok(guard) => guard.clone(),
                Err(_) => continue,
            };

            if !settings.devpulse_cron_enabled {
                continue;
            }
            if settings.devpulse_cron_expr.trim().is_empty() {
                continue;
            }

            let matched = match cron_matches(&settings.devpulse_cron_expr) {
                Ok(value) => value,
                Err(error) => {
                    if let Ok(mut runtime) = runtime_state.0.lock() {
                        runtime.last_error = Some(error);
                    }
                    continue;
                }
            };
            if !matched {
                continue;
            }

            let key = cron_key_now();
            let should_run = {
                let mut runtime = match runtime_state.0.lock() {
                    Ok(runtime) => runtime,
                    Err(_) => continue,
                };
                if runtime.run_in_flight {
                    false
                } else if runtime.last_cron_key.as_deref() == Some(key.as_str()) {
                    false
                } else {
                    runtime.run_in_flight = true;
                    runtime.last_cron_key = Some(key);
                    true
                }
            };

            if should_run {
                let app_handle = app.clone();
                let settings_handle = settings_state.clone();
                let runtime_handle = DevPulseState(runtime_state.0.clone());
                tauri::async_runtime::spawn(async move {
                    spawn_run_now(
                        app_handle,
                        settings_handle,
                        runtime_handle,
                        "run".to_string(),
                    )
                    .await;
                });
            }
        }
    });
}

#[tauri::command]
pub fn get_devpulse_config(state: State<SettingsState>) -> Result<DevPulseConfigView, String> {
    let settings = state.0.read().map_err(|e| e.to_string())?.clone();
    let root = try_resolve_root(&settings);
    Ok(build_config_view(&settings, root.as_deref()))
}

#[tauri::command]
pub fn update_devpulse_settings(
    state: State<SettingsState>,
    args: UpdateDevPulseSettingsArgs,
) -> Result<DevPulseConfigView, String> {
    let mut settings = state.0.write().map_err(|e| e.to_string())?;

    if let Some(root) = args.root_dir {
        settings.devpulse_root_dir = root.trim().to_string();
    }
    if let Some(enabled) = args.cron_enabled {
        settings.devpulse_cron_enabled = enabled;
    }
    if let Some(expr) = args.cron_expr {
        settings.devpulse_cron_expr = expr.trim().to_string();
    }
    if let Some(feeds) = args.feeds {
        settings.devpulse_feeds = feeds
            .into_iter()
            .map(|feed| feed.trim().to_string())
            .filter(|feed| !feed.is_empty())
            .collect();
        if settings.devpulse_feeds.is_empty() {
            settings.devpulse_feeds = default_devpulse_feeds();
        }
    }
    if let Some(filters) = args.topic_filters {
        settings.devpulse_topic_filters = filters
            .into_iter()
            .map(|filter| filter.trim().to_string())
            .filter(|filter| !filter.is_empty())
            .collect();
    }
    if let Some(batch) = args.batch_size {
        settings.devpulse_batch_size = batch.clamp(1, 50);
    }
    if let Some(limit) = args.collect_limit {
        settings.devpulse_collect_limit = limit.min(500);
    }
    if let Some(idle) = args.idle_poll_sec {
        settings.devpulse_idle_poll_sec = idle.clamp(10, 86_400);
    }
    if let Some(backlog) = args.backlog_pause_sec {
        settings.devpulse_backlog_pause_sec = backlog.clamp(0, 3_600);
    }
    if let Some(size) = args.bundle_size {
        settings.devpulse_bundle_size = size.clamp(1, 24);
    }
    if let Some(mode) = args.sns_mode {
        settings.devpulse_sns_mode = if mode.trim().eq_ignore_ascii_case("mastodon") {
            "mastodon".into()
        } else {
            "file".into()
        };
    }
    if let Some(instance) = args.mastodon_instance {
        settings.devpulse_mastodon_instance = instance.trim().to_string();
    }

    save_settings(&settings).map_err(|e| e.to_string())?;
    let root = try_resolve_root(&settings);
    Ok(build_config_view(&settings, root.as_deref()))
}

#[tauri::command]
pub fn get_devpulse_secrets_status() -> DevPulseSecretsStatusView {
    DevPulseSecretsStatusView {
        has_mastodon_token: has_mastodon_token(),
    }
}

#[tauri::command]
pub fn update_devpulse_secrets(
    args: UpdateDevPulseSecretsArgs,
) -> Result<DevPulseSecretsStatusView, String> {
    let token = args.mastodon_access_token.unwrap_or_default();
    save_devpulse_secrets(&DevPulseSecrets {
        mastodon_access_token: token,
    })
    .map_err(|e| e.to_string())?;
    Ok(DevPulseSecretsStatusView {
        has_mastodon_token: has_mastodon_token(),
    })
}

fn has_mastodon_token() -> bool {
    !load_devpulse_secrets()
        .mastodon_access_token
        .trim()
        .is_empty()
}

#[tauri::command]
pub fn get_devpulse_status(
    app: AppHandle,
    settings_state: State<SettingsState>,
    runtime_state: State<DevPulseState>,
) -> Result<DevPulseStatusView, String> {
    let settings = settings_state.0.read().map_err(|e| e.to_string())?.clone();
    let mut runtime = runtime_state.0.lock().map_err(|e| e.to_string())?;
    let bridge_dir = bridge_pythonpath(&app);

    let Some(root) = try_resolve_root(&settings) else {
        return Ok(DevPulseStatusView {
            config: build_config_view(&settings, None),
            runtime: build_runtime_view(&mut runtime),
            dependencies: Vec::new(),
            payload: empty_dashboard_payload(),
        });
    };

    allow_output_dir(&app, &root);
    let dependencies = build_dependency_views(&root, &settings);
    let payload = match run_status_payload(&root, &settings, bridge_dir.as_deref()) {
        Ok(payload) => {
            runtime.last_error = None;
            payload
        }
        Err(error) => {
            runtime.last_error = Some(error);
            empty_dashboard_payload()
        }
    };

    Ok(DevPulseStatusView {
        config: build_config_view(&settings, Some(&root)),
        runtime: build_runtime_view(&mut runtime),
        dependencies,
        payload,
    })
}

#[tauri::command]
pub fn get_devpulse_infra_status(
    settings_state: State<SettingsState>,
) -> Result<DevPulseInfraStatusView, String> {
    let settings = settings_state.0.read().map_err(|e| e.to_string())?.clone();
    if let Some(root) = try_resolve_root(&settings) {
        return Ok(build_infra_status(&root));
    }
    Ok(build_infra_status_without_root())
}

#[tauri::command]
pub fn start_devpulse_infra(
    settings_state: State<SettingsState>,
) -> Result<DevPulseInfraStatusView, String> {
    let settings = settings_state.0.read().map_err(|e| e.to_string())?.clone();
    let root = resolve_root(&settings)?;
    docker_available()?;
    docker_daemon_ready()?;

    let output = docker_compose_command(&root)
        .arg("up")
        .arg("-d")
        .arg("postgres")
        .arg("redis")
        .arg("minio")
        .arg("minio-init")
        .arg("qdrant")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("failed to start devPulse infra: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "docker compose up failed".to_string()
        } else {
            stderr
        });
    }

    Ok(build_infra_status(&root))
}

#[tauri::command]
pub fn stop_devpulse_infra(
    settings_state: State<SettingsState>,
) -> Result<DevPulseInfraStatusView, String> {
    let settings = settings_state.0.read().map_err(|e| e.to_string())?.clone();
    let root = resolve_root(&settings)?;
    docker_available()?;
    docker_daemon_ready()?;

    let output = docker_compose_command(&root)
        .arg("stop")
        .args(INFRA_SERVICES)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("failed to stop devPulse infra: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "docker compose stop failed".to_string()
        } else {
            stderr
        });
    }

    Ok(build_infra_status(&root))
}

#[tauri::command]
pub async fn run_devpulse_now(
    app: AppHandle,
    settings_state: State<'_, SettingsState>,
    runtime_state: State<'_, DevPulseState>,
    mode: Option<String>,
) -> Result<Value, String> {
    {
        let mut runtime = runtime_state.0.lock().map_err(|e| e.to_string())?;
        if runtime.run_in_flight {
            return Err("devPulse job already running".to_string());
        }
        runtime.run_in_flight = true;
    }

    let mode = mode.unwrap_or_else(|| "run".to_string());
    let settings = settings_state.0.read().map_err(|e| e.to_string())?.clone();
    let root = resolve_root(&settings)?;
    allow_output_dir(&app, &root);
    let bridge_dir = bridge_pythonpath(&app);

    let args = match mode.as_str() {
        "collect" => vec!["collect", "--quiet"],
        "bundle" => vec!["bundle", "--quiet"],
        "cleanup" => vec!["cleanup", "--quiet"],
        _ => vec!["run", "--quiet"],
    };

    let result = tauri::async_runtime::spawn_blocking(move || {
        run_cli_json(&root, &settings, &args, bridge_dir.as_deref())
    })
            .await
            .map_err(|e| e.to_string())?;

    let mut runtime = runtime_state.0.lock().map_err(|e| e.to_string())?;
    runtime.run_in_flight = false;
    runtime.last_run_at = Some(Local::now().to_rfc3339());
    if let Err(error) = &result {
        runtime.last_error = Some(error.clone());
    } else {
        runtime.last_error = None;
    }
    result
}

#[tauri::command]
pub fn start_devpulse_daemon(
    app: AppHandle,
    settings_state: State<SettingsState>,
    runtime_state: State<DevPulseState>,
) -> Result<DevPulseRuntimeView, String> {
    let settings = settings_state.0.read().map_err(|e| e.to_string())?.clone();
    let root = resolve_root(&settings)?;
    let python = python_bin(&root);
    let bridge_dir = bridge_pythonpath(&app);

    let mut runtime = runtime_state.0.lock().map_err(|e| e.to_string())?;
    if runtime.daemon.is_some() {
        return Ok(build_runtime_view(&mut runtime));
    }

    let mut cmd = Command::new(python);
    cmd.current_dir(&root)
        .arg("scripts/run_daemon.py")
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    configure_env(&mut cmd, &settings, bridge_dir.as_deref());

    let child = cmd
        .spawn()
        .map_err(|e| format!("failed to start devPulse daemon: {e}"))?;
    runtime.daemon = Some(child);
    runtime.last_error = None;
    Ok(build_runtime_view(&mut runtime))
}

#[tauri::command]
pub fn stop_devpulse_daemon(
    runtime_state: State<DevPulseState>,
) -> Result<DevPulseRuntimeView, String> {
    let mut runtime = runtime_state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = runtime.daemon.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok(build_runtime_view(&mut runtime))
}

pub fn default_devpulse_feeds() -> Vec<String> {
    vec![
        "all".into(),
        "new".into(),
        "ask".into(),
        "show".into(),
        "top".into(),
    ]
}

#[tauri::command]
pub fn pick_devpulse_root_dir(
    app: AppHandle,
    state: State<SettingsState>,
) -> Result<DevPulseConfigView, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Select devPulse project folder")
        .blocking_pick_folder();

    let Some(file_path) = picked else {
        let settings = state.0.read().map_err(|e| e.to_string())?.clone();
        let root = try_resolve_root(&settings);
        return Ok(build_config_view(&settings, root.as_deref()));
    };

    let path_buf: PathBuf = file_path
        .into_path()
        .map_err(|e| format!("invalid folder path: {e}"))?;

    let mut settings = state.0.write().map_err(|e| e.to_string())?;
    settings.devpulse_root_dir = path_buf.display().to_string();
    save_settings(&settings).map_err(|e| e.to_string())?;
    let root = try_resolve_root(&settings);
    Ok(build_config_view(&settings, root.as_deref()))
}
