use super::clipboard;
use super::input;
use super::screenshot;
use crate::analytics::summary::compute_daily_statistics;
use crate::database::{Database, Repository};
use crate::events::EventType;
use chrono::Local;
use std::fs;
use std::path::PathBuf;
use std::thread;
use std::time::Duration;

fn temp_repo() -> (Repository, PathBuf) {
    let dir = std::env::temp_dir().join(format!(
        "tracedesk-test-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    fs::create_dir_all(&dir).expect("create temp dir");
    let db_path = dir.join("test.db");
    let db = Database::open(Some(db_path)).expect("open test db");
    (Repository::new(db), dir)
}

fn cleanup(dir: PathBuf) {
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn screenshot_filename_detects_common_locales() {
    assert!(screenshot::is_screenshot_filename(
        "Screenshot 2025-06-13 at 10.00.00 AM.png"
    ));
    assert!(screenshot::is_screenshot_filename(
        "스크린샷 2025-06-13 오전 10.00.00.png"
    ));
    assert!(screenshot::is_screenshot_filename(
        "화면 캡처 2025-06-13.png"
    ));
    assert!(!screenshot::is_screenshot_filename("notes.txt"));
    assert!(!screenshot::is_screenshot_filename("photo.png"));
}

#[test]
fn clipboard_metadata_skips_preview_when_disabled() {
    let meta = clipboard::build_clipboard_metadata(false);
    assert!(meta.get("clipboard_preview").is_none());
    assert!(meta.get("content_type").is_some());
}

#[test]
fn record_copy_paste_and_screenshot_events() {
    let _guard = screenshot::pending_test_guard();
    screenshot::reset_test_state();
    let (repo, dir) = temp_repo();

    let copy =
        input::record_copy(&repo, Some("Safari"), Some("Example Page"), false).expect("copy");
    let paste = input::record_paste(&repo, Some("Notes"), Some("Untitled"), false).expect("paste");
    let shot = input::record_screenshot(&repo, "cmd+shift+3", Some("Finder"), None).expect("shot");

    assert_eq!(copy.event_type, EventType::Copy);
    assert_eq!(paste.event_type, EventType::Paste);
    assert_eq!(shot.event_type, EventType::Screenshot);
    assert!(copy.id.is_some());
    assert!(paste.id.is_some());
    assert!(shot.id.is_some());

    let today = Local::now().date_naive();
    let events = repo.get_events_for_date(today).expect("events");
    let types: Vec<_> = events
        .iter()
        .filter(|e| {
            matches!(
                e.event_type,
                EventType::Copy | EventType::Paste | EventType::Screenshot
            )
        })
        .map(|e| e.event_type)
        .collect();

    assert_eq!(types.len(), 3);

    let stats = compute_daily_statistics(&repo, today).expect("stats");
    assert_eq!(stats.copy, 1);
    assert_eq!(stats.paste, 1);
    assert_eq!(stats.screenshot, 1);

    cleanup(dir);
}

#[test]
fn screenshot_keyboard_pending_links_file_within_debounce() {
    let _guard = screenshot::pending_test_guard();
    screenshot::reset_test_state();
    let (repo, dir) = temp_repo();

    let shot = input::record_screenshot(&repo, "cmd+shift+4", None, None).expect("shot");
    let event_id = shot.id.expect("event id");

    screenshot::mark_keyboard_screenshot();
    screenshot::set_pending_keyboard_event(event_id);

    let shots_dir = dir.join("shots");
    fs::create_dir_all(&shots_dir).expect("shots dir");
    let file = shots_dir.join("스크린샷 test.png");
    fs::write(&file, b"fake png").expect("write file");

    assert_eq!(screenshot::take_pending_keyboard_event(), Some(event_id));

    let updated = input::attach_screenshot_file(&repo, event_id, &file, false).expect("attach");
    assert_eq!(
        updated.metadata.as_ref().and_then(|m| m.get("filename")),
        Some(&serde_json::json!("스크린샷 test.png"))
    );

    cleanup(dir);
}

#[test]
fn stale_screenshot_pending_is_cleared_after_debounce() {
    let _guard = screenshot::pending_test_guard();
    screenshot::reset_test_state();
    screenshot::mark_keyboard_screenshot();
    screenshot::set_pending_keyboard_event(42);

    thread::sleep(Duration::from_secs(11));

    assert_eq!(screenshot::take_pending_keyboard_event(), None);
    assert_eq!(screenshot::take_pending_keyboard_event(), None);
}
