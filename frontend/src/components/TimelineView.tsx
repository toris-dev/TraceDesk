import type { TimelineSegment } from "../api/client";
import { formatSeconds } from "../api/client";

interface Props {
  segments: TimelineSegment[];
}

const APP_COLORS: Record<string, string> = {};
const PALETTE = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#a855f7",
];

function colorForApp(app: string): string {
  if (!APP_COLORS[app]) {
    APP_COLORS[app] = PALETTE[Object.keys(APP_COLORS).length % PALETTE.length];
  }
  return APP_COLORS[app];
}

export function TimelineView({ segments }: Props) {
  if (segments.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-text-muted">
        타임라인 데이터가 없습니다
      </div>
    );
  }

  const maxDuration = Math.max(...segments.map((s) => s.duration), 1);

  return (
    <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
      {segments.slice(-20).reverse().map((seg, i) => (
        <div key={i} className="flex items-center gap-3 text-sm">
          <span className="w-14 shrink-0 text-text-muted font-mono text-xs">
            {seg.start}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: colorForApp(seg.application) }}
              />
              <span className="truncate font-medium">{seg.application}</span>
              <span className="text-text-muted text-xs ml-auto shrink-0">
                {formatSeconds(seg.duration)}
              </span>
            </div>
            <div className="h-2 bg-border rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(seg.duration / maxDuration) * 100}%`,
                  background: colorForApp(seg.application),
                }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
