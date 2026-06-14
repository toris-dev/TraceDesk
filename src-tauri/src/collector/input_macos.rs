//! macOS NSEvent 글로벌·로컬 모니터
//!
//! - **글로벌**: 다른 앱 사용 중 ⌘C/V 감지 (입력 모니터링 권한 필요)
//! - **로컬**: TraceDesk 창 포커스 중 ⌘C/V 감지
//!
//! CGEventTap/rdev는 macOS 15+에서 TSM API 크래시 유발 → NSEvent 사용.

use crate::collector::input::{self, InputEvent};
use block::ConcreteBlock;
use cocoa::base::{id, nil};
use cocoa::foundation::NSAutoreleasePool;
use crossbeam_channel::Sender;
use objc::{class, msg_send, sel, sel_impl};
use parking_lot::Mutex;
use std::ffi::CStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::AppHandle;

const NSEVENT_KEY_DOWN: u64 = 1 << 10;
const NS_COMMAND: u64 = 1 << 20;
const NS_SHIFT: u64 = 1 << 17;

// Physical key codes (layout-independent)
const VK_ANSI_C: u16 = 8;
const VK_ANSI_V: u16 = 9;
const VK_ANSI_3: u16 = 20;
const VK_ANSI_4: u16 = 21;
const VK_ANSI_5: u16 = 23;

const DEBOUNCE: Duration = Duration::from_millis(400);

static MONITORS: Mutex<(Option<usize>, Option<usize>)> = Mutex::new((None, None));
static INSTALLED: AtomicBool = AtomicBool::new(false);

struct Debouncer {
    last_copy: Option<Instant>,
    last_paste: Option<Instant>,
    last_screenshot: Option<Instant>,
}

impl Debouncer {
    fn new() -> Self {
        Self {
            last_copy: None,
            last_paste: None,
            last_screenshot: None,
        }
    }

    fn allow(&mut self, action: &InputEvent) -> bool {
        let slot = match action {
            InputEvent::Copy { .. } => &mut self.last_copy,
            InputEvent::Paste { .. } => &mut self.last_paste,
            InputEvent::Screenshot { .. } => &mut self.last_screenshot,
        };
        let now = Instant::now();
        if slot
            .map(|t| now.duration_since(t) < DEBOUNCE)
            .unwrap_or(false)
        {
            return false;
        }
        *slot = Some(now);
        true
    }
}

fn event_char(event: id) -> Option<String> {
    unsafe {
        if event == nil {
            return None;
        }
        let chars: id = msg_send![event, charactersIgnoringModifiers];
        if chars == nil {
            return None;
        }
        let cstr: *const i8 = msg_send![chars, UTF8String];
        if cstr.is_null() {
            return None;
        }
        Some(CStr::from_ptr(cstr).to_string_lossy().trim().to_lowercase())
    }
}

fn detect_action(flags: u64, event: id) -> Option<InputEvent> {
    if flags & NS_COMMAND == 0 {
        return None;
    }

    unsafe {
        let key_code: u16 = msg_send![event, keyCode];
        let shift = flags & NS_SHIFT != 0;

        if !shift {
            return match key_code {
                VK_ANSI_C => Some(InputEvent::Copy {
                    app: None,
                    window_title: None,
                }),
                VK_ANSI_V => Some(InputEvent::Paste {
                    app: None,
                    window_title: None,
                }),
                _ => {
                    let ch = event_char(event)?;
                    match ch.as_str() {
                        "c" => Some(InputEvent::Copy {
                            app: None,
                            window_title: None,
                        }),
                        "v" => Some(InputEvent::Paste {
                            app: None,
                            window_title: None,
                        }),
                        _ => None,
                    }
                }
            };
        }

        match key_code {
            VK_ANSI_3 => Some(InputEvent::Screenshot {
                shortcut: "cmd+shift+3".into(),
                app: None,
                window_title: None,
            }),
            VK_ANSI_4 => Some(InputEvent::Screenshot {
                shortcut: "cmd+shift+4".into(),
                app: None,
                window_title: None,
            }),
            VK_ANSI_5 => Some(InputEvent::Screenshot {
                shortcut: "cmd+shift+5".into(),
                app: None,
                window_title: None,
            }),
            _ => {
                let ch = event_char(event)?;
                match ch.as_str() {
                    "3" => Some(InputEvent::Screenshot {
                        shortcut: "cmd+shift+3".into(),
                        app: None,
                        window_title: None,
                    }),
                    "4" => Some(InputEvent::Screenshot {
                        shortcut: "cmd+shift+4".into(),
                        app: None,
                        window_title: None,
                    }),
                    "5" => Some(InputEvent::Screenshot {
                        shortcut: "cmd+shift+5".into(),
                        app: None,
                        window_title: None,
                    }),
                    _ => None,
                }
            }
        }
    }
}

