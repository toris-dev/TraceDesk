use crate::collector::clipboard;
use crate::collector::screenshot;
use crate::collector::thumbnail;
use crate::events::{ActivityEvent, EventType};
use crate::os::create_monitor;
use anyhow::{Context, Result};
use serde_json::{json, Value};
use std::path::Path;
#[cfg(not(target_os = "macos"))]
use std::time::{Duration, Instant};

#[cfg(not(target_os = "macos"))]
const DEBOUNCE: Duration = Duration::from_millis(400);

#[derive(Debug, Clone)]
pub enum InputEvent {
    Copy,
    Paste,
    Screenshot { shortcut: String },
}

pub fn record_copy(
    repo: &crate::database::Repository,
    app: Option<&str>,
    store_preview: bool,
) -> Result<ActivityEvent> {
    let metadata = clipboard::build_clipboard_metadata(store_preview);
    let mut event = ActivityEvent::new(EventType::Copy).with_metadata(metadata);
    if let Some(app) = app {
        event = event.with_app(app.to_string(), None);
    }
    let id = repo.insert_event(&event)?;
    event.id = Some(id);
    tracing::debug!("copy event recorded");
    Ok(event)
}

pub fn record_paste(
    repo: &crate::database::Repository,
    app: Option<&str>,
    store_preview: bool,
) -> Result<ActivityEvent> {
    let metadata = clipboard::build_clipboard_metadata(store_preview);
    let mut event = ActivityEvent::new(EventType::Paste).with_metadata(metadata);
    if let Some(app) = app {
        event = event.with_app(app.to_string(), None);
    }
    let id = repo.insert_event(&event)?;
    event.id = Some(id);
    tracing::debug!("paste event recorded");
    Ok(event)
}

pub fn record_screenshot(
    repo: &crate::database::Repository,
    shortcut: &str,
    app: Option<&str>,
) -> Result<ActivityEvent> {
    let mut event = ActivityEvent::new(EventType::Screenshot).with_metadata(json!({
        "source": "keyboard",
        "shortcut": shortcut,
    }));
    if let Some(app) = app {
        event = event.with_app(app.to_string(), None);
    }
    let id = repo.insert_event(&event)?;
    event.id = Some(id);
    screenshot::set_pending_keyboard_event(id);
    tracing::debug!(shortcut, event_id = id, "screenshot event recorded");
    Ok(event)
}

pub fn record_screenshot_path(
    repo: &crate::database::Repository,
    path: &Path,
    store_preview: bool,
) -> Result<ActivityEvent> {
    let mut metadata = json!({ "source": "filesystem" });
    enrich_screenshot_metadata(&mut metadata, path, store_preview, None);

    let event = ActivityEvent::new(EventType::Screenshot).with_metadata(metadata);
    let id = repo.insert_event(&event)?;
    let mut stored = event;
    stored.id = Some(id);

    if store_preview {
        let metadata = build_screenshot_metadata(path, "filesystem", store_preview, id);
        stored.metadata = Some(metadata.clone());
        repo.update_event_metadata(id, &metadata)?;
    }

    tracing::debug!(path = %path.display(), "screenshot file recorded");
    Ok(stored)
}

pub fn attach_screenshot_file(
    repo: &crate::database::Repository,
    event_id: i64,
    path: &Path,
    store_preview: bool,
) -> Result<ActivityEvent> {
    let mut event = repo
        .get_event_by_id(event_id)?
        .with_context(|| format!("screenshot event {event_id} not found"))?;

    let mut metadata = event.metadata.take().unwrap_or_else(|| {
        json!({
            "source": "keyboard",
        })
    });
    enrich_screenshot_metadata(&mut metadata, path, store_preview, Some(event_id));
    repo.update_event_metadata(event_id, &metadata)?;
    event.metadata = Some(metadata);
    tracing::debug!(event_id, path = %path.display(), "screenshot attached to keyboard event");
    Ok(event)
}

fn build_screenshot_metadata(
    path: &Path,
    source: &str,
    store_preview: bool,
    event_id: i64,
) -> Value {
    let mut metadata = json!({ "source": source });
    enrich_screenshot_metadata(&mut metadata, path, store_preview, Some(event_id));
    metadata
}

fn enrich_screenshot_metadata(
    metadata: &mut Value,
    path: &Path,
    store_preview: bool,
    event_id: Option<i64>,
) {
    let Some(obj) = metadata.as_object_mut() else {
        return;
    };

    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        obj.insert("filename".into(), json!(name));
    }
    obj.insert("source_path".into(), json!(path.display().to_string()));

    if store_preview {
        if let Some(event_id) = event_id {
            if let Ok(thumb) = thumbnail::create_screenshot_thumbnail(path, event_id) {
                obj.insert(
                    "thumbnail_path".into(),
                    json!(thumb.display().to_string()),
                );
            }
        }
    }
}

pub fn current_app_name() -> Option<String> {
    create_monitor()
        .get_active_window()
        .ok()
        .flatten()
        .map(|w| w.application)
}

#[cfg(not(target_os = "macos"))]
struct Debouncer {
    last_copy: Option<Instant>,
    last_paste: Option<Instant>,
    last_screenshot: Option<Instant>,
}

#[cfg(not(target_os = "macos"))]
impl Debouncer {
    fn new() -> Self {
        Self {
            last_copy: None,
            last_paste: None,
            last_screenshot: None,
        }
    }

