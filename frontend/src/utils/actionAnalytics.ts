import type { ActionHourlyPoint, ActivityItem, DailyStatistics } from "../api/client";

export type ActionFilter = "all" | "COPY" | "PASTE" | "SCREENSHOT";

const ACTION_TYPES = new Set(["COPY", "PASTE", "SCREENSHOT"]);

export function isActionType(type: string): type is ActionFilter {
  return ACTION_TYPES.has(type);
}

export function filterActionEvents(events: ActivityItem[], filter: ActionFilter): ActivityItem[] {
  if (filter === "all") return events;
  return events.filter((e) => e.type === filter);
}

export function actionTotals(stats: DailyStatistics) {
  const total = stats.copy + stats.paste + stats.screenshot;
  return {
    copy: stats.copy,
    paste: stats.paste,
    screenshot: stats.screenshot,
    total,
    copyPct: total > 0 ? (stats.copy / total) * 100 : 0,
    pastePct: total > 0 ? (stats.paste / total) * 100 : 0,
    screenshotPct: total > 0 ? (stats.screenshot / total) * 100 : 0,
  };
}

/** HH:MM:SS → 하루 중 위치 (0~100%) */
export function timeToDayPercent(time: string): number {
  const [h = 0, m = 0, s = 0] = time.split(":").map((v) => parseInt(v, 10) || 0);
  const secs = h * 3600 + m * 60 + s;
  return (secs / 86_400) * 100;
}

export function peakActionHour(data: ActionHourlyPoint[]): ActionHourlyPoint | null {
  let best: ActionHourlyPoint | null = null;
  let bestTotal = 0;
  for (const row of data) {
    const t = row.copy + row.paste + row.screenshot;
    if (t > bestTotal) {
      bestTotal = t;
      best = row;
    }
  }
  return best;
}
