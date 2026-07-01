use crate::database::{Database, Repository};
use crate::os::PermissionStatus;
use crate::system::SystemMonitor;
use std::sync::{Arc, Mutex, RwLock};
use tokio::sync::watch;

pub struct AppState {
    pub repository: Arc<Repository>,
    pub permissions: Arc<RwLock<PermissionStatus>>,
    pub system: Arc<Mutex<Option<SystemMonitor>>>,
    pub shutdown_tx: watch::Sender<bool>,
}

impl AppState {
    pub fn new() -> anyhow::Result<(Self, watch::Receiver<bool>)> {
        let db = Database::open(None)?;
        let repository = Arc::new(Repository::new(db));
        let permissions = Arc::new(RwLock::new(crate::os::check_permissions()));
        let system = Arc::new(Mutex::new(None));
        let (shutdown_tx, shutdown_rx) = watch::channel(false);

        Ok((
            Self {
                repository,
                permissions,
                system,
                shutdown_tx,
            },
            shutdown_rx,
        ))
    }
}
