use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct PermissionItem {
    pub id: String,
    pub name: String,
    pub granted: bool,
    pub required: bool,
    pub description: String,
    /// macOS: TCC 허용됐지만 실제 API가 동작하는지 (접근성/화면녹화)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub functional: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PermissionStatus {
    pub platform: String,
    pub all_granted: bool,
    pub permissions: Vec<PermissionItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub restart_recommended: Option<bool>,
}

/// 시스템 권한 상태 확인
pub fn check_permissions() -> PermissionStatus {
    platform_check()
}

/// OS 권한 요청 다이얼로그 표시 (macOS: 접근성·입력 모니터링)
pub fn request_permissions() -> PermissionStatus {
    platform_request()
}

/// 시스템 설정의 해당 권한 화면 열기
pub fn open_settings(permission_id: &str) -> anyhow::Result<()> {
    platform_open_settings(permission_id)
}

/// 시작 시 권한 확인 및 요청 프롬프트 표시 (설정에 따라 선택적)
pub fn ensure_at_startup(settings: &crate::settings::AppSettings) {
    if !settings.setup_completed {
        tracing::info!("skipping permission prompts until initial setup is completed");
        return;
    }

    let status = request_selected_permissions(
        settings.enable_accessibility,
        settings.enable_input_monitoring,
    );
    log_permission_status(&status);
}

pub fn request_selected_permissions(
    accessibility: bool,
    input_monitoring: bool,
) -> PermissionStatus {
    platform_request_selected(accessibility, input_monitoring)
}

fn log_permission_status(status: &PermissionStatus) {
    if status.all_granted {
        tracing::info!("all enabled permissions granted");
        return;
    }

    for perm in &status.permissions {
        if perm.required && !perm.granted {
            tracing::warn!(
                permission = %perm.id,
                name = %perm.name,
                "permission not granted — some features will be limited"
            );
        }
    }

    tracing::info!(
        "grant permissions in System Settings if prompts appeared, then restart TraceDesk if needed"
    );
}

