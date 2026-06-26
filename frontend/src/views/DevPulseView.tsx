import { useEffect, useMemo, useState } from "react";
import {
  checkDevPulseSns,
  getDevPulseInfraStatus,
  getDevPulseSecretsStatus,
  getDevPulseStatus,
  pickDevPulseRootDir,
  runDevPulseNow,
  runDevPulseSnsNow,
  startDevPulseDaemon,
  startDevPulseSnsDaemon,
  stopDevPulseDaemon,
  stopDevPulseSnsDaemon,
  showChecklistWindow,
  toAssetUrl,
  updateDevPulseSecrets,
  updateDevPulseSnsConfig,
  updateDevPulseSettings,
  type DevPulseBundleArtifact,
  type DevPulseDbBundle,
  type DevPulseInfraStatusView,
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

function jumpToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function formatError(error: unknown) {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function DevPulseView() {
  const { t } = useI18n();
  const [status, setStatus] = useState<DevPulseStatusView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rootDir, setRootDir] = useState("");
  const [dockerCliPath, setDockerCliPath] = useState("");
  const [cronEnabled, setCronEnabled] = useState(false);
  const [cronExpr, setCronExpr] = useState("0 9 * * *");
  const [feeds, setFeeds] = useState("all new ask show top");
  const [topicFilters, setTopicFilters] = useState("");
  const [batchSize, setBatchSize] = useState(5);
  const [collectLimit, setCollectLimit] = useState(0);
  const [idlePollSec, setIdlePollSec] = useState(90);
  const [backlogPauseSec, setBacklogPauseSec] = useState(0);
  const [bundleSize, setBundleSize] = useState(6);
  const [snsMode, setSnsMode] = useState("file");
  const [mastodonInstance, setMastodonInstance] = useState("");
  const [mastodonToken, setMastodonToken] = useState("");
  const [xApiKey, setXApiKey] = useState("");
  const [xApiSecret, setXApiSecret] = useState("");
  const [xAccessToken, setXAccessToken] = useState("");
  const [xAccessSecret, setXAccessSecret] = useState("");
  const [igAppId, setIgAppId] = useState("");
  const [igUserId, setIgUserId] = useState("");
  const [igAccessToken, setIgAccessToken] = useState("");
  const [igPostTimes, setIgPostTimes] = useState("09:00, 14:00, 19:00");
  const [igReelsPerDay, setIgReelsPerDay] = useState(3);
  const [igTimezone, setIgTimezone] = useState("Asia/Seoul");
  const [igPollSec, setIgPollSec] = useState(60);
  const [igGraphVersion, setIgGraphVersion] = useState("v21.0");
  const [igMediaPort, setIgMediaPort] = useState(9088);
  const [igMediaPublicBaseUrl, setIgMediaPublicBaseUrl] = useState("");
  const [igMinioPublicEndpoint, setIgMinioPublicEndpoint] = useState("");
  const [igDryRun, setIgDryRun] = useState(true);
  const [secretStatus, setSecretStatus] = useState<DevPulseSecretsStatusView | null>(null);
  const [infraStatus, setInfraStatus] = useState<DevPulseInfraStatusView | null>(null);
  const [pickingRoot, setPickingRoot] = useState(false);

  async function load() {
    setLoading(true);
    const errors: string[] = [];

    try {
      const secrets = await getDevPulseSecretsStatus();
      setSecretStatus(secrets);
    } catch (e) {
      errors.push(formatError(e));
    }

    try {
      const infra = await getDevPulseInfraStatus();
      setInfraStatus(infra);
    } catch (e) {
      errors.push(formatError(e));
    }

    try {
      const next = await getDevPulseStatus();
      setStatus(next);
      setRootDir(next.config.root_dir);
      setDockerCliPath(next.config.docker_cli_path);
      setCronEnabled(next.config.cron_enabled);
      setCronExpr(next.config.cron_expr);
      setFeeds(next.config.feeds.join(" "));
      setTopicFilters(next.config.topic_filters.join("\n"));
      setBatchSize(next.config.batch_size);
      setCollectLimit(next.config.collect_limit);
      setIdlePollSec(next.config.idle_poll_sec);
      setBacklogPauseSec(next.config.backlog_pause_sec);
      setBundleSize(next.config.bundle_size);
      setSnsMode(next.config.sns_mode);
      setMastodonInstance(next.config.mastodon_instance);
      const snsConfig = next.payload.sns?.config;
      if (snsConfig) {
        setIgAppId(snsConfig.app_id);
        setIgUserId(snsConfig.user_id);
        setIgPostTimes(snsConfig.post_times.join(", "));
        setIgReelsPerDay(snsConfig.reels_per_day);
        setIgTimezone(snsConfig.timezone);
        setIgPollSec(snsConfig.poll_sec);
        setIgGraphVersion(snsConfig.graph_version);
        setIgMediaPort(snsConfig.media_port);
        setIgMediaPublicBaseUrl(snsConfig.media_public_base_url);
        setIgMinioPublicEndpoint(snsConfig.minio_public_endpoint);
        setIgDryRun(snsConfig.dry_run);
      }
    } catch (e) {
      errors.push(formatError(e));
    }

    setError(errors.length > 0 ? errors.join("\n") : null);
    setLoading(false);
  }

  async function browseRootDir() {
    setPickingRoot(true);
    try {
      const config = await pickDevPulseRootDir();
      setRootDir(config.root_dir);
      await load();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setPickingRoot(false);
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
        dockerCliPath,
        cronEnabled,
        cronExpr,
        feeds: feeds.split(/\s+/).filter(Boolean),
        topicFilters: topicFilters
          .split(/\n|,/)
          .map((value) => value.trim())
          .filter(Boolean),
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
      if (snsMode === "x" && (xApiKey.trim() || xApiSecret.trim() || xAccessToken.trim() || xAccessSecret.trim())) {
        const nextSecrets = await updateDevPulseSecrets({
          xApiKey: xApiKey.trim(),
          xApiSecret: xApiSecret.trim(),
          xAccessToken: xAccessToken.trim(),
          xAccessSecret: xAccessSecret.trim(),
        });
        setSecretStatus(nextSecrets);
        setXApiKey("");
        setXApiSecret("");
        setXAccessToken("");
        setXAccessSecret("");
      }
      void load();
    } catch (e) {
      setError(formatError(e));
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
      setError(formatError(e));
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
      setError(formatError(e));
    } finally {
      setRunning(null);
    }
  }

  async function controlSns(action: "check" | "run" | "start-daemon" | "stop-daemon") {
    setRunning(action);
    try {
      if (action === "check") {
        await checkDevPulseSns();
      } else if (action === "run") {
        await runDevPulseSnsNow();
      } else if (action === "start-daemon") {
        await startDevPulseSnsDaemon();
      } else {
        await stopDevPulseSnsDaemon();
      }
      await load();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setRunning(null);
    }
  }

  async function saveSnsConfig() {
    setSaving(true);
    try {
      await updateDevPulseSnsConfig({
        appId: igAppId,
        userId: igUserId,
        accessToken: igAccessToken.trim() || undefined,
        postTimes: igPostTimes
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        reelsPerDay: igReelsPerDay,
        timezone: igTimezone,
        pollSec: igPollSec,
        graphVersion: igGraphVersion,
        mediaPort: igMediaPort,
        mediaPublicBaseUrl: igMediaPublicBaseUrl,
        minioPublicEndpoint: igMinioPublicEndpoint,
        dryRun: igDryRun,
      });
      setIgAccessToken("");
      await load();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setSaving(false);
    }
  }

  const cards = status?.payload.artifacts?.cards ?? [];
  const bundles = status?.payload.artifacts?.bundles ?? [];
  const dbBundles = status?.payload.db?.recent_bundles ?? [];
  const snsPosts = status?.payload.sns?.recent_posts ?? [];
  const snsStats = status?.payload.sns?.stats;
  const snsRuntime = status?.sns_runtime;
  const snsIssues = status?.payload.sns?.issues ?? [];
  const snsConfig = status?.payload.sns?.config;
  const slots = status?.payload.bundle?.slots ?? [];
  const progress = status?.payload.progress;
  const db = status?.payload.db;
  const bundleProgress = status?.payload.bundle;
  const counts = status?.payload.artifacts?.counts;
  const activeTopicFilters = status?.config.topic_filters ?? [];
  const logs = useMemo(
    () =>
      compactList([...(status?.payload.logs?.tail ?? []), ...(status?.payload.progress?.recent_logs ?? [])]).slice(-120),
    [status?.payload.logs?.tail, status?.payload.progress?.recent_logs],
  );
  const currentPhase = progress?.phase ?? "-";
  const currentStep = progress?.step ?? "-";
  const currentTitle = progress?.current_title ?? progress?.current_post_id ?? "-";
  const queuePercent = bundleProgress?.percent ?? 0;
  const dependencies = status?.dependencies ?? [];
  const dbError =
    typeof status?.payload.db?.counts?.error === "string" ? status.payload.db.counts.error : null;
  const runtimeError = status?.runtime.last_error ?? null;
  const snsRuntimeError = status?.sns_runtime.last_error ?? null;
  const rootReady = status?.config.root_ready ?? false;
  const setupHint = status?.config.setup_hint || status?.runtime.last_error || t("pulse.setupSaveHint");
  const dockerReady = Boolean(infraStatus?.docker_available && infraStatus?.docker_daemon_ready);
  const composeDir = infraStatus?.compose_dir?.trim() ? infraStatus.compose_dir : t("pulse.composeMissing");
  const crawlCount = progress?.total_collected ?? db?.counts?.collected ?? 0;
  const cardCount = counts?.cards ?? db?.counts?.card_generated ?? 0;
  const videoCount = counts?.bundles ?? db?.bundle_total ?? 0;
  const snsCount = progress?.total_published ?? db?.counts?.published ?? 0;
  const bundleById = new Map(bundles.map((bundle) => [bundle.bundle_id, bundle]));

  return (
    <div className="space-y-6 max-w-[1480px]">
      {!rootReady && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
          <p className="text-[11px] font-data uppercase tracking-[0.12em] text-amber-300">{t("pulse.setupTitle")}</p>
          <h3 className="mt-2 text-lg font-display text-amber-100">{t("pulse.setupDesc")}</h3>
          <p className="mt-2 text-sm text-amber-100/80">{setupHint}</p>
          <p className="mt-2 text-xs text-text-muted">{t("pulse.setupSaveHint")}</p>
        </section>
      )}

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
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="rounded-full border border-[var(--cyber-cyan)]/25 bg-[var(--cyber-cyan-dim)]/10 px-3 py-1 text-[11px] font-data text-[var(--cyber-cyan)]">
                {t("pulse.surfaceTrail")}
              </span>
              <span className="rounded-full border border-[var(--cyber-magenta)]/25 bg-[var(--cyber-magenta-dim)]/10 px-3 py-1 text-[11px] font-data text-[var(--cyber-magenta)]">
                {t("pulse.externalRuntime")}
              </span>
              <button
                type="button"
                onClick={() => jumpToSection("pulse-controls")}
                className="rounded-full border border-border px-3 py-1 text-[11px] font-data text-text-muted hover:border-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)]"
              >
                {t("pulse.openControls")}
              </button>
              <button
                type="button"
                onClick={() => jumpToSection("pulse-cards")}
                className="rounded-full border border-border px-3 py-1 text-[11px] font-data text-text-muted hover:border-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)]"
              >
                {t("pulse.openCards")}
              </button>
              <button
                type="button"
                onClick={() => jumpToSection("pulse-bundles")}
                className="rounded-full border border-border px-3 py-1 text-[11px] font-data text-text-muted hover:border-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)]"
              >
                {t("pulse.openBundles")}
              </button>
              <button
                type="button"
                onClick={() => jumpToSection("pulse-uploads")}
                className="rounded-full border border-border px-3 py-1 text-[11px] font-data text-text-muted hover:border-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)]"
              >
                {t("pulse.openUploads")}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] font-data uppercase tracking-[0.12em] text-text-muted">
                {t("pulse.activeTopics")}
              </span>
              {activeTopicFilters.length > 0 ? (
                activeTopicFilters.map((filter) => (
                  <span
                    key={filter}
                    className="rounded-full border border-[var(--cyber-cyan)]/30 bg-[var(--cyber-cyan-dim)]/10 px-3 py-1 text-[11px] text-[var(--cyber-cyan)]"
                  >
                    {filter}
                  </span>
                ))
              ) : (
                <span className="text-xs text-text-muted">{t("pulse.activeTopicsAll")}</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void showChecklistWindow()}
              className="rounded-lg border border-border px-3 py-2 text-sm text-text-muted hover:border-[var(--cyber-magenta)] hover:text-[var(--cyber-magenta)]"
            >
              {t("pulse.openChecklist")}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-border px-3 py-2 text-sm text-text-muted hover:border-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)] disabled:opacity-50"
            >
              {t("pulse.inspectRuntime")}
            </button>
            <button
              type="button"
              onClick={() => void run("run")}
              disabled={running !== null || !rootReady}
              className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground disabled:opacity-50"
            >
              {running === "run" ? t("common.loading") : t("pulse.runNow")}
            </button>
            <button
              type="button"
              onClick={() => void toggleDaemon(!(status?.runtime.daemon_running ?? false))}
              disabled={running !== null || !rootReady}
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

        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <QuickPulseMetric
            label={t("pulse.crawlCount")}
            value={String(crawlCount)}
            tone="cyan"
          />
          <QuickPulseMetric
            label={t("pulse.cardCount")}
            value={String(cardCount)}
            tone="emerald"
          />
          <QuickPulseMetric
            label={t("pulse.videoCount")}
            value={String(videoCount)}
            tone="violet"
          />
          <QuickPulseMetric
            label={t("pulse.snsCount")}
            value={String(snsCount)}
            tone="amber"
          />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {dependencies.map((dependency) => (
            <div
              key={dependency.key}
              className={`rounded-xl border p-4 ${dependency.ready ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-data text-text-muted">{dependency.label}</p>
                <span className={`text-[11px] font-data ${dependency.ready ? "text-emerald-300" : "text-amber-300"}`}>
                  {dependency.ready ? t("pulse.depReady") : t("pulse.depMissing")}
                </span>
              </div>
              <p className="mt-2 truncate text-sm text-text" title={dependency.target}>{dependency.target}</p>
              <p className="mt-2 line-clamp-2 text-xs text-text-muted">{dependency.detail}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-border/70 bg-surface/60 p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-data text-text-muted">{t("pulse.runtimeTitle")}</p>
              <p className="mt-1 text-xs text-text-muted">{t("pulse.runtimeHint")}</p>
            </div>
            <p className="text-sm text-text-muted">{infraStatus?.detail ?? (loading ? t("common.loading") : "-")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-[11px] font-data ${infraStatus?.docker_available ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}
            >
              {infraStatus?.docker_available ? t("pulse.dockerInstalled") : t("pulse.dockerMissing")}
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-[11px] font-data ${dockerReady ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}
            >
              {dockerReady ? t("pulse.dockerRunning") : t("pulse.dockerStopped")}
            </span>
          </div>
          <div>
            <p className="text-[11px] font-data text-text-muted">{t("pulse.runtimeComposeDir")}</p>
            <p className="mt-1 text-sm text-text-muted">{composeDir}</p>
          </div>
          <div>
            <p className="text-[11px] font-data text-text-muted">{t("pulse.runtimeBinary")}</p>
            <p className="mt-1 text-sm text-text-muted">{dockerCliPath.trim() || "docker"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(infraStatus?.services ?? []).map((service) => (
              <span
                key={service.name}
                className={`rounded-full border px-3 py-1 text-[11px] font-data ${service.running ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-border/70 bg-surface text-text-muted"}`}
              >
                {service.name}
              </span>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger-text">
            {error}
          </div>
        )}

        {(dbError || runtimeError || snsRuntimeError) && (
          <div className="mt-4 grid gap-3 xl:grid-cols-3">
            {dbError && (
              <StatusAlert
                title={t("pulse.dbWarningTitle")}
                message={dbError}
                tone="amber"
              />
            )}
            {runtimeError && (
              <StatusAlert
                title={t("pulse.pipelineWarningTitle")}
                message={runtimeError}
                tone="danger"
              />
            )}
            {snsRuntimeError && (
              <StatusAlert
                title={t("pulse.snsWarningTitle")}
                message={snsRuntimeError}
                tone="amber"
              />
            )}
          </div>
        )}
      </section>

      <section id="pulse-controls" className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] scroll-mt-24">
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
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-text-muted">{t("pulse.rootDir")}</span>
              <div className="flex flex-wrap gap-2">
                <input
                  value={rootDir}
                  onChange={(e) => setRootDir(e.target.value)}
                  placeholder="/path/to/devPulse"
                  className="min-w-[240px] flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void browseRootDir()}
                  disabled={pickingRoot}
                  className="rounded-lg border border-border px-3 py-2 text-sm text-text-muted hover:border-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)] disabled:opacity-50"
                >
                  {pickingRoot ? t("common.loading") : t("pulse.browseRoot")}
                </button>
              </div>
              {!rootReady && setupHint && (
                <p className="text-xs text-amber-300">{setupHint}</p>
              )}
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-text-muted">{t("pulse.dockerCliPath")}</span>
              <input
                value={dockerCliPath}
                onChange={(e) => setDockerCliPath(e.target.value)}
                placeholder="/usr/local/bin/docker"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
              <p className="text-xs text-text-muted">{t("pulse.dockerCliPathHint")}</p>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-text-muted">{t("pulse.feeds")}</span>
              <input
                value={feeds}
                onChange={(e) => setFeeds(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-text-muted">{t("pulse.topicFilters")}</span>
              <textarea
                value={topicFilters}
                onChange={(e) => setTopicFilters(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                placeholder={t("pulse.topicFiltersPlaceholder")}
              />
              <p className="text-xs text-text-muted">{t("pulse.topicFiltersHint")}</p>
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
                <option value="x">x</option>
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
            {snsMode === "mastodon" && (
              <>
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
              </>
            )}
            {snsMode === "x" && (
              <>
                <label className="space-y-1 text-sm">
                  <span className="text-text-muted">X_API_KEY</span>
                  <input
                    value={xApiKey}
                    onChange={(e) => setXApiKey(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                    placeholder={secretStatus?.has_x_credentials ? t("pulse.secretSaved") : ""}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-text-muted">X_API_SECRET</span>
                  <input
                    type="password"
                    value={xApiSecret}
                    onChange={(e) => setXApiSecret(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                    placeholder={secretStatus?.has_x_credentials ? t("pulse.secretSaved") : ""}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-text-muted">X_ACCESS_TOKEN</span>
                  <input
                    value={xAccessToken}
                    onChange={(e) => setXAccessToken(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                    placeholder={secretStatus?.has_x_credentials ? t("pulse.secretSaved") : ""}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-text-muted">X_ACCESS_SECRET</span>
                  <input
                    type="password"
                    value={xAccessSecret}
                    onChange={(e) => setXAccessSecret(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                    placeholder={secretStatus?.has_x_credentials ? t("pulse.secretSaved") : ""}
                  />
                </label>
              </>
            )}
          </div>
          <p className="text-xs text-text-muted">
            {snsMode === "x"
              ? secretStatus?.has_x_credentials
                ? t("pulse.secretSaved")
                : t("pulse.secretMissing")
              : secretStatus?.has_mastodon_token
                ? t("pulse.secretSaved")
                : t("pulse.secretMissing")}
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void run("collect")}
              disabled={running !== null || !rootReady}
              className="rounded-lg border border-border px-3 py-2 text-sm text-text-muted hover:border-[var(--cyber-cyan)] disabled:opacity-50"
            >
              {t("pulse.collectNow")}
            </button>
            <button
              type="button"
              onClick={() => void run("bundle")}
              disabled={running !== null || !rootReady}
              className="rounded-lg border border-border px-3 py-2 text-sm text-text-muted hover:border-[var(--cyber-cyan)] disabled:opacity-50"
            >
              {t("pulse.bundleNow")}
            </button>
            <button
              type="button"
              onClick={() => void run("cleanup")}
              disabled={running !== null || !rootReady}
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

      <section id="pulse-uploads" className="grid gap-6 xl:grid-cols-3 scroll-mt-24">
        <div className="td-panel p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-display text-[var(--cyber-cyan)]">{t("pulse.snsDeliveryTitle")}</h3>
              <p className="text-sm text-text-muted">{t("pulse.snsDeliveryDesc")}</p>
            </div>
            <strong className="text-sm text-text-muted">{snsStats?.posted ?? 0}</strong>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void controlSns("check")}
              disabled={running !== null || !rootReady}
              className="rounded-lg border border-border px-3 py-2 text-sm text-text-muted hover:border-[var(--cyber-cyan)] disabled:opacity-50"
            >
              {t("pulse.snsCheck")}
            </button>
            <button
              type="button"
              onClick={() => void controlSns("run")}
              disabled={running !== null || !rootReady}
              className="rounded-lg border border-border px-3 py-2 text-sm text-text-muted hover:border-[var(--cyber-cyan)] disabled:opacity-50"
            >
              {t("pulse.snsRunNow")}
            </button>
            <button
              type="button"
              onClick={() => void controlSns(snsRuntime?.daemon_running ? "stop-daemon" : "start-daemon")}
              disabled={running !== null || !rootReady}
              className="rounded-lg border border-accent/40 px-3 py-2 text-sm text-accent hover:bg-accent/10 disabled:opacity-50"
            >
              {snsRuntime?.daemon_running ? t("pulse.snsStopDaemon") : t("pulse.snsStartDaemon")}
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <StatCell label={t("pulse.snsDaemonStatus")} value={snsRuntime?.daemon_running ? t("pulse.running") : t("pulse.idle")} />
            <StatCell label={t("pulse.snsLastCheck")} value={fmt(snsRuntime?.last_check_at)} />
            <StatCell label={t("pulse.snsLastRun")} value={fmt(snsRuntime?.last_run_at)} />
          </div>
          {snsRuntime?.last_error && (
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {snsRuntime.last_error}
            </div>
          )}
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-text-muted">IG_APP_ID</span>
              <input
                value={igAppId}
                onChange={(e) => setIgAppId(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-text-muted">IG_USER_ID</span>
              <input
                value={igUserId}
                onChange={(e) => setIgUserId(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-text-muted">IG_ACCESS_TOKEN</span>
              <input
                type="password"
                value={igAccessToken}
                onChange={(e) => setIgAccessToken(e.target.value)}
                placeholder={snsConfig?.has_access_token ? t("pulse.secretSaved") : ""}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-text-muted">IG_POST_TIMES</span>
              <input
                value={igPostTimes}
                onChange={(e) => setIgPostTimes(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-text-muted">IG_REELS_PER_DAY</span>
              <input
                type="number"
                min={1}
                max={24}
                value={igReelsPerDay}
                onChange={(e) => setIgReelsPerDay(Number(e.target.value) || 1)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-text-muted">IG_TIMEZONE</span>
              <input
                value={igTimezone}
                onChange={(e) => setIgTimezone(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-text-muted">IG_POLL_SEC</span>
              <input
                type="number"
                min={10}
                max={3600}
                value={igPollSec}
                onChange={(e) => setIgPollSec(Number(e.target.value) || 10)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-text-muted">IG_GRAPH_VERSION</span>
              <input
                value={igGraphVersion}
                onChange={(e) => setIgGraphVersion(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-text-muted">IG_MEDIA_PORT</span>
              <input
                type="number"
                min={1}
                max={65535}
                value={igMediaPort}
                onChange={(e) => setIgMediaPort(Number(e.target.value) || 1)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-text-muted">IG_MEDIA_PUBLIC_BASE_URL</span>
              <input
                value={igMediaPublicBaseUrl}
                onChange={(e) => setIgMediaPublicBaseUrl(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-text-muted">MINIO_PUBLIC_ENDPOINT</span>
              <input
                value={igMinioPublicEndpoint}
                onChange={(e) => setIgMinioPublicEndpoint(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-border/70 bg-surface/60 px-3 py-2 text-sm">
              <input type="checkbox" checked={igDryRun} onChange={(e) => setIgDryRun(e.target.checked)} />
              <span>IG_DRY_RUN</span>
            </label>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-text-muted">{snsConfig?.has_access_token ? t("pulse.secretSaved") : t("pulse.secretMissing")}</p>
            <button
              type="button"
              onClick={() => void saveSnsConfig()}
              disabled={saving || !rootReady}
              className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground disabled:opacity-50"
            >
              {saving ? t("common.saving") : t("pulse.save")}
            </button>
          </div>
          {snsIssues.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {snsIssues.join(" · ")}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-data text-emerald-300">
              {t("pulse.snsPosted")} {snsStats?.posted ?? 0}
            </span>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-data text-amber-300">
              {t("pulse.snsFailed")} {snsStats?.failed ?? 0}
            </span>
            <span className="rounded-full border border-border/70 bg-surface px-3 py-1 text-[11px] font-data text-text-muted">
              {t("pulse.snsQueue")} {snsStats?.total ?? 0}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {snsPosts.length === 0 && (
              <p className="text-sm text-text-muted">
                {status?.payload.sns?.configured ? t("pulse.snsDeliveryEmpty") : t("pulse.snsDeliverySetup")}
              </p>
            )}
            {snsPosts.slice(0, 6).map((post) => (
              <SnsDeliveryRow
                key={`${post.bundle_id}-${post.kind}`}
                post={post}
                bundle={bundleById.get(post.bundle_id)}
                t={t}
              />
            ))}
          </div>
        </div>

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

      <section id="pulse-cards" className="td-panel p-6 scroll-mt-24">
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

      <section id="pulse-bundles" className="td-panel p-6 scroll-mt-24">
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

function QuickPulseMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "cyan" | "emerald" | "violet" | "amber";
}) {
  const toneClass = {
    cyan: "border-[var(--cyber-cyan)]/30 bg-[var(--cyber-cyan-dim)]/10 text-[var(--cyber-cyan)]",
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    violet: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  }[tone];

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-[11px] font-data uppercase tracking-[0.12em] opacity-80">{label}</p>
      <strong className="mt-2 block text-2xl font-semibold">{value}</strong>
    </div>
  );
}

function StatusAlert({
  title,
  message,
  tone,
}: {
  title: string;
  message: string;
  tone: "amber" | "danger";
}) {
  const className =
    tone === "danger"
      ? "border-danger/30 bg-danger/10 text-danger-text"
      : "border-amber-500/30 bg-amber-500/10 text-amber-100";

  return (
    <article className={`rounded-xl border px-4 py-3 ${className}`}>
      <p className="text-[11px] font-data uppercase tracking-[0.12em] opacity-80">{title}</p>
      <p className="mt-2 text-sm whitespace-pre-wrap break-words">{message}</p>
    </article>
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

function SnsDeliveryRow({
  post,
  bundle,
  t,
}: {
  post: {
    bundle_id: string;
    kind: string;
    ig_media_id?: string | null;
    posted_at?: string | null;
    error?: string | null;
  };
  bundle?: DevPulseBundleArtifact;
  t: (key: string) => string;
}) {
  const state = post.ig_media_id ? "posted" : post.error ? "failed" : "pending";
  const badgeClass =
    state === "posted"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : state === "failed"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
        : "border-border/70 bg-surface text-text-muted";

  return (
    <article className="rounded-xl border border-border/70 bg-surface/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate font-display text-base text-text">{post.bundle_id}</h4>
          <p className="mt-1 text-sm text-text-muted">
            {post.kind} · {fmt(post.posted_at)}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {post.ig_media_id ? `IG ${post.ig_media_id}` : post.error || t("pulse.snsPending")}
          </p>
        </div>
        <div className={`rounded-full border px-2.5 py-1 text-[11px] font-data ${badgeClass}`}>
          {state === "posted"
            ? t("pulse.snsPosted")
            : state === "failed"
              ? t("pulse.snsFailed")
              : t("pulse.snsPending")}
        </div>
      </div>
      {bundle && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {bundle.video_url && (
            <a
              className="rounded-lg border border-border px-2 py-1 text-text-muted hover:border-[var(--cyber-cyan)]"
              href={toAssetUrl(bundle.video_url) ?? undefined}
              target="_blank"
              rel="noreferrer"
            >
              {t("pulse.openVideo")}
            </a>
          )}
          {bundle.json_url && (
            <a
              className="rounded-lg border border-border px-2 py-1 text-text-muted hover:border-[var(--cyber-cyan)]"
              href={toAssetUrl(bundle.json_url) ?? undefined}
              target="_blank"
              rel="noreferrer"
            >
              {t("pulse.openJson")}
            </a>
          )}
          {bundle.caption_url && (
            <a
              className="rounded-lg border border-border px-2 py-1 text-text-muted hover:border-[var(--cyber-cyan)]"
              href={toAssetUrl(bundle.caption_url) ?? undefined}
              target="_blank"
              rel="noreferrer"
            >
              {t("pulse.openCaption")}
            </a>
          )}
        </div>
      )}
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
