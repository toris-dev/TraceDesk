use anyhow::Result;
use chrono::{DateTime, NaiveDate, Utc};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;

use crate::database::connection::{archives_dir, default_db_path, SCHEMA};

pub const DEFAULT_RETENTION_DAYS: u32 = 90;
pub const AUTO_ARCHIVE_INTERVAL_DAYS: i64 = 7;
pub const AUTO_ARCHIVE_SIZE_BYTES: u64 = 40 * 1024 * 1024; // 40 MB

#[derive(Debug, Clone, Serialize)]
pub struct ArchiveInfo {
    pub period: String,
    pub filename: String,
    pub compressed_bytes: u64,
    pub event_count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DbStats {
    pub active_db_bytes: u64,
    pub active_db_mb: f64,
    pub event_count: i64,
    pub oldest_event: Option<String>,
    pub retention_days: u32,
    pub archives: Vec<ArchiveInfo>,
    pub total_archive_bytes: u64,
    pub total_archive_mb: f64,
    pub last_archive_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ArchiveResult {
    pub archived_months: Vec<String>,
    pub deleted_events: i64,
    pub freed_bytes_estimate: u64,
    pub active_db_bytes_after: u64,
}

pub fn should_auto_archive(
    active_db_bytes: u64,
    last_archive_at: Option<&str>,
    has_stale_data: bool,
) -> bool {
    if active_db_bytes >= AUTO_ARCHIVE_SIZE_BYTES {
        return true;
    }
    if has_stale_data {
        if let Some(ts) = last_archive_at {
            if let Ok(last) = DateTime::parse_from_rfc3339(ts) {
                let days = (Utc::now() - last.with_timezone(&Utc)).num_days();
                return days >= AUTO_ARCHIVE_INTERVAL_DAYS;
            }
        }
        return true;
    }
    false
}

pub fn collect_db_stats(retention_days: u32, last_archive_at: Option<String>) -> Result<DbStats> {
    let db_path = default_db_path();
    let active_db_bytes = fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);

    let conn = Connection::open(&db_path)?;
    let event_count: i64 = conn.query_row("SELECT COUNT(*) FROM activity_events", [], |r| r.get(0))?;
    let oldest_event: Option<String> = conn
        .query_row(
            "SELECT MIN(created_at) FROM activity_events",
            [],
            |r| r.get(0),
        )
        .ok();

    let archives = list_archives()?;
    let total_archive_bytes: u64 = archives.iter().map(|a| a.compressed_bytes).sum();

    Ok(DbStats {
        active_db_bytes,
        active_db_mb: bytes_to_mb(active_db_bytes),
        event_count,
        oldest_event,
        retention_days,
        total_archive_bytes,
        total_archive_mb: bytes_to_mb(total_archive_bytes),
        archives,
        last_archive_at,
    })
}

pub fn has_data_older_than(retention_days: u32) -> Result<bool> {
    let cutoff = cutoff_date(retention_days);
    let conn = Connection::open(default_db_path())?;
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM activity_events WHERE date(created_at) < date(?1)",
        params![cutoff.format("%Y-%m-%d").to_string()],
        |r| r.get(0),
    )?;
    Ok(count > 0)
}

pub fn run_archive(retention_days: u32) -> Result<ArchiveResult> {
    let db_path = default_db_path();
    let size_before = fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);
    let cutoff = cutoff_date(retention_days);

    fs::create_dir_all(archives_dir())?;

    let conn = Connection::open(&db_path)?;
    let periods = months_to_archive(&conn, &cutoff)?;

    let mut archived_months = Vec::new();
    let mut deleted_events = 0i64;

    for period in periods {
        let count = archive_month(&conn, &period)?;
        if count > 0 {
            deleted_events += count;
            archived_months.push(period);
        }
    }

    if deleted_events > 0 {
        conn.execute("VACUUM", [])?;
    }

    let size_after = fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);

    Ok(ArchiveResult {
        archived_months,
        deleted_events,
        freed_bytes_estimate: size_before.saturating_sub(size_after),
        active_db_bytes_after: size_after,
    })
}

fn cutoff_date(retention_days: u32) -> NaiveDate {
    Utc::now().date_naive() - chrono::Duration::days(retention_days as i64)
}

