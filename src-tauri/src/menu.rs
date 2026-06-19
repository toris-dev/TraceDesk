use crate::database::connection;
use crate::export::run_export;
use crate::state::AppState;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

pub const MENU_SHOW: &str = "tray-show";
pub const MENU_QUIT: &str = "menu-quit";

pub const MENU_REFRESH: &str = "menu-refresh";
pub const MENU_GO_TODAY: &str = "menu-go-today";
pub const MENU_EXPORT_JSON: &str = "menu-export-json";
pub const MENU_EXPORT_CSV: &str = "menu-export-csv";
pub const MENU_EXPORT_ACTIONS: &str = "menu-export-actions";
pub const MENU_OPEN_DATA: &str = "menu-open-data";
pub const MENU_PERMISSIONS: &str = "menu-permissions";
pub const MENU_CHECK_UPDATE: &str = "menu-check-update";

pub const NAV_JOURNAL: &str = "nav-journal";
pub const NAV_OVERVIEW: &str = "nav-overview";
pub const NAV_ACTIONS: &str = "nav-actions";
pub const NAV_TIMELINE: &str = "nav-timeline";
pub const NAV_ANALYTICS: &str = "nav-analytics";
pub const NAV_SETTINGS: &str = "nav-settings";

pub const EVENT_NAVIGATE: &str = "menu-navigate";
pub const EVENT_REFRESH: &str = "menu-refresh-ui";
pub const EVENT_GO_TODAY: &str = "menu-go-today-ui";
pub const EVENT_EXPORT_DONE: &str = "menu-export-done";
pub const EVENT_ERROR: &str = "menu-error";
pub const EVENT_CHECK_UPDATE: &str = "menu-check-update-ui";

pub fn setup(app: &AppHandle, locale: &str) -> tauri::Result<()> {
    let menu = build_menu(app, locale)?;

    #[cfg(target_os = "macos")]
    {
        menu.set_as_app_menu()?;
    }

    #[cfg(not(target_os = "macos"))]
    if let Some(window) = app.get_webview_window("main") {
        window.set_menu(menu)?;
    }

    tracing::info!("application menu ready");
    Ok(())
}

fn build_menu(app: &AppHandle, locale: &str) -> tauri::Result<Menu<tauri::Wry>> {
    let s = menu_strings(locale);
    let file = build_file_submenu(app, &s)?;
    let edit = build_edit_submenu(app, &s)?;
    let view = build_view_submenu(app, &s)?;
    let help = build_help_submenu(app, &s)?;

    #[cfg(target_os = "macos")]
    {
        let app_menu = build_app_submenu(app, &s)?;
        let window = build_window_submenu(app, &s)?;
        return Menu::with_items(app, &[&app_menu, &file, &edit, &view, &window, &help]);
    }

    #[cfg(not(target_os = "macos"))]
    Menu::with_items(app, &[&file, &edit, &view, &help])
}

struct MenuStrings {
    app_name: &'static str,
    settings: &'static str,
    quit: &'static str,
    hide_app: &'static str,
    hide_others: &'static str,
    show_all: &'static str,
    file: &'static str,
    refresh: &'static str,
    export_json: &'static str,
    export_csv: &'static str,
    export_actions: &'static str,
    open_data: &'static str,
    edit: &'static str,
    view: &'static str,
    go_today: &'static str,
    journal: &'static str,
    overview: &'static str,
    actions: &'static str,
    timeline: &'static str,
    analytics: &'static str,
    window: &'static str,
    minimize: &'static str,
    zoom: &'static str,
    close_window: &'static str,
    help: &'static str,
    check_update: &'static str,
    permissions: &'static str,
    tray_open: &'static str,
    tray_tooltip: &'static str,
    state_error: &'static str,
    open_data_error: &'static str,
}

