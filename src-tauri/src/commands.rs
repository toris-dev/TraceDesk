use crate::activity_item::ActivityItem;
use crate::analytics::{
    analyze_productivity, build_action_hourly, build_activity_bundle, build_full_timeline,
    build_hourly_activity, build_idle_analysis, build_timeline, build_weekly_report,
    build_weekly_report_current, compute_daily_statistics, ActionHourlyPoint, ActivityBundle,
    DailyStatistics, FullTimelineItem, IdleAnalysis, ProductivityAnalysis, WeeklyReport,
};
use crate::database::models::ApplicationUsage;
use crate::events::{ActivityEvent, EventType};
use crate::os::{self, PermissionStatus};
use crate::settings_commands::{filter_permissions_by_settings, SettingsState};
use crate::state::AppState;
use crate::system::{collect_snapshot, create_monitor, SystemSnapshot};
use chrono::{Local, NaiveDate};
use serde::Serialize;
use tauri::{AppHandle, Manager, State, WebviewWindow};

#[derive(Debug, Serialize)]
pub struct HourlyActivityItem {
    pub hour: u32,
    pub activity: f64,
}

#[derive(Debug, Serialize)]
pub struct ActionDateSummary {
    pub date: String,
    pub total: i64,
    pub copy: i64,
    pub paste: i64,
    pub screenshot: i64,
    pub top_location: Option<String>,
    pub latest_time: Option<String>,
    pub latest_app: Option<String>,
}

fn summarize_action_events_for_date(
    date: String,
    events: impl IntoIterator<Item = ActivityEvent>,
) -> Option<ActionDateSummary> {
    let mut copy = 0;
    let mut paste = 0;
    let mut screenshot = 0;
    let mut latest_time = None;
    let mut latest_app = None;
    let mut locations = std::collections::HashMap::<String, i64>::new();

    for event in events.into_iter().filter(|e| {
        matches!(
            e.event_type,
            EventType::Copy | EventType::Paste | EventType::Screenshot
        )
    }) {
        match event.event_type {
            EventType::Copy => copy += 1,
            EventType::Paste => paste += 1,
            EventType::Screenshot => screenshot += 1,
            _ => {}
        }

        let app = event
            .application
            .clone()
            .unwrap_or_else(|| "Unknown".into());
        let location = if let Some(window) = event.window_title.as_deref().filter(|w| !w.is_empty())
        {
            format!("{app} · {window}")
        } else {
            app.clone()
        };
        *locations.entry(location).or_insert(0) += 1;
        latest_time = Some(
            event
                .created_at
                .with_timezone(&Local)
                .format("%H:%M:%S")
                .to_string(),
        );
        latest_app = Some(app);
    }

    let total = copy + paste + screenshot;
    if total == 0 {
        return None;
    }

    let top_location = locations
        .into_iter()
        .max_by(|a, b| a.1.cmp(&b.1).then_with(|| b.0.cmp(&a.0)))
        .map(|(location, _)| location);

    Some(ActionDateSummary {
        date,
        total,
        copy,
        paste,
        screenshot,
        top_location,
        latest_time,
        latest_app,
    })
}

fn parse_date(date: Option<String>) -> Result<NaiveDate, String> {
    match date {
        Some(d) => NaiveDate::parse_from_str(&d, "%Y-%m-%d").map_err(|e| e.to_string()),
        None => Ok(Local::now().date_naive()),
    }
}

#[tauri::command]
pub fn get_action_date_summaries(
    state: State<AppState>,
    limit: Option<usize>,
) -> Result<Vec<ActionDateSummary>, String> {
    let limit = limit.unwrap_or(14).clamp(1, 60);
    let dates = state
        .repository
        .get_available_dates()
        .map_err(|e| e.to_string())?;

    let mut summaries = Vec::new();
    for (date_str, _) in dates.into_iter().take(limit) {
        let date = NaiveDate::parse_from_str(&date_str, "%Y-%m-%d").map_err(|e| e.to_string())?;
        let events = state
            .repository
            .get_events_for_date(date)
            .map_err(|e| e.to_string())?;

        if let Some(summary) = summarize_action_events_for_date(date_str, events) {
            summaries.push(summary);
        }
    }

    Ok(summaries)
}

#[tauri::command]
pub fn get_activity_today(
    state: State<AppState>,
    date: Option<String>,
) -> Result<Vec<ActivityItem>, String> {
    let date = parse_date(date)?;
    let events = state
        .repository
        .get_events_for_date(date)
        .map_err(|e| e.to_string())?;
    Ok(events
        .into_iter()
        .map(|e| ActivityItem {
            id: e.id,
            event_type: e.event_type.as_str().to_string(),
            time: e
                .created_at
                .with_timezone(&chrono::Local)
                .format("%H:%M:%S")
                .to_string(),
            name: e.application,
            window_title: e.window_title,
            duration: e.duration,
            metadata: e.metadata,
        })
        .collect())
}

const MAX_ACTION_EVENTS_DETAIL: usize = 500;

/// Copy / paste / screenshot with full metadata (clipboard preview kept) for graph & search.
#[tauri::command]
pub fn get_action_events(
    state: State<AppState>,
    date: Option<String>,
) -> Result<Vec<ActivityItem>, String> {
    let date = parse_date(date)?;
    let events = state
        .repository
        .get_events_for_date(date)
        .map_err(|e| e.to_string())?;

    let mut items: Vec<ActivityItem> = events
        .into_iter()
        .filter(|e| {
            matches!(
                e.event_type,
                EventType::Copy | EventType::Paste | EventType::Screenshot
            )
        })
        .map(|e| ActivityItem {
            id: e.id,
            event_type: e.event_type.as_str().to_string(),
            time: e
                .created_at
                .with_timezone(&Local)
                .format("%H:%M:%S")
                .to_string(),
            name: e.application,
            window_title: e.window_title,
            duration: e.duration,
            metadata: e.metadata,
        })
        .collect();

    if items.len() > MAX_ACTION_EVENTS_DETAIL {
        let skip = items.len() - MAX_ACTION_EVENTS_DETAIL;
        items = items.split_off(skip);
    }

    Ok(items)
}

