import type { FullTimelineItem, IdleAnalysis } from "../api/client";
import { formatSeconds } from "../api/client";

interface Props {
  items: FullTimelineItem[];
  selectedHour?: number | null;
  onHourSelect?: (hour: number | null) => void;
  interactive?: boolean;
}

const APP_COLORS: Record<string, string> = {};
const PALETTE = [
  "#6366f1", "#22c55e", "#f59e0b", "#ef4444",
  "#06b6d4", "#ec4899", "#84cc16", "#a855f7",
];

function colorForApp(app: string): string {
  if (!APP_COLORS[app]) {
    APP_COLORS[app] = PALETTE[Object.keys(APP_COLORS).length % PALETTE.length];
  }
  return APP_COLORS[app];
}

function timeToSeconds(t: string): number {
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

const DAY_SECONDS = 24 * 3600;

export function TimelineGantt({
  items,
  selectedHour = null,
  onHourSelect,
  interactive = false,
}: Props) {
  const appItems = items.filter((i) => i.kind === "app" && i.duration);
  const markers = items.filter((i) => ["copy", "paste", "screenshot"].includes(i.kind));
  const idleItems = items.filter((i) => i.kind === "idle" && i.duration);

  if (appItems.length === 0 && markers.length === 0 && idleItems.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-text-muted">
        타임라인 데이터가 없습니다
      </div>
    );
  }

  const apps = [...new Set(appItems.map((i) => i.label))];

  const hourHighlight =
    selectedHour != null
      ? {
          left: `${(selectedHour / 24) * 100}%`,
          width: `${(1 / 24) * 100}%`,
        }
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="w-24 shrink-0" />
        <div className="flex-1 relative h-6">
          {[0, 6, 12, 18, 24].map((h) => (
            <span
              key={h}
              className="absolute text-xs text-text-muted font-mono -translate-x-1/2"
              style={{ left: `${(h / 24) * 100}%` }}
            >
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
        </div>
      </div>

      {interactive && onHourSelect && (
        <div className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-xs text-text-muted text-right">시간</span>
          <div className="flex-1 flex gap-px rounded-lg overflow-hidden border border-border">
            {Array.from({ length: 24 }, (_, hour) => (
              <button
                key={hour}
                type="button"
                title={`${String(hour).padStart(2, "0")}:00 – ${String(hour).padStart(2, "0")}:59`}
                onClick={() => onHourSelect(selectedHour === hour ? null : hour)}
                className={`flex-1 h-7 min-w-0 text-[9px] font-mono transition-colors ${
                  selectedHour === hour
                    ? "bg-accent text-accent-foreground"
                    : "bg-surface hover:bg-accent/20 text-text-muted"
                }`}
              >
                {hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      {apps.map((app) => {
        const segments = appItems.filter((i) => i.label === app);
        return (
          <div key={app} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs truncate text-right" title={app}>
              {app}
            </span>
            <div className="flex-1 relative h-7 bg-surface rounded-md border border-border overflow-hidden">
              {hourHighlight && (
                <div
                  className="absolute inset-y-0 bg-accent/10 pointer-events-none z-0"
                  style={hourHighlight}
                />
              )}
              {segments.map((seg, i) => {
                const startSec = timeToSeconds(seg.start);
                const duration = seg.duration ?? 0;
                const left = (startSec / DAY_SECONDS) * 100;
                const width = Math.max((duration / DAY_SECONDS) * 100, 0.3);
                return (
                  <div
                    key={i}
                    className="absolute top-0.5 bottom-0.5 rounded opacity-90 hover:opacity-100 transition-opacity cursor-default z-10"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      background: colorForApp(app),
                      minWidth: 2,
                    }}
                    title={`${seg.start} – ${seg.end ?? ""} (${formatSeconds(duration)})`}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {idleItems.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-xs text-text-muted text-right">유휴</span>
          <div className="flex-1 relative h-5 bg-surface rounded-md border border-border overflow-hidden">
            {hourHighlight && (
              <div
                className="absolute inset-y-0 bg-accent/10 pointer-events-none"
                style={hourHighlight}
              />
            )}
            {idleItems.map((seg, i) => {
              const startSec = timeToSeconds(seg.start);
              const duration = seg.duration ?? 0;
              const left = (startSec / DAY_SECONDS) * 100;
              const width = Math.max((duration / DAY_SECONDS) * 100, 0.2);
              return (
                <div
                  key={i}
                  className="absolute top-0.5 bottom-0.5 rounded bg-text-muted/25"
                  style={{ left: `${left}%`, width: `${width}%`, minWidth: 2 }}
                  title={`유휴 ${seg.start} – ${seg.end ?? ""}`}
                />
              );
            })}
          </div>
        </div>
      )}

      {markers.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-xs text-text-muted text-right">행동</span>
          <div className="flex-1 relative h-6">
            {hourHighlight && (
              <div
                className="absolute inset-y-0 bg-accent/10 pointer-events-none rounded"
                style={hourHighlight}
              />
            )}
            {markers.map((m, i) => {
              const pos = (timeToSeconds(m.start) / DAY_SECONDS) * 100;
              const color =
                m.kind === "copy" ? "#22c55e" :
                m.kind === "paste" ? "#f59e0b" : "#ef4444";
              return (
                <div
                  key={i}
                  className="absolute w-2.5 h-2.5 rounded-full -translate-x-1/2 top-1.5 ring-2 ring-surface-elevated"
                  style={{ left: `${pos}%`, background: color }}
                  title={`${m.label} ${m.start}`}
                />
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-4 text-xs text-text-muted pt-2 border-t border-border">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500" /> 복사
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> 붙여넣기
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" /> 스크린샷
        </span>
        {idleItems.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-2 rounded bg-text-muted/30" /> 유휴
          </span>
        )}
        {interactive && (
          <span className="text-accent/80">시간 칸을 클릭해 피드를 필터하세요</span>
        )}
      </div>
    </div>
  );
}

export function IdleAnalysisPanel({ analysis }: { analysis: IdleAnalysis }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-surface p-3 border border-border">
          <p className="text-text-muted text-xs">총 유휴 시간</p>
          <p className="text-lg font-semibold mt-0.5">
            {Math.floor(analysis.total_idle_minutes / 60)}h {analysis.total_idle_minutes % 60}m
          </p>
        </div>
        <div className="rounded-lg bg-surface p-3 border border-border">
          <p className="text-text-muted text-xs">유휴 세션</p>
          <p className="text-lg font-semibold mt-0.5">{analysis.session_count}회</p>
        </div>
        <div className="rounded-lg bg-surface p-3 border border-border">
          <p className="text-text-muted text-xs">최장 유휴</p>
          <p className="text-lg font-semibold mt-0.5">
            {analysis.longest_session_minutes}m
          </p>
        </div>
        <div className="rounded-lg bg-surface p-3 border border-border">
          <p className="text-text-muted text-xs">평균 유휴</p>
          <p className="text-lg font-semibold mt-0.5">
            {analysis.average_session_minutes}m
          </p>
        </div>
      </div>

      {analysis.sessions.length > 0 && (
        <div>
          <p className="text-text-muted text-xs mb-2">유휴 세션 목록</p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {analysis.sessions.map((s, i) => (
              <div key={i} className="flex justify-between text-xs font-mono">
                <span className="text-text-muted">{s.start} – {s.end}</span>
                <span>{formatSeconds(s.duration_seconds)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
