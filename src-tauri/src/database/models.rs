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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrmContact {
    pub id: i64,
    pub name: String,
    pub category: String,
    pub company: Option<String>,
    pub role: Option<String>,
    pub status: String,
    pub priority: String,
    pub preferred_channel: Option<String>,
    pub tags: Vec<String>,
    pub notes: String,
    pub last_contact_at: Option<String>,
    pub next_follow_up_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub ai_nudge: String,
    pub days_since_contact: Option<i64>,
    pub days_until_follow_up: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrmContactInput {
    pub id: Option<i64>,
    pub name: String,
    pub category: String,
    pub company: Option<String>,
    pub role: Option<String>,
    pub status: String,
    pub priority: String,
    pub preferred_channel: Option<String>,
    pub tags: Vec<String>,
    pub notes: String,
    pub last_contact_at: Option<String>,
    pub next_follow_up_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrmInteraction {
    pub id: i64,
    pub contact_id: i64,
    pub contact_name: String,
    pub kind: String,
    pub summary: String,
    pub happened_at: String,
    pub source: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrmInteractionInput {
    pub contact_id: i64,
    pub kind: String,
    pub summary: String,
    pub happened_at: String,
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrmReminder {
    pub contact_id: i64,
    pub name: String,
    pub category: String,
    pub priority: String,
    pub next_follow_up_at: String,
    pub days_until_follow_up: i64,
    pub ai_nudge: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrmSummary {
    pub total_contacts: usize,
    pub people_met: usize,
    pub investors: usize,
    pub customers: usize,
    pub overdue_followups: usize,
    pub due_this_week: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrmOverview {
    pub summary: CrmSummary,
    pub contacts: Vec<CrmContact>,
    pub reminders: Vec<CrmReminder>,
    pub recent_interactions: Vec<CrmInteraction>,
    pub suggested_prompt: String,
}
