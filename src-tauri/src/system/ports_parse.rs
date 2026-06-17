//! Cross-platform parsers — compiled on Windows and under `cargo test` for unit tests.
#[cfg(any(windows, test))]
pub fn parse_windows_local(local: &str) -> (String, Option<u16>) {
    if let Some(after) = local.rsplit(':').next() {
        if let Ok(port) = after.parse::<u16>() {
            let addr = local.trim_end_matches(&format!(":{port}")).to_string();
            return (addr, Some(port));
        }
    }
    (local.to_string(), None)
}

#[cfg(any(windows, test))]
pub fn parse_tasklist_csv_line(line: &str) -> Option<(u32, String)> {
    let mut fields = line.split(',');
    let name_raw = fields.next()?;
    let pid_raw = fields.next()?;
    let name = name_raw.trim_matches('"').to_string();
    let pid = pid_raw.trim_matches('"').parse().ok()?;
    Some((pid, name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_windows_local_ipv4() {
        let (addr, port) = parse_windows_local("127.0.0.1:5173");
        assert_eq!(addr, "127.0.0.1");
        assert_eq!(port, Some(5173));
    }

    #[test]
    fn parse_windows_local_wildcard() {
        let (addr, port) = parse_windows_local("0.0.0.0:3847");
        assert_eq!(addr, "0.0.0.0");
        assert_eq!(port, Some(3847));
    }

    #[test]
    fn parse_windows_local_ipv6() {
        let (addr, port) = parse_windows_local("[::]:8080");
        assert_eq!(addr, "[::]");
        assert_eq!(port, Some(8080));
    }

    #[test]
    fn parse_tasklist_line() {
        let parsed = parse_tasklist_csv_line(r#""chrome.exe","1234","Console","1","99,999 K""#);
        assert_eq!(parsed, Some((1234, "chrome.exe".into())));
    }
}