fn months_to_archive(conn: &Connection, cutoff: &NaiveDate) -> Result<Vec<String>> {
    let cutoff_str = cutoff.format("%Y-%m-%d").to_string();
    let mut stmt = conn.prepare(
        "SELECT DISTINCT strftime('%Y-%m', created_at) AS period
         FROM activity_events
         WHERE date(created_at) < date(?1)
         AND period IS NOT NULL
         ORDER BY period ASC",
    )?;

    let rows = stmt.query_map(params![cutoff_str], |row| row.get::<_, String>(0))?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

fn archive_month(conn: &Connection, period: &str) -> Result<i64> {
    let gz_path = archives_dir().join(format!("{period}.db.gz"));
    if gz_path.exists() {
        // Already archived — still purge stale rows from active db
        return purge_month(conn, period);
    }

    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM activity_events WHERE strftime('%Y-%m', created_at) = ?1",
        params![period],
        |r| r.get(0),
    )?;
    if count == 0 {
        return Ok(0);
    }

    let temp_db = archives_dir().join(format!(".{period}.tmp.db"));
    if temp_db.exists() {
        fs::remove_file(&temp_db)?;
    }

    {
        let archive_conn = Connection::open(&temp_db)?;
        archive_conn.execute_batch(SCHEMA)?;

        let attach_path = temp_db.to_string_lossy().replace('\'', "''");
        conn.execute_batch(&format!("ATTACH DATABASE '{attach_path}' AS archive_db"))?;

        conn.execute(
            "INSERT INTO archive_db.activity_events
             SELECT * FROM activity_events WHERE strftime('%Y-%m', created_at) = ?1",
            params![period],
        )?;
        conn.execute(
            "INSERT OR REPLACE INTO archive_db.daily_summary
             SELECT * FROM daily_summary WHERE substr(date, 1, 7) = ?1",
            params![period],
        )?;
        conn.execute(
            "INSERT OR REPLACE INTO archive_db.application_usage
             SELECT * FROM application_usage WHERE substr(date, 1, 7) = ?1",
            params![period],
        )?;

        conn.execute_batch("DETACH DATABASE archive_db")?;
    }

    gzip_file(&temp_db, &gz_path)?;
    fs::remove_file(&temp_db)?;

    purge_month(conn, period)?;
    tracing::info!(period, events = count, "archived month to compressed store");

    Ok(count)
}

fn purge_month(conn: &Connection, period: &str) -> Result<i64> {
    let deleted: i64 = conn.query_row(
        "SELECT COUNT(*) FROM activity_events WHERE strftime('%Y-%m', created_at) = ?1",
        params![period],
        |r| r.get(0),
    )?;

    conn.execute(
        "DELETE FROM activity_events WHERE strftime('%Y-%m', created_at) = ?1",
        params![period],
    )?;
    conn.execute(
        "DELETE FROM daily_summary WHERE substr(date, 1, 7) = ?1",
        params![period],
    )?;
    conn.execute(
        "DELETE FROM application_usage WHERE substr(date, 1, 7) = ?1",
        params![period],
    )?;

    Ok(deleted)
}

fn gzip_file(src: &Path, dest: &Path) -> Result<()> {
    let mut input = File::open(src)?;
    let mut buf = Vec::new();
    input.read_to_end(&mut buf)?;

    let output = File::create(dest)?;
    let mut encoder = flate2::write::GzEncoder::new(output, flate2::Compression::best());
    encoder.write_all(&buf)?;
    encoder.finish()?;
    Ok(())
}

pub fn list_archives() -> Result<Vec<ArchiveInfo>> {
    let dir = archives_dir();
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut archives = Vec::new();
    for entry in fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("gz") {
            continue;
        }
        let filename = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        let period = filename
            .strip_suffix(".db.gz")
            .unwrap_or(&filename)
            .to_string();
        let compressed_bytes = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        let event_count = read_archive_event_count(&path).unwrap_or(0);

        archives.push(ArchiveInfo {
            period,
            filename,
            compressed_bytes,
            event_count,
        });
    }

    archives.sort_by(|a, b| a.period.cmp(&b.period));
    Ok(archives)
}

fn read_archive_event_count(gz_path: &Path) -> Result<i64> {
    let temp = gz_path.with_extension(""); // .db
    decompress_gz(gz_path, &temp)?;
    let count: i64 = Connection::open(&temp)?
        .query_row("SELECT COUNT(*) FROM activity_events", [], |r| r.get(0))?;
    let _ = fs::remove_file(&temp);
    Ok(count)
}

fn decompress_gz(src: &Path, dest: &Path) -> Result<()> {
    let input = File::open(src)?;
    let mut decoder = flate2::read::GzDecoder::new(input);
    let mut buf = Vec::new();
    decoder.read_to_end(&mut buf)?;
    let mut output = File::create(dest)?;
    output.write_all(&buf)?;
    Ok(())
}

fn bytes_to_mb(bytes: u64) -> f64 {
    (bytes as f64 / 1024.0 / 1024.0 * 100.0).round() / 100.0
}
