use crate::activity_emit;
use crate::collector::input::{self, InputEvent};
use crate::collector::screenshot;
use crate::database::Repository;
use crate::events::{ActivityEvent, EventType};
use crate::os::{create_monitor, OsMonitor};
use crate::settings_commands::SettingsState;
use anyhow::Result;
use chrono::{Local, Utc};
use serde_json::json;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::AppHandle;
use tokio::sync::watch;

const POLL_INTERVAL: Duration = Duration::from_secs(2);
const IDLE_THRESHOLD_SECS: u64 = 300;
const SUMMARY_INTERVAL: Duration = Duration::from_secs(60);

pub struct CollectorAgent {
    repository: Arc<Repository>,
    monitor: Box<dyn OsMonitor>,
    app_handle: AppHandle,
    settings: SettingsState,
}

impl CollectorAgent {
    pub fn new(
        repository: Arc<Repository>,
        app_handle: AppHandle,
        settings: SettingsState,
    ) -> Self {
        Self {
            repository,
            monitor: create_monitor(),
            app_handle,
            settings,
        }
    }

    fn store_clipboard_preview(&self) -> bool {
        self.settings
            .0
            .read()
            .map(|s| s.store_clipboard_preview)
            .unwrap_or(false)
    }

    fn store_screenshot_preview(&self) -> bool {
        self.settings
            .0
            .read()
            .map(|s| s.store_screenshot_preview)
            .unwrap_or(false)
    }

    pub async fn run(
        self,
        mut shutdown: watch::Receiver<bool>,
        settings: crate::settings::AppSettings,
        input_rx: crossbeam_channel::Receiver<InputEvent>,
    ) -> Result<()> {
        let startup_event = ActivityEvent::new(EventType::SystemStart);
        self.repository.insert_event(&startup_event)?;
        tracing::info!("activity collector started");

        let (screenshot_tx, screenshot_rx) = crossbeam_channel::unbounded();

        if settings.enable_input_monitoring {
            tracing::info!("keyboard input monitoring enabled");
        } else {
            tracing::info!("input monitoring disabled — keyboard listener not started");
        }
        let _screenshot_handle = screenshot::spawn_screenshot_watcher(screenshot_tx);

        let mut current_app: Option<String> = None;
        let mut current_title: Option<String> = None;
        let mut session_start = Utc::now();
        let mut is_idle = false;
        let mut last_summary = std::time::Instant::now();

        loop {
            if *shutdown.borrow() {
                break;
            }

            self.process_input_events(&input_rx)?;
            self.process_screenshot_events(&screenshot_rx)?;

            let idle_secs = self.monitor.get_idle_seconds().unwrap_or(0);

            if idle_secs >= IDLE_THRESHOLD_SECS && !is_idle {
                if let Some(ref app) = current_app {
                    let duration = (Utc::now() - session_start).num_seconds().max(0);
                    self.record_window_focus(app, current_title.as_deref(), duration)?;
                }
                current_app = None;
                current_title = None;

                let event = ActivityEvent::new(EventType::IdleStart)
                    .with_metadata(json!({ "idle_seconds": idle_secs }));
                self.repository.insert_event(&event)?;
                is_idle = true;
                tracing::debug!(idle_secs, "idle started");
            } else if idle_secs < IDLE_THRESHOLD_SECS && is_idle {
                let duration = idle_secs.max(1) as i64;
                let event = ActivityEvent::new(EventType::IdleEnd)
                    .with_metadata(json!({ "idle_seconds": idle_secs }))
                    .with_duration(duration);
                self.repository.insert_event(&event)?;
                is_idle = false;
                session_start = Utc::now();
                tracing::debug!("idle ended");
            }

            if !is_idle {
                if let Ok(Some(window)) = self.monitor.get_active_window() {
                    let app_changed = current_app.as_deref() != Some(&window.application)
                        || current_title.as_deref() != Some(&window.title);

                    if app_changed {
                        if let Some(ref prev_app) = current_app {
                            let duration = (Utc::now() - session_start).num_seconds().max(0);
                            self.record_window_focus(prev_app, current_title.as_deref(), duration)?;
                        }

                        let event = ActivityEvent::new(EventType::WindowFocus)
                            .with_app(window.application.clone(), Some(window.title.clone()));
                        self.repository.insert_event(&event)?;

                        current_app = Some(window.application);
                        current_title = Some(window.title);
                        session_start = Utc::now();
                    }
                }
            }

            if last_summary.elapsed() >= SUMMARY_INTERVAL {
                if let Err(e) = crate::analytics::summary::refresh_daily_summary(&self.repository) {
                    tracing::warn!(error = %e, "failed to refresh daily summary");
                }
                last_summary = std::time::Instant::now();
            }

            tokio::select! {
                _ = tokio::time::sleep(POLL_INTERVAL) => {},
                _ = shutdown.changed() => {
                    if *shutdown.borrow() {
                        break;
                    }
                }
            }
        }

        if let Some(ref app) = current_app {
            let duration = (Utc::now() - session_start).num_seconds().max(0);
            self.record_window_focus(app, current_title.as_deref(), duration)?;
        }

        let shutdown_event = ActivityEvent::new(EventType::SystemShutdown);
        self.repository.insert_event(&shutdown_event)?;
        tracing::info!("activity collector stopped");

        Ok(())
    }

