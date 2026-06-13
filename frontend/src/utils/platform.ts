export type AppPlatform = "macos" | "windows" | "linux" | (string & {});

export function platformLabel(platform: AppPlatform): string {
  switch (platform) {
    case "macos":
      return "macOS";
    case "windows":
      return "Windows";
    case "linux":
      return "Linux";
    default:
      return platform;
  }
}

export function isMacPlatform(platform: AppPlatform): boolean {
  return platform === "macos";
}

export function autostartDescription(platform: AppPlatform): string {
  if (platform === "macos") {
    return "Mac 로그인 시 TraceDesk를 시작 프로그램에 등록합니다.";
  }
  if (platform === "windows") {
    return "Windows 로그인 시 TraceDesk를 시작 프로그램에 등록합니다.";
  }
  return "PC 로그인 시 TraceDesk를 자동으로 시작합니다.";
}

export function activitySectionTitle(platform: AppPlatform): string {
  if (isMacPlatform(platform)) {
    return "macOS 권한 (선택)";
  }
  return "활동 수집 (선택)";
}

export function accessibilityLabel(platform: AppPlatform): string {
  return isMacPlatform(platform) ? "접근성" : "활성 창 추적";
}

export function accessibilityDescription(platform: AppPlatform): string {
  if (platform === "macos") {
    return "활성 앱·창 추적 및 유휴 시간 감지에 필요합니다 (접근성 + 화면 녹화).";
  }
  if (platform === "windows") {
    return "활성 앱·창 제목 및 유휴 시간 감지에 사용됩니다.";
  }
  return "활성 앱·창 추적 및 유휴 시간 감지에 사용됩니다.";
}

export function inputMonitoringLabel(platform: AppPlatform): string {
  return isMacPlatform(platform) ? "입력 모니터링" : "키보드 단축키 감지";
}

export function inputMonitoringDescription(platform: AppPlatform): string {
  if (platform === "macos") {
    return "복사, 붙여넣기, 스크린샷 단축키 감지에 필요합니다.";
  }
  if (platform === "windows") {
    return "Ctrl+C/V, PrintScreen, Win+Shift+S 등 단축키 감지에 사용됩니다.";
  }
  return "복사, 붙여넣기, 스크린샷 단축키 감지에 사용됩니다.";
}

export function activitySectionHint(platform: AppPlatform): string {
  if (isMacPlatform(platform)) {
    return "권한을 선택하면 시스템 다이얼로그가 표시됩니다. 거부해도 앱은 실행되며, 설정 탭에서 나중에 요청할 수 있습니다.";
  }
  return "선택한 기능만 백그라운드에서 수집합니다. 설정 탭에서 언제든 변경할 수 있습니다.";
}
