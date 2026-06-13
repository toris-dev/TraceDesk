use std::process::Command;

/// CGWindowList API 실패 시 앱 이름만 조회 (화면 녹화 권한 불필요)
pub fn frontmost_app_name() -> Option<String> {
    frontmost_via_nsworkspace().or_else(frontmost_via_lsappinfo)
}

fn frontmost_via_nsworkspace() -> Option<String> {
    let output = Command::new("osascript")
        .args([
            "-l",
            "JavaScript",
            "-e",
            "ObjC.import('AppKit'); $.NSWorkspace.sharedWorkspace.frontmostApplication.localizedName.js",
        ])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if name.is_empty() { None } else { Some(name) }
}

fn frontmost_via_lsappinfo() -> Option<String> {
    let front = Command::new("lsappinfo").arg("front").output().ok()?;
    if !front.status.success() {
        return None;
    }
    let front_key = String::from_utf8_lossy(&front.stdout).trim().to_string();
    if front_key.is_empty() || front_key == "[ NULL ]" {
        return None;
    }

    let info = Command::new("lsappinfo")
        .args(["info", "-only", "name", &front_key])
        .output()
        .ok()?;
    if !info.status.success() {
        return None;
    }

    let text = String::from_utf8_lossy(&info.stdout);
    for line in text.lines() {
        if let Some((_, value)) = line.split_once('=') {
            let name = value.trim().trim_matches('"').to_string();
            if !name.is_empty() {
                return Some(name);
            }
        }
    }

    None
}

pub fn running_app_label() -> String {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(path_str) = exe.to_str() {
            if let Some(app_idx) = path_str.find(".app/Contents/") {
                let bundle_path = &path_str[..app_idx + 4];
                if let Some(name) = bundle_path.rsplit('/').next() {
                    let label = name.trim_end_matches(".app");
                    if !label.is_empty() {
                        return label.to_string();
                    }
                }
            }
        }
        if let Some(name) = exe.file_stem().and_then(|s| s.to_str()) {
            return name.to_string();
        }
    }
    "TraceDesk".into()
}
