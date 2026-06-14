use super::{ActiveWindow, OsMonitor};
use anyhow::Result;
use user_idle::UserIdle;

pub struct LinuxMonitor;

impl LinuxMonitor {
    pub fn new() -> Self {
        Self
    }
}

impl Default for LinuxMonitor {
    fn default() -> Self {
        Self::new()
    }
}

impl OsMonitor for LinuxMonitor {
    fn get_active_window(&self) -> Result<Option<ActiveWindow>> {
        match active_win_pos_rs::get_active_window() {
            Ok(win) => Ok(Some(ActiveWindow {
                application: win.app_name,
                title: win.title,
            })),
            Err(_) => Ok(None),
        }
    }

    fn get_idle_seconds(&self) -> Result<u64> {
        Ok(UserIdle::get_time().map(|d| d.as_seconds()).unwrap_or(0))
    }
}