fn menu_strings(locale: &str) -> MenuStrings {
    if locale == "en" {
        MenuStrings {
            app_name: "TraceDesk",
            settings: "Settings…",
            quit: "Quit TraceDesk",
            hide_app: "Hide TraceDesk",
            hide_others: "Hide Others",
            show_all: "Show All",
            file: "File",
            refresh: "Refresh",
            export_json: "Export as JSON…",
            export_csv: "Export as CSV (Excel)…",
            export_actions: "Export actions only…",
            open_data: "Open Data Folder",
            edit: "Edit",
            view: "View",
            go_today: "Go to Today",
            journal: "Activity Journal",
            overview: "Overview",
            actions: "Actions",
            timeline: "Timeline",
            analytics: "Analytics",
            window: "Window",
            minimize: "Minimize",
            zoom: "Zoom",
            close_window: "Close Window",
            help: "Help",
            check_update: "Check for Updates…",
            permissions: "Check Input Monitoring Permission",
            tray_open: "Open TraceDesk",
            tray_tooltip: "TraceDesk — tracking activity",
            state_error: "Could not load app state.",
            open_data_error: "Could not open data folder",
        }
    } else {
        MenuStrings {
            app_name: "TraceDesk",
            settings: "설정…",
            quit: "종료",
            hide_app: "TraceDesk 숨기기",
            hide_others: "다른 앱 숨기기",
            show_all: "모두 보기",
            file: "파일",
            refresh: "새로고침",
            export_json: "JSON으로 내보내기…",
            export_csv: "Excel(CSV)로 내보내기…",
            export_actions: "행동 기록만 내보내기…",
            open_data: "데이터 폴더 열기",
            edit: "편집",
            view: "보기",
            go_today: "오늘로 이동",
            journal: "활동 일지",
            overview: "요약",
            actions: "행동 기록",
            timeline: "타임라인",
            analytics: "분석",
            window: "윈도우",
            minimize: "최소화",
            zoom: "확대/축소",
            close_window: "창 닫기",
            help: "도움말",
            check_update: "업데이트 확인…",
            permissions: "입력 모니터링 권한 확인",
            tray_open: "TraceDesk 열기",
            tray_tooltip: "TraceDesk — 활동 추적 중",
            state_error: "앱 상태를 불러올 수 없습니다.",
            open_data_error: "데이터 폴더를 열 수 없습니다",
        }
    }
}

pub fn tray_labels(locale: &str) -> (&'static str, &'static str, &'static str) {
    let s = menu_strings(locale);
    (s.tray_open, s.quit, s.tray_tooltip)
}

#[cfg(target_os = "macos")]
fn build_app_submenu(app: &AppHandle, s: &MenuStrings) -> tauri::Result<Submenu<tauri::Wry>> {
    let about = PredefinedMenuItem::about(app, Some(s.app_name), None)?;
    let check_update =
        MenuItem::with_id(app, MENU_CHECK_UPDATE, s.check_update, true, None::<&str>)?;
    let sep_update = PredefinedMenuItem::separator(app)?;
    let settings = MenuItem::with_id(app, NAV_SETTINGS, s.settings, true, Some("CmdOrCtrl+,"))?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let services = PredefinedMenuItem::services(app, None)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let hide = PredefinedMenuItem::hide(app, Some(s.hide_app))?;
    let hide_others = PredefinedMenuItem::hide_others(app, Some(s.hide_others))?;
    let show_all = PredefinedMenuItem::show_all(app, Some(s.show_all))?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, MENU_QUIT, s.quit, true, Some("CmdOrCtrl+Q"))?;

    Submenu::with_items(
        app,
        s.app_name,
        true,
        &[
            &about,
            &check_update,
            &sep_update,
            &settings,
            &sep1,
            &services,
            &sep2,
            &hide,
            &hide_others,
            &show_all,
            &sep3,
            &quit,
        ],
    )
}

