use crate::analytics::summary::{build_hourly_activity, compute_daily_statistics};
use crate::database::Repository;
use crate::events::EventType;
use anyhow::Result;
use chrono::{Datelike, Local, NaiveDate, Weekday};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct FocusWindow {
    pub start: String,
    pub end: String,
    pub intensity: f64,
}

#[derive(Debug, Serialize)]
pub struct ProductivityAnalysis {
    pub score: u32,
    pub grade: String,
    pub active_ratio: f64,
    pub avg_session_minutes: i64,
    pub app_switches: i64,
    pub focus_window: Option<FocusWindow>,
    pub recommendations: Vec<String>,
}

const DISTRACTION_KEYWORDS: &[&str] = &[
    "youtube", "twitter", "x.com", "instagram", "facebook", "reddit", "tiktok", "netflix",
    "discord", "slack", "telegram", "kakaotalk", "messages", "mail",
];

pub fn analyze_productivity(repo: &Repository, date: NaiveDate) -> Result<ProductivityAnalysis> {
    let stats = compute_daily_statistics(repo, date)?;
    let events = repo.get_events_for_date(date)?;
    let hourly = build_hourly_activity(repo, date)?;

    let focus_sessions: Vec<i64> = events
        .iter()
        .filter(|e| e.event_type == EventType::WindowFocus)
        .filter_map(|e| e.duration)
        .filter(|&d| d >= 300)
        .collect();

    let avg_session_minutes = if focus_sessions.is_empty() {
        0
    } else {
        focus_sessions.iter().sum::<i64>() / focus_sessions.len() as i64 / 60
    };

    let app_switches = events
        .iter()
        .filter(|e| e.event_type == EventType::WindowFocus && e.duration.is_none())
        .count() as i64;

    let total_minutes = stats.active + stats.idle;
    let active_ratio = if total_minutes > 0 {
        stats.active as f64 / total_minutes as f64
    } else {
        0.0
    };

    let focus_window = find_peak_focus_window(&hourly);

    let score = calculate_score(
        active_ratio,
        avg_session_minutes,
        app_switches,
        stats.active,
        focus_window.as_ref(),
    );

    let recommendations = generate_daily_recommendations(
        &stats,
        active_ratio,
        avg_session_minutes,
        app_switches,
        focus_window.as_ref(),
        &events,
    );

    Ok(ProductivityAnalysis {
        score,
        grade: score_to_grade(score),
        active_ratio,
        avg_session_minutes,
        app_switches,
        focus_window,
        recommendations,
    })
}

fn find_peak_focus_window(hourly: &[(u32, f64)]) -> Option<FocusWindow> {
    if hourly.is_empty() {
        return None;
    }

    let mut best_start = 0u32;
    let mut best_sum = 0.0f64;

    for start in 0..23 {
        let sum: f64 = hourly
            .iter()
            .filter(|(h, _)| *h >= start && *h < start + 2)
            .map(|(_, v)| v)
            .sum();
        if sum > best_sum {
            best_sum = sum;
            best_start = start;
        }
    }

    if best_sum < 10.0 {
        return None;
    }

    Some(FocusWindow {
        start: format!("{:02}:00", best_start),
        end: format!("{:02}:00", (best_start + 2).min(24)),
        intensity: best_sum / 2.0,
    })
}

fn calculate_score(
    active_ratio: f64,
    avg_session_minutes: i64,
    app_switches: i64,
    active_minutes: i64,
    focus: Option<&FocusWindow>,
) -> u32 {
    if active_minutes < 5 {
        return 0;
    }

    let ratio_score = (active_ratio * 40.0).min(40.0);

    let session_score = match avg_session_minutes {
        0..=4 => 5.0,
        5..=14 => 15.0,
        15..=29 => 25.0,
        30..=59 => 30.0,
        _ => 30.0,
    };

    let switch_per_hour = if active_minutes > 0 {
        app_switches as f64 / (active_minutes as f64 / 60.0)
    } else {
        0.0
    };
    let switch_score = match switch_per_hour {
        s if s <= 5.0 => 20.0,
        s if s <= 10.0 => 15.0,
        s if s <= 20.0 => 10.0,
        _ => 5.0,
    };

    let focus_score = if focus.is_some() { 10.0 } else { 3.0 };

    (ratio_score + session_score + switch_score + focus_score).round() as u32
}

