use crate::database::models::{
    ApplicationUsage, CrmContact, CrmContactInput, CrmInteraction, CrmInteractionInput, CrmOverview,
    CrmReminder, CrmSummary, DailySummary,
};
use crate::database::Database;
use crate::events::ActivityEvent;
use anyhow::{Context, Result};
use chrono::{Local, NaiveDate, NaiveDateTime, TimeZone, Utc};
use rusqlite::params;

pub struct Repository {
    db: Database,
}

impl Repository {
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    pub fn insert_event(&self, event: &ActivityEvent) -> Result<i64> {
        self.db.with_connection(|conn| {
            conn.execute(
                "INSERT INTO activity_events (event_type, created_at, duration, application, window_title, metadata)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    event.event_type.as_str(),
                    Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                    event.duration,
                    event.application,
                    event.window_title,
                    event
                        .metadata
                        .as_ref()
                        .map(|m| serde_json::to_string(m))
                        .transpose()?,
                ],
            )
            .context("failed to insert activity event")?;

            Ok(conn.last_insert_rowid())
        })
    }

    pub fn get_event_by_id(&self, id: i64) -> Result<Option<ActivityEvent>> {
        self.db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, event_type, created_at, duration, application, window_title, metadata
                 FROM activity_events
                 WHERE id = ?1",
            )?;

            let mut rows = stmt.query(params![id])?;
            if let Some(row) = rows.next()? {
                Ok(Some(row_to_activity_event(row)?))
            } else {
                Ok(None)
            }
        })
    }

    pub fn update_event_metadata(&self, id: i64, metadata: &serde_json::Value) -> Result<()> {
        let metadata_json =
            serde_json::to_string(metadata).context("failed to serialize metadata")?;
        self.db.with_connection(|conn| {
            conn.execute(
                "UPDATE activity_events SET metadata = ?1 WHERE id = ?2",
                params![metadata_json, id],
            )
            .context("failed to update event metadata")?;
            Ok(())
        })
    }

    pub fn get_events_for_date(&self, date: NaiveDate) -> Result<Vec<ActivityEvent>> {
        let start = date.format("%Y-%m-%d 00:00:00").to_string();
        let end = (date + chrono::Duration::days(1))
            .format("%Y-%m-%d 00:00:00")
            .to_string();
        self.db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, event_type, created_at, duration, application, window_title, metadata
                 FROM activity_events
                 WHERE created_at >= ?1 AND created_at < ?2
                 ORDER BY created_at ASC",
            )?;

            let rows = stmt.query_map(params![start, end], |row| row_to_activity_event(row))?;

            rows.collect::<Result<Vec<_>, _>>()
                .context("failed to read activity events")
        })
    }

    pub fn upsert_application_usage(
        &self,
        date: &str,
        application: &str,
        duration_delta: i64,
    ) -> Result<()> {
        self.db.with_connection(|conn| {
            conn.execute(
                "INSERT INTO application_usage (date, application, duration)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(date, application) DO UPDATE SET
                 duration = duration + excluded.duration",
                params![date, application, duration_delta],
            )?;
            Ok(())
        })
    }

    pub fn get_application_usage_for_date(&self, date: NaiveDate) -> Result<Vec<ApplicationUsage>> {
        let date_str = date.format("%Y-%m-%d").to_string();
        self.db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, date, application, duration
                 FROM application_usage
                 WHERE date = ?1
                 ORDER BY duration DESC",
            )?;

            let rows = stmt.query_map(params![date_str], |row| {
                Ok(ApplicationUsage {
                    id: Some(row.get(0)?),
                    date: row.get(1)?,
                    application: row.get(2)?,
                    duration: row.get(3)?,
                })
            })?;

            rows.collect::<Result<Vec<_>, _>>()
                .context("failed to read application usage")
        })
    }

    pub fn upsert_daily_summary(&self, summary: &DailySummary) -> Result<()> {
        self.db.with_connection(|conn| {
            conn.execute(
                "INSERT INTO daily_summary (date, active_minutes, idle_minutes, copy_count, paste_count, screenshot_count, top_application)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(date) DO UPDATE SET
                 active_minutes = excluded.active_minutes,
                 idle_minutes = excluded.idle_minutes,
                 copy_count = excluded.copy_count,
                 paste_count = excluded.paste_count,
                 screenshot_count = excluded.screenshot_count,
                 top_application = excluded.top_application",
                params![
                    summary.date,
                    summary.active_minutes,
                    summary.idle_minutes,
                    summary.copy_count,
                    summary.paste_count,
                    summary.screenshot_count,
                    summary.top_application,
                ],
            )?;
            Ok(())
        })
    }

    pub fn get_available_dates(&self) -> Result<Vec<(String, i64)>> {
        self.db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT date(created_at) AS d, COUNT(*) AS cnt
                 FROM activity_events
                 GROUP BY d
                 ORDER BY d DESC",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })?;
            rows.collect::<Result<Vec<_>, _>>()
                .context("failed to read available dates")
        })
    }

    pub fn get_crm_overview(&self) -> Result<CrmOverview> {
        let contacts = self.list_crm_contacts()?;
        let recent_interactions = self.list_crm_interactions(18)?;
        let reminders = contacts
            .iter()
            .filter_map(|contact| {
                let due = contact.days_until_follow_up?;
                let next_follow_up_at = contact.next_follow_up_at.clone()?;
                Some(CrmReminder {
                    contact_id: contact.id,
                    name: contact.name.clone(),
                    category: contact.category.clone(),
                    priority: contact.priority.clone(),
                    next_follow_up_at,
                    days_until_follow_up: due,
                    ai_nudge: contact.ai_nudge.clone(),
                })
            })
            .collect::<Vec<_>>();

        let people_met = contacts.iter().filter(|c| c.category == "person").count();
        let investors = contacts.iter().filter(|c| c.category == "investor").count();
        let customers = contacts.iter().filter(|c| c.category == "customer").count();
        let overdue_followups = reminders.iter().filter(|r| r.days_until_follow_up < 0).count();
        let due_this_week = reminders
            .iter()
            .filter(|r| (0..=7).contains(&r.days_until_follow_up))
            .count();

        Ok(CrmOverview {
            summary: CrmSummary {
                total_contacts: contacts.len(),
                people_met,
                investors,
                customers,
                overdue_followups,
                due_this_week,
            },
            contacts,
            reminders,
            recent_interactions,
            suggested_prompt: "3주 전에 이야기했던 사람입니다. 오늘 답장을 보내면 관계 흐름이 끊기지 않습니다."
                .to_string(),
        })
    }

    pub fn list_crm_contacts(&self) -> Result<Vec<CrmContact>> {
        self.db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, name, category, company, role, status, priority, preferred_channel, tags, notes,
                        last_contact_at, next_follow_up_at, created_at, updated_at
                 FROM crm_contacts
                 ORDER BY
                    CASE priority
                      WHEN 'critical' THEN 0
                      WHEN 'high' THEN 1
                      WHEN 'medium' THEN 2
                      ELSE 3
                    END,
                    COALESCE(next_follow_up_at, updated_at) ASC,
                    updated_at DESC",
            )?;

            let rows = stmt.query_map([], |row| row_to_crm_contact(row))?;
            rows.collect::<Result<Vec<_>, _>>()
                .context("failed to read crm contacts")
        })
    }

    pub fn upsert_crm_contact(&self, input: &CrmContactInput) -> Result<CrmContact> {
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let tags_json = serde_json::to_string(&input.tags).context("failed to encode crm tags")?;
        let company = clean_optional(&input.company);
        let role = clean_optional(&input.role);
        let preferred_channel = clean_optional(&input.preferred_channel);
        let last_contact_at = clean_optional(&input.last_contact_at);
        let next_follow_up_at = clean_optional(&input.next_follow_up_at);
        let status = if input.status.trim().is_empty() {
            "active"
        } else {
            input.status.trim()
        };
        let priority = if input.priority.trim().is_empty() {
            "medium"
        } else {
            input.priority.trim()
        };

        self.db.with_connection(|conn| {
            let id = if let Some(id) = input.id {
                conn.execute(
                    "UPDATE crm_contacts
                     SET name = ?1, category = ?2, company = ?3, role = ?4, status = ?5, priority = ?6,
                         preferred_channel = ?7, tags = ?8, notes = ?9, last_contact_at = ?10,
                         next_follow_up_at = ?11, updated_at = ?12
                     WHERE id = ?13",
                    params![
                        input.name.trim(),
                        input.category.trim(),
                        company,
                        role,
                        status,
                        priority,
                        preferred_channel,
                        tags_json,
                        input.notes.trim(),
                        last_contact_at,
                        next_follow_up_at,
                        now,
                        id,
                    ],
                )
                .context("failed to update crm contact")?;
                id
            } else {
                conn.execute(
                    "INSERT INTO crm_contacts
                     (name, category, company, role, status, priority, preferred_channel, tags, notes, last_contact_at, next_follow_up_at, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)",
                    params![
                        input.name.trim(),
                        input.category.trim(),
                        company,
                        role,
                        status,
                        priority,
                        preferred_channel,
                        tags_json,
                        input.notes.trim(),
                        last_contact_at,
                        next_follow_up_at,
                        now,
                    ],
                )
                .context("failed to insert crm contact")?;
                conn.last_insert_rowid()
            };

            let mut stmt = conn.prepare(
                "SELECT id, name, category, company, role, status, priority, preferred_channel, tags, notes,
                        last_contact_at, next_follow_up_at, created_at, updated_at
                 FROM crm_contacts WHERE id = ?1",
            )?;
            let contact = stmt.query_row(params![id], row_to_crm_contact)?;
            Ok(contact)
        })
    }

    pub fn delete_crm_contact(&self, id: i64) -> Result<()> {
        self.db.with_connection(|conn| {
            conn.execute("DELETE FROM crm_contacts WHERE id = ?1", params![id])
                .context("failed to delete crm contact")?;
            Ok(())
        })
    }

    pub fn add_crm_interaction(&self, input: &CrmInteractionInput) -> Result<CrmInteraction> {
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let happened_at = if input.happened_at.trim().is_empty() {
            now.clone()
        } else {
            input.happened_at.trim().to_string()
        };
        let source = clean_optional(&input.source);

        self.db.with_connection(|conn| {
            conn.execute(
                "INSERT INTO crm_interactions (contact_id, kind, summary, happened_at, source, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    input.contact_id,
                    input.kind.trim(),
                    input.summary.trim(),
                    happened_at,
                    source,
                    now,
                ],
            )
            .context("failed to insert crm interaction")?;

            conn.execute(
                "UPDATE crm_contacts
                 SET last_contact_at = ?1, updated_at = ?2
                 WHERE id = ?3",
                params![happened_at, now, input.contact_id],
            )
            .context("failed to update crm last contact")?;

            let interaction_id = conn.last_insert_rowid();
            let mut stmt = conn.prepare(
                "SELECT i.id, i.contact_id, c.name, i.kind, i.summary, i.happened_at, i.source, i.created_at
                 FROM crm_interactions i
                 JOIN crm_contacts c ON c.id = i.contact_id
                 WHERE i.id = ?1",
            )?;
            let interaction = stmt.query_row(params![interaction_id], row_to_crm_interaction)?;
            Ok(interaction)
        })
    }

    pub fn list_crm_interactions(&self, limit: usize) -> Result<Vec<CrmInteraction>> {
        self.db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT i.id, i.contact_id, c.name, i.kind, i.summary, i.happened_at, i.source, i.created_at
                 FROM crm_interactions i
                 JOIN crm_contacts c ON c.id = i.contact_id
                 ORDER BY i.happened_at DESC, i.id DESC
                 LIMIT ?1",
            )?;
            let rows = stmt.query_map(params![limit as i64], row_to_crm_interaction)?;
            rows.collect::<Result<Vec<_>, _>>()
                .context("failed to read crm interactions")
        })
    }
}

