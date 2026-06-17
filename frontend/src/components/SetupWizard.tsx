import { useEffect, useState } from "react";
import type { AppSettings } from "../api/client";
import { completeSetup, getPermissionsStatus, getSettings } from "../api/client";
import { LOCALES, useI18n, usePlatformStrings } from "../i18n";
import { type AppPlatform } from "../utils/platform";
import { TortoiseMascot } from "./mascot";

interface Props {
  onComplete: (settings: AppSettings) => void;
}

export function SetupWizard({ onComplete }: Props) {
  const { locale, setLocale, t } = useI18n();
  const [step, setStep] = useState<"language" | "options">("language");
  const [platform, setPlatform] = useState<AppPlatform>("macos");
  const [autostart, setAutostart] = useState(true);
  const [accessibility, setAccessibility] = useState(true);
  const [inputMonitoring, setInputMonitoring] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const platformStrings = usePlatformStrings(platform);

  useEffect(() => {
    Promise.all([getSettings(), getPermissionsStatus()])
      .then(([s, perm]) => {
        setPlatform(perm.platform as AppPlatform);
        if (!s.setup_completed) {
          setAutostart(s.autostart_enabled);
          setAccessibility(s.enable_accessibility);
          setInputMonitoring(s.enable_input_monitoring);
          if (s.locale) setLocale(s.locale === "en" ? "en" : "ko");
        }
      })
      .catch(() => {});
  }, [setLocale]);

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
        locale,
      });
      onComplete(result.settings);
    } catch (e) {
      setError(typeof e === "string" ? e : t("setup.saveError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm p-4">
      <div className="w-full max-w-lg td-panel shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-border flex items-center gap-4">
          <TortoiseMascot
            mood="typing"
            size="md"
            showBubble
            message={t("setup.mascotMessage")}
          />
          <div>
            <h2 className="text-xl font-bold">
              {step === "language" ? t("language.title") : t("setup.title")}
            </h2>
            <p className="text-sm text-text-muted mt-1">
              {step === "language" ? t("language.description") : t("setup.subtitle")}
            </p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {step === "language" ? (
            <div className="grid grid-cols-2 gap-3">
              {LOCALES.map((item) => {
                const active = locale === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setLocale(item.id)}
                    className={`rounded-xl border p-4 text-left transition-all ${
                      active
                        ? "border-accent bg-accent/10 shadow-sm shadow-accent/10"
                        : "border-border hover:border-accent/40 hover:bg-surface"
                    }`}
                  >
                    <p className="font-semibold">{item.native}</p>
                    <p className="text-xs text-text-muted mt-1">{item.label}</p>
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <SetupOption
                checked={autostart}
                onChange={setAutostart}
                title={t("setup.autostart")}
                description={platformStrings.autostartDescription}
              />

              <div className="border-t border-border pt-4">
                <p className="text-sm font-medium mb-3">{platformStrings.activitySectionTitle}</p>
                <div className="space-y-3">
                  <SetupOption
                    checked={accessibility}
                    onChange={setAccessibility}
                    title={platformStrings.accessibilityLabel}
                    description={platformStrings.accessibilityDescription}
                  />
                  <SetupOption
                    checked={inputMonitoring}
                    onChange={setInputMonitoring}
                    title={platformStrings.inputMonitoringLabel}
                    description={platformStrings.inputMonitoringDescription}
                  />
                </div>
                <p className="text-xs text-text-muted mt-3">{platformStrings.activitySectionHint}</p>
              </div>
            </>
          )}

          {error && (
            <div className="rounded-lg bg-danger/10 border border-danger/30 p-4 flex items-center gap-4">
              <TortoiseMascot mood="confused" size="md" />
              <p className="text-sm text-danger-text">{error}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-surface border-t border-border flex flex-wrap gap-2 justify-end">
          {step === "language" ? (
            <button
              type="button"
              onClick={() => setStep("options")}
              className="text-sm px-5 py-2 rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 font-medium"
            >
              {t("setup.next")}
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={loading}
                onClick={() => setStep("language")}
                className="text-sm px-4 py-2 rounded-lg border border-border hover:bg-surface-elevated disabled:opacity-50"
              >
                {t("setup.back")}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() =>
                  finish({ autostart: false, accessibility: false, inputMonitoring: false })
                }
                className="text-sm px-4 py-2 rounded-lg border border-border hover:bg-surface-elevated disabled:opacity-50"
              >
                {t("common.skipAll")}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => finish({ autostart, accessibility, inputMonitoring })}
                className="text-sm px-5 py-2 rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50 font-medium"
              >
                {loading ? t("setup.configuring") : t("common.start")}
              </button>
            </>
          )}
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
