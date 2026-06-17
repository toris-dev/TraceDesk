use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::archive::DEFAULT_RETENTION_DAYS;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct InstallSeed {
    autostart_enabled: bool,
    enable_accessibility: bool,
    enable_input_monitoring: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub autostart_enabled: bool,
    pub retention_days: u32,
    pub last_archive_at: Option<String>,
    /// 사용자가 접근성 권한 요청에 동의했는지
    #[serde(default)]
    pub enable_accessibility: bool,
    /// 사용자가 입력 모니터링 권한 요청에 동의했는지
    #[serde(default)]
    pub enable_input_monitoring: bool,
    /// 복사·붙여넣기 시 클립보드 텍스트 미리보기 저장 (기본 OFF)
    #[serde(default)]
    pub store_clipboard_preview: bool,
    /// 스크린샷 썸네일 저장 (기본 OFF)
    #[serde(default)]
    pub store_screenshot_preview: bool,
    /// UI language (`ko` or `en`)
    #[serde(default = "default_locale")]
    pub locale: String,
    /// UI theme (`dark` or `light`)
    #[serde(default = "default_theme")]
    pub theme: String,
    /// 초기 설정 마법사 완료 여부
    #[serde(default)]
    pub setup_completed: bool,
    #[serde(default)]
    pub first_run_completed: bool,
    /// `ollama` | `lmstudio` | `mlxlm` | `openai` (OpenAI-compatible API)
    #[serde(default = "default_llm_provider")]
    pub llm_provider: String,
    #[serde(default)]
    pub llm_model: String,
    #[serde(default = "default_ollama_url")]
    pub ollama_base_url: String,
    #[serde(default = "default_api_base_url")]
    pub api_base_url: String,
    /// 마지막 연결 테스트 성공 여부
    #[serde(default)]
    pub llm_connected: bool,
}

fn default_llm_provider() -> String {
    "ollama".into()
}

fn default_ollama_url() -> String {
    "http://127.0.0.1:11434".into()
}

fn default_api_base_url() -> String {
    "https://api.openai.com/v1".into()
}

fn default_lmstudio_url() -> String {
    "http://127.0.0.1:1234/v1".into()
}

fn default_mlxlm_url() -> String {
    "http://127.0.0.1:8080/v1".into()
}

pub fn default_url_for_llm_provider(provider: &str) -> String {
    match provider {
        "openai" => default_api_base_url(),
        "lmstudio" => default_lmstudio_url(),
        "mlxlm" => default_mlxlm_url(),
        _ => default_ollama_url(),
    }
}

pub fn is_default_api_base_url(url: &str) -> bool {
    url == default_url_for_llm_provider("openai")
        || url == default_url_for_llm_provider("lmstudio")
        || url == default_url_for_llm_provider("mlxlm")
}

pub fn uses_api_base_url(provider: &str) -> bool {
    matches!(provider, "openai" | "lmstudio" | "mlxlm")
}

pub fn normalize_llm_provider(value: &str) -> String {
    match value {
        "openai" | "api" => "openai".into(),
        "lmstudio" | "lm_studio" | "lm-studio" => "lmstudio".into(),
        "mlxlm" | "mlx_lm" | "mlx-lm" => "mlxlm".into(),
        _ => "ollama".into(),
    }
}

fn default_locale() -> String {
    "ko".into()
}

pub fn normalize_locale(value: &str) -> String {
    if value == "en" {
        "en".into()
    } else {
        "ko".into()
    }
}

fn default_theme() -> String {
    "dark".into()
}

pub fn normalize_theme(value: &str) -> String {
    if value == "light" {
        "light".into()
    } else {
        "dark".into()
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            autostart_enabled: false,
            retention_days: DEFAULT_RETENTION_DAYS,
            last_archive_at: None,
            enable_accessibility: false,
            enable_input_monitoring: false,
            store_clipboard_preview: true,
            store_screenshot_preview: false,
            locale: default_locale(),
            theme: default_theme(),
            setup_completed: false,
            first_run_completed: false,
            llm_provider: default_llm_provider(),
            llm_model: String::new(),
            ollama_base_url: default_ollama_url(),
            api_base_url: default_api_base_url(),
            llm_connected: false,
        }
    }
}

pub fn settings_path() -> PathBuf {
    crate::database::connection::data_dir().join("settings.json")
}

pub fn load_settings() -> AppSettings {
    let path = settings_path();
    let mut settings = if !path.exists() {
        AppSettings::default()
    } else {
        match fs::read_to_string(&path) {
            Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
            Err(_) => AppSettings::default(),
        }
    };
    apply_install_seed(&mut settings);
    settings
}

fn apply_install_seed(settings: &mut AppSettings) {
    if settings.setup_completed {
        return;
    }
    let seed_path = crate::database::connection::data_dir().join("install_seed.json");
    if !seed_path.exists() {
        return;
    }
    match fs::read_to_string(&seed_path) {
        Ok(raw) => {
            if let Ok(seed) = serde_json::from_str::<InstallSeed>(&raw) {
                settings.autostart_enabled = seed.autostart_enabled;
                settings.enable_accessibility = seed.enable_accessibility;
                settings.enable_input_monitoring = seed.enable_input_monitoring;
                tracing::info!("applied installer seed preferences");
            }
        }
        Err(e) => tracing::warn!(error = %e, "failed to read install_seed.json"),
    }
    let _ = fs::remove_file(&seed_path);
}

pub fn save_settings(settings: &AppSettings) -> Result<()> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(settings)?;
    fs::write(&path, json).context("failed to write settings.json")?;
    Ok(())
}
