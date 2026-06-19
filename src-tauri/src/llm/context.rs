use crate::database::Repository;
use crate::events::{ActivityEvent, EventType};
use anyhow::Result;
use chrono::{Local, NaiveDate};

const MAX_CONTEXT_CHARS: usize = 14_000;
const MAX_RAG_EVENTS: usize = 90;

pub fn build_action_context_for_query(
    repo: &Repository,
    date: NaiveDate,
    query: &str,
) -> Result<String> {
    let events = repo.get_events_for_date(date)?;
    let action_events: Vec<&ActivityEvent> = events.iter().filter(|e| is_action(e)).collect();
    let terms = query_terms(query);
    if terms.is_empty() {
        return build_context_from_events(action_events);
    }

    let mut scored: Vec<(i64, usize, &ActivityEvent)> = action_events
        .iter()
        .enumerate()
        .map(|(idx, event)| (score_event(event, &terms), idx, *event))
        .filter(|(score, _, _)| *score > 0)
        .collect();

    if scored.is_empty() {
        return build_context_from_events(action_events);
    }

    scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.cmp(&a.1)));
    let mut selected: Vec<(usize, &ActivityEvent)> = scored
        .into_iter()
        .take(MAX_RAG_EVENTS)
        .map(|(_, idx, event)| (idx, event))
        .collect();
    selected.sort_by_key(|(idx, _)| *idx);

    let mut context = build_context_from_events(selected.into_iter().map(|(_, e)| e).collect())?;
    if !context.is_empty() {
        context.insert_str(
            0,
            "RAG: 질문과 관련도가 높은 복사·붙여넣기·캡처 기록을 우선 선별했습니다.\n",
        );
    }
    Ok(context)
}

fn build_context_from_events(events: Vec<&ActivityEvent>) -> Result<String> {
    let mut lines = Vec::new();

    for event in events {
        lines.push(format_event_line(event));
    }

    if lines.is_empty() {
        return Ok(String::new());
    }

    let mut out = String::new();
    for line in lines.iter().rev() {
        if out.len() + line.len() + 1 > MAX_CONTEXT_CHARS {
            out.insert_str(0, "...(older events truncated)\n");
            break;
        }
        if out.is_empty() {
            out = line.clone();
        } else {
            out = format!("{line}\n{out}");
        }
    }

    Ok(out)
}

fn format_event_line(event: &ActivityEvent) -> String {
    let time = event
        .created_at
        .with_timezone(&Local)
        .format("%H:%M:%S")
        .to_string();
    let app = event.application.as_deref().unwrap_or("?");
    let window = event.window_title.as_deref().unwrap_or("");
    let mut parts = vec![format!("[{}] {}", event.event_type.as_str(), time)];
    parts.push(format!("app={app}"));
    if !window.is_empty() {
        parts.push(format!("window={window}"));
    }

    if let Some(meta) = &event.metadata {
        if let Some(preview) = meta.get("clipboard_preview").and_then(|v| v.as_str()) {
            let snippet: String = preview.chars().take(280).collect();
            parts.push(format!("content={snippet}"));
        } else if let Some(ct) = meta.get("content_type").and_then(|v| v.as_str()) {
            parts.push(format!("content_type={ct}"));
            if let Some(len) = meta.get("clipboard_length").and_then(|v| v.as_u64()) {
                parts.push(format!("clipboard_length={len}"));
            }
        }
        if let Some(filename) = meta.get("filename").and_then(|v| v.as_str()) {
            parts.push(format!("file={filename}"));
        }
        if let Some(shortcut) = meta.get("shortcut").and_then(|v| v.as_str()) {
            parts.push(format!("shortcut={shortcut}"));
        }
    }

    parts.join(" | ")
}

fn query_terms(query: &str) -> Vec<String> {
    query
        .split(|c: char| !c.is_alphanumeric() && c != '_' && c != '-' && c != '.')
        .map(|s| s.trim().to_lowercase())
        .filter(|s| s.chars().count() >= 2)
        .take(16)
        .collect()
}

fn score_event(event: &ActivityEvent, terms: &[String]) -> i64 {
    let haystack = event_search_text(event);
    let mut score = 0;
    for term in terms {
        if haystack.contains(term) {
            score += 4;
        }
        if event
            .application
            .as_deref()
            .is_some_and(|v| v.to_lowercase().contains(term))
        {
            score += 3;
        }
        if event
            .window_title
            .as_deref()
            .is_some_and(|v| v.to_lowercase().contains(term))
        {
            score += 2;
        }
        if event.event_type.as_str().to_lowercase().contains(term) {
            score += 3;
        }
    }

    if matches!(event.event_type, EventType::Copy | EventType::Paste) {
        score += 1;
    }
    score
}

