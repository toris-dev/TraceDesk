use crate::events::{ActivityEvent, EventType};
use crate::state::AppState;
use chrono::{Local, NaiveDate};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Clone, Serialize)]
pub struct ExportResult {
    pub saved: bool,
    pub path: Option<String>,
    pub row_count: usize,
}

#[derive(Debug, Serialize)]
struct ExportRow {
    id: Option<i64>,
    date: String,
    time: String,
    event_type: String,
    type_label: String,
    application: Option<String>,
    window_title: Option<String>,
    duration_seconds: Option<i64>,
    clipboard_preview: Option<String>,
    clipboard_length: Option<i64>,
    content_type: Option<String>,
    filename: Option<String>,
    shortcut: Option<String>,
    source: Option<String>,
}

fn parse_date(date: Option<String>) -> Result<NaiveDate, String> {
    match date {
        Some(d) => NaiveDate::parse_from_str(&d, "%Y-%m-%d").map_err(|e| e.to_string()),
        None => Ok(Local::now().date_naive()),
    }
}

fn matches_scope(event: &ActivityEvent, scope: &str) -> bool {
    match scope {
        "actions" => matches!(
            event.event_type,
            EventType::Copy | EventType::Paste | EventType::Screenshot
        ),
        "journal" => !matches!(
            event.event_type,
            EventType::SystemStart | EventType::SystemShutdown
        ),
        _ => true,
    }
}

fn type_label(event_type: &EventType) -> &'static str {
    match event_type {
        EventType::SystemStart => "시스템 시작",
        EventType::SystemShutdown => "시스템 종료",
        EventType::WindowFocus => "앱 전환",
        EventType::Copy => "복사",
        EventType::Paste => "붙여넣기",
        EventType::Screenshot => "스크린샷",
        EventType::IdleStart => "유휴 시작",
        EventType::IdleEnd => "유휴 종료",
        EventType::AppOpen => "앱 실행",
        EventType::AppClose => "앱 종료",
        EventType::Keyboard => "키보드",
        EventType::Mouse => "마우스",
    }
}

fn meta_str(meta: &Option<serde_json::Value>, key: &str) -> Option<String> {
    meta.as_ref()?.get(key).and_then(|v| match v {
        serde_json::Value::String(s) => Some(s.clone()),
        serde_json::Value::Number(n) => Some(n.to_string()),
        serde_json::Value::Bool(b) => Some(b.to_string()),
        _ => None,
    })
}

fn meta_i64(meta: &Option<serde_json::Value>, key: &str) -> Option<i64> {
    meta.as_ref()?.get(key).and_then(|v| v.as_i64())
}

fn event_to_row(date: &str, event: &ActivityEvent) -> ExportRow {
    ExportRow {
        id: event.id,
        date: date.to_string(),
        time: event
            .created_at
            .with_timezone(&Local)
            .format("%H:%M:%S")
            .to_string(),
        event_type: event.event_type.as_str().to_string(),
        type_label: type_label(&event.event_type).to_string(),
        application: event.application.clone(),
        window_title: event.window_title.clone(),
        duration_seconds: event.duration,
        clipboard_preview: meta_str(&event.metadata, "clipboard_preview"),
        clipboard_length: meta_i64(&event.metadata, "clipboard_length"),
        content_type: meta_str(&event.metadata, "content_type"),
        filename: meta_str(&event.metadata, "filename"),
        shortcut: meta_str(&event.metadata, "shortcut"),
        source: meta_str(&event.metadata, "source"),
    }
}