fn row_to_activity_event(row: &rusqlite::Row<'_>) -> rusqlite::Result<ActivityEvent> {
    let event_type_str: String = row.get(1)?;
    let created_at_str: String = row.get(2)?;
    let metadata_str: Option<String> = row.get(6)?;

    Ok(ActivityEvent {
        id: Some(row.get(0)?),
        event_type: crate::events::EventType::from_str(&event_type_str)
            .unwrap_or(crate::events::EventType::WindowFocus),
        created_at: NaiveDateTime::parse_from_str(&created_at_str, "%Y-%m-%d %H:%M:%S")
            .ok()
            .and_then(|naive| Local.from_local_datetime(&naive).single())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(Utc::now),
        duration: row.get(3)?,
        application: row.get(4)?,
        window_title: row.get(5)?,
        metadata: metadata_str
            .map(|s| serde_json::from_str(&s))
            .transpose()
            .unwrap_or(None),
    })
}

fn row_to_crm_contact(row: &rusqlite::Row<'_>) -> rusqlite::Result<CrmContact> {
    let tags_raw: String = row.get(8)?;
    let tags = serde_json::from_str::<Vec<String>>(&tags_raw).unwrap_or_default();
    let last_contact_at: Option<String> = row.get(10)?;
    let next_follow_up_at: Option<String> = row.get(11)?;
    let days_since_contact = date_distance_from_today(last_contact_at.as_deref());
    let days_until_follow_up = date_distance_to_today(next_follow_up_at.as_deref());

    Ok(CrmContact {
        id: row.get(0)?,
        name: row.get(1)?,
        category: row.get(2)?,
        company: row.get(3)?,
        role: row.get(4)?,
        status: row.get(5)?,
        priority: row.get(6)?,
        preferred_channel: row.get(7)?,
        tags,
        notes: row.get(9)?,
        last_contact_at,
        next_follow_up_at,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
        ai_nudge: build_ai_nudge(days_since_contact, days_until_follow_up),
        days_since_contact,
        days_until_follow_up,
    })
}

