pub mod productivity;
pub mod summary;
pub mod weekly;

pub use productivity::{analyze_productivity, ProductivityAnalysis};
pub use summary::{
    build_action_hourly, build_full_timeline, build_hourly_activity, build_idle_analysis,
    build_timeline, compute_daily_statistics, ActionHourlyPoint, DailyStatistics,
    FullTimelineItem, IdleAnalysis,
};
pub use weekly::{build_weekly_report, build_weekly_report_current, WeeklyReport};
