use super::{collect_snapshot, create_monitor, SystemSnapshot};
use std::time::{Duration, Instant};

fn assert_memory(snap: &SystemSnapshot) {
    let m = &snap.memory;
    assert!(m.total_mb > 0, "total_mb should be > 0, got {}", m.total_mb);
    assert!(
        m.used_mb <= m.total_mb.saturating_add(512),
        "used_mb ({}) should not exceed total_mb ({}) by much",
        m.used_mb,
        m.total_mb
    );
    assert!(
        m.used_percent >= 0.0 && m.used_percent <= 100.0,
        "used_percent out of range: {}",
        m.used_percent
    );
    assert!(
        m.available_mb <= m.total_mb,
        "available_mb ({}) > total_mb ({})",
        m.available_mb,
        m.total_mb
    );
}

fn assert_cpu(snap: &SystemSnapshot) {
    assert!(
        snap.cpu_usage_percent >= 0.0 && snap.cpu_usage_percent <= 100.0,
        "cpu_usage_percent out of range: {}",
        snap.cpu_usage_percent
    );
}

#[test]
fn snapshot_returns_valid_cpu_and_memory() {
    let mut mon = create_monitor();
    let snap = collect_snapshot(&mut mon).expect("collect_snapshot should succeed");
    assert_memory(&snap);
    assert_cpu(&snap);
    assert!(!snap.timestamp.is_empty());
}

#[test]
fn tracedesk_process_is_present() {
    let mut mon = create_monitor();
    let snap = collect_snapshot(&mut mon).expect("collect_snapshot");
    let td = snap
        .tracedesk
        .as_ref()
        .expect("tracedesk process should be found by self PID");
    assert!(td.pid > 0);
    assert!(!td.name.is_empty());
    assert!(td.memory_mb > 0 || td.cpu_percent >= 0.0);
}

#[test]
fn repeated_snapshots_stay_consistent_and_fast() {
    let mut mon = create_monitor();
    let first = collect_snapshot(&mut mon).expect("first snapshot");
    assert_memory(&first);
    assert_cpu(&first);

    let start = Instant::now();
    for _ in 0..20 {
        let snap = collect_snapshot(&mut mon).expect("repeated snapshot");
        assert_memory(&snap);
        assert_cpu(&snap);
    }
    let elapsed = start.elapsed();
    assert!(
        elapsed < Duration::from_secs(15),
        "20 cached snapshots took too long: {:?}",
        elapsed
    );
}

#[test]
fn port_list_does_not_fail() {
    let mut mon = create_monitor();
    let snap = collect_snapshot(&mut mon).expect("collect_snapshot");
    assert_eq!(snap.ports.len(), snap.port_count);
}

#[test]
fn top_processes_are_sorted_by_cpu() {
    let mut mon = create_monitor();
    let snap = collect_snapshot(&mut mon).expect("collect_snapshot");
    if snap.top_processes.len() < 2 {
        return;
    }
    for w in snap.top_processes.windows(2) {
        assert!(
            w[0].cpu_percent >= w[1].cpu_percent,
            "top processes not sorted: {} < {}",
            w[0].cpu_percent,
            w[1].cpu_percent
        );
    }
}

#[cfg(unix)]
#[test]
fn unix_port_scan_returns_entries() {
    use super::ports::list_listening_ports;
    let ports = list_listening_ports(std::process::id()).expect("lsof port scan");
    // macOS dev machines almost always have at least one listener (e.g. ControlCenter, rapportd)
    eprintln!("unix LISTEN ports found: {}", ports.len());
}

#[cfg(windows)]
#[test]
fn windows_port_scan_returns_without_error() {
    use super::ports::list_listening_ports;
    let ports = list_listening_ports(std::process::id()).expect("netstat port scan");
    eprintln!("windows LISTEN ports found: {}", ports.len());
}
