use crate::activity_item::ActivityItem;
use crate::analytics::{
    analyze_productivity_from, build_action_hourly_from, build_full_timeline_from,
    build_hourly_activity_from, build_idle_analysis_from, build_weekly_report,
    compute_daily_statistics_from, ActionHourlyPoint, DailyStatistics, FullTimelineItem,
    IdleAnalysis, ProductivityAnalysis, WeeklyReport,
};
use crate::database::models::ApplicationUsage;
use crate::database::Repository;
use anyhow::Result;
use chrono::{Local, NaiveDate};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct HourlyActivityItem {
    pub hour: u32,
    pub activity: f64,
}

#[derive(Debug, Serialize)]
pub struct ActivityBundle {
    pub stats: DailyStatistics,
    pub applications: Vec<ApplicationUsage>,
    pub timeline: Vec<FullTimelineItem>,
    pub idle: IdleAnalysis,
    pub action_hourly: Vec<ActionHourlyPoint>,
    pub hourly: Vec<HourlyActivityItem>,
    pub events: Vec<ActivityItem>,
    pub productivity: ProductivityAnalysis,
    pub weekly: WeeklyReport,
}

pub fn build_activity_bundle(repo: &Repository, date: NaiveDate) -> Result<ActivityBundle> {
    let app_usage = repo.get_application_usage_for_date(date)?;
    let events = repo.get_events_for_date(date)?;

    let stats = compute_daily_statistics_from(&app_usage, &events);
    let idle = build_idle_analysis_from(&events);
    let timeline = build_full_timeline_from(&events);
    let action_hourly = build_action_hourly_from(&events);
    let hourly_raw = build_hourly_activity_from(&events);
    let productivity = analyze_productivity_from(&stats, &events, &hourly_raw);
    let hourly: Vec<HourlyActivityItem> = hourly_raw
        .into_iter()
        .map(|(hour, activity)| HourlyActivityItem { hour, activity })
        .collect();
    let weekly = build_weekly_report(repo, date)?;

    let activity_items: Vec<ActivityItem> = events
        .iter()
        .map(|e| ActivityItem {
            id: e.id,
            event_type: e.event_type.as_str().to_string(),
            time: e
                .created_at
                .with_timezone(&Local)
                .format("%H:%M:%S")
                .to_string(),
            name: e.application.clone(),
            window_title: e.window_title.clone(),
            duration: e.duration,
            metadata: e.metadata.clone(),
        })
        .collect();

    Ok(ActivityBundle {
        stats,
        applications: app_usage,
        timeline,
        idle,
        action_hourly,
        hourly,
        events: activity_items,
        productivity,
        weekly,
    })
}
