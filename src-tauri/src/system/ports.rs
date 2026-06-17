use anyhow::{Context, Result};
use serde::Serialize;
use std::collections::HashMap;
use std::process::Command;

const MAX_PORTS: usize = 120;

#[derive(Debug, Clone, Serialize)]
pub struct PortInfo {
    pub port: u16,
    pub protocol: String,
    pub address: String,
    pub process: Option<String>,
    pub pid: Option<u32>,
    pub is_tracedesk: bool,
}

pub fn list_listening_ports(self_pid: u32) -> Result<Vec<PortInfo>> {
    #[cfg(unix)]
    {
        list_ports_unix(self_pid)
    }
    #[cfg(windows)]
    {
        list_ports_windows(self_pid)
    }
}

#[cfg(unix)]
fn list_ports_unix(self_pid: u32) -> Result<Vec<PortInfo>> {
    let output = match Command::new("lsof")
        .args(["-nP", "-iTCP", "-sTCP:LISTEN"])
        .output()
    {
        Ok(o) => o,
        Err(e) => {
            tracing::debug!("lsof unavailable: {e:#}");
            return Ok(Vec::new());
        }
    };

    if !output.status.success() {
        tracing::debug!(
            status = ?output.status,
            stderr = %String::from_utf8_lossy(&output.stderr),
            "lsof port scan failed"
        );
        return Ok(Vec::new());
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let mut ports: Vec<PortInfo> = Vec::new();
    let mut seen = HashMap::new();

    for line in text.lines().skip(1) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 9 {
            continue;
        }

        let name = parts[0].to_string();
        let pid = parts[1].parse::<u32>().ok();
        let name_col = parts.get(8).copied().unwrap_or("");

        let (address, port, protocol) = parse_lsof_name(name_col);
        let Some(port) = port else { continue };

        let key = format!("{protocol}:{address}:{port}");
        if seen.contains_key(&key) {
            continue;
        }
        seen.insert(key, ());

        ports.push(PortInfo {
            port,
            protocol,
            address,
            process: Some(name),
            pid,
            is_tracedesk: pid == Some(self_pid),
        });

        if ports.len() >= MAX_PORTS {
            break;
        }
    }

    ports.sort_by_key(|p| p.port);
    Ok(ports)
}

#[cfg(unix)]
fn parse_lsof_name(name_col: &str) -> (String, Option<u16>, String) {
    let cleaned = name_col.trim_end_matches("(LISTEN)").trim();
    if let Some((addr, port_str)) = cleaned.rsplit_once(':') {
        if let Ok(port) = port_str.parse::<u16>() {
            return (addr.to_string(), Some(port), "TCP".into());
        }
    }
    (cleaned.to_string(), None, "TCP".into())
}

#[cfg(windows)]
fn list_ports_windows(self_pid: u32) -> Result<Vec<PortInfo>> {
    // One tasklist call for all PIDs — avoids spawning tasklist per port (very slow on Windows).
    let pid_names = build_windows_pid_name_map();

    let output = Command::new("netstat")
        .args(["-ano"])
        .output()
        .context("failed to run netstat")?;

    let text = String::from_utf8_lossy(&output.stdout);
    let mut ports = Vec::new();
    let mut seen = HashMap::new();

    for line in text.lines() {
        if ports.len() >= MAX_PORTS {
            break;
        }
        let line = line.trim();
        if !line.contains("LISTENING") {
            continue;
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 5 {
            continue;
        }
        let proto = parts[0].to_string();
        let local = parts[1];
        let pid = parts[4].parse::<u32>().ok();

        let (address, port) = parse_windows_local(local);
        let Some(port) = port else { continue };

        let key = format!("{proto}:{address}:{port}");
        if seen.contains_key(&key) {
            continue;
        }
        seen.insert(key, ());

        ports.push(PortInfo {
            port,
            protocol: proto,
            address,
            process: pid.and_then(|p| pid_names.get(&p).cloned()),
            pid,
            is_tracedesk: pid == Some(self_pid),
        });
    }

    ports.sort_by_key(|p| p.port);
    Ok(ports)
}

#[cfg(windows)]
fn parse_windows_local(local: &str) -> (String, Option<u16>) {
    super::ports_parse::parse_windows_local(local)
}

#[cfg(windows)]
fn build_windows_pid_name_map() -> HashMap<u32, String> {
    let mut map = HashMap::new();
    let Ok(output) = Command::new("tasklist")
        .args(["/FO", "CSV", "/NH"])
        .output()
    else {
        return map;
    };

    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        if let Some((pid, name)) = super::ports_parse::parse_tasklist_csv_line(line) {
            map.insert(pid, name);
        }
    }
    map
}

/// LISTEN 포트를 점유한 프로세스 종료 (TraceDesk 자체 PID는 보호)
pub fn kill_listener_process(pid: u32, self_pid: u32) -> Result<()> {
    if pid == 0 {
        anyhow::bail!("invalid pid");
    }
    if pid == self_pid {
        anyhow::bail!("TraceDesk 프로세스는 종료할 수 없습니다");
    }

    #[cfg(unix)]
    {
        let status = Command::new("kill")
            .arg(pid.to_string())
            .status()
            .context("failed to run kill")?;
        if !status.success() {
            anyhow::bail!("프로세스 종료에 실패했습니다 (PID {pid})");
        }
        Ok(())
    }

    #[cfg(windows)]
    {
        let status = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .status()
            .context("failed to run taskkill")?;
        if !status.success() {
            anyhow::bail!("프로세스 종료에 실패했습니다 (PID {pid})");
        }
        Ok(())
    }
}
