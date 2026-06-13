import { useCallback, useEffect, useState } from "react";
import type { AppSettings, ArchiveResult, DbStats } from "../api/client";
import {
  getDbStats,
  getSettings,
  requestPermissions,
  runArchiveNow,
  updateSettings,
} from "../api/client";
import { MascotScene } from "./mascot";
import {
  accessibilityDescription,
  activitySectionTitle,
  inputMonitoringDescription,
  accessibilityLabel,
  inputMonitoringLabel,
  isMacPlatform,
  type AppPlatform,
} from "../utils/platform";
import { getPermissionsStatus } from "../api/client";

export function SettingsPanel() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [dbStats, setDbStats] = useState<DbStats | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [lastArchive, setLastArchive] = useState<ArchiveResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [platform, setPlatform] = useState<AppPlatform>("macos");

  const load = useCallback(async () => {
    try {
      const [s, stats, perm] = await Promise.all([
        getSettings(),
        getDbStats(),
        getPermissionsStatus(),
      ]);
      setSettings(s);
      setDbStats(stats);
      setPlatform(perm.platform as AppPlatform);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAutostart = async (enabled: boolean) => {
    setSaving(true);
    try {
      const s = await updateSettings({ autostartEnabled: enabled });
      setSettings(s);
    } finally {
      setSaving(false);
    }
  };

  const handleRetention = async (days: number) => {
    setSaving(true);
    try {
      const s = await updateSettings({ retentionDays: days });
      setSettings(s);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handlePermissionPref = async (
    key: "accessibility" | "inputMonitoring",
    enabled: boolean,
  ) => {
    setSaving(true);
    try {
      const s = await updateSettings(
        key === "accessibility"
          ? { enableAccessibility: enabled }
          : { enableInputMonitoring: enabled },
      );
      setSettings(s);
    } finally {
      setSaving(false);
    }
  };

  const handleRequestPermissions = async () => {
    setSaving(true);
    try {
      await requestPermissions();
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    setArchiving(true);
    setLastArchive(null);
    try {
      const result = await runArchiveNow();
      setLastArchive(result);
      await load();
    } finally {
      setArchiving(false);
    }
  };

  if (!settings || !dbStats) {
    return (
      <MascotScene
        mood="loading"
        title="설정 불러오는 중"
        description="잠시만 기다려 주세요"
        size="md"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">설정</h2>
        <p className="text-sm text-text-muted">자동 실행 및 데이터 보관 정책</p>
      </div>

      {/* 자동 실행 */}
      <section className="rounded-xl border border-border bg-surface-elevated p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">로그인 시 자동 실행</h3>
            <p className="text-xs text-text-muted mt-1">
              PC 로그인 시 TraceDesk가 백그라운드에서 자동으로 시작됩니다.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleAutostart(!settings.autostart_enabled)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              settings.autostart_enabled ? "bg-accent" : "bg-border"
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                settings.autostart_enabled ? "left-6" : "left-0.5"
              }`}
            />
          </button>
        </div>
      </section>

      {/* 활동 수집 / macOS 권한 */}
      <section className="rounded-xl border border-border bg-surface-elevated p-5 space-y-4">
        <div>
          <h3 className="font-medium">{activitySectionTitle(platform)}</h3>
          <p className="text-xs text-text-muted mt-1">
            {isMacPlatform(platform)
              ? "활동 수집에 사용할 권한을 선택하세요. 켠 항목만 시스템 설정에서 요청합니다."
              : "활동 수집 기능을 선택하세요. Windows/Linux는 별도 권한 대화상자 없이 동작합니다."}
          </p>
        </div>

        <div className="space-y-3">
          <PermissionToggle
            label={accessibilityLabel(platform)}
            description={accessibilityDescription(platform)}
            checked={settings.enable_accessibility}
            disabled={saving}
            onChange={(v) => handlePermissionPref("accessibility", v)}
          />
          <PermissionToggle
            label={inputMonitoringLabel(platform)}
            description={inputMonitoringDescription(platform)}
            checked={settings.enable_input_monitoring}
            disabled={saving}
            onChange={(v) => handlePermissionPref("inputMonitoring", v)}
          />
        </div>

        {isMacPlatform(platform) &&
          (settings.enable_accessibility || settings.enable_input_monitoring) && (
          <button
            type="button"
            disabled={saving}
            onClick={handleRequestPermissions}
            className="text-sm px-4 py-2 rounded-lg border border-accent text-accent hover:bg-accent/10 disabled:opacity-50"
          >
            선택한 권한 요청
          </button>
        )}
      </section>

      {/* 클립보드 미리보기 */}
      <section className="rounded-xl border border-border bg-surface-elevated p-5 space-y-3">
        <PermissionToggle
          label="클립보드 내용 미리보기 저장"
          description="켜면 복사·붙여넣기 시 텍스트 앞 400자를 로컬 DB에 저장합니다. 비밀번호·토큰 등 민감 정보가 포함될 수 있으니 필요할 때만 사용하세요. (입력 모니터링 필요)"
          checked={settings.store_clipboard_preview}
          disabled={saving || !settings.enable_input_monitoring}
          onChange={async (v) => {
            setSaving(true);
            try {
              const s = await updateSettings({ storeClipboardPreview: v });
              setSettings(s);
            } finally {
              setSaving(false);
            }
          }}
        />
        {!settings.enable_input_monitoring && (
          <p className="text-xs text-text-muted">
            입력 모니터링을 켜야 클립보드 미리보기를 사용할 수 있습니다.
          </p>
        )}
        <PermissionToggle
          label="스크린샷 썸네일 저장"
          description="켜면 Desktop·Screenshots 폴더에 저장된 캡처의 썸네일(최대 320px)을 앱 데이터 폴더에 보관합니다. 화면 내용이 포함될 수 있습니다."
          checked={settings.store_screenshot_preview}
          disabled={saving}
          onChange={async (v) => {
            setSaving(true);
            try {
              const s = await updateSettings({ storeScreenshotPreview: v });
              setSettings(s);
            } finally {
              setSaving(false);
            }
          }}
        />
      </section>

      {/* DB 용량 */}
      <section className="rounded-xl border border-border bg-surface-elevated p-5 space-y-4">
        <h3 className="font-medium">데이터베이스</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="활성 DB" value={`${dbStats.active_db_mb} MB`} />
          <Stat label="이벤트 수" value={dbStats.event_count.toLocaleString()} />
          <Stat label="아카이브" value={`${dbStats.total_archive_mb} MB`} />
          <Stat label="보관 기간" value={`${dbStats.retention_days}일`} />
        </div>

        <div>
          <label className="text-sm text-text-muted block mb-2">
            활성 DB 보관 기간 (이후 월별 압축 아카이브)
          </label>
          <div className="flex flex-wrap gap-2">
            {[60, 90, 180, 365].map((d) => (
              <button
                key={d}
                type="button"
                disabled={saving}
                onClick={() => handleRetention(d)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  settings.retention_days === d
                    ? "bg-accent text-white border-accent"
                    : "border-border hover:bg-surface"
                }`}
              >
                {d}일
              </button>
            ))}
          </div>
          <p className="text-xs text-text-muted mt-2">
            {settings.retention_days}일 이전 데이터는{" "}
            <code className="bg-surface px-1 rounded">archives/YYYY-MM.db.gz</code>로
            압축 보관 후 활성 DB에서 제거됩니다. DB 40MB 초과 또는 7일마다 자동 실행됩니다.
          </p>
        </div>

        {dbStats.oldest_event && (
          <p className="text-xs text-text-muted">
            가장 오래된 기록: {dbStats.oldest_event}
          </p>
        )}

        <button
          type="button"
          disabled={archiving}
          onClick={handleArchive}
          className="text-sm px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {archiving ? "아카이브 중..." : "지금 아카이브 실행"}
        </button>

        {lastArchive && (
          <div className="rounded-lg bg-surface border border-border p-3 text-sm">
            <p className="text-green-400 font-medium">아카이브 완료</p>
            <p className="text-text-muted mt-1">
              {lastArchive.deleted_events.toLocaleString()}개 이벤트 →{" "}
              {lastArchive.archived_months.join(", ") || "없음"}
            </p>
            {lastArchive.freed_bytes_estimate > 0 && (
              <p className="text-text-muted text-xs mt-1">
                약 {(lastArchive.freed_bytes_estimate / 1024 / 1024).toFixed(1)} MB 확보
              </p>
            )}
          </div>
        )}
      </section>

      {/* 아카이브 목록 */}
      {dbStats.archives.length > 0 && (
        <section className="rounded-xl border border-border bg-surface-elevated p-5">
          <h3 className="font-medium mb-3">압축 아카이브 ({dbStats.archives.length}개)</h3>
          <div className="overflow-auto max-h-48">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted text-left border-b border-border">
                  <th className="pb-2 pr-4 font-medium">기간</th>
                  <th className="pb-2 pr-4 font-medium">크기</th>
                  <th className="pb-2 font-medium">이벤트</th>
                </tr>
              </thead>
              <tbody>
                {dbStats.archives.map((a) => (
                  <tr key={a.period} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono">{a.period}</td>
                    <td className="py-2 pr-4">
                      {(a.compressed_bytes / 1024 / 1024).toFixed(2)} MB
                    </td>
                    <td className="py-2">{a.event_count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-text-muted mt-3">
            저장 위치: ~/Library/Application Support/tracedesk/archives/
          </p>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface border border-border p-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="font-semibold mt-0.5">{value}</p>
    </div>
  );
}

function PermissionToggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-surface border border-border p-3">
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-text-muted mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${
          checked ? "bg-accent" : "bg-border"
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
            checked ? "left-6" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
