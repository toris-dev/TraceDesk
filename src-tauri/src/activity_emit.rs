use crate::commands::ActivityItem;
use crate::events::{ActivityEvent, EventType};
use tauri::{AppHandle, Emitter};

pub const ACTIVITY_EVENT: &str = "activity-event";

pub fn activity_item_from(event: &ActivityEvent) -> ActivityItem {
    ActivityItem {
        id: event.id,
        event_type: event.event_type.as_str().to_string(),
        time: event.created_at.format("%H:%M:%S").to_string(),
        name: event.application.clone(),
        duration: event.duration,
        metadata: event.metadata.clone(),
    }
}

pub fn emit_action_event(app: &AppHandle, event: &ActivityEvent) {
    if !matches!(
        event.event_type,
        EventType::Copy | EventType::Paste | EventType::Screenshot
    ) {
        return;
    }

    let payload = activity_item_from(event);
    if let Err(e) = app.emit(ACTIVITY_EVENT, &payload) {
        tracing::debug!(error = %e, "failed to emit activity event");
    }
}
