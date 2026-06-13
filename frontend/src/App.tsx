import { useCallback, useEffect, useState } from "react";
import {
  getActionHourly,
  getActivityToday,
  getApplications,
  getAvailableDates,
  getDailyStatistics,
  getHourlyActivity,
  getIdleAnalysis,
  getProductivityAnalysis,
  getTimelineFull,
  getWeeklyReport,
  getSettings,
  subscribeActivityEvents,
  upsertActivityEvent,
  type ActionHourlyPoint,
  type ActivityItem,
  type ApplicationUsage,
  type AppSettings,
  type DailyStatistics,
  type FullTimelineItem,
  type HourlyActivity,
  type IdleAnalysis,
  type ProductivityAnalysis,
  type WeeklyReport,
} from "./api/client";
import { ActionHistoryPanel, isActionEvent } from "./components/ActionHistoryPanel";
import { ActionChart } from "./components/ActionChart";
import { ActivityGraph } from "./components/ActivityGraph";
import { AppUsageChart } from "./components/AppUsageChart";
import { DateSelector } from "./components/DateSelector";
import { PermissionBanner } from "./components/PermissionBanner";
import { ProductivityPanel, WeeklyReportPanel } from "./components/ProductivityPanel";
import { IdleAnalysisPanel, TimelineGantt } from "./components/TimelineGantt";
import { TimelineView } from "./components/TimelineView";
import { SystemMonitor } from "./components/SystemMonitor";
import { SettingsPanel } from "./components/SettingsPanel";
import { MascotAssistant } from "./components/MascotAssistant";
import { MascotScene } from "./components/mascot";
import { SetupWizard } from "./components/SetupWizard";
import {
  DashboardLayout,
  isActivityPage,
  type DashboardPage,
} from "./layout/DashboardLayout";
import { OverviewView } from "./views/OverviewView";
import { formatDateKo, isToday, todayISO } from "./utils/date";

const REFRESH_INTERVAL = 30_000;

