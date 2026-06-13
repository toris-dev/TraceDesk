use crate::analytics::productivity::{analyze_productivity, today_local, weekday_ko, weekday_short};
use crate::database::Repository;
use anyhow::Result;
use chrono::{Duration, NaiveDate};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct DailyReportItem {
    pub date: String,
    pub weekday: String,
    pub weekday_short: String,
    pub active_minutes: i64,
    pub idle_minutes: i64,
    pub productivity_score: u32,
    pub grade: String,
    pub focus_window: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct WeeklyReport {
    pub period_start: String,
    pub period_end: String,
    pub total_active_minutes: i64,
    pub total_active_hours: f64,
    pub avg_productivity_score: u32,
    pub avg_daily_active_minutes: i64,
    pub best_focus_day: Option<DailyReportItem>,
    pub most_productive_day: Option<DailyReportItem>,
    pub daily: Vec<DailyReportItem>,
    pub focus_pattern_summary: String,
    pub recommendations: Vec<String>,
}

pub fn build_weekly_report(repo: &Repository, end_date: NaiveDate) -> Result<WeeklyReport> {
    let start_date = end_date - Duration::days(6);
    let mut daily = Vec::new();

    let mut cursor = start_date;
    while cursor <= end_date {
        let stats = crate::analytics::summary::compute_daily_statistics(repo, cursor)?;
        let productivity = analyze_productivity(repo, cursor)?;

        let focus_window = productivity.focus_window.as_ref().map(|fw| {
            format!("{}~{}", fw.start, fw.end)
        });

        daily.push(DailyReportItem {
            date: cursor.format("%Y-%m-%d").to_string(),
            weekday: weekday_ko(cursor).to_string(),
            weekday_short: weekday_short(cursor).to_string(),
            active_minutes: stats.active,
            idle_minutes: stats.idle,
            productivity_score: productivity.score,
            grade: productivity.grade.clone(),
            focus_window,
        });

        cursor += Duration::days(1);
    }

    let total_active_minutes: i64 = daily.iter().map(|d| d.active_minutes).sum();
    let days_with_data = daily.iter().filter(|d| d.active_minutes > 0).count().max(1);
    let avg_productivity_score = if daily.is_empty() {
        0
    } else {
        daily.iter().map(|d| d.productivity_score).sum::<u32>() / daily.len() as u32
    };

    let best_focus_day = daily
        .iter()
        .filter(|d| d.focus_window.is_some() && d.active_minutes > 0)
        .max_by_key(|d| d.productivity_score)
        .cloned();

    let most_productive_day = daily
        .iter()
        .filter(|d| d.active_minutes > 0)
        .max_by_key(|d| d.productivity_score)
        .cloned();

    let focus_pattern_summary = build_focus_pattern_summary(&daily);
    let recommendations = generate_weekly_recommendations(
        &daily,
        total_active_minutes,
        avg_productivity_score,
        best_focus_day.as_ref(),
    );

    Ok(WeeklyReport {
        period_start: start_date.format("%Y-%m-%d").to_string(),
        period_end: end_date.format("%Y-%m-%d").to_string(),
        total_active_minutes,
        total_active_hours: (total_active_minutes as f64 / 60.0 * 10.0).round() / 10.0,
        avg_productivity_score,
        avg_daily_active_minutes: total_active_minutes / days_with_data as i64,
        best_focus_day,
        most_productive_day,
        daily,
        focus_pattern_summary,
        recommendations,
    })
}

pub fn build_weekly_report_current(repo: &Repository) -> Result<WeeklyReport> {
    build_weekly_report(repo, today_local())
}

fn build_focus_pattern_summary(daily: &[DailyReportItem]) -> String {
    let mut hour_counts = [0u32; 24];

    for day in daily {
        if let Some(ref window) = day.focus_window {
            if let Some(hour) = window.split(':').next().and_then(|h| h.parse::<usize>().ok()) {
                if hour < 24 {
                    hour_counts[hour] += 1;
                    if hour + 1 < 24 {
                        hour_counts[hour + 1] += 1;
                    }
                }
            }
        }
    }

    let peak_hour = hour_counts
        .iter()
        .enumerate()
        .max_by_key(|(_, c)| *c)
        .map(|(h, c)| (h, *c));

    match peak_hour {
        Some((h, c)) if c > 0 => {
            format!(
                "이번 주 집중 피크는 주로 {:02}:00~{:02}:00 시간대에 형성되었습니다.",
                h,
                (h + 2).min(24)
            )
        }
        _ => "아직 충분한 집중 패턴 데이터가 없습니다.".into(),
    }
}

fn generate_weekly_recommendations(
    daily: &[DailyReportItem],
    total_active: i64,
    avg_score: u32,
    best_focus: Option<&DailyReportItem>,
) -> Vec<String> {
    let mut recs = Vec::new();

    if let Some(best) = best_focus {
        if let Some(ref window) = best.focus_window {
            recs.push(format!(
                "{}({}) 집중도가 가장 높았습니다. 피크 시간 {}에 중요 업무를 배치하세요.",
                best.weekday, best.date, window
            ));
        }
    }

    let weekday_active: i64 = daily
        .iter()
        .filter(|d| !matches!(d.weekday.as_str(), "토요일" | "일요일"))
        .map(|d| d.active_minutes)
        .sum();
    let weekend_active: i64 = daily
        .iter()
        .filter(|d| matches!(d.weekday.as_str(), "토요일" | "일요일"))
        .map(|d| d.active_minutes)
        .sum();

    if weekday_active > 0 && weekend_active > weekday_active / 2 {
        recs.push(
            "주말 활동량이 평일 대비 높습니다. 휴식과 작업의 균형을 점검해 보세요.".into(),
        );
    }

    if avg_score >= 70 {
        recs.push(format!(
            "주간 평균 생산성 점수 {}점으로 양호합니다. 현재 패턴을 유지하세요.",
            avg_score
        ));
    } else if avg_score >= 50 {
        recs.push(format!(
            "주간 평균 생산성 점수 {}점입니다. 집중 시간대를 루틴으로 고정하면 개선됩니다.",
            avg_score
        ));
    } else if total_active > 0 {
        recs.push(
            "생산성 점수가 낮은 편입니다. 유휴 시간과 앱 전환을 줄이는 것부터 시작해 보세요."
                .into(),
        );
    }

    let trend = compute_weekly_trend(daily);
    if trend > 15 {
        recs.push("후반부로 갈수록 활동량이 증가했습니다. 에너지 관리에 유의하세요.".into());
    } else if trend < -15 {
        recs.push(
            "주 후반 활동량이 줄었습니다. 주 초반에 핵심 업무를 배치하는 것을 권장합니다.".into(),
        );
    }

    if total_active > 0 {
        recs.push(format!(
            "이번 주 총 {}시간 {}분 활동했습니다.",
            total_active / 60,
            total_active % 60
        ));
    }

    if recs.is_empty() {
        recs.push("데이터가 쌓이면 맞춤형 주간 추천이 제공됩니다.".into());
    }

    recs
}

fn compute_weekly_trend(daily: &[DailyReportItem]) -> i64 {
    if daily.len() < 4 {
        return 0;
    }
    let mid = daily.len() / 2;
    let first_half: i64 = daily[..mid].iter().map(|d| d.active_minutes).sum();
    let second_half: i64 = daily[mid..].iter().map(|d| d.active_minutes).sum();
    second_half - first_half
}
