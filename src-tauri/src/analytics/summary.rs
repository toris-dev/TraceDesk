use crate::database::models::DailySummary;
use crate::database::Repository;
use crate::events::EventType;
use anyhow::Result;
use chrono::{Local, NaiveDate, Timelike, Utc};
use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Serialize)]
pub struct DailyStatistics {
    pub active: i64,
    pub idle: i64,
    pub copy: i64,
    pub paste: i64,
    pub screenshot: i64,
    pub top_application: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TimelineSegment {
    pub application: String,
    pub start: String,
    pub end: String,
    pub duration: i64,
}

#[derive(Debug, Serialize)]
pub struct FullTimelineItem {
    pub kind: String,
    pub label: String,
    pub start: String,
    pub end: Option<String>,
    pub duration: Option<i64>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Serialize)]
pub struct IdleSession {
    pub start: String,
    pub end: String,
    pub duration_seconds: i64,
}

#[derive(Debug, Serialize)]
pub struct IdleAnalysis {
    pub total_idle_minutes: i64,
    pub session_count: i64,
    pub longest_session_minutes: i64,
    pub average_session_minutes: i64,
    pub sessions: Vec<IdleSession>,
}

pub fn refresh_daily_summary(repo: &Repository) -> Result<()> {
    let today = Local::now().date_naive();
    let stats = compute_daily_statistics(repo, today)?;

    let summary = DailySummary {
        id: None,
        date: today.format("%Y-%m-%d").to_string(),
        active_minutes: stats.active,
        idle_minutes: stats.idle,
        copy_count: stats.copy,
        paste_count: stats.paste,
        screenshot_count: stats.screenshot,
        top_application: stats.top_application.clone(),
    };

    repo.upsert_daily_summary(&summary)?;
    Ok(())
}

pub fn compute_daily_statistics(repo: &Repository, date: NaiveDate) -> Result<DailyStatistics> {
    let app_usage = repo.get_application_usage_for_date(date)?;
    let events = repo.get_events_for_date(date)?;
    Ok(compute_daily_statistics_from(&app_usage, &events))
}

pub fn compute_daily_statistics_from(
    app_usage: &[crate::database::models::ApplicationUsage],
    events: &[crate::events::ActivityEvent],
) -> DailyStatistics {
    let active_seconds: i64 = app_usage.iter().map(|a| a.duration).sum();
    let active_minutes = active_seconds / 60;

    let idle_analysis = build_idle_analysis_from(events);
    let idle_minutes = idle_analysis.total_idle_minutes;

    let mut copy = 0i64;
    let mut paste = 0i64;
    let mut screenshot = 0i64;
    for event in events {
        match event.event_type {
            EventType::Copy => copy += 1,
            EventType::Paste => paste += 1,
            EventType::Screenshot => screenshot += 1,
            _ => {}
        }
    }

    let top_application = app_usage.first().map(|a| a.application.clone());

    DailyStatistics {
        active: active_minutes,
        idle: idle_minutes,
        copy,
        paste,
        screenshot,
        top_application,
    }
}

pub fn build_idle_analysis(repo: &Repository, date: NaiveDate) -> Result<IdleAnalysis> {
    let events = repo.get_events_for_date(date)?;
    Ok(build_idle_analysis_from(&events))
}

pub fn build_idle_analysis_from(events: &[crate::events::ActivityEvent]) -> IdleAnalysis {
    let sessions = extract_idle_sessions(events);

    let total_idle_seconds: i64 = sessions.iter().map(|s| s.duration_seconds).sum();
    let total_idle_minutes = total_idle_seconds / 60;
    let session_count = sessions.len() as i64;
    let longest_session_minutes = sessions
        .iter()
        .map(|s| s.duration_seconds / 60)
        .max()
        .unwrap_or(0);
    let average_session_minutes = if session_count > 0 {
        total_idle_minutes / session_count
    } else {
        0
    };

    IdleAnalysis {
        total_idle_minutes,
        session_count,
        longest_session_minutes,
        average_session_minutes,
        sessions,
    }
}

fn extract_idle_sessions(events: &[crate::events::ActivityEvent]) -> Vec<IdleSession> {
    let mut sessions = Vec::new();
    let mut pending_start: Option<chrono::DateTime<Utc>> = None;

    for event in events {
        match event.event_type {
            EventType::IdleStart => pending_start = Some(event.created_at),
            EventType::IdleEnd => {
                if let Some(start) = pending_start.take() {
                    let end = event.created_at;
                    let duration = (end - start).num_seconds().max(1);
                    sessions.push(IdleSession {
                        start: start.format("%H:%M:%S").to_string(),
                        end: end.format("%H:%M:%S").to_string(),
                        duration_seconds: duration,
                    });
                }
            }
            _ => {}
        }
    }

    if let Some(start) = pending_start {
        let end = Utc::now();
        let duration = (end - start).num_seconds().max(1);
        sessions.push(IdleSession {
            start: start.format("%H:%M:%S").to_string(),
            end: end.format("%H:%M:%S").to_string(),
            duration_seconds: duration,
        });
    }

    sessions
}

pub fn build_timeline(repo: &Repository, date: NaiveDate) -> Result<Vec<TimelineSegment>> {
    let events = repo.get_events_for_date(date)?;
    Ok(build_timeline_from(&events))
}