    fn process_input_events(
        &self,
        rx: &crossbeam_channel::Receiver<InputEvent>,
    ) -> Result<()> {
        while let Ok(event) = rx.try_recv() {
            let app = input::current_app_name();
            let store_preview = self.store_clipboard_preview();
            match event {
                InputEvent::Copy => {
                    let recorded =
                        input::record_copy(&self.repository, app.as_deref(), store_preview)?;
                    activity_emit::emit_action_event(&self.app_handle, &recorded);
                }
                InputEvent::Paste => {
                    let recorded =
                        input::record_paste(&self.repository, app.as_deref(), store_preview)?;
                    activity_emit::emit_action_event(&self.app_handle, &recorded);
                }
                InputEvent::Screenshot { shortcut } => {
                    screenshot::mark_keyboard_screenshot();
                    let recorded = input::record_screenshot(
                        &self.repository,
                        &shortcut,
                        app.as_deref(),
                    )?;
                    activity_emit::emit_action_event(&self.app_handle, &recorded);
                }
            }
        }
        Ok(())
    }

    fn process_screenshot_events(
        &self,
        rx: &crossbeam_channel::Receiver<PathBuf>,
    ) -> Result<()> {
        while let Ok(path) = rx.try_recv() {
            let store_preview = self.store_screenshot_preview();
            if let Some(event_id) = screenshot::take_pending_keyboard_event() {
                match input::attach_screenshot_file(
                    &self.repository,
                    event_id,
                    &path,
                    store_preview,
                ) {
                    Ok(updated) => {
                        activity_emit::emit_action_event(&self.app_handle, &updated);
                    }
                    Err(e) => {
                        tracing::warn!(
                            error = %e,
                            path = %path.display(),
                            "failed to attach screenshot file to keyboard event"
                        );
                    }
                }
                continue;
            }

            let recorded =
                input::record_screenshot_path(&self.repository, &path, store_preview)?;
            activity_emit::emit_action_event(&self.app_handle, &recorded);
        }
        Ok(())
    }

    fn record_window_focus(
        &self,
        application: &str,
        window_title: Option<&str>,
        duration: i64,
    ) -> Result<()> {
        if duration <= 0 {
            return Ok(());
        }

        let today = Local::now().format("%Y-%m-%d").to_string();
        self.repository
            .upsert_application_usage(&today, application, duration)?;

        let event = ActivityEvent::new(EventType::WindowFocus)
            .with_app(application.to_string(), window_title.map(String::from))
            .with_duration(duration);
        self.repository.insert_event(&event)?;

        Ok(())
    }
}
