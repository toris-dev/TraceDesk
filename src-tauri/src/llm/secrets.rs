use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LlmSecrets {
    #[serde(default)]
    pub api_key: String,
}

fn secrets_path() -> PathBuf {
    crate::database::connection::data_dir().join("llm_secrets.json")
}

pub fn load_secrets() -> LlmSecrets {
    let path = secrets_path();
    if !path.exists() {
        return LlmSecrets::default();
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

pub fn save_secrets(secrets: &LlmSecrets) -> Result<()> {
    let path = secrets_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(secrets)?;
    fs::write(&path, json).context("failed to write llm_secrets.json")?;
    Ok(())
}

pub fn has_api_key() -> bool {
    !load_secrets().api_key.trim().is_empty()
}
