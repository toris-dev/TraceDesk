import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  getActivityBundle,
  getAvailableDates,
  getSettings,
  subscribeActivityEvents,
  subscribeMenuEvents,
  upsertActivityEvent,
  type ActivityItem,
  type AppSettings,
  type DailyStatistics,
  type ExportResult,
  type FullTimelineItem,
  type ActionHourlyPoint,
  type ApplicationUsage,
  type HourlyActivity,
  type IdleAnalysis,
  type ProductivityAnalysis,
  type WeeklyReport,
} from "./api/client";
import { ActionHistoryPanel, isActionEvent } from "./components/ActionHistoryPanel";
import { ActivityToolbar } from "./components/ActivityToolbar";
import { PermissionBanner } from "./components/PermissionBanner";
import { TimelineGantt } from "./components/TimelineGantt";
import { TimelineView } from "./components/TimelineView";
import { SettingsPanel } from "./components/SettingsPanel";
import { MascotAssistant } from "./components/MascotAssistant";
import { MascotScene } from "./components/mascot";
import { SetupWizard } from "./components/SetupWizard";
import { ThemeToggle } from "./components/ThemeToggle";
import {
  DashboardLayout,
  isActivityPage,
  isDashboardPage,
  type DashboardPage,
} from "./layout/DashboardLayout";
import { OverviewView } from "./views/OverviewView";
import { ActivityJournalView } from "./views/ActivityJournalView";
import { I18nProvider, normalizeLocale, useI18n, type Locale } from "./i18n";
import { ThemeProvider, normalizeTheme, type Theme } from "./theme";
import { formatDate, isToday, todayISO } from "./utils/date";
import { filterJournalEvents, isJournalEvent } from "./utils/activityFeed";

const AnalyticsView = lazy(() =>
  import("./views/AnalyticsView").then((m) => ({ default: m.AnalyticsView })),
);
const SystemMonitor = lazy(() =>
  import("./components/SystemMonitor").then((m) => ({ default: m.SystemMonitor })),
);

const REFRESH_INTERVAL = 60_000;

function initialLocale(): Locale {
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("ko")) {
    return "ko";
  }
  return "en";
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [theme, setTheme] = useState<Theme>("dark");
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setLocale(normalizeLocale(s.locale));
        setTheme(normalizeTheme(s.theme));
        setAppSettings(s);
      })
      .catch(() => setAppSettings(null))
      .finally(() => setBooting(false));
  }, []);

  if (booting || appSettings === null) {
    return (
      <ThemeProvider theme={theme} setTheme={setTheme}>
        <I18nProvider locale={locale} setLocale={setLocale}>
          <MascotScene
            mood="loading"
            title={locale === "en" ? "Starting TraceDesk" : "TraceDesk 시작 중"}
            description={locale === "en" ? "Getting things ready…" : "거북이가 준비하고 있어요..."}
            size="xl"
          />
        </I18nProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme} setTheme={setTheme}>
      <I18nProvider locale={locale} setLocale={setLocale}>
        <AppContent
          appSettings={appSettings}
          onSettingsChange={(s) => {
            setAppSettings(s);
            setLocale(normalizeLocale(s.locale));
            setTheme(normalizeTheme(s.theme));
          }}
        />
      </I18nProvider>
    </ThemeProvider>
  );
}

