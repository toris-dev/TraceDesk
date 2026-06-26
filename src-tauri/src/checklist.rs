use crate::settings::{save_settings, ChecklistItem};
use crate::settings_commands::SettingsState;
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State, WebviewUrl, WebviewWindowBuilder};

const CHECKLIST_WINDOW_LABEL: &str = "checklist";
const CHECKLIST_WINDOW_EVENT: &str = "checklist-updated";

fn sanitize_items(items: Vec<ChecklistItem>) -> Vec<ChecklistItem> {
    items
        .into_iter()
        .filter_map(|item| {
            let title = item.title.trim().to_string();
            if title.is_empty() {
                return None;
            }
            Some(ChecklistItem {
                id: item.id.trim().to_string(),
                title,
                done: item.done,
                created_at: item.created_at.trim().to_string(),
            })
        })
        .take(64)
        .collect()
}

fn show_existing_window(app: &AppHandle) -> bool {
    if let Some(window) = app.get_webview_window(CHECKLIST_WINDOW_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return true;
    }
    false
}

fn create_checklist_window(app: &AppHandle) -> Result<(), String> {
    if show_existing_window(app) {
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(
        app,
        CHECKLIST_WINDOW_LABEL,
        WebviewUrl::App("index.html?mode=checklist".into()),
    )
    .title("TraceDesk Checklist")
    .inner_size(388.0, 640.0)
    .min_inner_size(320.0, 420.0)
    .resizable(true)
    .always_on_top(true)
    .skip_taskbar(false)
    .decorations(true)
    .visible(true)
    .build()
    .map_err(|e| e.to_string())?;

    let _ = window.set_position(LogicalPosition::new(36.0, 96.0));
    let _ = window.set_size(LogicalSize::new(388.0, 640.0));
    #[cfg(target_os = "macos")]
    let _ = window.set_visible_on_all_workspaces(true);

    Ok(())
}

#[tauri::command]
pub fn get_checklist_items(state: State<SettingsState>) -> Result<Vec<ChecklistItem>, String> {
    let settings = state.0.read().map_err(|e| e.to_string())?;
    Ok(settings.checklist_items.clone())
}

#[tauri::command]
pub fn save_checklist_items(
    app: AppHandle,
    state: State<SettingsState>,
    items: Vec<ChecklistItem>,
) -> Result<Vec<ChecklistItem>, String> {
    let mut settings = state.0.write().map_err(|e| e.to_string())?;
    settings.checklist_items = sanitize_items(items);
    save_settings(&settings).map_err(|e| e.to_string())?;
    let _ = app.emit(CHECKLIST_WINDOW_EVENT, &settings.checklist_items);
    Ok(settings.checklist_items.clone())
}

#[tauri::command]
pub fn show_checklist_window(app: AppHandle) -> Result<(), String> {
    create_checklist_window(&app)
}

#[tauri::command]
pub fn hide_checklist_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(CHECKLIST_WINDOW_LABEL) {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}