pub fn build_timeline_from(events: &[crate::events::ActivityEvent]) -> Vec<TimelineSegment> {
    let mut segments = Vec::new();

    for event in events {
        if event.event_type != EventType::WindowFocus {
            continue;
        }
        let Some(duration) = event.duration.filter(|d| *d > 0) else {
            continue;
        };
        let Some(ref app) = event.application else {
            continue;
        };

        let end = event.created_at;
        let start = end - chrono::Duration::seconds(duration);

        segments.push(TimelineSegment {
            application: app.clone(),
            start: start.format("%H:%M:%S").to_string(),
            end: end.format("%H:%M:%S").to_string(),
            duration,
        });
    }

    segments
}

pub fn build_full_timeline(repo: &Repository, date: NaiveDate) -> Result<Vec<FullTimelineItem>> {
    let events = repo.get_events_for_date(date)?;
    Ok(build_full_timeline_from(&events))
}

pub fn build_full_timeline_from(events: &[crate::events::ActivityEvent]) -> Vec<FullTimelineItem> {
    let mut items = Vec::new();

    for event in events {
        match event.event_type {
            EventType::WindowFocus if event.duration.filter(|d| *d > 0).is_some() => {
                let duration = event.duration.unwrap();
                let end = event.created_at;
                let start = end - chrono::Duration::seconds(duration);
                items.push(FullTimelineItem {
                    kind: "app".into(),
                    label: event
                        .application
                        .clone()
                        .unwrap_or_else(|| "Unknown".into()),
                    start: start.format("%H:%M:%S").to_string(),
                    end: Some(end.format("%H:%M:%S").to_string()),
                    duration: Some(duration),
                    metadata: event.metadata.clone(),
                });
            }
            EventType::IdleStart => {
                items.push(FullTimelineItem {
                    kind: "idle".into(),
                    label: "유휴".into(),
                    start: event.created_at.format("%H:%M:%S").to_string(),
                    end: None,
                    duration: None,
                    metadata: event.metadata.clone(),
                });
            }
            EventType::IdleEnd => {
                if let Some(last) = items
                    .iter_mut()
                    .rev()
                    .find(|i| i.kind == "idle" && i.end.is_none())
                {
                    last.end = Some(event.created_at.format("%H:%M:%S").to_string());
                    if let (Ok(start), Ok(end)) = (
                        chrono::NaiveTime::parse_from_str(&last.start, "%H:%M:%S"),
                        chrono::NaiveTime::parse_from_str(last.end.as_ref().unwrap(), "%H:%M:%S"),
                    ) {
                        let duration = end.signed_duration_since(start).num_seconds().max(1);
                        last.duration = Some(duration);
                    }
                }
            }
            EventType::Copy | EventType::Paste | EventType::Screenshot => {
                let kind = event.event_type.as_str().to_lowercase();
                let label = match event.event_type {
                    EventType::Copy => "복사".into(),
                    EventType::Paste => "붙여넣기".into(),
                    EventType::Screenshot => "스크린샷".into(),
                    _ => kind.clone(),
                };
                items.push(FullTimelineItem {
                    kind,
                    label,
                    start: event.created_at.format("%H:%M:%S").to_string(),
                    end: None,
                    duration: None,
                    metadata: event.metadata.clone(),
                });
            }
            _ => {}
        }
    }

    items.sort_by(|a, b| a.start.cmp(&b.start));
    items
}

pub fn build_hourly_activity(repo: &Repository, date: NaiveDate) -> Result<Vec<(u32, f64)>> {
    let events = repo.get_events_for_date(date)?;
    Ok(build_hourly_activity_from(&events))
}

pub fn build_hourly_activity_from(events: &[crate::events::ActivityEvent]) -> Vec<(u32, f64)> {
    let mut hourly: [i64; 24] = [0; 24];

    for event in events {
        if event.event_type != EventType::WindowFocus {
            continue;
        }
        if let Some(duration) = event.duration {
            let hour = event.created_at.hour() as usize;
            if hour < 24 {
                hourly[hour] += duration;
            }
        }
    }

    let max = hourly.iter().copied().max().unwrap_or(1).max(1) as f64;
    hourly
        .iter()
        .enumerate()
        .map(|(h, &secs)| (h as u32, (secs as f64 / max) * 100.0))
        .collect()
}

#[derive(Debug, Serialize)]
pub struct ActionHourlyPoint {
    pub hour: u32,
    pub copy: u32,
    pub paste: u32,
    pub screenshot: u32,
}

pub fn build_action_hourly(repo: &Repository, date: NaiveDate) -> Result<Vec<ActionHourlyPoint>> {
    let events = repo.get_events_for_date(date)?;
    Ok(build_action_hourly_from(&events))
}

pub fn build_action_hourly_from(events: &[crate::events::ActivityEvent]) -> Vec<ActionHourlyPoint> {
    let mut hourly_copy = [0u32; 24];
    let mut hourly_paste = [0u32; 24];
    let mut hourly_screenshot = [0u32; 24];

    for event in events {
        let hour = event.created_at.hour() as usize;
        if hour >= 24 {
            continue;
        }
        match event.event_type {
            EventType::Copy => hourly_copy[hour] += 1,
            EventType::Paste => hourly_paste[hour] += 1,
            EventType::Screenshot => hourly_screenshot[hour] += 1,
            _ => {}
        }
    }

    (0..24)
        .map(|h| ActionHourlyPoint {
            hour: h,
            copy: hourly_copy[h as usize],
            paste: hourly_paste[h as usize],
            screenshot: hourly_screenshot[h as usize],
        })
        .collect()
}