fn row_to_crm_interaction(row: &rusqlite::Row<'_>) -> rusqlite::Result<CrmInteraction> {
    Ok(CrmInteraction {
        id: row.get(0)?,
        contact_id: row.get(1)?,
        contact_name: row.get(2)?,
        kind: row.get(3)?,
        summary: row.get(4)?,
        happened_at: row.get(5)?,
        source: row.get(6)?,
        created_at: row.get(7)?,
    })
}

fn clean_optional(value: &Option<String>) -> Option<String> {
    value.as_ref().and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn parse_date_like(value: &str) -> Option<NaiveDate> {
    let head = value.get(0..10).unwrap_or(value);
    NaiveDate::parse_from_str(head, "%Y-%m-%d").ok()
}

fn date_distance_from_today(value: Option<&str>) -> Option<i64> {
    let date = parse_date_like(value?)?;
    Some((Local::now().date_naive() - date).num_days())
}

fn date_distance_to_today(value: Option<&str>) -> Option<i64> {
    let date = parse_date_like(value?)?;
    Some((date - Local::now().date_naive()).num_days())
}

fn build_ai_nudge(days_since_contact: Option<i64>, days_until_follow_up: Option<i64>) -> String {
    if let Some(days) = days_since_contact {
        if days >= 21 {
            let weeks = days / 7;
            return format!("{weeks}주 전에 이야기했던 사람입니다. 오늘 짧게 안부를 남기세요.");
        }
        if days >= 7 {
            return format!("{days}일 전에 대화했습니다. 이번 주 안에 한 번 더 연결하세요.");
        }
    }

    if let Some(days) = days_until_follow_up {
        if days < 0 {
            return format!("후속 연락이 {}일 지연되었습니다. 가장 먼저 처리하세요.", days.abs());
        }
        if days == 0 {
            return "오늘 팔로업 예정입니다. 답장이 필요한지 먼저 확인하세요.".to_string();
        }
        if days <= 3 {
            return format!("{days}일 안에 후속 연락 예정입니다. 대화 맥락을 미리 정리해두세요.");
        }
    }

    "최근 맥락을 한 줄로 남겨두면 다음 연락 품질이 올라갑니다.".to_string()
}
