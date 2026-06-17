use crate::system::ports::{self, PortInfo};
use anyhow::Result;
use chrono::Utc;
use serde::Serialize;
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};
use sysinfo::{Pid, ProcessesToUpdate, System};

const PROCESS_REFRESH_EVERY: u64 = 6;
const PORTS_REFRESH_SECS: u64 = 30;
const TOP_PROCESS_LIMIT: usize = 15;

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

/// Cached system monitor state — avoids re-scanning all processes and ports every poll.
pub struct SystemMonitor {
    sys: System,
    tick: u64,
    self_pid: u32,
    top_processes: Vec<ProcessInfo>,
    tracedesk: Option<ProcessInfo>,
    ports: Vec<PortInfo>,
    port_count: usize,
    last_ports_at: Option<Instant>,
}

impl SystemMonitor {
    fn new(sys: System) -> Self {
        Self {
            sys,
            tick: 0,
            self_pid: std::process::id(),
            top_processes: Vec::new(),
            tracedesk: None,
            ports: Vec::new(),
            port_count: 0,
            last_ports_at: None,
        }
    }

    fn should_refresh_ports(&self) -> bool {
        match self.last_ports_at {
            None => true,
            Some(t) => t.elapsed() >= Duration::from_secs(PORTS_REFRESH_SECS),
        }
    }

    fn refresh_processes(&mut self) {
        self.sys
            .refresh_processes(ProcessesToUpdate::All, true);

        self.tracedesk = self
            .sys
            .process(Pid::from_u32(self.self_pid))
            .map(|p| process_info(self.self_pid, p));

        self.top_processes = compute_top_processes(&self.sys, TOP_PROCESS_LIMIT);
    }

    fn refresh_ports(&mut self) -> Result<()> {
        let ports = ports::list_listening_ports(self.self_pid)?;
        self.port_count = ports.len();
        self.ports = ports;
        self.last_ports_at = Some(Instant::now());
        Ok(())
    }
}

pub fn collect_snapshot(mon: &mut SystemMonitor) -> Result<SystemSnapshot> {
    mon.tick += 1;

    mon.sys.refresh_cpu_all();
    mon.sys.refresh_memory();

    let cpu_usage = mon.sys.global_cpu_usage();

    let total = mon.sys.total_memory() / 1024 / 1024;
    let available = mon.sys.available_memory() / 1024 / 1024;
    let used = mon.sys.used_memory() / 1024 / 1024;
    let used_percent = if total > 0 {
        (used as f32 / total as f32) * 100.0
    } else {
        0.0
    };

    if mon.tick == 1 || mon.tick % PROCESS_REFRESH_EVERY == 0 {
        mon.refresh_processes();
    }

    if mon.should_refresh_ports() {
        if let Err(e) = mon.refresh_ports() {
            tracing::warn!("port scan failed: {e:#}");
            mon.last_ports_at = Some(Instant::now());
        }
    }

    Ok(SystemSnapshot {
        timestamp: Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
        cpu_usage_percent: cpu_usage,
        memory: MemoryInfo {
            total_mb: total,
            used_mb: used,
            available_mb: available,
            used_percent,
        },
        tracedesk: mon.tracedesk.clone(),
        port_count: mon.port_count,
        ports: mon.ports.clone(),
        top_processes: mon.top_processes.clone(),
    })
}

fn compute_top_processes(sys: &System, limit: usize) -> Vec<ProcessInfo> {
    let mut processes: Vec<ProcessInfo> = sys
        .processes()
        .iter()
        .map(|(pid, proc_)| process_info(pid.as_u32(), proc_))
        .collect();

    let n = processes.len();
    if n > limit {
        let k = limit.saturating_sub(1);
        processes.select_nth_unstable_by(k, |a, b| {
            b.cpu_percent
                .partial_cmp(&a.cpu_percent)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        processes.truncate(limit);
    }

    processes.sort_by(|a, b| {
        b.cpu_percent
            .partial_cmp(&a.cpu_percent)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    processes
}

fn process_info(pid: u32, proc_: &sysinfo::Process) -> ProcessInfo {
    ProcessInfo {
        pid,
        name: proc_.name().to_string_lossy().into_owned(),
        cpu_percent: proc_.cpu_usage(),
        memory_mb: proc_.memory() / 1024 / 1024,
    }
}

pub fn lock_monitor<'a>(mon: &'a Mutex<SystemMonitor>) -> MutexGuard<'a, SystemMonitor> {
    mon.lock().expect("system monitor mutex poisoned")
}

pub fn create_monitor() -> SystemMonitor {
    let mut sys = System::new();
    sys.refresh_cpu_all();
    sys.refresh_memory();
    std::thread::sleep(Duration::from_millis(200));

    let mut mon = SystemMonitor::new(sys);
    mon.refresh_processes();
    if let Err(e) = mon.refresh_ports() {
        tracing::warn!("initial port scan failed: {e:#}");
    }
    mon
}