fn dispatch_key_event(event: id, tx: &Sender<InputEvent>, debouncer: &Mutex<Debouncer>) {
    if event == nil {
        return;
    }
    unsafe {
        let flags: u64 = msg_send![event, modifierFlags];
        if let Some(action) = detect_action(flags, event) {
            let ctx = input::current_source_context();
            let action = action.with_source_context(ctx);
            let mut d = debouncer.lock();
            if d.allow(&action) {
                tracing::debug!(?action, "macOS key action detected");
                let _ = tx.send(action);
            }
        }
    }
}

pub fn uninstall_key_monitors() {
    if !INSTALLED.load(Ordering::SeqCst) {
        return;
    }

    unsafe {
        let _pool = NSAutoreleasePool::new(nil);
        let mut guards = MONITORS.lock();
        if let Some(global) = guards.0.take() {
            let obj: id = global as id;
            let _: () = msg_send![class!(NSEvent), removeMonitor: obj];
        }
        if let Some(local) = guards.1.take() {
            let obj: id = local as id;
            let _: () = msg_send![class!(NSEvent), removeMonitor: obj];
        }
    }

    INSTALLED.store(false, Ordering::SeqCst);
    tracing::info!("macOS key monitors removed");
}

/// 메인 스레드에서 호출해야 함 (Tauri setup → run_on_main_thread)
pub fn install_global_key_monitor(tx: Sender<InputEvent>) -> Result<(), String> {
    if INSTALLED.load(Ordering::SeqCst) {
        return Ok(());
    }

    let tx = Arc::new(tx);
    let debouncer = Arc::new(Mutex::new(Debouncer::new()));

    unsafe {
        let _pool = NSAutoreleasePool::new(nil);

        let tx_global = Arc::clone(&tx);
        let debouncer_global = Arc::clone(&debouncer);
        let global_handler = ConcreteBlock::new(move |event: id| {
            dispatch_key_event(event, &tx_global, &debouncer_global);
        });
        let global_handler = global_handler.copy();

        let global: id = msg_send![
            class!(NSEvent),
            addGlobalMonitorForEventsMatchingMask: NSEVENT_KEY_DOWN
            handler: &*global_handler
        ];

        let tx_local = Arc::clone(&tx);
        let debouncer_local = Arc::clone(&debouncer);
        let local_handler = ConcreteBlock::new(move |event: id| -> id {
            dispatch_key_event(event, &tx_local, &debouncer_local);
            event
        });
        let local_handler = local_handler.copy();

        let local: id = msg_send![
            class!(NSEvent),
            addLocalMonitorForEventsMatchingMask: NSEVENT_KEY_DOWN
            handler: &*local_handler
        ];

        if global == nil && local == nil {
            return Err(
                "NSEvent monitors failed — Input Monitoring permission may be required".into(),
            );
        }

        let mut guards = MONITORS.lock();
        if global == nil {
            tracing::warn!(
                "global key monitor unavailable — copy/paste in other apps needs Input Monitoring permission"
            );
        } else {
            std::mem::forget(global_handler);
            guards.0 = Some(global as usize);
        }

        if local == nil {
            tracing::warn!("local key monitor unavailable");
        } else {
            std::mem::forget(local_handler);
            guards.1 = Some(local as usize);
        }
    }

    INSTALLED.store(true, Ordering::SeqCst);
    tracing::info!("macOS key monitors installed (global + local NSEvent)");
    Ok(())
}

pub fn has_global_monitor() -> bool {
    MONITORS.lock().0.is_some()
}

fn input_monitoring_granted() -> bool {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightListenEventAccess() -> bool;
    }
    unsafe { CGPreflightListenEventAccess() }
}

pub fn reinstall_key_monitors_if_needed(app: &AppHandle, tx: Sender<InputEvent>) {
    if !INSTALLED.load(Ordering::SeqCst) {
        return;
    }
    if has_global_monitor() || !input_monitoring_granted() {
        return;
    }
    tracing::info!("input monitoring permission granted — reinstalling global key monitor");
    let _ = app.run_on_main_thread(move || {
        uninstall_key_monitors();
        if let Err(e) = install_global_key_monitor(tx) {
            tracing::error!(error = %e, "failed to reinstall global key monitor");
        }
    });
}

pub fn sync_key_monitor(
    app: &AppHandle,
    enabled: bool,
    tx: Sender<InputEvent>,
) -> Result<(), String> {
    if enabled {
        if INSTALLED.load(Ordering::SeqCst) {
            reinstall_key_monitors_if_needed(app, tx);
            return Ok(());
        }
        app.run_on_main_thread(move || {
            if let Err(e) = install_global_key_monitor(tx) {
                tracing::error!(error = %e, "failed to install macOS key monitor");
            }
        })
        .map_err(|e| e.to_string())?;
    } else {
        app.run_on_main_thread(uninstall_key_monitors)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
