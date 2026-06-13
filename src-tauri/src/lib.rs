mod activity_emit;
mod analytics;
mod archive;
mod collector;
mod commands;
mod database;
mod events;
mod os;
mod settings;
mod settings_commands;
mod state;
mod system;
mod tray;

use settings::load_settings;
use settings_commands::{apply_autostart_preference, maybe_run_auto_archive, SettingsState};
use state::AppState;
use std::sync::Arc;
use tauri::{Manager, RunEvent, WindowEvent};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "tracedesk=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .on_menu_event(|app, event| {
            tray::handle_menu_event(app, event.id.as_ref());
        })
        .on_web_content_process_terminate(|webview| {
            tracing::error!("webview process terminated — reloading UI");
            let _ = webview.eval("window.location.reload()");
        })
        .setup(|app| {
            let settings = load_settings();

            if let Err(e) = apply_autostart_preference(app.handle(), &settings) {
                tracing::warn!(error = %e, "login autostart configuration skipped");
            }

            if settings.setup_completed {
                os::ensure_at_startup(&settings);
            }

            let settings_state = SettingsState(Arc::new(std::sync::RwLock::new(settings.clone())));
            app.manage(settings_state.clone());

            let (input_tx, input_rx) = crossbeam_channel::unbounded();

            if settings.enable_input_monitoring {
                #[cfg(target_os = "macos")]
                {
                    let tx = input_tx.clone();
                    app.handle().run_on_main_thread(move || {
                        if let Err(e) = collector::input_macos::install_global_key_monitor(tx) {
                            tracing::error!(error = %e, "failed to install macOS key monitor");
                        }
                    })?;
                }
                #[cfg(not(target_os = "macos"))]
                {
                    let _ = collector::input::spawn_input_listener(input_tx);
                }
            }
            drop(input_tx);

            let (app_state, shutdown_rx) = match AppState::new() {
                Ok(v) => v,
                Err(e) => {
                    tracing::error!(error = %e, "failed to initialize app state");
                    return Err(e.into());
                }
            };
            let app_handle = app.handle().clone();
            let collector_repo = Arc::clone(&app_state.repository);

            let settings_for_collector = settings.clone();
            let settings_state_for_collector = settings_state.clone();
            tauri::async_runtime::spawn(async move {
                let agent = collector::CollectorAgent::new(
                    collector_repo,
                    app_handle,
                    settings_state_for_collector,
                );
                if let Err(e) = agent.run(shutdown_rx, settings_for_collector, input_rx).await {
                    tracing::error!(error = %e, "activity collector failed");
                }
            });

            tauri::async_runtime::spawn_blocking(move || {
                std::thread::sleep(std::time::Duration::from_secs(5));
                if let Ok(mut s) = settings_state.0.write() {
                    maybe_run_auto_archive(&mut s);
                }
            });

            app.manage(app_state);

            let thumb_dir = collector::thumbnail::thumbnails_dir();
            if let Err(e) = std::fs::create_dir_all(&thumb_dir) {
                tracing::warn!(error = %e, "failed to create thumbnails directory");
            } else if let Err(e) = app.handle().asset_protocol_scope().allow_directory(&thumb_dir, true) {
                tracing::warn!(error = %e, "failed to allow thumbnails for asset protocol");
            }

            tray::setup(app.handle())?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_activity_today,
            commands::get_daily_statistics,
            commands::get_timeline,
            commands::get_applications,
            commands::get_hourly_activity,
            commands::get_timeline_full,
            commands::get_idle_analysis,
            commands::get_action_hourly,
            commands::get_productivity_analysis,
            commands::get_weekly_report,
            commands::get_available_dates,
            commands::get_permissions_status,
            commands::request_permissions,
            commands::refresh_permissions,
            commands::open_permission_settings,
            commands::get_system_snapshot,
            commands::kill_port_process,
            commands::check_health,
            commands::check_permissions_cli,
            commands::request_permissions_cli,
            settings_commands::get_settings,
            settings_commands::update_settings,
            settings_commands::complete_setup,
            settings_commands::get_db_stats,
            settings_commands::run_archive_now,
        ])
        .build(tauri::generate_context!())
        .expect("failed to build TraceDesk application")
        .run(|app_handle, event| {
            match event {
                RunEvent::WindowEvent { label, event, .. } if label == "main" => {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        tray::hide_main_window(app_handle);
                        tracing::info!("window hidden — collector keeps running in tray");
                    }
                }
                RunEvent::Reopen { .. } => {
                    tray::show_main_window(app_handle);
                }
                RunEvent::Exit => {
                    if let Some(state) = app_handle.try_state::<AppState>() {
                        let _ = state.shutdown_tx.send(true);
                    }
                }
                _ => {}
            }
        });
}
