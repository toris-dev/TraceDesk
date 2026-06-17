import type { ActivityItem } from "../api/client";
import { useI18n } from "../i18n";
import { eventAccent } from "../utils/activityFeed";
import { timeToDayPercent } from "../utils/actionAnalytics";

interface Props {
  events: ActivityItem[];
}

const LANES: { type: string; labelKey: "copy" | "paste" | "capture" }[] = [
  { type: "COPY", labelKey: "copy" },
  { type: "PASTE", labelKey: "paste" },
  { type: "SCREENSHOT", labelKey: "capture" },
];

export function ActionTimelineStrip({ events }: Props) {
  const { t } = useI18n();

  if (events.length === 0) {
    return (
      <div className="flex h-28 items-center justify-center text-text-muted text-sm">
        {t("actions.noChartData")}
      </div>
    );
  }

  const hours = Array.from({ length: 25 }, (_, i) => i);

  return (
    <div className="space-y-3">
      {LANES.map((lane) => {
        const laneEvents = events.filter((e) => e.type === lane.type);
        return (
          <div key={lane.type} className="flex items-center gap-2">
            <span
              className="td-label w-12 shrink-0 text-right"
              style={{ color: eventAccent(lane.type) }}
            >
              {t(`actions.${lane.labelKey}`)}
            </span>
            <div className="relative flex-1 h-7 rounded-md bg-border/40 border border-border/50 overflow-hidden">
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute top-0 bottom-0 border-l border-border/30"
                  style={{ left: `${(h / 24) * 100}%` }}
                />
              ))}
              {laneEvents.map((ev, i) => (
                <div
                  key={ev.id ?? `${ev.type}-${ev.time}-${i}`}
                  className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full ring-2 ring-[var(--cyber-panel-bg)]"
                  style={{
                    left: `calc(${timeToDayPercent(ev.time)}% - 4px)`,
                    background: eventAccent(ev.type),
                    boxShadow: `0 0 6px ${eventAccent(ev.type)}`,
                  }}
                  title={`${ev.time} · ${ev.name ?? ""}${ev.window_title ? ` · ${ev.window_title}` : ""}`}
                />
              ))}
            </div>
            <span className="font-data text-xs text-text-muted w-8 shrink-0 text-right">
              {laneEvents.length}
            </span>
          </div>
        );
      })}
      <div className="flex justify-between text-[10px] font-data text-text-muted pl-14 pr-10">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>
    </div>
  );
}
