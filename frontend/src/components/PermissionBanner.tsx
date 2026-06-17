import { useCallback, useEffect, useState } from "react";
import type { AppSettings, PermissionItem, PermissionStatus } from "../api/client";
import {
  getPermissionsStatus,
  getSettings,
  openPermissionSettings,
  refreshPermissions,
  requestPermissions,
} from "../api/client";
import { isMacPlatform } from "../utils/platform";
import { TortoiseMascot } from "./mascot";

function needsAttention(status: PermissionStatus, settings: AppSettings): boolean {
  if (!settings.enable_accessibility && !settings.enable_input_monitoring) return false;

  if (isMacPlatform(status.platform)) {
    if (status.restart_recommended) return true;
    if (!status.all_granted) return true;
    return status.permissions.some((p) => p.required && p.functional === false);
  }

  if (status.platform === "windows" || status.platform === "linux") {
    if (!settings.enable_accessibility) return false;
    return !status.all_granted
      || status.permissions.some((p) => p.required && p.functional === false);
  }

  return false;
}

function attentionItems(status: PermissionStatus): PermissionItem[] {
  const missing = status.permissions.filter((p) => p.required && !p.granted);
  if (missing.length > 0) return missing;

  const broken = status.permissions.filter(
    (p) => p.required && p.functional === false,
  );
  if (broken.length > 0) return broken;

  if (status.restart_recommended) {
    return status.permissions.filter((p) => p.id === "accessibility" && p.required);
  }

  return [];
}

export function PermissionBanner() {
  const [status, setStatus] = useState<PermissionStatus | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [permData, settingsData] = await Promise.all([
        getPermissionsStatus(),
        getSettings(),
      ]);
      setStatus(permData);
      setSettings(settingsData);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!status || !settings || !settings.setup_completed) return;
    if (!needsAttention(status, settings)) return;

    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [status, settings, load]);

  if (!status || !settings || !settings.setup_completed) {
    return null;
  }

  if (!needsAttention(status, settings)) {
    return null;
  }

  const items = attentionItems(status);
  const isRestart = Boolean(status.restart_recommended) && items.every((p) => p.granted);
  const isMac = isMacPlatform(status.platform);

  const handleRequest = async () => {
    setLoading(true);
    try {
      const data = await requestPermissions();
      setStatus(data);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const data = await refreshPermissions();
      setStatus(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-warning/40 bg-warning/10 p-5 space-y-4">
      <div className="flex items-start gap-4">
        <TortoiseMascot mood="confused" size="md" />
        <div>
          <h2 className="text-warning-text font-semibold">
            {isRestart ? "앱 재시작 필요" : isMac ? "권한 설정 필요" : "활동 수집 확인 필요"}
          </h2>
          <p className="text-sm text-text-muted mt-1">
            {isRestart ? (
              <>
                권한은 허용됐지만 창 추적이 아직 동작하지 않습니다.{" "}
                <strong className="text-warning-text">{status.app_label ?? "TraceDesk"}</strong>
                을(를) 완전히 종료한 뒤 다시 실행하세요.
              </>
            ) : isMac ? (
              <>
                macOS 권한이 필요합니다.
                {status.app_label && (
                  <>
                    {" "}
                    설정에서 <strong className="text-warning-text">{status.app_label}</strong>
                    을(를) 찾아 허용하세요.
                  </>
                )}
              </>
            ) : (
              <>활성 창 추적이 동작하지 않습니다. 다른 앱으로 전환한 뒤 상태를 새로고침하세요.</>
            )}
          </p>
        </div>
      </div>

      {items.length > 0 && (
        <ul className="space-y-3">
          {items.map((perm) => (
            <li
              key={perm.id}
              className="flex items-start justify-between gap-4 rounded-lg bg-surface/80 border border-border p-3"
            >
              <div>
                <p className="font-medium text-sm text-text">
                  {perm.name}
                  {perm.granted && perm.functional === false && (
                    <span className="ml-2 text-xs text-warning">동작 안 함</span>
                  )}
                </p>
                <p className="text-xs text-text-muted mt-1">{perm.description}</p>
              </div>
              {!isRestart && isMac && (
                <button
                  type="button"
                  onClick={() => openPermissionSettings(perm.id)}
                  className="shrink-0 text-xs px-3 py-1.5 rounded-md border border-border text-text hover:bg-surface-elevated transition-colors"
                >
                  설정 열기
                </button>
              )}
              {!isRestart && status.platform === "windows" && perm.id === "accessibility" && (
                <button
                  type="button"
                  onClick={() => openPermissionSettings(perm.id)}
                  className="shrink-0 text-xs px-3 py-1.5 rounded-md border border-border text-text hover:bg-surface-elevated transition-colors"
                >
                  Windows 설정
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {!isRestart && isMac && (
          <button
            type="button"
            disabled={loading}
            onClick={handleRequest}
            className="text-sm px-4 py-2 rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
          >
            권한 요청
          </button>
        )}
        <button
          type="button"
          disabled={loading}
          onClick={handleRefresh}
          className="text-sm px-4 py-2 rounded-lg border border-border text-text hover:bg-surface-elevated disabled:opacity-50"
        >
          상태 새로고침
        </button>
      </div>

      <p className="text-xs text-text-muted">
        {isMac && settings.enable_accessibility &&
          "창 추적에는 접근성 + 화면 녹화 권한이 모두 필요합니다. "}
        설정 탭에서 수집 기능 사용 여부를 변경할 수 있습니다.
      </p>
    </div>
  );
}
