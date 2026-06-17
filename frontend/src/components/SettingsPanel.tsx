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
import { UpdatePanel } from "./UpdatePanel";
import { LlmSettingsSection } from "./llm/LlmSettingsSection";
import { LOCALES, useI18n, usePlatformStrings } from "../i18n";
import { THEMES, useTheme, type Theme } from "../theme";
import { isMacPlatform, type AppPlatform } from "../utils/platform";
import { getPermissionsStatus } from "../api/client";

interface Props {
  onSettingsChange?: (settings: AppSettings) => void;
}

export function SettingsPanel({ onSettingsChange }: Props) {
  const { locale, setLocale, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [dbStats, setDbStats] = useState<DbStats | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [lastArchive, setLastArchive] = useState<ArchiveResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [platform, setPlatform] = useState<AppPlatform>("macos");
  const platformStrings = usePlatformStrings(platform);

  const applySettings = (s: AppSettings) => {
    setSettings(s);
    onSettingsChange?.(s);
  };

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
      applySettings(s);
    } finally {
      setSaving(false);
    }
  };

  const handleRetention = async (days: number) => {
    setSaving(true);
    try {
      const s = await updateSettings({ retentionDays: days });
      applySettings(s);
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
      applySettings(s);
    } finally {
      setSaving(false);
    }
  };

  const handleLocale = async (next: typeof locale) => {
    setSaving(true);
    setLocale(next);
    try {
      applySettings(await updateSettings({ locale: next }));
    } finally {
      setSaving(false);
    }
  };

  const handleTheme = async (next: Theme) => {
    setSaving(true);
    setTheme(next);
    try {
      applySettings(await updateSettings({ theme: next }));
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
        title={t("settings.loading")}
        description={t("settings.loadingDesc")}
        size="md"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text">{t("settings.title")}</h2>
        <p className="text-sm text-text-muted">{t("settings.subtitle")}</p>
      </div>

      <section className="rounded-xl border border-border bg-surface-elevated p-5 space-y-3">
        <div>
          <h3 className="font-medium text-text">{t("language.current")}</h3>
          <p className="text-xs text-text-muted mt-1">{t("language.description")}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {LOCALES.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={saving}
              onClick={() => handleLocale(item.id)}
              className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                locale === item.id
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border hover:bg-surface"
              }`}
            >
              {item.native}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface-elevated p-5 space-y-3">
        <div>
          <h3 className="font-medium text-text">{t("theme.title")}</h3>
          <p className="text-xs text-text-muted mt-1">{t("theme.description")}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {THEMES.map((item) => {
            const active = theme === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={saving}
                onClick={() => handleTheme(item.id)}
                className={`rounded-xl border p-4 text-left transition-all ${
                  active
                    ? "border-accent bg-accent/10 shadow-sm shadow-accent/10"
                    : "border-border hover:border-accent/40 hover:bg-surface"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg" aria-hidden>
                    {item.icon}
                  </span>
                  <span className="font-medium text-sm text-text">
                    {t(item.id === "light" ? "theme.light" : "theme.dark")}
                  </span>
                </div>
                <p className="text-xs text-text-muted mt-1">
                  {t(item.id === "light" ? "theme.lightHint" : "theme.darkHint")}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <LlmSettingsSection />

      <UpdatePanel />

      <section className="rounded-xl border border-border bg-surface-elevated p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-text">{t("settings.autostart")}</h3>
            <p className="text-xs text-text-muted mt-1">{t("settings.autostartDesc")}</p>
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
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-surface-elevated transition-transform ${
                settings.autostart_enabled ? "left-6" : "left-0.5"
              }`}
            />
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface-elevated p-5 space-y-4">
        <div>
          <h3 className="font-medium text-text">{platformStrings.activitySectionTitle}</h3>
          <p className="text-xs text-text-muted mt-1">
            {isMacPlatform(platform) ? t("settings.activityMacHint") : t("settings.activityOtherHint")}
          </p>
        </div>

        <div className="space-y-3">
          <PermissionToggle
            label={platformStrings.accessibilityLabel}
            description={platformStrings.accessibilityDescription}
            checked={settings.enable_accessibility}
            disabled={saving}
            onChange={(v) => handlePermissionPref("accessibility", v)}
          />
          <PermissionToggle
            label={platformStrings.inputMonitoringLabel}
            description={platformStrings.inputMonitoringDescription}
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
            {t("settings.requestPermissions")}
          </button>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface-elevated p-5 space-y-3">
        <PermissionToggle
          label={t("settings.clipboardPreview")}
          description={t("settings.clipboardPreviewDesc")}
          checked={settings.store_clipboard_preview}
          disabled={saving || !settings.enable_input_monitoring}
          onChange={async (v) => {
            setSaving(true);
            try {
              applySettings(await updateSettings({ storeClipboardPreview: v }));
            } finally {
              setSaving(false);
            }
          }}
        />
        {!settings.enable_input_monitoring && (
          <p className="text-xs text-text-muted">{t("settings.clipboardRequiresInput")}</p>
        )}
        <PermissionToggle
          label={t("settings.screenshotThumb")}
          description={t("settings.screenshotThumbDesc")}
          checked={settings.store_screenshot_preview}
          disabled={saving}
          onChange={async (v) => {
            setSaving(true);
            try {
              applySettings(await updateSettings({ storeScreenshotPreview: v }));
            } finally {
              setSaving(false);
            }
          }}
        />
      </section>

      <section className="rounded-xl border border-border bg-surface-elevated p-5 space-y-4">
        <h3 className="font-medium text-text">{t("settings.database")}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label={t("settings.activeDb")} value={`${dbStats.active_db_mb} MB`} />
          <Stat label={t("settings.eventCount")} value={dbStats.event_count.toLocaleString()} />
          <Stat label={t("settings.archives")} value={`${dbStats.total_archive_mb} MB`} />
          <Stat label={t("settings.retention")} value={t("common.days", { count: dbStats.retention_days })} />
        </div>

        <div>
          <label className="text-sm text-text-muted block mb-2">{t("settings.retentionLabel")}</label>
          <div className="flex flex-wrap gap-2">
            {[60, 90, 180, 365].map((d) => (
              <button
                key={d}
                type="button"
                disabled={saving}
                onClick={() => handleRetention(d)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  settings.retention_days === d
                    ? "bg-accent text-accent-foreground border-accent"
                    : "border-border hover:bg-surface"
                }`}
              >
                {t("common.days", { count: d })}
              </button>
            ))}
          </div>
          <p className="text-xs text-text-muted mt-2">
            {t("settings.retentionHint", { days: settings.retention_days })}
          </p>
        </div>

        {dbStats.oldest_event && (
          <p className="text-xs text-text-muted">
            {t("settings.oldestRecord", { date: dbStats.oldest_event })}
          </p>
        )}

        <button
          type="button"
          disabled={archiving}
          onClick={handleArchive}
          className="text-sm px-4 py-2 rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
        >
          {archiving ? t("settings.archiving") : t("settings.archiveNow")}
        </button>

        {lastArchive && (
          <div className="rounded-lg bg-surface border border-border p-3 text-sm">
            <p className="text-success-text font-medium">{t("settings.archiveDone")}</p>
            <p className="text-text-muted mt-1">
              {t("settings.archiveResult", {
                count: lastArchive.deleted_events.toLocaleString(),
                months: lastArchive.archived_months.join(", ") || t("settings.none"),
              })}
            </p>
            {lastArchive.freed_bytes_estimate > 0 && (
              <p className="text-text-muted text-xs mt-1">
                {t("settings.archiveFreed", {
                  mb: (lastArchive.freed_bytes_estimate / 1024 / 1024).toFixed(1),
                })}
              </p>
            )}
          </div>
        )}
      </section>

      {dbStats.archives.length > 0 && (
        <section className="rounded-xl border border-border bg-surface-elevated p-5">
          <h3 className="font-medium mb-3 text-text">
            {t("settings.archiveList", { count: dbStats.archives.length })}
          </h3>
          <div className="overflow-auto max-h-48">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted text-left border-b border-border">
                  <th className="pb-2 pr-4 font-medium">{t("settings.period")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("settings.size")}</th>
                  <th className="pb-2 font-medium">{t("settings.events")}</th>
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
          <p className="text-xs text-text-muted mt-3">{t("settings.archivePath")}</p>
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
        <p className="font-medium text-sm text-text">{label}</p>
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
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-surface-elevated transition-transform ${
            checked ? "left-6" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
