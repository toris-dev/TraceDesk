import type { ActivityItem } from "../api/client";
import { CYBER, EVENT_ACCENT } from "../theme/cyberTokens";

export type FeedFilter = "all" | "app" | "action" | "idle";

const ACTION_TYPES = new Set(["COPY", "PASTE", "SCREENSHOT"]);
const IDLE_TYPES = new Set(["IDLE_START", "IDLE_END"]);
const HIDDEN_TYPES = new Set(["SYSTEM_START", "SYSTEM_SHUTDOWN"]);

export function isJournalEvent(type: string): boolean {
  return !HIDDEN_TYPES.has(type);
}

export function isActionEvent(type: string): boolean {
  return ACTION_TYPES.has(type);
}

export function filterJournalEvents(events: ActivityItem[]): ActivityItem[] {
  return events.filter((e) => isJournalEvent(e.type));
}

export function filterByCategory(
  events: ActivityItem[],
  category: FeedFilter,
): ActivityItem[] {
  switch (category) {
    case "app":
      return events.filter((e) => e.type === "WINDOW_FOCUS");
    case "action":
      return events.filter((e) => isActionEvent(e.type));
    case "idle":
      return events.filter((e) => IDLE_TYPES.has(e.type));
    default:
      return events;
  }
}

export function filterBySearch(events: ActivityItem[], query: string): ActivityItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return events;
  return events.filter((e) => {
    const app = e.name?.toLowerCase() ?? "";
    const preview =
      typeof e.metadata?.clipboard_preview === "string"
        ? e.metadata.clipboard_preview.toLowerCase()
        : "";
    const filename =
      typeof e.metadata?.filename === "string" ? e.metadata.filename.toLowerCase() : "";
    return app.includes(q) || preview.includes(q) || filename.includes(q);
  });
}

export function filterByHour(events: ActivityItem[], hour: number | null): ActivityItem[] {
  if (hour == null) return events;
  return events.filter((e) => {
    const h = parseInt(e.time.split(":")[0] ?? "-1", 10);
    return h === hour;
  });
}

export function eventAccent(type: string): string {
  return EVENT_ACCENT[type] ?? CYBER.cyan;
}

export function eventIcon(type: string): string {
  switch (type) {
    case "COPY":
      return "⎘";
    case "PASTE":
      return "⎗";
    case "SCREENSHOT":
      return "▣";
    case "WINDOW_FOCUS":
      return "◫";
    case "IDLE_START":
      return "◌";
    case "IDLE_END":
      return "◉";
    default:
      return "·";
  }
}
