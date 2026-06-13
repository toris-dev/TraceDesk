use arboard::Clipboard;
use serde_json::{json, Value};
use std::time::Duration;

const PREVIEW_MAX_CHARS: usize = 400;
const READ_DELAY: Duration = Duration::from_millis(50);
const RETRY_DELAY: Duration = Duration::from_millis(100);

struct ClipboardSnapshot {
    length: usize,
    content_type: &'static str,
    preview: Option<String>,
    truncated: bool,
}

pub fn build_clipboard_metadata(store_preview: bool) -> Value {
    std::thread::sleep(READ_DELAY);
    let mut snap = read_snapshot(store_preview);
    if store_preview && snap.content_type == "empty" {
        std::thread::sleep(RETRY_DELAY);
        snap = read_snapshot(store_preview);
    }
    snap.into_json()
}

fn read_snapshot(store_preview: bool) -> ClipboardSnapshot {
    let Ok(mut cb) = Clipboard::new() else {
        return ClipboardSnapshot {
            length: 0,
            content_type: "unknown",
            preview: None,
            truncated: false,
        };
    };

    if let Ok(text) = cb.get_text() {
        let length = text.chars().count();
        let (preview, truncated) = if store_preview {
            truncate_preview(&text)
        } else {
            (None, false)
        };
        return ClipboardSnapshot {
            length,
            content_type: "text",
            preview,
            truncated,
        };
    }

    if cb.get_image().is_ok() {
        return ClipboardSnapshot {
            length: 0,
            content_type: "image",
            preview: None,
            truncated: false,
        };
    }

    ClipboardSnapshot {
        length: 0,
        content_type: "empty",
        preview: None,
        truncated: false,
    }
}

fn truncate_preview(text: &str) -> (Option<String>, bool) {
    if text.is_empty() {
        return (None, false);
    }
    let truncated = text.chars().count() > PREVIEW_MAX_CHARS;
    let preview: String = text.chars().take(PREVIEW_MAX_CHARS).collect();
    (Some(preview), truncated)
}

impl ClipboardSnapshot {
    fn into_json(self) -> Value {
        let mut meta = json!({
            "clipboard_length": self.length,
            "content_type": self.content_type,
        });
        if let Some(preview) = self.preview {
            meta["clipboard_preview"] = json!(preview);
        }
        if self.truncated {
            meta["clipboard_truncated"] = json!(true);
        }
        meta
    }
}
