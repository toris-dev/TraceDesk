use crate::analytics::{
    analyze_productivity, build_action_hourly, build_full_timeline, build_hourly_activity,
    build_idle_analysis, build_timeline, build_weekly_report, build_weekly_report_current,
    compute_daily_statistics, ActionHourlyPoint, DailyStatistics, FullTimelineItem, IdleAnalysis,
    ProductivityAnalysis, WeeklyReport,
};
use crate::database::models::ApplicationUsage;
use crate::os::{self, PermissionStatus};
use crate::settings_commands::{filter_permissions_by_settings, SettingsState};
use crate::state::AppState;
use crate::system::{collect_snapshot, lock_system, SystemSnapshot};
use chrono::{Local, NaiveDate};
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct ActivityItem {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<i64>,
    #[serde(rename = "type")]
    pub event_type: String,
    pub time: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct HourlyActivityItem {
    pub hour: u32,
    pub activity: f64,
}

fn parse_date(date: Option<String>) -> Result<NaiveDate, String> {
    match date {
        Some(d) => NaiveDate::parse_from_str(&d, "%Y-%m-%d").map_err(|e| e.to_string()),
        None => Ok(Local::now().date_naive()),
    }
}

#[tauri::command]
pub fn get_activity_today(
    state: State<AppState>,
    date: Option<String>,
) -> Result<Vec<ActivityItem>, String> {
    let date = parse_date(date)?;
    let events = state.repository.get_events_for_date(date).map_err(|e| e.to_string())?;
    Ok(events
        .into_iter()
        .map(|e| ActivityItem {
            id: e.id,
            event_type: e.event_type.as_str().to_string(),
            time: e.created_at.format("%H:%M:%S").to_string(),
            name: e.application,
            duration: e.duration,
            metadata: e.metadata,
        })
        .collect())
}

#[tauri::command]
pub fn get_daily_statistics(
    state: State<AppState>,
    date: Option<String>,
) -> Result<DailyStatistics, String> {
    let date = parse_date(date)?;
    compute_daily_statistics(&state.repository, date).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_timeline(
    state: State<AppState>,
    date: Option<String>,
) -> Result<serde_json::Value, String> {
    let date = parse_date(date)?;
    let segments = build_timeline(&state.repository, date).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "segments": segments }))
}

#[tauri::command]
pub fn get_applications(
    state: State<AppState>,
    date: Option<String>,
) -> Result<serde_json::Value, String> {
    let date = parse_date(date)?;
    let usage: Vec<ApplicationUsage> = state
        .repository
        .get_application_usage_for_date(date)
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "applications": usage }))
}

#[tauri::command]
pub fn get_hourly_activity(
    state: State<AppState>,
    date: Option<String>,
) -> Result<serde_json::Value, String> {
    let date = parse_date(date)?;
    let hourly = build_hourly_activity(&state.repository, date).map_err(|e| e.to_string())?;
    let data: Vec<HourlyActivityItem> = hourly
        .into_iter()
        .map(|(hour, activity)| HourlyActivityItem { hour, activity })
        .collect();
    Ok(serde_json::json!({ "hourly": data }))
}

#[tauri::command]
pub fn get_timeline_full(
    state: State<AppState>,
    date: Option<String>,
) -> Result<serde_json::Value, String> {
    let date = parse_date(date)?;
    let items: Vec<FullTimelineItem> =
        build_full_timeline(&state.repository, date).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "items": items }))
}

#[tauri::command]
pub fn get_idle_analysis(
    state: State<AppState>,
    date: Option<String>,
) -> Result<IdleAnalysis, String> {
    let date = parse_date(date)?;
    build_idle_analysis(&state.repository, date).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_action_hourly(
    state: State<AppState>,
    date: Option<String>,
) -> Result<serde_json::Value, String> {
    let date = parse_date(date)?;
    let hourly: Vec<ActionHourlyPoint> =
        build_action_hourly(&state.repository, date).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "hourly": hourly }))
}

#[tauri::command]
pub fn get_productivity_analysis(
    state: State<AppState>,
    date: Option<String>,
) -> Result<ProductivityAnalysis, String> {
    let date = parse_date(date)?;
    analyze_productivity(&state.repository, date).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_weekly_report(
    state: State<AppState>,
    date: Option<String>,
) -> Result<WeeklyReport, String> {
    let report = match date {
        Some(d) => {
            let end = NaiveDate::parse_from_str(&d, "%Y-%m-%d").map_err(|e| e.to_string())?;
            build_weekly_report(&state.repository, end)
        }
        None => build_weekly_report_current(&state.repository),
    };
    report.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_permissions_status(
    state: State<AppState>,
    settings_state: State<SettingsState>,
) -> Result<PermissionStatus, String> {
    let settings = settings_state.0.read().map_err(|e| e.to_string())?;
    let status = os::check_permissions();
    let filtered = filter_permissions_by_settings(status, &settings);
    *state.permissions.write().map_err(|e| e.to_string())? = filtered.clone();
    Ok(filtered)
}

#[tauri::command]
pub fn request_permissions(
    state: State<AppState>,
    settings_state: State<SettingsState>,
) -> Result<PermissionStatus, String> {
    let settings = settings_state.0.read().map_err(|e| e.to_string())?;
    let status = os::request_selected_permissions(
        settings.enable_accessibility,
        settings.enable_input_monitoring,
    );
    *state.permissions.write().map_err(|e| e.to_string())? = status.clone();
    Ok(filter_permissions_by_settings(status, &settings))
}

#[tauri::command]
pub fn refresh_permissions(
    state: State<AppState>,
    settings_state: State<SettingsState>,
) -> Result<PermissionStatus, String> {
    let settings = settings_state.0.read().map_err(|e| e.to_string())?;
    let status = os::check_permissions();
    let filtered = filter_permissions_by_settings(status, &settings);
    *state.permissions.write().map_err(|e| e.to_string())? = filtered.clone();
    Ok(filtered)
}

#[tauri::command]
pub fn open_permission_settings(id: String) -> Result<(), String> {
    os::open_settings(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_system_snapshot(state: State<AppState>) -> Result<SystemSnapshot, String> {
    let mut sys = lock_system(&state.system);
    collect_snapshot(&mut sys).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kill_port_process(pid: u32) -> Result<(), String> {
    let self_pid = std::process::id();
    crate::system::kill_listener_process(pid, self_pid).map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
pub struct AvailableDate {
    pub date: String,
    pub event_count: i64,
}

#[tauri::command]
pub fn get_available_dates(state: State<AppState>) -> Result<Vec<AvailableDate>, String> {
    state
        .repository
        .get_available_dates()
        .map(|rows| {
            rows.into_iter()
                .map(|(date, event_count)| AvailableDate { date, event_count })
                .collect()
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn check_health() -> &'static str {
    "ok"
}

#[tauri::command]
pub fn check_permissions_cli() -> Result<PermissionStatus, String> {
    Ok(os::check_permissions())
}

#[tauri::command]
pub fn request_permissions_cli() -> Result<PermissionStatus, String> {
    Ok(os::request_permissions())
}
