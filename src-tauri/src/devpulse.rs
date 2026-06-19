use crate::devpulse_secrets::{load_devpulse_secrets, save_devpulse_secrets, DevPulseSecrets};
use crate::llm::secrets::load_secrets;
use crate::settings::{default_url_for_llm_provider, save_settings, uses_api_base_url, AppSettings};
use crate::settings_commands::SettingsState;
use chrono::{Datelike, Local, Timelike};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::env;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State};

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
    pub cron_enabled: bool,
    pub cron_expr: String,
    pub feeds: Vec<String>,
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
pub struct DevPulseStatusView {
    pub config: DevPulseConfigView,
    pub runtime: DevPulseRuntimeView,
    pub payload: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDevPulseSettingsArgs {
    pub root_dir: Option<String>,
    pub cron_enabled: Option<bool>,
    pub cron_expr: Option<String>,
    pub feeds: Option<Vec<String>>,
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

fn resolve_root(settings: &AppSettings) -> Result<PathBuf, String> {
    let from_settings = settings.devpulse_root_dir.trim();
    let candidate = if from_settings.is_empty() {
        fallback_root_candidates()
            .into_iter()
            .find(|path| path.exists())
            .ok_or_else(|| "devPulse root not found".to_string())?
    } else {
        PathBuf::from(from_settings)
    };

    candidate
        .canonicalize()
        .map_err(|e| format!("failed to resolve devPulse root: {e}"))
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

fn bridge_pythonpath() -> Option<PathBuf> {
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

fn build_config_view(settings: &AppSettings, root: &Path) -> DevPulseConfigView {
    let secrets = load_devpulse_secrets();
    DevPulseConfigView {
        root_dir: root.display().to_string(),
        cron_enabled: settings.devpulse_cron_enabled,
        cron_expr: settings.devpulse_cron_expr.clone(),
        feeds: settings.devpulse_feeds.clone(),
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

fn configure_env(cmd: &mut Command, settings: &AppSettings) {
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
        .env("MASTODON_INSTANCE", settings.devpulse_mastodon_instance.trim())
        .env("FEEDS", settings.devpulse_feeds.join(" "))
        .env("BATCH_SIZE", settings.devpulse_batch_size.to_string())
        .env("COLLECT_LIMIT", settings.devpulse_collect_limit.to_string())
        .env("IDLE_POLL_SEC", settings.devpulse_idle_poll_sec.to_string())
        .env(
            "BACKLOG_PAUSE_SEC",
            settings.devpulse_backlog_pause_sec.to_string(),
        )
        .env("BUNDLE_SIZE", settings.devpulse_bundle_size.to_string());

    if let Some(bridge_dir) = bridge_pythonpath() {
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

fn run_status_payload(root: &Path, settings: &AppSettings) -> Result<Value, String> {
    let python = python_bin(root);
    let mut cmd = Command::new(python);
    cmd.current_dir(root)
        .arg("-c")
        .arg(STATUS_SNIPPET)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure_env(&mut cmd, settings);

    let output = cmd.output().map_err(|e| format!("failed to run devPulse status: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "devPulse status command failed".to_string()
        } else {
            stderr
        });
    }

    let stdout = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;
    let mut payload =
        serde_json::from_str::<Value>(&stdout).map_err(|e| format!("invalid devPulse status json: {e}"))?;
    rewrite_payload_paths(root, &mut payload);
    Ok(payload)
}

fn run_cli_json(root: &Path, settings: &AppSettings, args: &[&str]) -> Result<Value, String> {
    let python = python_bin(root);
    let mut cmd = Command::new(python);
    cmd.current_dir(root)
        .arg("pipeline/cli.py")
        .args(args)
        .arg("--json")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure_env(&mut cmd, settings);

    let output = cmd.output().map_err(|e| format!("failed to run devPulse command: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "devPulse command failed".to_string()
        } else {
            stderr
        });
    }

    let stdout = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;
    serde_json::from_str::<Value>(&stdout).map_err(|e| format!("invalid devPulse command json: {e}"))
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
    for token in field.split(',').map(str::trim).filter(|token| !token.is_empty()) {
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
    Ok(
        cron_field_matches(parts[0], now.minute(), 0, 59)?
            && cron_field_matches(parts[1], now.hour(), 0, 23)?
            && cron_field_matches(parts[2], now.day(), 1, 31)?
            && cron_field_matches(parts[3], now.month(), 1, 12)?
            && cron_field_matches(parts[4], now.weekday().num_days_from_sunday(), 0, 6)?,
    )
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
    let args = match mode.as_str() {
        "collect" => vec!["collect", "--quiet"],
        "bundle" => vec!["bundle", "--quiet"],
        "cleanup" => vec!["cleanup", "--quiet"],
        _ => vec!["run", "--quiet"],
    };

    let result = tauri::async_runtime::spawn_blocking(move || run_cli_json(&root, &settings, &args))
        .await
        .map_err(|e| e.to_string())
        .and_then(|res| res);

    if let Ok(mut runtime) = runtime_state.0.lock() {
        runtime.run_in_flight = false;
        runtime.last_run_at = Some(Local::now().to_rfc3339());
        runtime.last_error = result.err();
    }
}

pub fn spawn_scheduler(app: AppHandle, settings_state: SettingsState, runtime_state: DevPulseState) {
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
                    spawn_run_now(app_handle, settings_handle, runtime_handle, "run".to_string())
                        .await;
                });
            }
        }
    });
}

#[tauri::command]
pub fn get_devpulse_config(state: State<SettingsState>) -> Result<DevPulseConfigView, String> {
    let settings = state.0.read().map_err(|e| e.to_string())?.clone();
    let root = resolve_root(&settings)?;
    Ok(build_config_view(&settings, &root))
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

    let root = resolve_root(&settings)?;
    save_settings(&settings).map_err(|e| e.to_string())?;
    Ok(build_config_view(&settings, &root))
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
    let root = resolve_root(&settings)?;
    allow_output_dir(&app, &root);
    let payload = run_status_payload(&root, &settings)?;
    let mut runtime = runtime_state.0.lock().map_err(|e| e.to_string())?;
    Ok(DevPulseStatusView {
        config: build_config_view(&settings, &root),
        runtime: build_runtime_view(&mut runtime),
        payload,
    })
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

    let args = match mode.as_str() {
        "collect" => vec!["collect", "--quiet"],
        "bundle" => vec!["bundle", "--quiet"],
        "cleanup" => vec!["cleanup", "--quiet"],
        _ => vec!["run", "--quiet"],
    };

    let result = tauri::async_runtime::spawn_blocking(move || run_cli_json(&root, &settings, &args))
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
    settings_state: State<SettingsState>,
    runtime_state: State<DevPulseState>,
) -> Result<DevPulseRuntimeView, String> {
    let settings = settings_state.0.read().map_err(|e| e.to_string())?.clone();
    let root = resolve_root(&settings)?;
    let python = python_bin(&root);

    let mut runtime = runtime_state.0.lock().map_err(|e| e.to_string())?;
    if runtime.daemon.is_some() {
        return Ok(build_runtime_view(&mut runtime));
    }

    let mut cmd = Command::new(python);
    cmd.current_dir(&root)
        .arg("scripts/run_daemon.py")
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    configure_env(&mut cmd, &settings);

    let child = cmd.spawn().map_err(|e| format!("failed to start devPulse daemon: {e}"))?;
    runtime.daemon = Some(child);
    runtime.last_error = None;
    Ok(build_runtime_view(&mut runtime))
}

#[tauri::command]
pub fn stop_devpulse_daemon(runtime_state: State<DevPulseState>) -> Result<DevPulseRuntimeView, String> {
    let mut runtime = runtime_state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = runtime.daemon.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok(build_runtime_view(&mut runtime))
}

pub fn default_devpulse_feeds() -> Vec<String> {
    vec!["all".into(), "new".into(), "ask".into(), "show".into(), "top".into()]
}
