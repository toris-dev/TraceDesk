import { useEffect, useMemo, useState } from "react";
import {
  getDevPulseSecretsStatus,
  getDevPulseStatus,
  runDevPulseNow,
  startDevPulseDaemon,
  stopDevPulseDaemon,
  toAssetUrl,
  updateDevPulseSecrets,
  updateDevPulseSettings,
  type DevPulseBundleArtifact,
  type DevPulseDbBundle,
  type DevPulseSecretsStatusView,
  type DevPulseStatusView,
} from "../api/client";
import { useI18n } from "../i18n";

function fmt(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function percent(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "0%";
  return `${Math.max(0, Math.min(100, value)).toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function compactList<T>(items: T[]) {
  return items.filter(Boolean);
}

export function DevPulseView() {
  const { t } = useI18n();
  const [status, setStatus] = useState<DevPulseStatusView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rootDir, setRootDir] = useState("");
  const [cronEnabled, setCronEnabled] = useState(false);
  const [cronExpr, setCronExpr] = useState("0 9 * * *");
  const [feeds, setFeeds] = useState("all new ask show top");
  const [batchSize, setBatchSize] = useState(5);
  const [collectLimit, setCollectLimit] = useState(0);
  const [idlePollSec, setIdlePollSec] = useState(90);
  const [backlogPauseSec, setBacklogPauseSec] = useState(0);
  const [bundleSize, setBundleSize] = useState(6);
  const [snsMode, setSnsMode] = useState("file");
  const [mastodonInstance, setMastodonInstance] = useState("");
  const [mastodonToken, setMastodonToken] = useState("");
  const [secretStatus, setSecretStatus] = useState<DevPulseSecretsStatusView | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [next, secrets] = await Promise.all([getDevPulseStatus(), getDevPulseSecretsStatus()]);
      setStatus(next);
      setSecretStatus(secrets);
      setRootDir(next.config.root_dir);
      setCronEnabled(next.config.cron_enabled);
      setCronExpr(next.config.cron_expr);
      setFeeds(next.config.feeds.join(" "));
      setBatchSize(next.config.batch_size);
      setCollectLimit(next.config.collect_limit);
      setIdlePollSec(next.config.idle_poll_sec);
      setBacklogPauseSec(next.config.backlog_pause_sec);
      setBundleSize(next.config.bundle_size);
      setSnsMode(next.config.sns_mode);
      setMastodonInstance(next.config.mastodon_instance);
      setError(null);
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const live = Boolean(
      status?.runtime.run_in_flight ||
        status?.runtime.daemon_running ||
        (status?.payload.progress?.phase && status.payload.progress.phase !== "유휴"),
    );
    const delay = live ? 5000 : 30000;
    const timer = window.setInterval(() => {
      void load();
    }, delay);
    return () => window.clearInterval(timer);
  }, [status?.runtime.daemon_running, status?.runtime.run_in_flight, status?.payload.progress?.phase]);

  async function saveConfig() {
    setSaving(true);
    try {
      await updateDevPulseSettings({
        rootDir,
        cronEnabled,
        cronExpr,
        feeds: feeds.split(/\s+/).filter(Boolean),
        batchSize,
        collectLimit,
        idlePollSec,
        backlogPauseSec,
        bundleSize,
        snsMode,
        mastodonInstance,
      });
      if (mastodonToken.trim()) {
        const nextSecrets = await updateDevPulseSecrets({ mastodonAccessToken: mastodonToken.trim() });
        setSecretStatus(nextSecrets);
        setMastodonToken("");
      }
      await load();
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function run(mode: "run" | "collect" | "bundle" | "cleanup") {
    setRunning(mode);
    try {
      await runDevPulseNow(mode);
      await load();
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    } finally {
      setRunning(null);
    }
  }

  async function toggleDaemon(next: boolean) {
    setRunning(next ? "daemon-start" : "daemon-stop");
    try {
      if (next) {
        await startDevPulseDaemon();
      } else {
        await stopDevPulseDaemon();
      }
      await load();
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    } finally {
      setRunning(null);
    }
  }

  const cards = status?.payload.artifacts?.cards ?? [];
  const bundles = status?.payload.artifacts?.bundles ?? [];
  const dbBundles = status?.payload.db?.recent_bundles ?? [];
  const slots = status?.payload.bundle?.slots ?? [];
  const progress = status?.payload.progress;
  const db = status?.payload.db;
  const bundleProgress = status?.payload.bundle;
  const counts = status?.payload.artifacts?.counts;
  const logs = useMemo(
    () =>
      compactList([...(status?.payload.logs?.tail ?? []), ...(status?.payload.progress?.recent_logs ?? [])]).slice(-120),
    [status?.payload.logs?.tail, status?.payload.progress?.recent_logs],
  );
  const isLive = Boolean(status?.runtime.run_in_flight || status?.runtime.daemon_running);
  const currentPhase = progress?.phase ?? "-";
  const currentStep = progress?.step ?? "-";
  const currentTitle = progress?.current_title ?? progress?.current_post_id ?? "-";
  const queuePercent = bundleProgress?.percent ?? 0;

  return (
    <div className="space-y-6 max-w-[1480px]">
      <section className="td-panel p-6 md:p-7 bg-gradient-to-br from-[var(--cyber-cyan-dim)] via-[var(--cyber-panel-bg)] to-[var(--cyber-magenta-dim)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="td-label">{t("pulse.kicker")}</p>
            <h2 className="text-2xl font-display font-semibold text-[var(--cyber-cyan)]">
              {t("pulse.title")}
            </h2>
            <p className="max-w-3xl text-sm text-text-muted">
              {t("pulse.description")}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-border px-3 py-2 text-sm text-text-muted hover:border-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)]"
            >
              {isLive ? t("pulse.autoRefresh") : t("common.refresh")}
            </button>
            <button
              type="button"
              onClick={() => void run("run")}
              disabled={running !== null}
              className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground disabled:opacity-50"
            >
              {running === "run" ? t("common.loading") : t("pulse.runNow")}
            </button>
            <button
              type="button"
              onClick={() => void toggleDaemon(!(status?.runtime.daemon_running ?? false))}
              disabled={running !== null}
              className="rounded-lg border border-accent/40 px-3 py-2 text-sm text-accent hover:bg-accent/10 disabled:opacity-50"
            >
              {status?.runtime.daemon_running ? t("pulse.stopDaemon") : t("pulse.startDaemon")}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-border/70 bg-surface/70 p-4">
            <p className="text-[11px] font-data text-text-muted">{t("pulse.daemonStatus")}</p>
            <strong className="mt-2 block text-lg text-text">
              {status?.runtime.daemon_running ? t("pulse.running") : t("pulse.idle")}
            </strong>
          </div>
          <div className="rounded-xl border border-border/70 bg-surface/70 p-4">
            <p className="text-[11px] font-data text-text-muted">{t("pulse.lastRun")}</p>
            <strong className="mt-2 block text-lg text-text">{fmt(status?.runtime.last_run_at)}</strong>
          </div>
          <div className="rounded-xl border border-border/70 bg-surface/70 p-4">
            <p className="text-[11px] font-data text-text-muted">{t("pulse.bundleQueue")}</p>
            <strong className="mt-2 block text-lg text-text">
              {db?.bundle_pending ?? "-"}
            </strong>
          </div>
          <div className="rounded-xl border border-border/70 bg-surface/70 p-4">
            <p className="text-[11px] font-data text-text-muted">{t("pulse.snsPublished")}</p>
            <strong className="mt-2 block text-lg text-text">
              {progress?.total_published ?? 0}
            </strong>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger-text">
            {error}
          </div>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="td-panel p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-display text-[var(--cyber-cyan)]">{t("pulse.liveTitle")}</h3>
              <p className="text-sm text-text-muted">{t("pulse.liveDesc")}</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-surface/60 px-3 py-2 text-right">
              <p className="text-[11px] font-data text-text-muted">{t("pulse.updatedAt")}</p>
              <p className="mt-1 text-sm text-text">{fmt(progress?.updated_at ?? status?.payload.generated_at)}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--cyber-cyan)]/20 bg-[var(--cyber-cyan-dim)]/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-data uppercase tracking-[0.12em] text-text-muted">{t("pulse.currentTask")}</p>
                <p className="mt-2 text-base font-semibold text-text">
                  {currentPhase} · {currentStep}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-text-muted">{currentTitle}</p>
              </div>
              <div className="min-w-[132px] rounded-xl border border-border/70 bg-black/20 px-4 py-3 text-center">
                <p className="text-[11px] font-data text-text-muted">{t("pulse.queueFill")}</p>
                <strong className="mt-1 block text-xl text-[var(--cyber-cyan)]">{percent(queuePercent)}</strong>
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/30">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,var(--cyber-cyan),var(--cyber-magenta))]"
                style={{ width: percent(queuePercent) }}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCell label={t("pulse.runCycle")} value={String(progress?.run_number ?? 0)} />
            <StatCell label={t("pulse.queueSize")} value={String(progress?.queue_size ?? 0)} />
            <StatCell label={t("pulse.processedThisRun")} value={String(progress?.processed_this_run ?? 0)} />
            <StatCell label={t("pulse.failedThisRun")} value={String(progress?.failed_this_run ?? 0)} tone="danger" />
            <StatCell label={t("pulse.collectedTotal")} value={String(progress?.total_collected ?? 0)} />
            <StatCell label={t("pulse.bundleCount")} value={String(db?.bundle_total ?? counts?.bundles ?? 0)} />
          </div>
        </div>

        <div className="td-panel p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-display text-[var(--cyber-cyan)]">{t("pulse.scheduleTitle")}</h3>
              <p className="text-sm text-text-muted">{t("pulse.scheduleDesc")}</p>
            </div>
            <button
              type="button"
              onClick={() => void saveConfig()}
              disabled={saving}
              className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground disabled:opacity-50"
            >
              {saving ? t("common.saving") : t("pulse.save")}
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-text-muted">{t("pulse.rootDir")}</span>
              <input
                value={rootDir}
                onChange={(e) => setRootDir(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-text-muted">{t("pulse.feeds")}</span>
              <input
                value={feeds}
                onChange={(e) => setFeeds(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-text-muted">{t("pulse.cronExpr")}</span>
              <input
                value={cronExpr}
                onChange={(e) => setCronExpr(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-data"
              />
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-border/70 bg-surface/60 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={cronEnabled}
                onChange={(e) => setCronEnabled(e.target.checked)}
              />
              <span>{t("pulse.cronEnabled")}</span>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-text-muted">{t("pulse.batchSize")}</span>
              <input
                type="number"
                min={1}
                max={50}
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value) || 1)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-text-muted">{t("pulse.collectLimit")}</span>
              <input
                type="number"
                min={0}
                max={500}
                value={collectLimit}
                onChange={(e) => setCollectLimit(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-text-muted">{t("pulse.idlePollSec")}</span>
              <input
                type="number"
                min={10}
                value={idlePollSec}
                onChange={(e) => setIdlePollSec(Number(e.target.value) || 10)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-text-muted">{t("pulse.bundleSize")}</span>
              <input
                type="number"
                min={1}
                max={24}
                value={bundleSize}
                onChange={(e) => setBundleSize(Number(e.target.value) || 1)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-text-muted">{t("pulse.snsMode")}</span>
              <select
                value={snsMode}
                onChange={(e) => setSnsMode(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="file">file</option>
                <option value="mastodon">mastodon</option>
              </select>
            </label>
          </div>

          <label className="space-y-1 text-sm block max-w-xs">
            <span className="text-text-muted">{t("pulse.backlogPauseSec")}</span>
            <input
              type="number"
              min={0}
              value={backlogPauseSec}
              onChange={(e) => setBacklogPauseSec(Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-text-muted">{t("pulse.mastodonInstance")}</span>
              <input
                value={mastodonInstance}
                onChange={(e) => setMastodonInstance(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                placeholder="https://mastodon.social"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-text-muted">{t("pulse.mastodonToken")}</span>
              <input
                type="password"
                value={mastodonToken}
                onChange={(e) => setMastodonToken(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                placeholder={secretStatus?.has_mastodon_token ? t("pulse.secretSaved") : ""}
              />
            </label>
          </div>
          <p className="text-xs text-text-muted">
            {secretStatus?.has_mastodon_token ? t("pulse.secretSaved") : t("pulse.secretMissing")}
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void run("collect")}
              disabled={running !== null}
              className="rounded-lg border border-border px-3 py-2 text-sm text-text-muted hover:border-[var(--cyber-cyan)] disabled:opacity-50"
            >
              {t("pulse.collectNow")}
            </button>
            <button
              type="button"
              onClick={() => void run("bundle")}
              disabled={running !== null}
              className="rounded-lg border border-border px-3 py-2 text-sm text-text-muted hover:border-[var(--cyber-cyan)] disabled:opacity-50"
            >
              {t("pulse.bundleNow")}
            </button>
            <button
              type="button"
              onClick={() => void run("cleanup")}
              disabled={running !== null}
              className="rounded-lg border border-border px-3 py-2 text-sm text-text-muted hover:border-[var(--cyber-cyan)] disabled:opacity-50"
            >
              {t("pulse.cleanup")}
            </button>
          </div>
        </div>

        <div className="td-panel p-6">
          <h3 className="text-lg font-display text-[var(--cyber-cyan)]">{t("pulse.bundleReady")}</h3>
          <p className="mt-1 text-sm text-text-muted">{t("pulse.bundleReadyDesc")}</p>
          <div className="mt-3 rounded-xl border border-border/60 bg-surface/50 px-3 py-2 text-sm text-text-muted">
            {bundleProgress?.ready ? t("pulse.queueReady") : t("pulse.queueCollecting")}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {slots.length === 0 && <p className="text-sm text-text-muted">{loading ? t("common.loading") : t("pulse.noSlots")}</p>}
            {slots.map((slot) => (
              <div
                key={slot.index}
                className={`rounded-xl border p-3 ${slot.filled ? "border-[var(--cyber-cyan)]/30 bg-[var(--cyber-cyan-dim)]/10" : "border-border/50 bg-surface/40"}`}
              >
                <p className="text-[11px] font-data text-text-muted">SLOT {slot.index}</p>
                <p className="mt-2 line-clamp-2 text-sm text-text">{slot.title || t("pulse.emptySlot")}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="td-panel p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-display text-[var(--cyber-cyan)]">{t("pulse.recentBundles")}</h3>
              <p className="text-sm text-text-muted">{t("pulse.recentBundlesDesc")}</p>
            </div>
            <strong className="text-sm text-text-muted">{bundles.length}</strong>
          </div>
          <div className="mt-4 space-y-3">
            {bundles.length === 0 && <p className="text-sm text-text-muted">{t("pulse.bundleEmpty")}</p>}
            {bundles.slice(0, 5).map((bundle) => (
              <BundleUploadRow key={bundle.bundle_id} bundle={bundle} t={t} />
            ))}
          </div>
        </div>

        <div className="td-panel p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-display text-[var(--cyber-cyan)]">{t("pulse.recentDbBundles")}</h3>
              <p className="text-sm text-text-muted">{t("pulse.recentDbBundlesDesc")}</p>
            </div>
            <strong className="text-sm text-text-muted">{dbBundles.length}</strong>
          </div>
          <div className="mt-4 space-y-3">
            {dbBundles.length === 0 && <p className="text-sm text-text-muted">{t("pulse.dbBundleEmpty")}</p>}
            {dbBundles.slice(0, 6).map((bundle) => (
              <DbBundleRow key={bundle.id} bundle={bundle} />
            ))}
          </div>
        </div>
      </section>

      <section className="td-panel p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-display text-[var(--cyber-cyan)]">{t("pulse.cardsTitle")}</h3>
            <p className="text-sm text-text-muted">{t("pulse.cardsDesc")}</p>
          </div>
          <strong className="text-sm text-text-muted">{cards.length}</strong>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-4">
          {cards.length === 0 && <p className="text-sm text-text-muted">{t("pulse.artifactEmpty")}</p>}
          {cards.map((card) => (
            <article key={card.post_id} className="rounded-xl border border-border/70 bg-surface/60 overflow-hidden">
              {toAssetUrl(card.url) && (
                <img src={toAssetUrl(card.url) ?? undefined} alt={card.title} className="aspect-[4/5] w-full object-cover bg-black/20" />
              )}
              <div className="p-3">
                <p className="line-clamp-2 text-sm text-text">{card.title || card.post_id}</p>
                <p className="mt-2 text-[11px] text-text-muted">{fmt(card.created_at)} · {card.size_kb}KB</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="td-panel p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-display text-[var(--cyber-cyan)]">{t("pulse.bundlesTitle")}</h3>
            <p className="text-sm text-text-muted">{t("pulse.bundlesDesc")}</p>
          </div>
          <strong className="text-sm text-text-muted">{bundles.length}</strong>
        </div>
        <div className="mt-4 space-y-4">
          {bundles.map((bundle) => (
            <article key={bundle.bundle_id} className="rounded-xl border border-border/70 bg-surface/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="font-display text-base text-text">{bundle.bundle_id}</h4>
                  <p className="mt-1 text-sm text-text-muted">
                    {fmt(bundle.created_at)} · {bundle.post_count} posts · {bundle.card_count} cards
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    {t("pulse.platform")}: {bundle.platform || "file"}
                    {bundle.duplicate_count ? ` · ${t("pulse.duplicates")} ${bundle.duplicate_count + 1}` : ""}
                  </p>
                </div>
                <div className="flex gap-2 text-xs">
                  {bundle.video_url && (
                    <a className="rounded-lg border border-border px-2 py-1 text-text-muted hover:border-[var(--cyber-cyan)]" href={toAssetUrl(bundle.video_url) ?? undefined} target="_blank" rel="noreferrer">
                      {t("pulse.openVideo")}
                    </a>
                  )}
                  {bundle.json_url && (
                    <a className="rounded-lg border border-border px-2 py-1 text-text-muted hover:border-[var(--cyber-cyan)]" href={toAssetUrl(bundle.json_url) ?? undefined} target="_blank" rel="noreferrer">
                      {t("pulse.openJson")}
                    </a>
                  )}
                  {bundle.caption_url && (
                    <a className="rounded-lg border border-border px-2 py-1 text-text-muted hover:border-[var(--cyber-cyan)]" href={toAssetUrl(bundle.caption_url) ?? undefined} target="_blank" rel="noreferrer">
                      {t("pulse.openCaption")}
                    </a>
                  )}
                </div>
              </div>
              {bundle.video_url && (
                <video
                  className="mt-4 aspect-[9/16] w-full max-w-[280px] rounded-xl border border-border/60 bg-black/30"
                  controls
                  preload="metadata"
                  src={toAssetUrl(bundle.video_url) ?? undefined}
                />
              )}
              {bundle.caption && (
                <p className="mt-3 whitespace-pre-wrap text-sm text-text-muted">{bundle.caption}</p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="td-panel p-6">
        <h3 className="text-lg font-display text-[var(--cyber-cyan)]">{t("pulse.logsTitle")}</h3>
        <div className="mt-4 rounded-xl border border-border/70 bg-black/30 p-4 font-data text-xs text-text-muted">
          {logs.length === 0 ? (
            <p>{t("pulse.noLogs")}</p>
          ) : (
            logs.map((line, index) => <div key={`${index}-${line}`}>{line}</div>)
          )}
        </div>
      </section>
    </div>
  );
}

function StatCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-surface/60 p-3">
      <p className="text-[11px] font-data text-text-muted">{label}</p>
      <strong className={`mt-2 block text-lg ${tone === "danger" ? "text-danger-text" : "text-text"}`}>{value}</strong>
    </div>
  );
}

function BundleUploadRow({
  bundle,
  t,
}: {
  bundle: DevPulseBundleArtifact;
  t: (key: string) => string;
}) {
  return (
    <article className="rounded-xl border border-border/70 bg-surface/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate font-display text-base text-text">{bundle.bundle_id}</h4>
          <p className="mt-1 text-sm text-text-muted">
            {fmt(bundle.published_at || bundle.created_at)} · {bundle.post_count} posts · {bundle.card_count} cards
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {t("pulse.platform")}: {bundle.platform || "file"}
            {bundle.duplicate_count ? ` · ${t("pulse.duplicates")} ${bundle.duplicate_count + 1}` : ""}
          </p>
        </div>
        <div className="rounded-full border border-[var(--cyber-cyan)]/25 bg-[var(--cyber-cyan-dim)]/10 px-2.5 py-1 text-[11px] font-data text-[var(--cyber-cyan)]">
          {bundle.platform || "file"}
        </div>
      </div>
      {bundle.caption && <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-text-muted">{bundle.caption}</p>}
    </article>
  );
}

function DbBundleRow({ bundle }: { bundle: DevPulseDbBundle }) {
  return (
    <article className="rounded-xl border border-border/70 bg-surface/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate font-display text-base text-text">{bundle.id}</h4>
          <p className="mt-1 text-sm text-text-muted">{fmt(bundle.created_at)}</p>
          <p className="mt-1 text-xs text-text-muted">
            posts {bundle.post_ids?.length ?? 0}
            {bundle.video_key ? ` · ${bundle.video_key}` : ""}
          </p>
        </div>
        <div className="rounded-full border border-border px-2.5 py-1 text-[11px] font-data text-text-muted">
          {bundle.post_ids?.length ?? 0}
        </div>
      </div>
    </article>
  );
}