fn csv_escape(value: &str) -> String {
    if value.contains(['"', ',', '\n', '\r']) {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn opt_csv(value: &Option<String>) -> String {
    value.as_deref().map(csv_escape).unwrap_or_default()
}

fn opt_i64_csv(value: Option<i64>) -> String {
    value.map(|v| v.to_string()).unwrap_or_default()
}

fn write_csv(path: &Path, rows: &[ExportRow]) -> Result<(), String> {
    let mut content = String::from("\u{feff}");
    content.push_str(
        "id,date,time,event_type,type_label,application,window_title,duration_seconds,\
         clipboard_preview,clipboard_length,content_type,filename,shortcut,source\n",
    );

    for row in rows {
        content.push_str(&format!(
            "{},{},{},{},{},{},{},{},{},{},{},{},{},{}\n",
            row.id.map(|v| v.to_string()).unwrap_or_default(),
            csv_escape(&row.date),
            csv_escape(&row.time),
            csv_escape(&row.event_type),
            csv_escape(&row.type_label),
            opt_csv(&row.application),
            opt_csv(&row.window_title),
            opt_i64_csv(row.duration_seconds),
            opt_csv(&row.clipboard_preview),
            opt_i64_csv(row.clipboard_length),
            opt_csv(&row.content_type),
            opt_csv(&row.filename),
            opt_csv(&row.shortcut),
            opt_csv(&row.source),
        ));
    }

    fs::write(path, content).map_err(|e| e.to_string())
}

fn write_json(path: &Path, date: &str, scope: &str, rows: &[ExportRow]) -> Result<(), String> {
    let payload = serde_json::json!({
        "exported_at": Local::now().format("%Y-%m-%dT%H:%M:%S").to_string(),
        "date": date,
        "scope": scope,
        "row_count": rows.len(),
        "events": rows,
    });
    let json = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_activity(
    app: AppHandle,
    state: State<'_, AppState>,
    date: Option<String>,
    scope: String,
    format: String,
) -> Result<ExportResult, String> {
    run_export(&app, &state.repository, date, scope, format).await
}

pub async fn run_export(
    app: &AppHandle,
    repository: &crate::database::Repository,
    date: Option<String>,
    scope: String,
    format: String,
) -> Result<ExportResult, String> {
    let date = parse_date(date)?;
    let date_str = date.format("%Y-%m-%d").to_string();

    let events = repository
        .get_events_for_date(date)
        .map_err(|e| e.to_string())?;

    let rows: Vec<ExportRow> = events
        .iter()
        .filter(|e| matches_scope(e, &scope))
        .map(|e| event_to_row(&date_str, e))
        .collect();

    if rows.is_empty() {
        return Err("내보낼 기록이 없습니다.".into());
    }

    let is_csv = format == "csv";
    let ext = if is_csv { "csv" } else { "json" };
    let filter_label = if is_csv { "Excel (CSV)" } else { "JSON" };
    let scope_slug = match scope.as_str() {
        "actions" => "actions",
        "journal" => "journal",
        _ => "all",
    };
    let default_name = format!("tracedesk-{date_str}-{scope_slug}.{ext}");

    let picked = app
        .dialog()
        .file()
        .set_title("활동 기록 저장")
        .set_file_name(&default_name)
        .add_filter(filter_label, &[ext])
        .blocking_save_file();

    let Some(file_path) = picked else {
        return Ok(ExportResult {
            saved: false,
            path: None,
            row_count: rows.len(),
        });
    };

    let path_buf: PathBuf = file_path
        .into_path()
        .map_err(|e| format!("invalid save path: {e}"))?;

    if is_csv {
        write_csv(&path_buf, &rows)?;
    } else {
        write_json(&path_buf, &date_str, &scope, &rows)?;
    }

    tracing::info!(
        path = %path_buf.display(),
        rows = rows.len(),
        format = %format,
        scope = %scope,
        "activity export saved"
    );

    Ok(ExportResult {
        saved: true,
        path: Some(path_buf.display().to_string()),
        row_count: rows.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::ActivityEvent;
    use serde_json::json;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_path(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!("tracedesk-export-test-{name}-{nanos}"))
    }

    #[test]
    fn csv_includes_bom_and_headers() {
        let row = ExportRow {
            id: Some(1),
            date: "2025-06-13".into(),
            time: "10:00:00".into(),
            event_type: "COPY".into(),
            type_label: "복사".into(),
            application: Some("Safari".into()),
            window_title: None,
            duration_seconds: None,
            clipboard_preview: Some("hello".into()),
            clipboard_length: Some(5),
            content_type: Some("text".into()),
            filename: None,
            shortcut: None,
            source: None,
        };
        let path = temp_path("csv");
        write_csv(&path, &[row]).expect("write csv");
        let raw = fs::read_to_string(&path).expect("read csv");
        assert!(raw.starts_with('\u{feff}'));
        assert!(raw.contains("type_label"));
        assert!(raw.contains("복사"));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn json_wraps_export_metadata() {
        let row = event_to_row(
            "2025-06-13",
            &ActivityEvent::new(EventType::Paste)
                .with_app("Notes", None)
                .with_metadata(json!({ "clipboard_preview": "test" })),
        );
        let path = temp_path("json");
        write_json(&path, "2025-06-13", "actions", &[row]).expect("write json");
        let raw = fs::read_to_string(&path).expect("read json");
        assert!(raw.contains("\"scope\": \"actions\""));
        assert!(raw.contains("\"PASTE\""));
        let _ = fs::remove_file(path);
    }
}
