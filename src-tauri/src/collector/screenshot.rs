use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;
use std::path::PathBuf;
use std::time::{Duration, Instant};

const SCREENSHOT_DEBOUNCE: Duration = Duration::from_secs(3);

static LAST_KEYBOARD_SCREENSHOT: Mutex<Option<Instant>> = Mutex::new(None);
static PENDING_KEYBOARD_EVENT: Mutex<Option<i64>> = Mutex::new(None);

pub fn mark_keyboard_screenshot() {
    *LAST_KEYBOARD_SCREENSHOT.lock() = Some(Instant::now());
}

pub fn set_pending_keyboard_event(event_id: i64) {
    *PENDING_KEYBOARD_EVENT.lock() = Some(event_id);
}

pub fn take_pending_keyboard_event() -> Option<i64> {
    if keyboard_debounce_active() {
        PENDING_KEYBOARD_EVENT.lock().take()
    } else {
        None
    }
}

fn keyboard_debounce_active() -> bool {
    LAST_KEYBOARD_SCREENSHOT
        .lock()
        .map(|t| t.elapsed() < SCREENSHOT_DEBOUNCE)
        .unwrap_or(false)
}

pub fn is_screenshot_filename(name: &str) -> bool {
    let lower = name.to_lowercase();
    (lower.contains("screenshot") || lower.contains("screen shot") || lower.starts_with("snip"))
        && (lower.ends_with(".png")
            || lower.ends_with(".jpg")
            || lower.ends_with(".jpeg")
            || lower.ends_with(".webp"))
}

pub fn watch_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(home) = dirs::home_dir() {
        paths.push(home.join("Desktop"));
        paths.push(home.join("Pictures").join("Screenshots"));

        #[cfg(windows)]
        {
            paths.push(home.join("OneDrive").join("Desktop"));
            paths.push(home.join("OneDrive").join("Pictures").join("Screenshots"));
            paths.push(home.join("Videos").join("Captures"));
        }
    }
    paths.retain(|p| p.exists());
    paths
}

pub fn spawn_screenshot_watcher(
    tx: crossbeam_channel::Sender<PathBuf>,
) -> Option<std::thread::JoinHandle<()>> {
    let paths = watch_paths();
    if paths.is_empty() {
        tracing::warn!("no screenshot watch directories found");
        return None;
    }

    Some(
        std::thread::Builder::new()
            .name("tracedesk-screenshot".into())
            .spawn(move || {
                let (watch_tx, watch_rx) = crossbeam_channel::unbounded();

                let mut watcher = match RecommendedWatcher::new(
                    move |res| {
                        if let Ok(event) = res {
                            let _ = watch_tx.send(event);
                        }
                    },
                    notify::Config::default(),
                ) {
                    Ok(w) => w,
                    Err(e) => {
                        tracing::error!(error = %e, "failed to create screenshot watcher");
                        return;
                    }
                };

                for path in &paths {
                    if let Err(e) = watcher.watch(path, RecursiveMode::NonRecursive) {
                        tracing::warn!(path = %path.display(), error = %e, "failed to watch path");
                    } else {
                        tracing::info!(path = %path.display(), "watching for screenshots");
                    }
                }

                while let Ok(event) = watch_rx.recv() {
                    if !matches!(event.kind, EventKind::Create(_)) {
                        continue;
                    }

                    for path in event.paths {
                        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                            continue;
                        };
                        if !is_screenshot_filename(name) {
                            continue;
                        }

                        if keyboard_debounce_active() {
                            tracing::debug!(path = %path.display(), "screenshot file during keyboard debounce");
                        }

                        let _ = tx.send(path);
                    }
                }
            })
            .expect("failed to spawn screenshot watcher"),
    )
}
