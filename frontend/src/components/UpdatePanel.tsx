import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { MENU_CHECK_UPDATE } from "../api/client";
import {
  checkForAppUpdate,
  downloadAndInstallUpdate,
  type UpdateCheckResult,
  type UpdateProgress,
} from "../updater";
import { useI18n } from "../i18n";

function formatProgress(progress: UpdateProgress, locale: string): string {
  if (progress.total && progress.total > 0) {
    const pct = Math.min(100, Math.round((progress.downloaded / progress.total) * 100));
    return `${pct}%`;
  }
  const mb = progress.downloaded / (1024 * 1024);
  return locale === "ko" ? `${mb.toFixed(1)}MB` : `${mb.toFixed(1)} MB`;
}

export function UpdatePanel() {
  const { locale, t } = useI18n();
  const [result, setResult] = useState<UpdateCheckResult>({ phase: "idle" });
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const busy = result.phase === "checking" || result.phase === "downloading";

  const runCheck = useCallback(async () => {
    setProgress(null);
    setResult({ phase: "checking" });
    const next = await checkForAppUpdate();
    setResult(next);
  }, []);

  useEffect(() => {
    let active = true;
    const unlisten = listen(MENU_CHECK_UPDATE, () => {
      if (active) void runCheck();
    });
    return () => {
      active = false;
      void unlisten.then((fn) => fn());
    };
  }, [runCheck]);

  const runInstall = useCallback(async () => {
    setProgress(null);
    setResult((prev) => ({ ...prev, phase: "downloading" }));
    const next = await downloadAndInstallUpdate((value) => setProgress(value));
    setResult(next);
  }, []);

  return (
    <section className="rounded-xl border border-border bg-surface-elevated p-5 space-y-3">
      <div>
        <h3 className="font-medium text-text">{t("updater.title")}</h3>
        <p className="text-xs text-text-muted mt-1">{t("updater.description")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={runCheck}
          className="text-sm px-4 py-2 rounded-lg border border-border text-text hover:bg-surface disabled:opacity-50"
        >
          {result.phase === "checking" ? t("updater.checking") : t("updater.check")}
        </button>

        {result.phase === "available" && (
          <button
            type="button"
            disabled={busy}
            onClick={runInstall}
            className="text-sm px-4 py-2 rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
          >
            {t("updater.install", { version: result.version ?? "" })}
          </button>
        )}
      </div>

      {result.phase === "available" && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-sm text-text">
          <p>{t("updater.available", { version: result.version ?? "" })}</p>
          {result.notes && (
            <p className="text-xs text-text-muted mt-1 whitespace-pre-wrap">{result.notes}</p>
          )}
        </div>
      )}

      {result.phase === "up-to-date" && (
        <p className="text-sm text-success-text">{t("updater.upToDate")}</p>
      )}

      {result.phase === "downloading" && progress && (
        <p className="text-sm text-text-muted">
          {t("updater.downloading", { progress: formatProgress(progress, locale) })}
        </p>
      )}

      {result.phase === "error" && (
        <p className="text-sm text-danger-text">{t("updater.error", { message: result.error ?? "" })}</p>
      )}
    </section>
  );
}
