import { useCallback, useEffect, useState } from "react";
import {
  getActionDateSummaries,
  getActionEvents,
  type ActionDateSummary,
  type ActivityItem,
  type DailyStatistics,
} from "../api/client";
import { ActionGraphExplorer } from "../components/action-graph/ActionGraphExplorer";
import { useI18n } from "../i18n";
import { CYBER } from "../theme/cyberTokens";
import { actionTotals } from "../utils/actionAnalytics";

interface Props {
  stats: DailyStatistics;
  selectedDate: string;
  onDateChange: (date: string) => void;
  dateLabel: string;
  viewingToday: boolean;
  liveEvents: ActivityItem[];
}

export function ActionsView({
  stats,
  selectedDate,
  onDateChange,
  dateLabel,
  viewingToday,
  liveEvents,
}: Props) {
  const { t } = useI18n();
  const [events, setEvents] = useState<ActivityItem[]>([]);
  const [dateSummaries, setDateSummaries] = useState<ActionDateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const totals = actionTotals(stats);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getActionEvents(selectedDate);
      setEvents(rows);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getActionDateSummaries(14)
      .then(setDateSummaries)
      .catch(() => setDateSummaries([]));
  }, [selectedDate]);

  // Merge live events when viewing today
  const displayEvents = viewingToday
    ? mergeLiveEvents(events, liveEvents)
    : events;

  return (
    <div className="space-y-5 max-w-[1500px]">
      <div className="td-panel p-5 md:p-6 bg-gradient-to-br from-[var(--cyber-magenta-dim)] via-[var(--cyber-panel-bg)] to-transparent">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="td-label">{dateLabel}</p>
            <h2 className="text-2xl font-display font-bold tracking-wide text-[var(--cyber-cyan)] mt-1">
              {t("actions.graphPageTitle")}
            </h2>
            <p className="text-xs text-text-muted mt-2 max-w-xl">{t("actions.graphPageDesc")}</p>
          </div>
          <div className="flex gap-4 text-sm font-data">
            <span>
              {t("actions.copy")}{" "}
              <strong style={{ color: CYBER.green }}>{totals.copy}</strong>
            </span>
            <span>
              {t("actions.paste")}{" "}
              <strong style={{ color: CYBER.amber }}>{totals.paste}</strong>
            </span>
            <span>
              {t("actions.capture")}{" "}
              <strong style={{ color: CYBER.magenta }}>{totals.screenshot}</strong>
            </span>
          </div>
        </div>
      </div>

      <ActionDateStrip
        summaries={dateSummaries}
        selectedDate={selectedDate}
        onPickDate={onDateChange}
      />

      <ActionGraphExplorer events={displayEvents} loading={loading} dateLabel={dateLabel} />
    </div>
  );
}

function ActionDateStrip({
  summaries,
  selectedDate,
  onPickDate,
}: {
  summaries: ActionDateSummary[];
  selectedDate: string;
  onPickDate: (date: string) => void;
}) {
  const { t } = useI18n();

  return (
    <section className="action-date-strip">
      <div className="action-date-strip-head">
        <span>{t("actions.recentDateSummary")}</span>
        <small>{t("actions.recentDateSummaryHint")}</small>
      </div>
      {summaries.length === 0 ? (
        <div className="action-date-empty">
          <span>NO ACTION DATES</span>
          <small>{t("actions.empty")}</small>
        </div>
      ) : null}
      <div className="action-date-strip-scroll">
        {summaries.map((summary) => {
          const active = summary.date === selectedDate;
          return (
            <button
              key={summary.date}
              type="button"
              onClick={() => onPickDate(summary.date)}
              className={`action-date-chip ${active ? "action-date-chip-active" : ""}`}
            >
              <span className="action-date-chip-date">{summary.date}</span>
              <strong>{summary.total}</strong>
              <span className="action-date-chip-location" title={summary.top_location ?? undefined}>
                {summary.top_location ?? t("actions.noLocation")}
              </span>
              <span className="action-date-chip-meta">
                C {summary.copy} · P {summary.paste} · S {summary.screenshot}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function mergeLiveEvents(stored: ActivityItem[], live: ActivityItem[]): ActivityItem[] {
  const byId = new Map<number, ActivityItem>();
  for (const e of stored) {
    if (e.id != null) byId.set(e.id, e);
  }
  for (const e of live) {
    if (e.id != null) byId.set(e.id, e);
  }
  return [...byId.values()].sort((a, b) => a.time.localeCompare(b.time));
}