fn score_to_grade(score: u32) -> String {
    match score {
        85..=100 => "A".into(),
        70..=84 => "B".into(),
        50..=69 => "C".into(),
        30..=49 => "D".into(),
        _ => "F".into(),
    }
}

fn generate_daily_recommendations(
    stats: &crate::analytics::summary::DailyStatistics,
    active_ratio: f64,
    avg_session_minutes: i64,
    app_switches: i64,
    focus: Option<&FocusWindow>,
    events: &[crate::events::ActivityEvent],
) -> Vec<String> {
    let mut recs = Vec::new();

    if let Some(fw) = focus {
        recs.push(format!(
            "집중 피크 시간은 {}~{}입니다. 중요 업무를 이 시간대에 배치해 보세요.",
            fw.start, fw.end
        ));
    }

    if active_ratio < 0.5 && stats.active + stats.idle > 30 {
        recs.push(
            "유휴 시간 비율이 높습니다. 작업 재개 전 짧은 스트레칭으로 리듬을 회복해 보세요."
                .into(),
        );
    }

    if avg_session_minutes < 15 && stats.active > 60 {
        recs.push(
            "평균 집중 세션이 15분 미만입니다. 알림을 끄고 25분 집중 블록을 시도해 보세요."
                .into(),
        );
    }

    if app_switches > 50 {
        recs.push(
            "앱 전환이 잦습니다. 집중 작업 시 불필요한 창을 닫아 두면 생산성이 올라갑니다."
                .into(),
        );
    }

    let distraction_minutes = estimate_distraction_minutes(events);
    if distraction_minutes > 60 {
        recs.push(format!(
            "엔터테인먼트/커뮤니케이션 앱 사용이 약 {}분 감지되었습니다. 집중 시간과 분리해 보세요.",
            distraction_minutes
        ));
    }

    if stats.copy > 80 {
        recs.push(
            "복사/붙여넣기가 많은 날입니다. 정보 정리 시간을 따로 확보하면 흐름이 좋아집니다."
                .into(),
        );
    }

    if recs.is_empty() && stats.active > 0 {
        recs.push("오늘 활동 패턴이 안정적입니다. 현재 리듬을 유지해 보세요.".into());
    }

    recs
}

fn estimate_distraction_minutes(events: &[crate::events::ActivityEvent]) -> i64 {
    events
        .iter()
        .filter(|e| e.event_type == EventType::WindowFocus)
        .filter_map(|e| {
            let app = e.application.as_deref()?.to_lowercase();
            let title = e.window_title.as_deref().unwrap_or("").to_lowercase();
            let is_distraction = DISTRACTION_KEYWORDS
                .iter()
                .any(|k| app.contains(k) || title.contains(k));
            if is_distraction {
                e.duration
            } else {
                None
            }
        })
        .sum::<i64>()
        / 60
}

pub fn weekday_ko(date: NaiveDate) -> &'static str {
    match date.weekday() {
        Weekday::Mon => "월요일",
        Weekday::Tue => "화요일",
        Weekday::Wed => "수요일",
        Weekday::Thu => "목요일",
        Weekday::Fri => "금요일",
        Weekday::Sat => "토요일",
        Weekday::Sun => "일요일",
    }
}

pub fn weekday_short(date: NaiveDate) -> &'static str {
    match date.weekday() {
        Weekday::Mon => "월",
        Weekday::Tue => "화",
        Weekday::Wed => "수",
        Weekday::Thu => "목",
        Weekday::Fri => "금",
        Weekday::Sat => "토",
        Weekday::Sun => "일",
    }
}

pub fn today_local() -> NaiveDate {
    Local::now().date_naive()
}