#[cfg(target_os = "macos")]
mod platform {
    use super::{PermissionItem, PermissionStatus};
    use core_foundation::base::TCFType;
    use core_foundation::boolean::CFBoolean;
    use core_foundation::dictionary::CFDictionary;
    use core_foundation::string::CFString;
    use std::process::Command;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
        fn AXIsProcessTrustedWithOptions(opts: core_foundation::dictionary::CFDictionaryRef) -> bool;
    }

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightListenEventAccess() -> bool;
        fn CGRequestListenEventAccess() -> bool;
        fn CGPreflightScreenCaptureAccess() -> bool;
        fn CGRequestScreenCaptureAccess() -> bool;
    }

    fn is_accessibility_granted() -> bool {
        unsafe { AXIsProcessTrusted() }
    }

    fn is_input_monitoring_granted() -> bool {
        unsafe { CGPreflightListenEventAccess() }
    }

    fn is_screen_recording_granted() -> bool {
        unsafe { CGPreflightScreenCaptureAccess() }
    }

    fn request_accessibility_prompt() -> bool {
        unsafe {
            let key = CFString::new("AXTrustedCheckOptionPrompt");
            let value = CFBoolean::true_value();
            let pairs = [(key.as_CFType(), value.as_CFType())];
            let dict = CFDictionary::from_CFType_pairs(&pairs);
            AXIsProcessTrustedWithOptions(dict.as_concrete_TypeRef())
        }
    }

    fn request_input_monitoring_prompt() -> bool {
        unsafe { CGRequestListenEventAccess() }
    }

    fn request_screen_recording_prompt() -> bool {
        unsafe { CGRequestScreenCaptureAccess() }
    }

    pub fn check() -> PermissionStatus {
        build_status(false)
    }

    pub fn request() -> PermissionStatus {
        request_selected(true, true)
    }

    pub fn request_selected(accessibility: bool, input_monitoring: bool) -> PermissionStatus {
        if accessibility && !is_accessibility_granted() {
            tracing::info!("requesting Accessibility permission — approve in the system dialog");
            let _ = request_accessibility_prompt();
        }
        if input_monitoring && !is_input_monitoring_granted() {
            tracing::info!("requesting Input Monitoring permission — approve in the system dialog");
            let _ = request_input_monitoring_prompt();
        }
        if accessibility && !is_screen_recording_granted() {
            tracing::info!("requesting Screen Recording permission — required for window titles");
            let _ = request_screen_recording_prompt();
        }
        build_status_selected(accessibility, input_monitoring, true)
    }

    fn build_status_selected(
        want_accessibility: bool,
        want_input_monitoring: bool,
        after_request: bool,
    ) -> PermissionStatus {
        use crate::os::macos::probe_window_tracking;
        use crate::os::macos_frontmost;

        let accessibility_granted = is_accessibility_granted();
        let screen_granted = is_screen_recording_granted();
        let input_granted = is_input_monitoring_granted();
        let tracking_works = probe_window_tracking();
        let app_label = macos_frontmost::running_app_label();

        let mut permissions = Vec::new();

        if want_accessibility {
            let ax_desc = if after_request && !accessibility_granted {
                format!(
                    "시스템 설정 → 개인정보 보호 → 접근성에서 「{app_label}」을(를) 허용하세요. \
                     개발 모드(tauri dev)에서는 터미널 또는 IDE도 함께 허용해야 할 수 있습니다."
                )
            } else if accessibility_granted && screen_granted && !tracking_works {
                format!(
                    "권한은 허용됐지만 창 추적이 동작하지 않습니다. 「{app_label}」을(를) 완전히 종료한 뒤 다시 실행하세요."
                )
            } else {
                "활성 앱 추적 및 유휴 감지에 사용됩니다.".into()
            };

            permissions.push(PermissionItem {
                id: "accessibility".into(),
                name: "접근성".into(),
                granted: accessibility_granted,
                required: true,
                description: ax_desc,
                functional: Some(tracking_works),
            });

            let screen_desc = if after_request && !screen_granted {
                format!(
                    "창 제목·세부 추적에 필요합니다. 시스템 설정 → 개인정보 보호 → 화면 및 시스템 오디오 녹음에서 「{app_label}」을(를) 허용하세요."
                )
            } else if screen_granted && !tracking_works {
                "화면 녹화 권한 허용 후에도 창 제목이 비어 있을 수 있습니다. 앱을 재시작해 보세요.".into()
            } else {
                "활성 창 제목·세부 정보 추적에 사용됩니다 (CGWindowList API).".into()
            };

            permissions.push(PermissionItem {
                id: "screen_recording".into(),
                name: "화면 녹화".into(),
                granted: screen_granted,
                required: true,
                description: screen_desc,
                functional: Some(tracking_works && screen_granted),
            });
        } else {
            permissions.push(PermissionItem {
                id: "accessibility".into(),
                name: "접근성".into(),
                granted: accessibility_granted,
                required: false,
                description: "활성 앱/창 추적 및 유휴 감지에 사용됩니다.".into(),
                functional: None,
            });
        }

        permissions.push(PermissionItem {
            id: "input_monitoring".into(),
            name: "입력 모니터링".into(),
            granted: input_granted,
            required: want_input_monitoring,
            description: if after_request && want_input_monitoring && !input_granted {
                format!(
                    "복사/붙여넣기/스크린샷 단축키 감지에 필요합니다. 시스템 설정 → 개인정보 보호 → 입력 모니터링에서 「{app_label}」을(를) 허용하세요."
                )
            } else {
                "키보드 단축키(복사, 붙여넣기, 스크린샷) 감지에 사용됩니다.".into()
            },
            functional: None,
        });

        let all_granted = permissions.iter().all(|p| !p.required || p.granted);
        let restart_recommended = want_accessibility
            && accessibility_granted
            && screen_granted
            && !tracking_works;

        PermissionStatus {
            platform: "macos".into(),
            all_granted,
            permissions,
            app_label: Some(app_label),
            restart_recommended: if restart_recommended { Some(true) } else { None },
        }
    }

    fn build_status(after_request: bool) -> PermissionStatus {
        build_status_selected(true, true, after_request)
    }

    pub fn open_settings(permission_id: &str) -> anyhow::Result<()> {
        let url = match permission_id {
            "accessibility" => {
                "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Accessibility"
            }
            "input_monitoring" => {
                "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_ListenEvent"
            }
            "screen_recording" => {
                "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_ScreenCapture"
            }
            _ => anyhow::bail!("unknown permission: {permission_id}"),
        };

        Command::new("open").arg(url).status()?;
        Ok(())
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use super::{PermissionItem, PermissionStatus};
    use crate::os::windows::probe_window_tracking;
    use std::process::Command;

    pub fn check() -> PermissionStatus {
        build_status_selected(false, false)
    }

    pub fn request() -> PermissionStatus {
        request_selected(true, true)
    }

    pub fn request_selected(accessibility: bool, input_monitoring: bool) -> PermissionStatus {
        build_status_selected(accessibility, input_monitoring)
    }

    fn build_status_selected(
        want_accessibility: bool,
        want_input_monitoring: bool,
    ) -> PermissionStatus {
        let tracking = probe_window_tracking();

        let permissions = vec![
            PermissionItem {
                id: "accessibility".into(),
                name: "활성 창 추적".into(),
                granted: tracking,
                required: want_accessibility,
                description: if want_accessibility && !tracking {
                    "현재 활성 창을 읽을 수 없습니다. TraceDesk 창을 닫고 다른 앱으로 전환한 뒤 상태를 새로고침하세요.".into()
                } else {
                    "활성 앱·창 제목 및 유휴 시간 감지에 사용됩니다.".into()
                },
                functional: Some(tracking),
            },
            PermissionItem {
                id: "input_monitoring".into(),
                name: "키보드 단축키 감지".into(),
                granted: true,
                required: want_input_monitoring,
                description: "Ctrl+C/V, PrintScreen, Win+Shift+S 등 단축키 감지에 사용됩니다.".into(),
                functional: None,
            },
        ];

        let all_granted = permissions.iter().all(|p| !p.required || p.granted);

        PermissionStatus {
            platform: "windows".into(),
            all_granted,
            permissions,
            app_label: Some("TraceDesk".into()),
            restart_recommended: None,
        }
    }

    pub fn open_settings(_permission_id: &str) -> anyhow::Result<()> {
        Command::new("cmd")
            .args(["/C", "start", "", "ms-settings:privacy"])
            .status()?;
        Ok(())
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use super::{PermissionItem, PermissionStatus};

    fn probe_window_tracking() -> bool {
        active_win_pos_rs::get_active_window().is_ok()
    }

    pub fn check() -> PermissionStatus {
        build_status_selected(false, false)
    }

    pub fn request() -> PermissionStatus {
        request_selected(true, true)
    }

    pub fn request_selected(accessibility: bool, input_monitoring: bool) -> PermissionStatus {
        build_status_selected(accessibility, input_monitoring)
    }

    fn build_status_selected(
        want_accessibility: bool,
        want_input_monitoring: bool,
    ) -> PermissionStatus {
        let tracking = probe_window_tracking();

        let permissions = vec![
            PermissionItem {
                id: "accessibility".into(),
                name: "활성 창 추적".into(),
                granted: tracking,
                required: want_accessibility,
                description: "X11/Wayland 환경에서 활성 창 정보 수집에 사용됩니다.".into(),
                functional: Some(tracking),
            },
            PermissionItem {
                id: "input_monitoring".into(),
                name: "키보드 단축키 감지".into(),
                granted: true,
                required: want_input_monitoring,
                description: "복사, 붙여넣기, 스크린샷 단축키 감지에 사용됩니다.".into(),
                functional: None,
            },
        ];

        let all_granted = permissions.iter().all(|p| !p.required || p.granted);

        PermissionStatus {
            platform: "linux".into(),
            all_granted,
            permissions,
            app_label: None,
            restart_recommended: None,
        }
    }

    pub fn open_settings(_permission_id: &str) -> anyhow::Result<()> {
        anyhow::bail!("open system settings is not supported on Linux")
    }
}

fn platform_check() -> PermissionStatus {
    platform::check()
}

fn platform_request() -> PermissionStatus {
    platform::request()
}

fn platform_request_selected(accessibility: bool, input_monitoring: bool) -> PermissionStatus {
    platform::request_selected(accessibility, input_monitoring)
}

fn platform_open_settings(permission_id: &str) -> anyhow::Result<()> {
    platform::open_settings(permission_id)
}