#[tauri::command]
pub fn get_activity_bundle(
    state: State<AppState>,
    date: Option<String>,
) -> Result<ActivityBundle, String> {
    let date = parse_date(date)?;
    build_activity_bundle(&state.repository, date).map_err(|e| e.to_string())
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
    app: tauri::AppHandle,
    state: State<AppState>,
    settings_state: State<SettingsState>,
) -> Result<PermissionStatus, String> {
    let settings = settings_state.0.read().map_err(|e| e.to_string())?;
    let status = os::request_selected_permissions(
        settings.enable_accessibility,
        settings.enable_input_monitoring,
    );
    if settings.enable_input_monitoring {
        if let Some(channel) = app.try_state::<crate::collector::input_bridge::InputChannel>() {
            crate::collector::input_bridge::sync_input_monitoring(&app, true, &channel.0);
        }
    }
    *state.permissions.write().map_err(|e| e.to_string())? = status.clone();
    Ok(filter_permissions_by_settings(status, &settings))
}

#[tauri::command]
pub fn refresh_permissions(
    app: tauri::AppHandle,
    state: State<AppState>,
    settings_state: State<SettingsState>,
) -> Result<PermissionStatus, String> {
    let settings = settings_state.0.read().map_err(|e| e.to_string())?;
    if settings.enable_input_monitoring {
        if let Some(channel) = app.try_state::<crate::collector::input_bridge::InputChannel>() {
            crate::collector::input_bridge::sync_input_monitoring(&app, true, &channel.0);
        }
    }
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
    let mut mon = state
        .system
        .lock()
        .map_err(|_| "system monitor mutex poisoned".to_string())?;
    let mon = mon.get_or_insert_with(create_monitor);
    collect_snapshot(mon).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kill_port_process(pid: u32) -> Result<(), String> {
    let self_pid = std::process::id();
    crate::system::kill_listener_process(pid, self_pid).map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
pub struct MainWindowState {
    pub is_maximized: bool,
    pub is_visible: bool,
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "main window is not available".to_string())
}

fn main_window_state(window: &WebviewWindow) -> MainWindowState {
    MainWindowState {
        is_maximized: window.is_maximized().unwrap_or(false),
        is_visible: window.is_visible().unwrap_or(true),
    }
}

#[tauri::command]
pub fn get_main_window_state(app: AppHandle) -> Result<MainWindowState, String> {
    let window = main_window(&app)?;
    Ok(main_window_state(&window))
}

#[tauri::command]
pub fn minimize_main_window(app: AppHandle) -> Result<MainWindowState, String> {
    let window = main_window(&app)?;
    window.minimize().map_err(|e| e.to_string())?;
    Ok(main_window_state(&window))
}

#[tauri::command]
pub fn toggle_main_window_maximized(app: AppHandle) -> Result<MainWindowState, String> {
    let window = main_window(&app)?;
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())?;
    } else {
        window.maximize().map_err(|e| e.to_string())?;
    }
    Ok(main_window_state(&window))
}

#[tauri::command]
pub fn hide_main_window(app: AppHandle) -> Result<MainWindowState, String> {
    let window = main_window(&app)?;
    window.hide().map_err(|e| e.to_string())?;
    Ok(MainWindowState {
        is_maximized: window.is_maximized().unwrap_or(false),
        is_visible: false,
    })
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

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Local, TimeZone, Utc};

    fn event(event_type: EventType, hour: u32, app: &str, window: Option<&str>) -> ActivityEvent {
        ActivityEvent {
            id: None,
            event_type,
            created_at: Utc.with_ymd_and_hms(2026, 6, 19, hour, 30, 0).unwrap(),
            duration: None,
            application: Some(app.into()),
            window_title: window.map(str::to_string),
            metadata: None,
        }
    }

    #[test]
    fn summarizes_action_counts_and_top_location() {
        let summary = summarize_action_events_for_date(
            "2026-06-19".into(),
            vec![
                event(EventType::Copy, 9, "Arc", Some("Docs")),
                event(EventType::Paste, 10, "Arc", Some("Docs")),
                event(EventType::Screenshot, 11, "Finder", Some("Desktop")),
                event(EventType::WindowFocus, 12, "Cursor", Some("Editor")),
            ],
        )
        .expect("action summary");

        assert_eq!(summary.date, "2026-06-19");
        assert_eq!(summary.total, 3);
        assert_eq!(summary.copy, 1);
        assert_eq!(summary.paste, 1);
        assert_eq!(summary.screenshot, 1);
        assert_eq!(summary.top_location.as_deref(), Some("Arc · Docs"));
        let expected_latest_time = Utc
            .with_ymd_and_hms(2026, 6, 19, 11, 30, 0)
            .unwrap()
            .with_timezone(&Local)
            .format("%H:%M:%S")
            .to_string();
        assert_eq!(
            summary.latest_time.as_deref(),
            Some(expected_latest_time.as_str())
        );
        assert_eq!(summary.latest_app.as_deref(), Some("Finder"));
    }

    #[test]
    fn ignores_dates_without_action_events() {
        let summary = summarize_action_events_for_date(
            "2026-06-19".into(),
            vec![event(EventType::WindowFocus, 9, "Cursor", Some("Editor"))],
        );

        assert!(summary.is_none());
    }
}
