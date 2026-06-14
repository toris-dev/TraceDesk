import { useMemo, useState } from "react";
import {
  clipboardPreviewText,
  formatSeconds,
  screenshotThumbnailSrc,
  type ActivityItem,
} from "../api/client";
import { CopyableClipboardContent } from "./CopyableClipboardContent";
import { useI18n } from "../i18n";
import {
  eventAccent,
  eventIcon,
  filterByCategory,
  filterByHour,
  filterBySearch,
  type FeedFilter,
} from "../utils/activityFeed";

const FILTERS: { id: FeedFilter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "app", label: "앱" },
  { id: "action", label: "행동" },
  { id: "idle", label: "유휴" },
];

interface Props {
  events: ActivityItem[];
  dateLabel: string;
  selectedHour: number | null;
  onClearHour: () => void;
}

export function ActivityFeed({
  events,
  dateLabel,
  selectedHour,
  onClearHour,
}: Props) {
  const [category, setCategory] = useState<FeedFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    let list = filterByCategory(events, category);
    list = filterBySearch(list, search);
    list = filterByHour(list, selectedHour);
    return [...list].reverse();
  }, [events, category, search, selectedHour]);

  const selected = filtered.find((e) => e.id === selectedId) ?? null;

  return (
    <section className="rounded-2xl border border-border bg-surface-elevated overflow-hidden flex flex-col min-h-[420px]">
      <div className="p-5 border-b border-border space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">활동 피드</h2>
            <p className="text-sm text-text-muted mt-1">
              {dateLabel} · {filtered.length}건
              {selectedHour != null && (
                <button
                  type="button"
                  onClick={onClearHour}
                  className="ml-2 text-accent hover:underline"
                >
                  {String(selectedHour).padStart(2, "0")}:00 필터 해제
                </button>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setCategory(f.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                category === f.id
                  ? "bg-accent text-accent-foreground border-accent"
                  : "border-border text-text-muted hover:border-accent/40 hover:text-text"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="앱 이름 · 클립보드 · 파일명 검색"
          className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm placeholder:text-text-muted focus:outline-none focus:border-accent/50"
        />
      </div>

      <div className="flex flex-1 min-h-0">
        <div
          className={`overflow-y-auto p-3 space-y-1.5 ${selected ? "w-full lg:w-1/2 lg:border-r border-border" : "w-full"}`}
        >
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-text-muted text-sm">
              이 조건에 맞는 기록이 없습니다.
            </div>
          ) : (
            filtered.map((ev, i) => (
              <FeedRow
                key={ev.id ?? `${ev.type}-${ev.time}-${i}`}
                event={ev}
                active={ev.id === selectedId}
                onSelect={() => setSelectedId(ev.id === selectedId ? null : (ev.id ?? null))}
              />
            ))
          )}
        </div>

        {selected && (
          <aside className="hidden lg:flex lg:w-1/2 flex-col min-h-0">
            <EventDetail event={selected} onClose={() => setSelectedId(null)} />
          </aside>
        )}
      </div>

      {selected && (
        <div className="lg:hidden border-t border-border">
          <EventDetail event={selected} onClose={() => setSelectedId(null)} />
        </div>
      )}
    </section>
  );
}

function FeedRow({
  event: ev,
  active,
  onSelect,
}: {
  event: ActivityItem;
  active: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  const accent = eventAccent(ev.type);
  const preview = clipboardPreviewText(ev.metadata, t("actions.clipboardImage"));

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-xl px-3 py-2.5 border transition-all ${
        active
          ? "border-accent/50 bg-accent/10 shadow-sm"
          : "border-transparent bg-surface hover:border-border hover:bg-surface-elevated"
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm"
          style={{ background: `${accent}22`, color: accent }}
        >
          {eventIcon(ev.type)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-text-muted">{ev.time}</span>
            <span className="text-sm font-medium" style={{ color: accent }}>
              {t(`events.${ev.type}`)}
            </span>
            {ev.name && (
              <span className="text-xs text-text-muted truncate max-w-[10rem]">{ev.name}</span>
            )}
          </div>
          {preview && (
            <p className="text-[11px] text-text-muted truncate mt-0.5">{preview}</p>
          )}
          {ev.type === "WINDOW_FOCUS" && ev.duration != null && ev.duration > 0 && (
            <p className="text-[11px] text-text-muted mt-0.5">{formatSeconds(ev.duration)} 사용</p>
          )}
        </div>
      </div>
    </button>
  );
}

function EventDetail({ event: ev, onClose }: { event: ActivityItem; onClose: () => void }) {
  const { t } = useI18n();
  const accent = eventAccent(ev.type);
  const screenshotSrc =
    ev.type === "SCREENSHOT" ? screenshotThumbnailSrc(ev.metadata) : null;

  return (
    <div className="flex flex-col h-full min-h-[240px] p-5 overflow-y-auto">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-xs text-text-muted font-mono">{ev.time}</p>
          <h3 className="text-lg font-semibold mt-1" style={{ color: accent }}>
            {t(`events.${ev.type}`)}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border px-2 py-1 text-xs text-text-muted hover:text-text"
        >
          닫기
        </button>
      </div>

      <dl className="space-y-3 text-sm">
        {ev.name && (
          <div>
            <dt className="text-text-muted text-xs mb-0.5">앱</dt>
            <dd className="font-medium">{ev.name}</dd>
          </div>
        )}
        {ev.duration != null && ev.duration > 0 && (
          <div>
            <dt className="text-text-muted text-xs mb-0.5">지속 시간</dt>
            <dd>{formatSeconds(ev.duration)}</dd>
          </div>
        )}
        {ev.metadata?.shortcut != null && (
          <div>
            <dt className="text-text-muted text-xs mb-0.5">단축키</dt>
            <dd className="font-mono">{String(ev.metadata.shortcut)}</dd>
          </div>
        )}
        {ev.metadata?.filename != null && (
          <div>
            <dt className="text-text-muted text-xs mb-0.5">파일</dt>
            <dd className="break-all">{String(ev.metadata.filename)}</dd>
          </div>
        )}
        {ev.metadata?.idle_seconds != null && (
          <div>
            <dt className="text-text-muted text-xs mb-0.5">유휴</dt>
            <dd>{formatSeconds(Number(ev.metadata.idle_seconds))}</dd>
          </div>
        )}
      </dl>

      {(ev.type === "COPY" || ev.type === "PASTE") && (
        <CopyableClipboardContent metadata={ev.metadata} indent={false} className="mt-2" />
      )}

      {screenshotSrc && (
        <img
          src={screenshotSrc}
          alt="스크린샷"
          className="mt-4 max-h-48 rounded-lg border border-border object-contain bg-image-bg"
        />
      )}
    </div>
  );
}
