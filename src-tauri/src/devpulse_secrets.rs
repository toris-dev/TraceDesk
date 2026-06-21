use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DevPulseSecrets {
    #[serde(default)]
    pub mastodon_access_token: String,
    #[serde(default)]
    pub x_api_key: String,
    #[serde(default)]
    pub x_api_secret: String,
    #[serde(default)]
    pub x_access_token: String,
    #[serde(default)]
    pub x_access_secret: String,
}

fn secrets_path() -> PathBuf {
    crate::database::connection::data_dir().join("devpulse_secrets.json")
}

pub fn load_devpulse_secrets() -> DevPulseSecrets {
    let path = secrets_path();
    if !path.exists() {
        return DevPulseSecrets::default();
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

pub fn save_devpulse_secrets(secrets: &DevPulseSecrets) -> Result<()> {
    let path = secrets_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(secrets)?;
    fs::write(&path, json).context("failed to write devpulse_secrets.json")?;
    Ok(())
}
