import { useMemo, useState } from "react";
import {
  screenshotThumbnailSrc,
  type ActivityItem,
} from "../api/client";
import { CopyableClipboardContent } from "./CopyableClipboardContent";
import { useI18n } from "../i18n";
import { isActionEvent } from "../utils/activityFeed";
import type { ActionFilter } from "../utils/actionAnalytics";
import { filterActionEvents } from "../utils/actionAnalytics";

export { isActionEvent };

interface Props {
  events: ActivityItem[];
  viewingToday: boolean;
  dateLabel: string;
}

const FILTERS: { id: ActionFilter; labelKey: string }[] = [
  { id: "all", labelKey: "filterAll" },
  { id: "COPY", labelKey: "copy" },
  { id: "PASTE", labelKey: "paste" },
  { id: "SCREENSHOT", labelKey: "capture" },
];

export function ActionHistoryPanel({ events, viewingToday, dateLabel }: Props) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<ActionFilter>("all");
  const filtered = useMemo(() => filterActionEvents(events, filter), [events, filter]);

  const copyCount = events.filter((e) => e.type === "COPY").length;
  const pasteCount = events.filter((e) => e.type === "PASTE").length;
  const shotCount = events.filter((e) => e.type === "SCREENSHOT").length;

  return (
    <section id="action-history" className="td-panel p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display font-semibold tracking-wide text-[var(--cyber-cyan)]">
            {t("actions.eventLog")}
          </h2>
          <p className="text-sm text-text-muted mt-1">
            {t("actions.dateRecorded", { date: dateLabel })}
            {viewingToday && (
              <span className="inline-flex items-center gap-1 ml-2 text-success-text/90 text-xs uppercase tracking-wide">
                <span className="size-1.5 rounded-full bg-success animate-pulse" />
                {t("actions.live")}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-3 text-sm font-data">
          <span>
            {t("actions.copy")} <strong className="text-[var(--cyber-green)]">{copyCount}</strong>
          </span>
          <span>
            {t("actions.paste")} <strong className="text-[var(--cyber-amber)]">{pasteCount}</strong>
          </span>
          <span>
            {t("actions.capture")} <strong className="text-[var(--cyber-magenta)]">{shotCount}</strong>
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-display tracking-wide border transition-colors ${
              filter === f.id
                ? "bg-[var(--cyber-cyan-dim)] border-[var(--cyber-cyan)] text-[var(--cyber-cyan)]"
                : "border-border text-text-muted hover:border-[var(--cyber-cyan)]"
            }`}
          >
            {t(`actions.${f.labelKey}`)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface/50 px-4 py-8 text-center">
          <p className="text-text-muted text-sm">{t("actions.empty")}</p>
          <p className="text-text-muted text-xs mt-2">
            {t("actions.emptyHint", {
              inputMonitoring: t("actions.inputMonitoring"),
              inputPermission: t("actions.inputPermission"),
            })}
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1 cyber-scroll">
          {filtered.map((ev, i) => (
            <ActionEventRow key={ev.id ?? `${ev.type}-${ev.time}-${i}`} event={ev} />
          ))}
        </div>
      )}
    </section>
  );
}

function ActionEventRow({ event: ev }: { event: ActivityItem }) {
  const { t } = useI18n();
  const screenshotSrc =
    ev.type === "SCREENSHOT" ? screenshotThumbnailSrc(ev.metadata) : null;
  const isClipboard = ev.type === "COPY" || ev.type === "PASTE";

  return (
    <div className="rounded-lg bg-surface border border-border/60 px-3 py-2.5">
      <div className="flex items-center gap-2 text-xs font-mono flex-wrap">
        <span className="text-text-muted w-14 shrink-0">{ev.time}</span>
        <span
          className={`shrink-0 font-sans font-medium ${
            ev.type === "COPY"
              ? "text-success-text"
              : ev.type === "PASTE"
                ? "text-warning"
                : "text-danger-text"
          }`}
        >
          {t(`events.${ev.type}`)}
        </span>
        {ev.metadata?.shortcut != null && (
          <span className="text-text-muted ml-auto shrink-0 truncate max-w-28">
            {String(ev.metadata.shortcut)}
          </span>
        )}
        {ev.metadata?.filename != null && ev.metadata?.shortcut == null && (
          <span className="text-text-muted ml-auto shrink-0 truncate max-w-40">
            {String(ev.metadata.filename)}
          </span>
        )}
      </div>

      {(ev.name || ev.window_title) && (
        <div className="mt-1.5 pl-[3.75rem] space-y-0.5 text-[11px] leading-snug">
          {ev.name && (
            <p className="text-text">
              {t("actions.inApp", { app: ev.name })}
            </p>
          )}
          {ev.window_title && (
            <p className="text-text-muted truncate" title={ev.window_title}>
              {t("actions.inWindow", { title: ev.window_title })}
            </p>
          )}
        </div>
      )}

      {isClipboard && <CopyableClipboardContent metadata={ev.metadata} className="mt-1.5" />}

      {screenshotSrc && (
        <img
          src={screenshotSrc}
          alt={t("actions.screenshotPreview")}
          className="mt-2 ml-[3.75rem] max-h-36 max-w-full rounded border border-border object-contain bg-image-bg"
        />
      )}
    </div>
  );
}