fn event_search_text(event: &ActivityEvent) -> String {
    let mut parts = vec![event.event_type.as_str().to_lowercase()];
    parts.extend(action_aliases(&event.event_type));
    if let Some(app) = &event.application {
        parts.push(app.to_lowercase());
    }
    if let Some(window) = &event.window_title {
        parts.push(window.to_lowercase());
    }
    if let Some(meta) = &event.metadata {
        if let Some(preview) = meta.get("clipboard_preview").and_then(|v| v.as_str()) {
            parts.push(preview.to_lowercase());
        }
        if let Some(content_type) = meta.get("content_type").and_then(|v| v.as_str()) {
            parts.push(content_type.to_lowercase());
        }
        if let Some(filename) = meta.get("filename").and_then(|v| v.as_str()) {
            parts.push(filename.to_lowercase());
        }
        if let Some(shortcut) = meta.get("shortcut").and_then(|v| v.as_str()) {
            parts.push(shortcut.to_lowercase());
        }
    }
    parts.join(" ")
}

fn action_aliases(event_type: &EventType) -> Vec<String> {
    match event_type {
        EventType::Copy => vec![
            "copy".into(),
            "copied".into(),
            "clipboard".into(),
            "복사".into(),
            "클립보드".into(),
        ],
        EventType::Paste => vec![
            "paste".into(),
            "pasted".into(),
            "붙여넣기".into(),
            "붙여넣".into(),
            "붙인".into(),
        ],
        EventType::Screenshot => vec![
            "screenshot".into(),
            "capture".into(),
            "screen capture".into(),
            "캡처".into(),
            "캡쳐".into(),
            "스크린샷".into(),
            "화면".into(),
        ],
        _ => Vec::new(),
    }
}

fn is_action(event: &ActivityEvent) -> bool {
    matches!(
        event.event_type,
        EventType::Copy | EventType::Paste | EventType::Screenshot
    )
}

pub fn system_prompt(locale: &str) -> &'static str {
    if locale == "en" {
        "You are TraceDesk, a private assistant that answers questions about the user's copy, paste, and screenshot activity on their own computer. Use only the provided activity log. If the log lacks information, say so. Be concise. Cite times and apps when relevant. Never invent events."
    } else {
        "당신은 TraceDesk의 개인 활동 도우미입니다. 사용자 본인 PC의 복사·붙여넣기·캡처 기록만 근거로 답변하세요. 기록에 없는 내용은 추측하지 말고 모른다고 하세요. 간결하게, 시간과 앱 이름을 인용하세요."
    }
}

pub fn user_prompt(question: &str, date: NaiveDate, context: &str) -> String {
    format!(
        "날짜: {}\n\n활동 기록:\n{}\n\n질문: {}",
        date.format("%Y-%m-%d"),
        if context.is_empty() {
            "(해당 날짜에 복사·붙여넣기·캡처 기록이 없습니다)"
        } else {
            context
        },
        question.trim()
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn event(
        event_type: EventType,
        app: &str,
        window: &str,
        preview: Option<&str>,
    ) -> ActivityEvent {
        let metadata = preview.map(|text| {
            serde_json::json!({
                "clipboard_preview": text,
                "content_type": "text",
            })
        });

        ActivityEvent {
            id: Some(1),
            event_type,
            created_at: Utc::now(),
            duration: None,
            application: Some(app.into()),
            window_title: Some(window.into()),
            metadata,
        }
    }

    #[test]
    fn korean_action_aliases_match_event_types() {
        let copy = event(EventType::Copy, "Safari", "Docs", Some("alpha"));
        let paste = event(EventType::Paste, "Cursor", "Editor", Some("alpha"));
        let screenshot = event(EventType::Screenshot, "Finder", "Desktop", None);

        assert!(score_event(&copy, &query_terms("복사한 내용")) > 0);
        assert!(score_event(&paste, &query_terms("붙여넣기 어디서")) > 0);
        assert!(score_event(&screenshot, &query_terms("캡처 날짜")) > 0);
        assert!(score_event(&screenshot, &query_terms("스크린샷")) > 0);
    }

    #[test]
    fn app_window_and_content_are_searchable() {
        let copy = event(EventType::Copy, "Arc", "OpenAI docs", Some("Responses API"));

        assert!(score_event(&copy, &query_terms("arc")) > 0);
        assert!(score_event(&copy, &query_terms("OpenAI")) > 0);
        assert!(score_event(&copy, &query_terms("responses")) > 0);
    }
}
