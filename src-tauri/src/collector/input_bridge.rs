use crate::collector::input::InputEvent;
use crossbeam_channel::Sender;
use tauri::AppHandle;

pub struct InputChannel(pub Sender<InputEvent>);

pub fn sync_input_monitoring(app: &AppHandle, enabled: bool, tx: &Sender<InputEvent>) {
    if enabled {
        tracing::info!("enabling keyboard input monitoring");
    } else {
        tracing::info!("disabling keyboard input monitoring");
    }

    #[cfg(target_os = "macos")]
    {
        if enabled {
            crate::collector::input_macos::reinstall_key_monitors_if_needed(app, tx.clone());
        }
        if let Err(e) = crate::collector::input_macos::sync_key_monitor(app, enabled, tx.clone()) {
            tracing::error!(error = %e, "failed to sync macOS key monitor");
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        crate::collector::input::sync_input_listener(enabled, tx.clone());
    }
}
