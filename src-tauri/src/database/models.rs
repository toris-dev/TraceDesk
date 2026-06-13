use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailySummary {
    pub id: Option<i64>,
    pub date: String,
    pub active_minutes: i64,
    pub idle_minutes: i64,
    pub copy_count: i64,
    pub paste_count: i64,
    pub screenshot_count: i64,
    pub top_application: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplicationUsage {
    pub id: Option<i64>,
    pub date: String,
    pub application: String,
    pub duration: i64,
}
