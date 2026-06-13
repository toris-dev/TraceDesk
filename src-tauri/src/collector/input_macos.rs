//! macOS NSEvent 글로벌·로컬 모니터
//!
//! - **글로벌**: 다른 앱 사용 중 ⌘C/V 감지 (입력 모니터링 권한 필요)
//! - **로컬**: TraceDesk 창 포커스 중 ⌘C/V 감지
//!
//! CGEventTap/rdev는 macOS 15+에서 TSM API 크래시 유발 → NSEvent 사용.

use crate::collector::input::InputEvent;
use block::ConcreteBlock;
use cocoa::base::{id, nil};
use cocoa::foundation::NSAutoreleasePool;
use crossbeam_channel::Sender;
use objc::{class, msg_send, sel, sel_impl};
use std::ffi::CStr;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

const NSEVENT_KEY_DOWN: u64 = 1 << 10;
const NS_COMMAND: u64 = 1 << 20;
const NS_SHIFT: u64 = 1 << 17;

const DEBOUNCE: Duration = Duration::from_millis(400);

static GLOBAL_MONITOR: OnceLock<usize> = OnceLock::new();
static LOCAL_MONITOR: OnceLock<usize> = OnceLock::new();

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
            InputEvent::Copy => &mut self.last_copy,
            InputEvent::Paste => &mut self.last_paste,
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
        Some(
            CStr::from_ptr(cstr)
                .to_string_lossy()
                .trim()
                .to_lowercase(),
        )
    }
}

fn detect_action(flags: u64, event: id) -> Option<InputEvent> {
    if flags & NS_COMMAND == 0 {
        return None;
    }

    let ch = event_char(event)?;
    let shift = flags & NS_SHIFT != 0;

    if !shift {
        return match ch.as_str() {
            "c" => Some(InputEvent::Copy),
            "v" => Some(InputEvent::Paste),
            _ => None,
        };
    }

    match ch.as_str() {
        "3" => Some(InputEvent::Screenshot {
            shortcut: "cmd+shift+3".into(),
        }),
        "4" => Some(InputEvent::Screenshot {
            shortcut: "cmd+shift+4".into(),
        }),
        "5" => Some(InputEvent::Screenshot {
            shortcut: "cmd+shift+5".into(),
        }),
        _ => None,
    }
}

fn dispatch_key_event(event: id, tx: &Sender<InputEvent>, debouncer: &Mutex<Debouncer>) {
    if event == nil {
        return;
    }
    unsafe {
        let flags: u64 = msg_send![event, modifierFlags];
        if let Some(action) = detect_action(flags, event) {
            if let Ok(mut d) = debouncer.lock() {
                if d.allow(&action) {
                    tracing::debug!(?action, "macOS key action detected");
                    let _ = tx.send(action);
                }
            }
        }
    }
}

/// 메인 스레드에서 호출해야 함 (Tauri setup → run_on_main_thread)
pub fn install_global_key_monitor(tx: Sender<InputEvent>) -> Result<(), String> {
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

        if global == nil {
            tracing::warn!(
                "global key monitor unavailable — copy/paste in other apps needs Input Monitoring permission"
            );
        } else {
            std::mem::forget(global_handler);
            let _ = GLOBAL_MONITOR.set(global as usize);
        }

        if local == nil {
            tracing::warn!("local key monitor unavailable");
        } else {
            std::mem::forget(local_handler);
            let _ = LOCAL_MONITOR.set(local as usize);
        }
    }

    tracing::info!("macOS key monitors installed (global + local NSEvent)");
    Ok(())
}
