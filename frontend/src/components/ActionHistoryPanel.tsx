import {
  clipboardPreviewText,
  eventTypeLabel,
  screenshotThumbnailSrc,
  type ActivityItem,
} from "../api/client";

const ACTION_TYPES = new Set(["COPY", "PASTE", "SCREENSHOT"]);

export function isActionEvent(type: string): boolean {
  return ACTION_TYPES.has(type);
}

interface Props {
  events: ActivityItem[];
  viewingToday: boolean;
  dateLabel: string;
}

export function ActionHistoryPanel({ events, viewingToday, dateLabel }: Props) {
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
          <h2 className="text-lg font-semibold">복사 · 붙여넣기 · 캡처</h2>
          <p className="text-sm text-text-muted mt-1">
            {dateLabel}에 기록된 행동 내역
            {viewingToday && (
              <span className="inline-flex items-center gap-1 ml-2 text-green-400/90 text-xs uppercase tracking-wide">
                <span className="size-1.5 rounded-full bg-green-400 animate-pulse" />
                실시간
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <span>
            복사 <strong className="text-green-400">{copyCount}</strong>
          </span>
          <span>
            붙여넣기 <strong className="text-amber-400">{pasteCount}</strong>
          </span>
          <span>
            캡처 <strong className="text-red-400">{shotCount}</strong>
          </span>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface/50 px-4 py-8 text-center">
          <p className="text-text-muted text-sm">
            아직 복사·붙여넣기·캡처 기록이 없습니다.
          </p>
          <p className="text-text-muted text-xs mt-2">
            설정에서 <strong className="text-text">입력 모니터링</strong>을 켜고,
            macOS는 <strong className="text-text">입력 모니터링 권한</strong>을 허용해 주세요.
            내용 미리보기·캡처 썸네일은 설정에서 각각 켤 수 있습니다.
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
  const preview = clipboardPreviewText(ev.metadata);
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
              ? "text-green-400"
              : ev.type === "PASTE"
                ? "text-amber-400"
                : "text-red-400"
          }`}
        >
          {eventTypeLabel(ev.type)}
        </span>
        {ev.name && (
          <span className="truncate text-text-muted max-w-[12rem]" title={ev.name}>
            {ev.name}
          </span>
        )}
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
        {isClipboard && ev.metadata?.clipboard_length != null && !preview && (
          <span className="text-text-muted ml-auto shrink-0">
            {String(ev.metadata.clipboard_length)}자
          </span>
        )}
      </div>
      {preview && (
        <p
          className="mt-1.5 pl-[3.75rem] text-[11px] text-text-muted leading-snug break-all line-clamp-4"
          title={preview}
        >
          {preview}
        </p>
      )}
      {screenshotSrc && (
        <img
          src={screenshotSrc}
          alt="스크린샷 미리보기"
          className="mt-2 ml-[3.75rem] max-h-36 max-w-full rounded border border-border object-contain bg-black/20"
        />
      )}
    </div>
  );
}
