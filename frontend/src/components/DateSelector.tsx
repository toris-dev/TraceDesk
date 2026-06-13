import { useMemo } from "react";
import {
  addDays,
  formatDateKo,
  isToday,
  parseISO,
  recentDays,
  todayISO,
} from "../utils/date";

interface Props {
  selectedDate: string;
  onChange: (date: string) => void;
  availableDates: string[];
}

export function DateSelector({ selectedDate, onChange, availableDates }: Props) {
  const availableSet = useMemo(() => new Set(availableDates), [availableDates]);
  const isSelectedToday = isToday(selectedDate);
  const canGoNext = !isSelectedToday;

  const goPrev = () => onChange(addDays(selectedDate, -1));
  const goNext = () => {
    const next = addDays(selectedDate, 1);
    if (next <= todayISO()) onChange(next);
  };

  const quickDays = recentDays(14);

  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={goPrev}
          className="w-9 h-9 rounded-lg border border-border hover:bg-surface flex items-center justify-center text-text-muted hover:text-text transition-colors"
          aria-label="이전 날"
        >
          ‹
        </button>

        <div className="flex-1 min-w-[200px]">
          <label className="block relative">
            <span className="block text-base font-semibold pointer-events-none">
              {formatDateKo(selectedDate)}
            </span>
            <input
              type="date"
              value={selectedDate}
              max={todayISO()}
              onChange={(e) => {
                const v = e.target.value;
                if (v && v <= todayISO()) onChange(v);
              }}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              aria-label="날짜 선택"
            />
          </label>
          <p className="text-xs text-text-muted mt-0.5">
            {isSelectedToday ? "오늘 · 실시간 갱신" : "과거 기록 조회"}
          </p>
        </div>

        <button
          type="button"
          onClick={goNext}
          disabled={!canGoNext}
          className="w-9 h-9 rounded-lg border border-border hover:bg-surface flex items-center justify-center text-text-muted hover:text-text transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="다음 날"
        >
          ›
        </button>

        {!isSelectedToday && (
          <button
            type="button"
            onClick={() => onChange(todayISO())}
            className="px-3 py-1.5 rounded-lg text-sm border border-accent text-accent hover:bg-accent/10 transition-colors"
          >
            오늘
          </button>
        )}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
        {quickDays.map((day) => {
          const selected = day === selectedDate;
          const hasData = availableSet.has(day);
          const d = parseISO(day);
          const isDayToday = isToday(day);

          return (
            <button
              key={day}
              type="button"
              onClick={() => onChange(day)}
              className={`shrink-0 flex flex-col items-center min-w-[3rem] px-2 py-1.5 rounded-lg text-xs border transition-colors ${
                selected
                  ? "bg-accent text-white border-accent"
                  : hasData
                    ? "border-border hover:bg-surface text-text"
                    : "border-border/50 text-text-muted hover:bg-surface"
              }`}
            >
              <span className="font-medium">
                {d.toLocaleDateString("ko-KR", { weekday: "short" })}
              </span>
              <span className={`text-sm font-semibold ${selected ? "" : ""}`}>
                {d.getDate()}
              </span>
              <span
                className={`w-1 h-1 rounded-full mt-0.5 ${
                  hasData
                    ? selected
                      ? "bg-white"
                      : "bg-accent"
                    : "bg-transparent"
                }`}
              />
              {isDayToday && !selected && (
                <span className="text-[10px] text-accent mt-0.5">오늘</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
