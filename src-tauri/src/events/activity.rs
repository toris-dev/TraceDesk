use chrono::{DateTime, Local, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EventType {
    SystemStart,
    SystemShutdown,
    AppOpen,
    AppClose,
    WindowFocus,
    Copy,
    Paste,
    Screenshot,
    Keyboard,
    Mouse,
    IdleStart,
    IdleEnd,
}

impl EventType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::SystemStart => "SYSTEM_START",
            Self::SystemShutdown => "SYSTEM_SHUTDOWN",
            Self::AppOpen => "APP_OPEN",
            Self::AppClose => "APP_CLOSE",
            Self::WindowFocus => "WINDOW_FOCUS",
            Self::Copy => "COPY",
            Self::Paste => "PASTE",
            Self::Screenshot => "SCREENSHOT",
            Self::Keyboard => "KEYBOARD",
            Self::Mouse => "MOUSE",
            Self::IdleStart => "IDLE_START",
            Self::IdleEnd => "IDLE_END",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "SYSTEM_START" => Some(Self::SystemStart),
            "SYSTEM_SHUTDOWN" => Some(Self::SystemShutdown),
            "APP_OPEN" => Some(Self::AppOpen),
            "APP_CLOSE" => Some(Self::AppClose),
            "WINDOW_FOCUS" => Some(Self::WindowFocus),
            "COPY" => Some(Self::Copy),
            "PASTE" => Some(Self::Paste),
            "SCREENSHOT" => Some(Self::Screenshot),
            "KEYBOARD" => Some(Self::Keyboard),
            "MOUSE" => Some(Self::Mouse),
            "IDLE_START" => Some(Self::IdleStart),
            "IDLE_END" => Some(Self::IdleEnd),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityEvent {
    pub id: Option<i64>,
    pub event_type: EventType,
    pub created_at: DateTime<Utc>,
    pub duration: Option<i64>,
    pub application: Option<String>,
    pub window_title: Option<String>,
    pub metadata: Option<Value>,
}

impl ActivityEvent {
    pub fn new(event_type: EventType) -> Self {
        Self {
            id: None,
            event_type,
            created_at: Local::now().with_timezone(&Utc),
            duration: None,
            application: None,
            window_title: None,
            metadata: None,
        }
    }

    pub fn with_app(
        mut self,
        application: impl Into<String>,
        window_title: Option<String>,
    ) -> Self {
        self.application = Some(application.into());
        self.window_title = window_title;
        self
    }

    pub fn with_duration(mut self, duration: i64) -> Self {
        self.duration = Some(duration);
        self
    }

    pub fn with_metadata(mut self, metadata: Value) -> Self {
        self.metadata = Some(metadata);
        self
    }
}
