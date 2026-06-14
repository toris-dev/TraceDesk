use crate::database::models::{ApplicationUsage, DailySummary};
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
