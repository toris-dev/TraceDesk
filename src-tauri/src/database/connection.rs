use anyhow::{Context, Result};
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS activity_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    duration INTEGER,
    application TEXT,
    window_title TEXT,
    metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_activity_events_created_at ON activity_events(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_events_event_type ON activity_events(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_events_application ON activity_events(application);

CREATE TABLE IF NOT EXISTS daily_summary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    active_minutes INTEGER NOT NULL DEFAULT 0,
    idle_minutes INTEGER NOT NULL DEFAULT 0,
    copy_count INTEGER NOT NULL DEFAULT 0,
    paste_count INTEGER NOT NULL DEFAULT 0,
    screenshot_count INTEGER NOT NULL DEFAULT 0,
    top_application TEXT
);

CREATE TABLE IF NOT EXISTS application_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    application TEXT NOT NULL,
    duration INTEGER NOT NULL DEFAULT 0,
    UNIQUE(date, application)
);
";

pub fn data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("tracedesk")
}

pub fn default_db_path() -> PathBuf {
    data_dir().join("tracedesk.db")
}

pub fn archives_dir() -> PathBuf {
    data_dir().join("archives")
}

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn open(path: Option<PathBuf>) -> Result<Self> {
        let path = path.unwrap_or_else(default_db_path);

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("failed to create db directory: {}", parent.display()))?;
        }

        let conn = Connection::open(&path)
            .with_context(|| format!("failed to open database: {}", path.display()))?;

        conn.execute_batch(SCHEMA)
            .context("failed to initialize database schema")?;

        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             PRAGMA temp_store=MEMORY;
             PRAGMA cache_size=-8000;",
        )
        .context("failed to apply sqlite pragmas")?;

        tracing::info!(path = %path.display(), "database initialized");

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn with_connection<F, T>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&Connection) -> Result<T>,
    {
        let conn = self.conn.lock().expect("database mutex poisoned");
        f(&conn)
    }
}
