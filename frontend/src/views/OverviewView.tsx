import { formatDuration } from "../api/client";
import type {
  ActionHourlyPoint,
  ActivityItem,
  DailyStatistics,
  FullTimelineItem,
  HourlyActivity,
  ProductivityAnalysis,
} from "../api/client";
import { ActionChart } from "../components/ActionChart";
import { ActionHistoryPanel } from "../components/ActionHistoryPanel";
import { ActivityGraph } from "../components/ActivityGraph";
import { ProductivityPanel } from "../components/ProductivityPanel";
import { TimelineGantt } from "../components/TimelineGantt";
import type { DashboardPage } from "../layout/DashboardLayout";

interface Props {
  stats: DailyStatistics;
  productivity: ProductivityAnalysis | null;
  actionEvents: ActivityItem[];
  actionHourly: ActionHourlyPoint[];
  hourly: HourlyActivity[];
  fullTimeline: FullTimelineItem[];
  viewingToday: boolean;
  dateLabel: string;
  onNavigate: (page: DashboardPage) => void;
}

function KpiCard({
  label,
  value,
  accent,
  onClick,
}: {
  label: string;
  value: string;
  accent: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-2xl border border-border bg-surface-elevated p-5 text-left transition-all hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5 active:scale-[0.98]"
    >
      <p className="text-sm text-text-muted mb-2">{label}</p>
      <p className="text-3xl font-bold tracking-tight" style={{ color: accent }}>
        {value}
      </p>
      {onClick && (
        <p className="text-[11px] text-text-muted mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
          클릭하여 자세히 →
        </p>
      )}
    </button>
  );
}

export function OverviewView({
  stats,
  productivity,
  actionEvents,
  actionHourly,
  hourly,
  fullTimeline,
  viewingToday,
  dateLabel,
  onNavigate,
}: Props) {
  const totalMinutes = 24 * 60;
  const activePct = Math.min((stats.active / totalMinutes) * 100, 100);

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="rounded-2xl border border-border bg-gradient-to-br from-surface-elevated to-surface p-6 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-sm text-text-muted">{dateLabel} 활동 요약</p>
            <p className="text-4xl font-bold mt-1">{formatDuration(stats.active)}</p>
            <p className="text-sm text-text-muted mt-1">
              하루 대비 {activePct.toFixed(1)}% 활동 · 유휴 {formatDuration(stats.idle)}
            </p>
          </div>
          {stats.top_application && (
            <div className="rounded-xl bg-surface/80 border border-border px-4 py-3">
              <p className="text-xs text-text-muted">가장 많이 사용</p>
              <p className="font-semibold mt-0.5 truncate max-w-[200px]">
                {stats.top_application}
              </p>
            </div>
          )}
        </div>
        <div className="h-2 rounded-full bg-border overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-emerald-500 transition-all duration-700"
            style={{ width: `${activePct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          label="활동"
          value={formatDuration(stats.active)}
          accent="#6366f1"
          onClick={() => onNavigate("analytics")}
        />
        <KpiCard
          label="복사"
          value={`${stats.copy}`}
          accent="#22c55e"
          onClick={() => onNavigate("actions")}
        />
        <KpiCard
          label="붙여넣기"
          value={`${stats.paste}`}
          accent="#f59e0b"
          onClick={() => onNavigate("actions")}
        />
        <KpiCard
          label="캡처"
          value={`${stats.screenshot}`}
          accent="#ef4444"
          onClick={() => onNavigate("actions")}
        />
        <KpiCard
          label="유휴"
          value={formatDuration(stats.idle)}
          accent="#94a3b8"
          onClick={() => onNavigate("analytics")}
        />
      </div>

      <div className="grid xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <ActionHistoryPanel
            events={actionEvents.slice(0, 8)}
            viewingToday={viewingToday}
            dateLabel={dateLabel}
          />
          {actionEvents.length > 8 && (
            <button
              type="button"
              onClick={() => onNavigate("actions")}
              className="mt-3 w-full rounded-xl border border-dashed border-border py-2.5 text-sm text-accent hover:bg-accent/5"
            >
              전체 {actionEvents.length}건 보기 →
            </button>
          )}
        </div>

        <section className="rounded-2xl border border-border bg-surface-elevated p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">생산성</h3>
            <button
              type="button"
              onClick={() => onNavigate("analytics")}
              className="text-xs text-accent hover:underline"
            >
              분석 보기
            </button>
          </div>
          {productivity ? (
            <ProductivityPanel analysis={productivity} />
          ) : (
            <p className="text-text-muted text-sm">데이터 없음</p>
          )}
        </section>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-border bg-surface-elevated p-6">
          <h3 className="font-semibold mb-4">시간별 집중도</h3>
          <ActivityGraph data={hourly} />
        </section>
        <section className="rounded-2xl border border-border bg-surface-elevated p-6">
          <h3 className="font-semibold mb-4">시간별 행동</h3>
          <ActionChart data={actionHourly} />
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-surface-elevated p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">오늘의 타임라인 미리보기</h3>
          <button
            type="button"
            onClick={() => onNavigate("timeline")}
            className="text-sm text-accent hover:underline"
          >
            전체 타임라인 →
          </button>
        </div>
        <TimelineGantt items={fullTimeline} />
      </section>
    </div>
  );
}
