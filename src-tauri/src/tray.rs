use crate::menu::{tray_labels, MENU_QUIT, MENU_SHOW};
use tauri::{
    include_image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle,
};

pub use crate::menu::{hide_main_window, show_main_window};

fn tray_icon() -> tauri::image::Image<'static> {
    #[cfg(target_os = "macos")]
    {
        include_image!("icons/tray-icon.png")
    }
    #[cfg(not(target_os = "macos"))]
    {
        include_image!("icons/32x32.png")
    }
}

pub fn setup(app: &AppHandle, locale: &str) -> tauri::Result<()> {
    let (show_label, quit_label, tooltip) = tray_labels(locale);

    let show = MenuItem::with_id(app, MENU_SHOW, show_label, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, MENU_QUIT, quit_label, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .tooltip(tooltip)
        .show_menu_on_left_click(false);

    builder = builder.icon(tray_icon());

    #[cfg(target_os = "macos")]
    {
        builder = builder.icon_as_template(true);
    }

    builder
        .on_tray_icon_event(|tray, event| {
            if should_show_from_tray_event(&event) {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    tracing::info!("system tray icon ready");
    Ok(())
}

fn should_show_from_tray_event(event: &TrayIconEvent) -> bool {
    match event {
        TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
        } => true,
        #[cfg(windows)]
        TrayIconEvent::DoubleClick { .. } => true,
        _ => false,
    }
}
