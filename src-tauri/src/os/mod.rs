#[cfg(target_os = "linux")]
pub mod linux;
#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(target_os = "macos")]
pub mod macos_frontmost;
#[cfg(target_os = "windows")]
pub mod windows;

pub mod permissions;

pub use permissions::{
    check_permissions, ensure_at_startup, open_settings, request_permissions,
    request_selected_permissions, PermissionStatus,
};

use anyhow::Result;

#[derive(Debug, Clone)]
pub struct ActiveWindow {
    pub application: String,
    pub title: String,
}

pub trait OsMonitor: Send + Sync {
    fn get_active_window(&self) -> Result<Option<ActiveWindow>>;
    fn get_idle_seconds(&self) -> Result<u64>;
}

pub fn create_monitor() -> Box<dyn OsMonitor> {
    #[cfg(target_os = "macos")]
    {
        Box::new(macos::MacOsMonitor::new())
    }
    #[cfg(target_os = "linux")]
    {
        Box::new(linux::LinuxMonitor::new())
    }
    #[cfg(target_os = "windows")]
    {
        Box::new(windows::WindowsMonitor::new())
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        compile_error!("TraceDesk supports macOS, Linux, and Windows only");
    }
}
