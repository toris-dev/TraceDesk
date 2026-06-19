use crate::archive::{collect_db_stats, run_archive, ArchiveResult, DbStats};
use crate::collector::input_bridge::{sync_input_monitoring, InputChannel};
use crate::menu;
use crate::os::{request_selected_permissions, PermissionStatus};
use crate::settings::{normalize_locale, normalize_theme, save_settings, AppSettings};
use crate::tray;
use std::sync::{Arc, RwLock};
use tauri::{Manager, State};
use tauri_plugin_autostart::ManagerExt;

#[derive(Clone)]
pub struct SettingsState(pub Arc<RwLock<AppSettings>>);

#[tauri::command]
pub fn get_settings(state: State<SettingsState>) -> Result<AppSettings, String> {
    state.0.read().map(|s| s.clone()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_settings(
    app: tauri::AppHandle,
    state: State<SettingsState>,
    autostart_enabled: Option<bool>,
    retention_days: Option<u32>,
    enable_accessibility: Option<bool>,
    enable_input_monitoring: Option<bool>,
    store_clipboard_preview: Option<bool>,
    store_screenshot_preview: Option<bool>,
    locale: Option<String>,
    theme: Option<String>,
    performance_mode: Option<bool>,
) -> Result<AppSettings, String> {
    let mut settings = state.0.write().map_err(|e| e.to_string())?;

    if let Some(enabled) = autostart_enabled {
        settings.autostart_enabled = enabled;
        sync_autostart(&app, enabled)?;
    }
    if let Some(days) = retention_days {
        settings.retention_days = days.clamp(30, 365);
    }
    if let Some(v) = enable_accessibility {
        settings.enable_accessibility = v;
    }
    if let Some(v) = enable_input_monitoring {
        settings.enable_input_monitoring = v;
        if let Some(channel) = app.try_state::<InputChannel>() {
            sync_input_monitoring(&app, v, &channel.0);
        }
    }
    if let Some(v) = store_clipboard_preview {
        settings.store_clipboard_preview = v;
    }
    if let Some(v) = store_screenshot_preview {
        settings.store_screenshot_preview = v;
    }
    if let Some(v) = locale {
        settings.locale = normalize_locale(&v);
        menu::setup(&app, &settings.locale).map_err(|e| e.to_string())?;
        tray::setup(&app, &settings.locale).map_err(|e| e.to_string())?;
    }
    if let Some(v) = theme {
        settings.theme = normalize_theme(&v);
    }
    if let Some(v) = performance_mode {
        settings.performance_mode = v;
    }

    save_settings(&settings).map_err(|e| e.to_string())?;
    Ok(settings.clone())
}

#[derive(serde::Serialize)]
pub struct SetupResult {
    pub settings: AppSettings,
    pub permissions: PermissionStatus,
}

#[tauri::command]
pub fn complete_setup(
    app: tauri::AppHandle,
    state: State<SettingsState>,
    autostart_enabled: bool,
    enable_accessibility: bool,
    enable_input_monitoring: bool,
    locale: Option<String>,
) -> Result<SetupResult, String> {
    let mut settings = state.0.write().map_err(|e| e.to_string())?;

    settings.autostart_enabled = autostart_enabled;
    settings.enable_accessibility = enable_accessibility;
    settings.enable_input_monitoring = enable_input_monitoring;
    if let Some(v) = locale {
        settings.locale = normalize_locale(&v);
    }
    settings.setup_completed = true;
    settings.first_run_completed = true;

    save_settings(&settings).map_err(|e| e.to_string())?;
    sync_autostart(&app, autostart_enabled)?;
    menu::setup(&app, &settings.locale).map_err(|e| e.to_string())?;
    tray::setup(&app, &settings.locale).map_err(|e| e.to_string())?;

    let permissions = request_selected_permissions(enable_accessibility, enable_input_monitoring);

    if enable_input_monitoring {
        if let Some(channel) = app.try_state::<InputChannel>() {
            sync_input_monitoring(&app, true, &channel.0);
        }
    }

    Ok(SetupResult {
        settings: settings.clone(),
        permissions,
    })
}

#[tauri::command]
pub fn get_db_stats(state: State<SettingsState>) -> Result<DbStats, String> {
    let settings = state.0.read().map_err(|e| e.to_string())?;
    collect_db_stats(settings.retention_days, settings.last_archive_at.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn run_archive_now(state: State<SettingsState>) -> Result<ArchiveResult, String> {
    let retention = state.0.read().map_err(|e| e.to_string())?.retention_days;
    let result = run_archive(retention).map_err(|e| e.to_string())?;

    if result.deleted_events > 0 {
        let mut settings = state.0.write().map_err(|e| e.to_string())?;
        settings.last_archive_at = Some(chrono::Utc::now().to_rfc3339());
        save_settings(&settings).map_err(|e| e.to_string())?;
    }

    Ok(result)
}

pub fn sync_autostart(app: &tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let autolaunch = app.autolaunch();
    if enabled {
        autolaunch.enable().map_err(|e| e.to_string())?;
        tracing::info!("login autostart enabled");
    } else {
        autolaunch.disable().map_err(|e| e.to_string())?;
        tracing::info!("login autostart disabled");
    }
    Ok(())
}

pub fn apply_autostart_preference(
    app: &tauri::AppHandle,
    settings: &AppSettings,
) -> Result<(), String> {
    if settings.setup_completed {
        sync_autostart(app, settings.autostart_enabled)?;
    }
    Ok(())
}

pub fn filter_permissions_by_settings(
    status: PermissionStatus,
    settings: &AppSettings,
) -> PermissionStatus {
    let permissions = status
        .permissions
        .into_iter()
        .map(|mut p| {
            if p.id == "accessibility" || p.id == "screen_recording" {
                p.required = settings.enable_accessibility;
            } else if p.id == "input_monitoring" {
                p.required = settings.enable_input_monitoring;
            }
            p
        })
        .collect::<Vec<_>>();

    let all_granted = permissions.iter().all(|p| !p.required || p.granted)
        && !status.restart_recommended.unwrap_or(false);

    PermissionStatus {
        all_granted,
        permissions,
        ..status
    }
}

pub fn maybe_run_auto_archive(settings: &mut AppSettings) {
    let retention = settings.retention_days;
    let last = settings.last_archive_at.clone();

    let stats = match collect_db_stats(retention, last.clone()) {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!(error = %e, "failed to collect db stats for auto archive");
            return;
        }
    };

    let stale = crate::archive::has_data_older_than(retention).unwrap_or(false);
    if !crate::archive::should_auto_archive(stats.active_db_bytes, last.as_deref(), stale) {
        return;
    }

    tracing::info!("running automatic database archive");
    match run_archive(retention) {
        Ok(result) if result.deleted_events > 0 => {
            settings.last_archive_at = Some(chrono::Utc::now().to_rfc3339());
            if let Err(e) = save_settings(settings) {
                tracing::warn!(error = %e, "failed to save settings after archive");
            }
            tracing::info!(
                months = ?result.archived_months,
                deleted = result.deleted_events,
                freed = result.freed_bytes_estimate,
                "auto archive completed"
            );
        }
        Ok(_) => tracing::debug!("auto archive: nothing to archive"),
        Err(e) => tracing::warn!(error = %e, "auto archive failed"),
    }
}