fn build_file_submenu(app: &AppHandle, s: &MenuStrings) -> tauri::Result<Submenu<tauri::Wry>> {
    let refresh = MenuItem::with_id(app, MENU_REFRESH, s.refresh, true, Some("CmdOrCtrl+R"))?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let export_json = MenuItem::with_id(
        app,
        MENU_EXPORT_JSON,
        s.export_json,
        true,
        Some("CmdOrCtrl+Shift+J"),
    )?;
    let export_csv = MenuItem::with_id(
        app,
        MENU_EXPORT_CSV,
        s.export_csv,
        true,
        Some("CmdOrCtrl+Shift+E"),
    )?;
    let export_actions = MenuItem::with_id(
        app,
        MENU_EXPORT_ACTIONS,
        s.export_actions,
        true,
        None::<&str>,
    )?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let open_data = MenuItem::with_id(app, MENU_OPEN_DATA, s.open_data, true, None::<&str>)?;

    #[cfg(not(target_os = "macos"))]
    {
        let sep3 = PredefinedMenuItem::separator(app)?;
        let settings = MenuItem::with_id(
            app,
            NAV_SETTINGS,
            s.settings.trim_end_matches('…'),
            true,
            Some("CmdOrCtrl+,"),
        )?;
        let quit = MenuItem::with_id(app, MENU_QUIT, s.quit, true, Some("Alt+F4"))?;
        return Submenu::with_items(
            app,
            s.file,
            true,
            &[
                &refresh,
                &sep1,
                &export_json,
                &export_csv,
                &export_actions,
                &sep2,
                &open_data,
                &sep3,
                &settings,
                &quit,
            ],
        );
    }

    #[cfg(target_os = "macos")]
    Submenu::with_items(
        app,
        s.file,
        true,
        &[
            &refresh,
            &sep1,
            &export_json,
            &export_csv,
            &export_actions,
            &sep2,
            &open_data,
        ],
    )
}

fn build_edit_submenu(app: &AppHandle, s: &MenuStrings) -> tauri::Result<Submenu<tauri::Wry>> {
    let undo = PredefinedMenuItem::undo(app, None)?;
    let redo = PredefinedMenuItem::redo(app, None)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let cut = PredefinedMenuItem::cut(app, None)?;
    let copy = PredefinedMenuItem::copy(app, None)?;
    let paste = PredefinedMenuItem::paste(app, None)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let select_all = PredefinedMenuItem::select_all(app, None)?;

    Submenu::with_items(
        app,
        s.edit,
        true,
        &[&undo, &redo, &sep1, &cut, &copy, &paste, &sep2, &select_all],
    )
}

fn build_view_submenu(app: &AppHandle, s: &MenuStrings) -> tauri::Result<Submenu<tauri::Wry>> {
    let go_today = MenuItem::with_id(app, MENU_GO_TODAY, s.go_today, true, Some("CmdOrCtrl+T"))?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let journal = MenuItem::with_id(app, NAV_JOURNAL, s.journal, true, Some("CmdOrCtrl+1"))?;
    let overview = MenuItem::with_id(app, NAV_OVERVIEW, s.overview, true, Some("CmdOrCtrl+2"))?;
    let actions = MenuItem::with_id(app, NAV_ACTIONS, s.actions, true, Some("CmdOrCtrl+3"))?;
    let timeline = MenuItem::with_id(app, NAV_TIMELINE, s.timeline, true, Some("CmdOrCtrl+4"))?;
    let analytics = MenuItem::with_id(app, NAV_ANALYTICS, s.analytics, true, Some("CmdOrCtrl+5"))?;

    Submenu::with_items(
        app,
        s.view,
        true,
        &[&go_today, &sep1, &journal, &overview, &actions, &timeline, &analytics],
    )
}

#[cfg(target_os = "macos")]
fn build_window_submenu(app: &AppHandle, s: &MenuStrings) -> tauri::Result<Submenu<tauri::Wry>> {
    let minimize = PredefinedMenuItem::minimize(app, Some(s.minimize))?;
    let maximize = PredefinedMenuItem::maximize(app, Some(s.zoom))?;
    let sep = PredefinedMenuItem::separator(app)?;
    let close = PredefinedMenuItem::close_window(app, Some(s.close_window))?;

    Submenu::with_items(app, s.window, true, &[&minimize, &maximize, &sep, &close])
}