function AppContent({
  appSettings,
  onSettingsChange,
}: {
  appSettings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}) {
  const { locale, t } = useI18n();
  const [page, setPage] = useState<DashboardPage>("journal");
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [stats, setStats] = useState<DailyStatistics | null>(null);
  const [applications, setApplications] = useState<ApplicationUsage[]>([]);
  const [fullTimeline, setFullTimeline] = useState<FullTimelineItem[]>([]);
  const [idleAnalysis, setIdleAnalysis] = useState<IdleAnalysis | null>(null);
  const [actionHourly, setActionHourly] = useState<ActionHourlyPoint[]>([]);
  const [hourly, setHourly] = useState<HourlyActivity[]>([]);
  const [actionEvents, setActionEvents] = useState<ActivityItem[]>([]);
  const [activityEvents, setActivityEvents] = useState<ActivityItem[]>([]);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [productivity, setProductivity] = useState<ProductivityAnalysis | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [timelineMode, setTimelineMode] = useState<"gantt" | "list">("gantt");
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const loadAvailableDates = useCallback(async () => {
    try {
      const rows = await getAvailableDates();
      setAvailableDates(rows.map((r) => r.date));
    } catch {
      /* ignore */
    }
  }, []);

  const loadData = useCallback(
    async (date: string, silent = false) => {
      if (!silent) setLoading(true);
      try {
        const bundle = await getActivityBundle(date);

        setStats(bundle.stats);
        setApplications(bundle.applications);
        setFullTimeline(bundle.timeline);
        setIdleAnalysis(bundle.idle);
        setActionHourly(bundle.action_hourly);
        setHourly(bundle.hourly);
        setActionEvents(
          bundle.events
            .filter((e) => isActionEvent(e.type))
            .slice(-50)
            .reverse(),
        );
        setActivityEvents(filterJournalEvents(bundle.events));
        setProductivity(bundle.productivity);
        setWeeklyReport(bundle.weekly);
        setConnected(true);
        setError(null);
      } catch (e) {
        setConnected(false);
        setError(typeof e === "string" ? e : t("app.loadErrorDefault"));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [t],
  );

  const handleExportDone = useCallback(
    (result: ExportResult) => {
      if (!result.saved) return;
      const name = result.path?.split(/[/\\]/).pop() ?? "file";
      setExportNotice(t("app.exportSaved", { name, count: result.row_count }));
      window.setTimeout(() => setExportNotice(null), 4000);
    },
    [t],
  );

  useEffect(() => {
    loadAvailableDates();
  }, [loadAvailableDates]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    subscribeMenuEvents({
      onNavigate: (p) => {
        if (isDashboardPage(p)) setPage(p);
      },
      onRefresh: () => {
        if (isActivityPage(page)) loadData(selectedDate);
      },
      onGoToday: () => {
        setSelectedDate(todayISO());
        setPage("journal");
      },
      onExportDone: handleExportDone,
      onError: (message) => setExportNotice(message),
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});

    return () => {
      unlisten?.();
    };
  }, [page, selectedDate, loadData, handleExportDone]);

  useEffect(() => {
    if (!isActivityPage(page)) return;
    loadData(selectedDate);
    setSelectedHour(null);
  }, [selectedDate, page, loadData]);

  useEffect(() => {
    if (!isActivityPage(page) || !isToday(selectedDate)) return;
    const id = setInterval(() => {
      loadData(selectedDate, true);
      loadAvailableDates();
    }, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [selectedDate, page, loadData, loadAvailableDates]);

  useEffect(() => {
    if (!isActivityPage(page) || !isToday(selectedDate)) return;

    let unlisten: (() => void) | undefined;
    subscribeActivityEvents((item) => {
      if (!isJournalEvent(item.type) && !isActionEvent(item.type)) return;
      if (isJournalEvent(item.type)) {
        setActivityEvents((prev) => {
          const result = upsertActivityEvent(prev, item);
          return result.events.slice(0, 200);
        });
      }
      if (!isActionEvent(item.type)) return;
      let isNew = false;
      setActionEvents((prev) => {
        const result = upsertActivityEvent(prev, item);
        isNew = result.isNew;
        return result.events.slice(0, 50);
      });
      if (!isNew) return;
      setStats((prev) => {
        if (!prev) return prev;
        if (item.type === "COPY") return { ...prev, copy: prev.copy + 1 };
        if (item.type === "PASTE") return { ...prev, paste: prev.paste + 1 };
        if (item.type === "SCREENSHOT") return { ...prev, screenshot: prev.screenshot + 1 };
        return prev;
      });
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});

    return () => {
      unlisten?.();
    };
  }, [page, selectedDate]);

  const viewingToday = isToday(selectedDate);
  const dateLabel = viewingToday
    ? t("common.today")
    : formatDate(selectedDate, locale, true);
  const hasActivity =
    stats &&
    (stats.active > 0 ||
      stats.copy > 0 ||
      stats.paste > 0 ||
      stats.screenshot > 0 ||
      applications.length > 0 ||
      actionEvents.length > 0);

  const listSegments = useMemo(
    () =>
      fullTimeline
        .filter((i) => i.kind === "app" && i.duration)
        .map((i) => ({
          application: i.label,
          start: i.start,
          end: i.end ?? i.start,
          duration: i.duration ?? 0,
        })),
    [fullTimeline],
  );

  const mascotTab =
    page === "system" ? "system" : page === "settings" ? "settings" : "activity";

  const activityToolbar = isActivityPage(page) ? (
    <ActivityToolbar
      selectedDate={selectedDate}
      onChange={setSelectedDate}
      availableDates={availableDates}
      onExportDone={handleExportDone}
    />
  ) : undefined;

  const renderActivityContent = () => {
    if (loading) {
      return (
        <MascotScene
          mood="loading"
          title={t("app.loadingActivity")}
          description={t("app.loadingActivityDesc")}
        />
      );
    }

    if (error) {
      return (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 p-8">
          <MascotScene
            mood="confused"
            title={t("app.loadError")}
            description={error}
            size="md"
          />
        </div>
      );
    }

    if (!stats) return null;

    if (!hasActivity && page === "overview") {
      return (
        <div className="space-y-6 max-w-[1400px]">
          <div className="rounded-2xl border border-border bg-surface-elevated overflow-hidden">
            <MascotScene
              mood="sleeping"
              title={t("app.noRecordTitle", {
                date: formatDate(selectedDate, locale),
              })}
              description={t("app.noRecordDesc")}
              action={
                !viewingToday ? (
                  <button
                    type="button"
                    onClick={() => setSelectedDate(todayISO())}
                    className="text-sm px-4 py-2 rounded-lg bg-accent text-accent-foreground hover:bg-accent/90"
                  >
                    {t("app.goToday")}
                  </button>
                ) : undefined
              }
            />
          </div>
          <ActionHistoryPanel
            events={actionEvents}
            viewingToday={viewingToday}
            dateLabel={dateLabel}
          />
        </div>
      );
    }

    switch (page) {
      case "journal":
        return (
          <ActivityJournalView
            stats={stats}
            activityEvents={activityEvents}
            fullTimeline={fullTimeline}
            dateLabel={dateLabel}
            viewingToday={viewingToday}
            selectedHour={selectedHour}
            onHourSelect={setSelectedHour}
          />
        );

      case "overview":
        return (
          <OverviewView
            stats={stats}
            productivity={productivity}
            actionEvents={actionEvents}
            actionHourly={actionHourly}
            hourly={hourly}
            fullTimeline={fullTimeline}
            viewingToday={viewingToday}
            dateLabel={dateLabel}
            onNavigate={setPage}
          />
        );

      case "actions":
        return (
          <div className="max-w-4xl">
            <ActionHistoryPanel
              events={actionEvents}
              viewingToday={viewingToday}
              dateLabel={dateLabel}
            />
          </div>
        );

      case "timeline":
        return (
          <section className="rounded-2xl border border-border bg-surface-elevated p-6 max-w-[1400px]">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div>
                <h3 className="text-lg font-semibold">{t("app.timelineTitle")}</h3>
                <p className="text-sm text-text-muted">
                  {t("app.timelineSubtitle", { date: dateLabel })}
                </p>
              </div>
              <div className="flex rounded-xl border border-border overflow-hidden text-sm">
                <button
                  type="button"
                  onClick={() => setTimelineMode("gantt")}
                  className={`px-4 py-2 ${timelineMode === "gantt" ? "bg-accent text-accent-foreground" : "text-text-muted hover:bg-surface"}`}
                >
                  {t("app.gantt")}
                </button>
                <button
                  type="button"
                  onClick={() => setTimelineMode("list")}
                  className={`px-4 py-2 ${timelineMode === "list" ? "bg-accent text-accent-foreground" : "text-text-muted hover:bg-surface"}`}
                >
                  {t("app.list")}
                </button>
              </div>
            </div>
            {timelineMode === "gantt" ? (
              <TimelineGantt
                items={fullTimeline}
                selectedHour={selectedHour}
                onHourSelect={setSelectedHour}
                interactive
              />
            ) : (
              <TimelineView segments={listSegments} />
            )}
          </section>
        );

      case "analytics":
        return (
          <Suspense
            fallback={
              <MascotScene mood="loading" title={t("app.loadingAnalytics")} size="md" />
            }
          >
            <AnalyticsView
              productivity={productivity}
              weeklyReport={weeklyReport}
              hourly={hourly}
              actionHourly={actionHourly}
              applications={applications}
              idleAnalysis={idleAnalysis}
            />
          </Suspense>
        );

      default:
        return null;
    }
  };

  return (
    <>
      {!appSettings.setup_completed && (
        <SetupWizard
          onComplete={(s) => {
            onSettingsChange(s);
          }}
        />
      )}

      <DashboardLayout
        page={page}
        onPageChange={setPage}
        connected={connected}
        subtitle={
          isActivityPage(page)
            ? formatDate(selectedDate, locale)
            : formatDate(todayISO(), locale)
        }
        actionBadge={stats ? stats.copy + stats.paste + stats.screenshot : actionEvents.length}
        toolbar={activityToolbar}
        themeToggle={
          <ThemeToggle
            onSettingsChange={onSettingsChange}
            disabled={loading && isActivityPage(page)}
          />
        }
        onRefresh={isActivityPage(page) ? () => loadData(selectedDate) : undefined}
        refreshing={loading}
      >
        <PermissionBanner />

        {exportNotice && (
          <div className="mb-4 rounded-lg border border-success/30 bg-success/10 px-4 py-2 text-sm text-success-text">
            {exportNotice}
          </div>
        )}

        {page === "system" && (
          <Suspense fallback={<MascotScene mood="loading" title={t("app.loadingSystem")} size="md" />}>
            <SystemMonitor connected={connected && !error} />
          </Suspense>
        )}

        {page === "settings" && <SettingsPanel onSettingsChange={onSettingsChange} />}

        {isActivityPage(page) && renderActivityContent()}
      </DashboardLayout>

      <MascotAssistant
        loading={loading && isActivityPage(page)}
        error={error}
        connected={connected}
        hasActivity={!!hasActivity}
        productivityScore={productivity?.score}
        activeTab={mascotTab}
        setupCompleted={appSettings.setup_completed}
      />
    </>
  );
}
