use super::{ActiveWindow, OsMonitor};
use crate::os::macos_frontmost;
use anyhow::Result;

pub struct MacOsMonitor;

impl MacOsMonitor {
    pub fn new() -> Self {
        Self
    }
}

impl Default for MacOsMonitor {
    fn default() -> Self {
        Self::new()
    }
}

impl OsMonitor for MacOsMonitor {
    fn get_active_window(&self) -> Result<Option<ActiveWindow>> {
        match active_win_pos_rs::get_active_window() {
            Ok(win) => Ok(Some(ActiveWindow {
                application: win.app_name,
                title: win.title,
            })),
            Err(()) => {
                if let Some(app) = macos_frontmost::frontmost_app_name() {
                    tracing::debug!(app = %app, "active window fallback via lsappinfo");
                    Ok(Some(ActiveWindow {
                        application: app,
                        title: String::new(),
                    }))
                } else {
                    tracing::debug!("failed to get active window (accessibility + screen recording may be required)");
                    Ok(None)
                }
            }
        }
    }

    fn get_idle_seconds(&self) -> Result<u64> {
        Ok(user_idle::UserIdle::get_time()
            .map(|d| d.as_seconds())
            .unwrap_or(0))
    }
}

/// 창 추적 API 동작 여부 (권한 UI 진단용)
pub fn probe_window_tracking() -> bool {
    active_win_pos_rs::get_active_window().is_ok() || macos_frontmost::frontmost_app_name().is_some()
}
