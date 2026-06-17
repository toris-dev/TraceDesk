import { clipboardPreviewText, formatSeconds, type ActivityItem } from "../../api/client";
import { useI18n } from "../../i18n";
import { eventAccent, eventIcon } from "../../utils/activityFeed";

interface Props {
  events: ActivityItem[];
}

export function CyberEventStream({ events }: Props) {
  const { t } = useI18n();

  if (events.length === 0) {
    return (
      <p className="text-text-muted font-mono text-xs text-center py-4">NO EVENTS</p>
    );
  }

  return (
    <div className="space-y-1">
      {events.map((ev, i) => {
        const accent = eventAccent(ev.type);
        const preview = clipboardPreviewText(ev.metadata, t("actions.clipboardImage"));
        return (
          <div
            key={ev.id ?? `${ev.type}-${ev.time}-${i}`}
            className="flex items-center gap-2 px-1 py-1 border-b border-border/30 hover:bg-cyan-500/5 transition-colors"
          >
            <span className="font-mono text-[0.6rem] text-text-muted shrink-0 w-12">
              {ev.time}
            </span>
            <span
              className="shrink-0 text-[0.65rem]"
              style={{ color: accent }}
            >
              {eventIcon(ev.type)}
            </span>
            <span className="font-mono text-[0.65rem] truncate" style={{ color: accent }}>
              {t(`events.${ev.type}`)}
            </span>
            {ev.name && (
              <span className="font-mono text-[0.6rem] text-text-muted truncate">
                {ev.name}
              </span>
            )}
            {preview && (
              <span className="font-mono text-[0.55rem] text-text-muted truncate ml-auto max-w-[120px]">
                {preview}
              </span>
            )}
            {ev.type === "WINDOW_FOCUS" && ev.duration != null && ev.duration > 0 && (
              <span className="font-mono text-[0.55rem] text-text-muted shrink-0">
                {formatSeconds(ev.duration)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
