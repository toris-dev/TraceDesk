import type {
  ActivityItem,
  DailyStatistics,
  FullTimelineItem,
} from "../api/client";
import { formatDuration } from "../api/client";
import { ActivityFeed } from "../components/ActivityFeed";
import { TimelineGantt } from "../components/TimelineGantt";

interface Props {
  stats: DailyStatistics;
  activityEvents: ActivityItem[];
  fullTimeline: FullTimelineItem[];
  dateLabel: string;
  viewingToday: boolean;
  selectedHour: number | null;
  onHourSelect: (hour: number | null) => void;
}

export function ActivityJournalView({
  stats,
  activityEvents,
  fullTimeline,
  dateLabel,
  viewingToday,
  selectedHour,
  onHourSelect,
}: Props) {
  const actionTotal = stats.copy + stats.paste + stats.screenshot;

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="rounded-2xl border border-border bg-gradient-to-br from-accent/10 via-surface-elevated to-surface p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-text-muted flex items-center gap-2">
              {viewingToday && (
                <span className="inline-flex items-center gap-1.5 text-success-text/90 text-xs">
                  <span className="size-2 rounded-full bg-success animate-pulse" />
                  기록 중
                </span>
              )}
              {dateLabel} 활동 일지
            </p>
            <p className="text-3xl font-bold mt-2 text-text">{formatDuration(stats.active)}</p>
            <p className="text-sm text-text-muted mt-1">
              앱 {activityEvents.filter((e) => e.type === "WINDOW_FOCUS").length}건 ·
              행동 {actionTotal}건 · 유휴 {formatDuration(stats.idle)}
            </p>
          </div>
          {stats.top_application && (
            <div className="rounded-xl border border-border bg-surface/60 px-4 py-3">
              <p className="text-xs text-text-muted">주요 앱</p>
              <p className="font-semibold mt-0.5 truncate max-w-[180px] text-text">
                {stats.top_application}
              </p>
            </div>
          )}
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-surface-elevated p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-semibold text-text">하루 타임라인</h3>
            <p className="text-sm text-text-muted">
              시간대를 클릭하면 해당 구간 기록만 필터됩니다
            </p>
          </div>
          {selectedHour != null && (
            <button
              type="button"
              onClick={() => onHourSelect(null)}
              className="text-sm text-accent hover:underline"
            >
              전체 시간 보기
            </button>
          )}
        </div>
        <TimelineGantt
          items={fullTimeline}
          selectedHour={selectedHour}
          onHourSelect={onHourSelect}
          interactive
        />
      </section>

      <ActivityFeed
        events={activityEvents}
        dateLabel={dateLabel}
        selectedHour={selectedHour}
        onClearHour={() => onHourSelect(null)}
      />
    </div>
  );
}
