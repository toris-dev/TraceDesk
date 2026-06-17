use crate::database::Repository;
use crate::events::{ActivityEvent, EventType};
use anyhow::Result;
use chrono::{Local, NaiveDate};

const MAX_CONTEXT_CHARS: usize = 14_000;

pub fn build_action_context(repo: &Repository, date: NaiveDate) -> Result<String> {
    let events = repo.get_events_for_date(date)?;
    let mut lines = Vec::new();

    for event in events.iter().filter(|e| is_action(e)) {
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

        lines.push(parts.join(" | "));
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