fn build_help_submenu(app: &AppHandle, s: &MenuStrings) -> tauri::Result<Submenu<tauri::Wry>> {
    #[cfg(not(target_os = "macos"))]
    let about = PredefinedMenuItem::about(app, Some("TraceDesk"), None)?;

    let check_update =
        MenuItem::with_id(app, MENU_CHECK_UPDATE, s.check_update, true, None::<&str>)?;
    let permissions = MenuItem::with_id(app, MENU_PERMISSIONS, s.permissions, true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let open_data = MenuItem::with_id(app, MENU_OPEN_DATA, s.open_data, true, None::<&str>)?;

    #[cfg(target_os = "macos")]
    {
        Submenu::with_items(app, s.help, true, &[&check_update, &permissions, &sep, &open_data])
    }

    #[cfg(not(target_os = "macos"))]
    {
        Submenu::with_items(app, s.help, true, &[&about, &check_update, &permissions, &sep, &open_data])
    }
}

pub fn handle_menu_event(app: &AppHandle, id: &str) {
    match id {
        MENU_SHOW => show_main_window(app),

        MENU_QUIT | "quit" => quit_app(app),

        MENU_REFRESH => {
            show_main_window(app);
            let _ = app.emit(EVENT_REFRESH, ());
        }

        MENU_GO_TODAY => {
            show_main_window(app);
            let _ = app.emit(EVENT_GO_TODAY, ());
        }

        MENU_EXPORT_JSON => spawn_export(app, "json", "journal"),
        MENU_EXPORT_CSV => spawn_export(app, "csv", "journal"),
        MENU_EXPORT_ACTIONS => spawn_export(app, "csv", "actions"),

        MENU_OPEN_DATA => open_data_folder(app),

        MENU_PERMISSIONS => {
            show_main_window(app);
            let _ = app.emit(EVENT_NAVIGATE, "settings");
        }

        MENU_CHECK_UPDATE => {
            show_main_window(app);
            let _ = app.emit(EVENT_NAVIGATE, "settings");
            let _ = app.emit(EVENT_CHECK_UPDATE, ());
        }

        NAV_JOURNAL | NAV_OVERVIEW | NAV_ACTIONS | NAV_TIMELINE | NAV_ANALYTICS | NAV_SETTINGS => {
            let page = id.strip_prefix("nav-").unwrap_or(id);
            show_main_window(app);
            let _ = app.emit(EVENT_NAVIGATE, page);
        }

        "close" => hide_main_window(app),

        _ => {}
    }
}

fn quit_app(app: &AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        let _ = state.shutdown_tx.send(true);
    }
    app.exit(0);
}

fn open_data_folder(app: &AppHandle) {
    let locale = app
        .try_state::<crate::settings_commands::SettingsState>()
        .and_then(|s| s.0.read().ok().map(|v| v.locale.clone()))
        .unwrap_or_else(|| "ko".into());
    let s = menu_strings(&locale);
    let dir = connection::data_dir();
    if let Err(e) = std::fs::create_dir_all(&dir) {
        tracing::warn!(error = %e, "failed to ensure data directory");
    }
    if let Err(e) = app.opener().open_path(dir.to_string_lossy().into_owned(), None::<&str>) {
        tracing::warn!(error = %e, path = %dir.display(), "failed to open data folder");
        let _ = app.emit(EVENT_ERROR, format!("{}: {e}", s.open_data_error));
    }
}

fn spawn_export(app: &AppHandle, format: &str, scope: &str) {
    show_main_window(app);
    let locale = app
        .try_state::<crate::settings_commands::SettingsState>()
        .and_then(|s| s.0.read().ok().map(|v| v.locale.clone()))
        .unwrap_or_else(|| "ko".into());
    let strings = menu_strings(&locale);
    let app = app.clone();
    let format = format.to_string();
    let scope = scope.to_string();
    tauri::async_runtime::spawn(async move {
        let Some(state) = app.try_state::<AppState>() else {
            let _ = app.emit(EVENT_ERROR, strings.state_error);
            return;
        };
        match run_export(&app, &state.repository, None, scope, format).await {
            Ok(result) => {
                let _ = app.emit(EVENT_EXPORT_DONE, result);
            }
            Err(message) => {
                let _ = app.emit(EVENT_ERROR, message);
            }
        }
    });
}

pub fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn hide_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}
