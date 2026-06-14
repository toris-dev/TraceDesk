import {
  screenshotThumbnailSrc,
  type ActivityItem,
} from "../api/client";
import { CopyableClipboardContent } from "./CopyableClipboardContent";
import { useI18n } from "../i18n";
import { isActionEvent } from "../utils/activityFeed";

export { isActionEvent };

interface Props {
  events: ActivityItem[];
  viewingToday: boolean;
  dateLabel: string;
}

export function ActionHistoryPanel({ events, viewingToday, dateLabel }: Props) {
  const { t } = useI18n();
  const copyCount = events.filter((e) => e.type === "COPY").length;
  const pasteCount = events.filter((e) => e.type === "PASTE").length;
  const shotCount = events.filter((e) => e.type === "SCREENSHOT").length;

  return (
    <section
      id="action-history"
      className="rounded-xl border border-border bg-surface-elevated p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text">{t("actions.title")}</h2>
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
        <div className="flex gap-3 text-sm text-text">
          <span>
            {t("actions.copy")} <strong className="text-success-text">{copyCount}</strong>
          </span>
          <span>
            {t("actions.paste")} <strong className="text-warning">{pasteCount}</strong>
          </span>
          <span>
            {t("actions.capture")} <strong className="text-danger-text">{shotCount}</strong>
          </span>
        </div>
      </div>

      {events.length === 0 ? (
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
        <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
          {events.map((ev, i) => (
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