    fn allow_copy(&mut self) -> bool {
        let now = Instant::now();
        if self
            .last_copy
            .map(|t| now.duration_since(t) < DEBOUNCE)
            .unwrap_or(false)
        {
            return false;
        }
        self.last_copy = Some(now);
        true
    }

    fn allow_paste(&mut self) -> bool {
        let now = Instant::now();
        if self
            .last_paste
            .map(|t| now.duration_since(t) < DEBOUNCE)
            .unwrap_or(false)
        {
            return false;
        }
        self.last_paste = Some(now);
        true
    }

    fn allow_screenshot(&mut self) -> bool {
        let now = Instant::now();
        if self
            .last_screenshot
            .map(|t| now.duration_since(t) < DEBOUNCE)
            .unwrap_or(false)
        {
            return false;
        }
        self.last_screenshot = Some(now);
        true
    }
}

#[cfg(not(target_os = "macos"))]
#[derive(Default)]
struct ModifierState {
    meta: bool,
    ctrl: bool,
    shift: bool,
    alt: bool,
}

#[cfg(not(target_os = "macos"))]
impl ModifierState {
    fn update(&mut self, key: rdev::Key, pressed: bool) {
        match key {
            rdev::Key::MetaLeft | rdev::Key::MetaRight => self.meta = pressed,
            rdev::Key::ControlLeft | rdev::Key::ControlRight => self.ctrl = pressed,
            rdev::Key::ShiftLeft | rdev::Key::ShiftRight => self.shift = pressed,
            rdev::Key::Alt | rdev::Key::AltGr => self.alt = pressed,
            _ => {}
        }
    }

    #[cfg(not(target_os = "macos"))]
    fn primary(&self) -> bool {
        self.ctrl
    }
}

#[cfg(not(target_os = "macos"))]
fn key_label(key: rdev::Key) -> Option<&'static str> {
    match key {
        rdev::Key::KeyC => Some("c"),
        rdev::Key::KeyV => Some("v"),
        rdev::Key::KeyX => Some("x"),
        rdev::Key::Num3 => Some("3"),
        rdev::Key::Num4 => Some("4"),
        rdev::Key::Num5 => Some("5"),
        rdev::Key::PrintScreen => Some("printscreen"),
        rdev::Key::KeyS => Some("s"),
        _ => None,
    }
}

#[cfg(not(target_os = "macos"))]
fn detect_action(modifiers: &ModifierState, key: rdev::Key) -> Option<InputEvent> {
    let primary = modifiers.primary();

    if primary && !modifiers.shift {
        match key {
            rdev::Key::KeyC => return Some(InputEvent::Copy),
            rdev::Key::KeyV => return Some(InputEvent::Paste),
            _ => {}
        }
    }

    #[cfg(target_os = "macos")]
    if modifiers.meta && modifiers.shift {
        match key {
            rdev::Key::Num3 => {
                return Some(InputEvent::Screenshot {
                    shortcut: "cmd+shift+3".into(),
                });
            }
            rdev::Key::Num4 => {
                return Some(InputEvent::Screenshot {
                    shortcut: "cmd+shift+4".into(),
                });
            }
            rdev::Key::Num5 => {
                return Some(InputEvent::Screenshot {
                    shortcut: "cmd+shift+5".into(),
                });
            }
            _ => {}
        }
    }

    #[cfg(target_os = "windows")]
    {
        if key == rdev::Key::PrintScreen {
            return Some(InputEvent::Screenshot {
                shortcut: "printscreen".into(),
            });
        }
        if modifiers.meta && modifiers.shift && key == rdev::Key::KeyS {
            return Some(InputEvent::Screenshot {
                shortcut: "win+shift+s".into(),
            });
        }
    }

    #[cfg(target_os = "linux")]
    {
        if key == rdev::Key::PrintScreen {
            return Some(InputEvent::Screenshot {
                shortcut: "printscreen".into(),
            });
        }
        if primary && modifiers.shift && key == rdev::Key::KeyS {
            return Some(InputEvent::Screenshot {
                shortcut: "ctrl+shift+s".into(),
            });
        }
    }

    let _ = key_label(key);
    let _ = primary;
    None
}

#[cfg(not(target_os = "macos"))]
pub fn spawn_input_listener(
    tx: crossbeam_channel::Sender<InputEvent>,
) -> std::thread::JoinHandle<()> {
    spawn_rdev_input_listener(tx)
}

#[cfg(not(target_os = "macos"))]
fn spawn_rdev_input_listener(
    tx: crossbeam_channel::Sender<InputEvent>,
) -> std::thread::JoinHandle<()> {
    std::thread::Builder::new()
        .name("tracedesk-input".into())
        .spawn(move || {
            let mut modifiers = ModifierState::default();
            let mut debouncer = Debouncer::new();

            let callback = move |event: rdev::Event| {
                match event.event_type {
                    rdev::EventType::KeyPress(key) => {
                        if let Some(action) = detect_action(&modifiers, key) {
                            let allowed = match &action {
                                InputEvent::Copy => debouncer.allow_copy(),
                                InputEvent::Paste => debouncer.allow_paste(),
                                InputEvent::Screenshot { .. } => debouncer.allow_screenshot(),
                            };
                            if allowed {
                                let _ = tx.send(action);
                            }
                        }
                        modifiers.update(key, true);
                    }
                    rdev::EventType::KeyRelease(key) => {
                        modifiers.update(key, false);
                    }
                    _ => {}
                }
            };

            if let Err(e) = rdev::listen(callback) {
                tracing::error!(error = ?e, "input listener failed — accessibility permission may be required");
            }
        })
        .expect("failed to spawn input listener thread")
}
