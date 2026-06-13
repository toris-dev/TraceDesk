use crate::system::ports::{self, PortInfo};
use anyhow::Result;
use chrono::Utc;
use serde::Serialize;
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;
use sysinfo::{Pid, System};

#[derive(Debug, Clone, Serialize)]
pub struct MemoryInfo {
    pub total_mb: u64,
    pub used_mb: u64,
    pub available_mb: u64,
    pub used_percent: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_percent: f32,
    pub memory_mb: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SystemSnapshot {
    pub timestamp: String,
    pub cpu_usage_percent: f32,
    pub memory: MemoryInfo,
    pub tracedesk: Option<ProcessInfo>,
    pub top_processes: Vec<ProcessInfo>,
    pub ports: Vec<PortInfo>,
    pub port_count: usize,
}

pub fn collect_snapshot(sys: &mut System) -> Result<SystemSnapshot> {
    sys.refresh_cpu_all();
    sys.refresh_memory();

    let cpu_usage = sys.global_cpu_usage();

    let total = sys.total_memory() / 1024 / 1024;
    let available = sys.available_memory() / 1024 / 1024;
    let used = total.saturating_sub(available);
    let used_percent = if total > 0 {
        (used as f32 / total as f32) * 100.0
    } else {
        0.0
    };

    let self_pid = std::process::id();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let tracedesk = sys.process(Pid::from_u32(self_pid)).map(|p| process_info(self_pid, p));

    let mut processes: Vec<ProcessInfo> = sys
        .processes()
        .iter()
        .map(|(pid, proc_)| process_info(pid.as_u32(), proc_))
        .collect();

    processes.sort_by(|a, b| {
        b.cpu_percent
            .partial_cmp(&a.cpu_percent)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let top_processes: Vec<_> = processes.into_iter().take(15).collect();

    let ports = ports::list_listening_ports(self_pid)?;

    Ok(SystemSnapshot {
        timestamp: Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
        cpu_usage_percent: cpu_usage,
        memory: MemoryInfo {
            total_mb: total,
            used_mb: used,
            available_mb: available,
            used_percent,
        },
        tracedesk,
        port_count: ports.len(),
        ports,
        top_processes,
    })
}

fn process_info(pid: u32, proc_: &sysinfo::Process) -> ProcessInfo {
    ProcessInfo {
        pid,
        name: proc_.name().to_string_lossy().into_owned(),
        cpu_percent: proc_.cpu_usage(),
        memory_mb: proc_.memory() / 1024 / 1024,
    }
}

pub fn lock_system<'a>(sys: &'a Mutex<System>) -> MutexGuard<'a, System> {
    sys.lock().expect("system metrics mutex poisoned")
}

pub fn create_system() -> System {
    let mut sys = System::new_all();
    sys.refresh_all();
    std::thread::sleep(Duration::from_millis(300));
    sys
}