export default function App() {
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [page, setPage] = useState<DashboardPage>("overview");
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [stats, setStats] = useState<DailyStatistics | null>(null);
  const [applications, setApplications] = useState<ApplicationUsage[]>([]);
  const [fullTimeline, setFullTimeline] = useState<FullTimelineItem[]>([]);
  const [idleAnalysis, setIdleAnalysis] = useState<IdleAnalysis | null>(null);
  const [actionHourly, setActionHourly] = useState<ActionHourlyPoint[]>([]);
  const [hourly, setHourly] = useState<HourlyActivity[]>([]);
  const [actionEvents, setActionEvents] = useState<ActivityItem[]>([]);
  const [productivity, setProductivity] = useState<ProductivityAnalysis | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [timelineMode, setTimelineMode] = useState<"gantt" | "list">("gantt");

  useEffect(() => {
    getSettings()
      .then(setAppSettings)
      .catch(() => setAppSettings(null));
  }, []);

  const loadAvailableDates = useCallback(async () => {
    try {
      const rows = await getAvailableDates();
      setAvailableDates(rows.map((r) => r.date));
    } catch {
      /* ignore */
    }
  }, []);

  const loadData = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const [
        statsData,
        appsData,
        timelineData,
        idleData,
        actionsData,
        hourlyData,
        eventsData,
        productivityData,
        weeklyData,
      ] = await Promise.all([
        getDailyStatistics(date),
        getApplications(date),
        getTimelineFull(date),
        getIdleAnalysis(date),
        getActionHourly(date),
        getHourlyActivity(date),
        getActivityToday(date),
        getProductivityAnalysis(date),
        getWeeklyReport(date),
      ]);

      setStats(statsData);
      setApplications(appsData.applications);
      setFullTimeline(timelineData.items);
      setIdleAnalysis(idleData);
      setActionHourly(actionsData.hourly);
      setHourly(hourlyData.hourly);
      setActionEvents(
        eventsData
          .filter((e) => isActionEvent(e.type))
          .slice(-50)
          .reverse(),
      );
      setProductivity(productivityData);
      setWeeklyReport(weeklyData);
      setConnected(true);
      setError(null);
    } catch (e) {
      setConnected(false);
      setError(
        typeof e === "string"
          ? e
          : "TraceDesk 데이터를 불러올 수 없습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAvailableDates();
  }, [loadAvailableDates]);

  useEffect(() => {
    if (!isActivityPage(page)) return;
    loadData(selectedDate);
  }, [selectedDate, page, loadData]);

  useEffect(() => {
    if (!isActivityPage(page) || !isToday(selectedDate)) return;
    const id = setInterval(() => {
      loadData(selectedDate);
      loadAvailableDates();
    }, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [selectedDate, page, loadData, loadAvailableDates]);

  useEffect(() => {
    if (!isActivityPage(page) || !isToday(selectedDate)) return;

    let unlisten: (() => void) | undefined;
    subscribeActivityEvents((item) => {
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
  const dateLabel = viewingToday ? "오늘" : formatDateKo(selectedDate, true);
  const hasActivity =
    stats &&
    (stats.active > 0 ||
      stats.copy > 0 ||
      stats.paste > 0 ||
      stats.screenshot > 0 ||
      applications.length > 0 ||
      actionEvents.length > 0);

  const listSegments = fullTimeline
    .filter((i) => i.kind === "app" && i.duration)
    .map((i) => ({
      application: i.label,
      start: i.start,
      end: i.end ?? i.start,
      duration: i.duration ?? 0,
    }));

  const mascotTab =
    page === "system" ? "system" : page === "settings" ? "settings" : "activity";

  if (appSettings === null) {
    return (
      <MascotScene
        mood="loading"
        title="TraceDesk 시작 중"
        description="거북이가 준비하고 있어요..."
        size="xl"
      />
    );
  }

  const activityToolbar = isActivityPage(page) ? (
    <DateSelector
      selectedDate={selectedDate}
      onChange={setSelectedDate}
      availableDates={availableDates}
    />
  ) : undefined;

  const renderActivityContent = () => {
    if (loading) {
      return (
        <MascotScene
          mood="loading"
          title="활동 데이터 불러오는 중"
          description="오늘의 기록을 정리하고 있어요"
        />
      );
    }

    if (error) {
      return (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8">
          <MascotScene
            mood="confused"
            title="데이터를 불러오지 못했어요"
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
              title={`${formatDateKo(selectedDate)} — 기록 없음`}
              description="TraceDesk가 실행 중일 때 활동이 기록됩니다. 설정에서 입력 모니터링을 확인하세요."
              action={
                !viewingToday ? (
                  <button
                    type="button"
                    onClick={() => setSelectedDate(todayISO())}
                    className="text-sm px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent/90"
                  >
                    오늘로 이동
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
                <h3 className="text-lg font-semibold">타임라인</h3>
                <p className="text-sm text-text-muted">{dateLabel} 앱 사용 · 행동 마커</p>
              </div>
              <div className="flex rounded-xl border border-border overflow-hidden text-sm">
                <button
                  type="button"
                  onClick={() => setTimelineMode("gantt")}
                  className={`px-4 py-2 ${timelineMode === "gantt" ? "bg-accent text-white" : "text-text-muted hover:bg-surface"}`}
                >
                  Gantt
                </button>
                <button
                  type="button"
                  onClick={() => setTimelineMode("list")}
                  className={`px-4 py-2 ${timelineMode === "list" ? "bg-accent text-white" : "text-text-muted hover:bg-surface"}`}
                >
                  목록
                </button>
              </div>
            </div>
            {timelineMode === "gantt" ? (
              <TimelineGantt items={fullTimeline} />
            ) : (
              <TimelineView segments={listSegments} />
            )}
          </section>
        );

      case "analytics":
        return (
          <div className="space-y-6 max-w-[1400px]">
            <div className="grid lg:grid-cols-2 gap-6">
              <section className="rounded-2xl border border-border bg-surface-elevated p-6">
                <h3 className="text-lg font-semibold mb-4">생산성 분석</h3>
                {productivity && <ProductivityPanel analysis={productivity} />}
              </section>
              <section className="rounded-2xl border border-border bg-surface-elevated p-6">
                <h3 className="text-lg font-semibold mb-4">주간 리포트</h3>
                {weeklyReport && <WeeklyReportPanel report={weeklyReport} />}
              </section>
            </div>
            <div className="grid lg:grid-cols-2 gap-6">
              <section className="rounded-2xl border border-border bg-surface-elevated p-6">
                <h3 className="text-lg font-semibold mb-4">시간별 집중도</h3>
                <ActivityGraph data={hourly} />
              </section>
              <section className="rounded-2xl border border-border bg-surface-elevated p-6">
                <h3 className="text-lg font-semibold mb-4">시간별 행동</h3>
                <ActionChart data={actionHourly} />
              </section>
            </div>
            <div className="grid lg:grid-cols-2 gap-6">
              <section className="rounded-2xl border border-border bg-surface-elevated p-6">
                <h3 className="text-lg font-semibold mb-4">앱 사용 통계</h3>
                <AppUsageChart data={applications} />
              </section>
              <section className="rounded-2xl border border-border bg-surface-elevated p-6">
                <h3 className="text-lg font-semibold mb-4">유휴 분석</h3>
                {idleAnalysis && <IdleAnalysisPanel analysis={idleAnalysis} />}
              </section>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      {!appSettings.setup_completed && (
        <SetupWizard onComplete={setAppSettings} />
      )}

      <DashboardLayout
        page={page}
        onPageChange={setPage}
        connected={connected}
        subtitle={isActivityPage(page) ? formatDateKo(selectedDate) : formatDateKo(todayISO())}
        actionBadge={stats ? stats.copy + stats.paste + stats.screenshot : actionEvents.length}
        toolbar={activityToolbar}
        onRefresh={isActivityPage(page) ? () => loadData(selectedDate) : undefined}
        refreshing={loading}
      >
        <PermissionBanner />

        {page === "system" && <SystemMonitor connected={connected && !error} />}

        {page === "settings" && <SettingsPanel />}

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
