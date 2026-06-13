import { useEffect, useState } from "react";
import type { AppSettings } from "../api/client";
import { completeSetup, getPermissionsStatus, getSettings } from "../api/client";
import {
  accessibilityDescription,
  activitySectionHint,
  activitySectionTitle,
  autostartDescription,
  inputMonitoringDescription,
  accessibilityLabel,
  inputMonitoringLabel,
  type AppPlatform,
} from "../utils/platform";
import { TortoiseMascot } from "./mascot";

interface Props {
  onComplete: (settings: AppSettings) => void;
}

export function SetupWizard({ onComplete }: Props) {
  const [platform, setPlatform] = useState<AppPlatform>("macos");
  const [autostart, setAutostart] = useState(true);
  const [accessibility, setAccessibility] = useState(true);
  const [inputMonitoring, setInputMonitoring] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getSettings(), getPermissionsStatus()])
      .then(([s, perm]) => {
        setPlatform(perm.platform as AppPlatform);
        if (!s.setup_completed) {
          setAutostart(s.autostart_enabled);
          setAccessibility(s.enable_accessibility);
          setInputMonitoring(s.enable_input_monitoring);
        }
      })
      .catch(() => {});
  }, []);

  const finish = async (opts: {
    autostart: boolean;
    accessibility: boolean;
    inputMonitoring: boolean;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await completeSetup({
        autostartEnabled: opts.autostart,
        enableAccessibility: opts.accessibility,
        enableInputMonitoring: opts.inputMonitoring,
      });
      onComplete(result.settings);
    } catch (e) {
      setError(typeof e === "string" ? e : "초기 설정을 저장하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface-elevated shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-border flex items-center gap-4">
          <TortoiseMascot mood="typing" size="md" showBubble message="안녕! 설정을 도와줄게" />
          <div>
            <h2 className="text-xl font-bold">TraceDesk 초기 설정</h2>
            <p className="text-sm text-text-muted mt-1">
              설치 후 한 번만 표시됩니다. 원하는 항목만 선택하세요.
            </p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <SetupOption
            checked={autostart}
            onChange={setAutostart}
            title="로그인 시 자동 실행"
            description={autostartDescription(platform)}
          />

          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium mb-3">{activitySectionTitle(platform)}</p>
            <div className="space-y-3">
              <SetupOption
                checked={accessibility}
                onChange={setAccessibility}
                title={accessibilityLabel(platform)}
                description={accessibilityDescription(platform)}
              />
              <SetupOption
                checked={inputMonitoring}
                onChange={setInputMonitoring}
                title={inputMonitoringLabel(platform)}
                description={inputMonitoringDescription(platform)}
              />
            </div>
            <p className="text-xs text-text-muted mt-3">{activitySectionHint(platform)}</p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4 flex items-center gap-4">
              <TortoiseMascot mood="confused" size="md" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-surface border-t border-border flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            disabled={loading}
            onClick={() =>
              finish({ autostart: false, accessibility: false, inputMonitoring: false })
            }
            className="text-sm px-4 py-2 rounded-lg border border-border hover:bg-surface-elevated disabled:opacity-50"
          >
            모두 건너뛰기
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => finish({ autostart, accessibility, inputMonitoring })}
            className="text-sm px-5 py-2 rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50 font-medium"
          >
            {loading ? "설정 중..." : "시작하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SetupOption({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 w-4 h-4 rounded border-border accent-accent"
      />
      <div>
        <p className="font-medium text-sm group-hover:text-accent transition-colors">{title}</p>
        <p className="text-xs text-text-muted mt-0.5">{description}</p>
      </div>
    </label>
  );
}
