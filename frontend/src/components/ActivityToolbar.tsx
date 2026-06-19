import { useEffect, useMemo, useRef, useState } from "react";
import {
  exportActivity,
  type ExportFormat,
  type ExportResult,
  type ExportScope,
} from "../api/client";
import { useI18n } from "../i18n";
import {
  addDays,
  formatDate,
  isToday,
  parseISO,
  recentDays,
  todayISO,
} from "../utils/date";

interface Props {
  selectedDate: string;
  onChange: (date: string) => void;
  availableDates: string[];
  onExportDone?: (result: ExportResult) => void;
}

export function ActivityToolbar({
  selectedDate,
  onChange,
  availableDates,
  onExportDone,
}: Props) {
  const { locale, t } = useI18n();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const exportOptions = useMemo(
    (): { scope: ExportScope; format: ExportFormat; label: string; hint: string }[] => [
      {
        scope: "journal",
        format: "json",
        label: t("toolbar.exportJsonJournal"),
        hint: t("toolbar.exportJsonJournalHint"),
      },
      {
        scope: "actions",
        format: "json",
        label: t("toolbar.exportJsonActions"),
        hint: t("toolbar.exportJsonActionsHint"),
      },
      {
        scope: "journal",
        format: "csv",
        label: t("toolbar.exportCsvJournal"),
        hint: t("toolbar.exportCsvJournalHint"),
      },
      {
        scope: "actions",
        format: "csv",
        label: t("toolbar.exportCsvActions"),
        hint: t("toolbar.exportCsvActionsHint"),
      },
      {
        scope: "all",
        format: "json",
        label: t("toolbar.exportJsonAll"),
        hint: t("toolbar.exportJsonAllHint"),
      },
    ],
    [t],
  );

  const availableSet = useMemo(() => new Set(availableDates), [availableDates]);
  const isSelectedToday = isToday(selectedDate);
  const quickDays = recentDays(7);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setCalendarOpen(false);
        setExportOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const goPrev = () => onChange(addDays(selectedDate, -1));
  const goNext = () => {
    const next = addDays(selectedDate, 1);
    if (next <= todayISO()) onChange(next);
  };

  const runExport = async (scope: ExportScope, format: ExportFormat) => {
    setExportOpen(false);
    setExporting(true);
    try {
      const result = await exportActivity({ date: selectedDate, scope, format });
      onExportDone?.(result);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative flex items-center gap-2 min-w-0 max-w-full">
      <div className="flex items-center rounded-lg border border-border bg-surface-elevated overflow-hidden">
        <button
          type="button"
          onClick={goPrev}
          className="px-2.5 py-2 text-text-muted hover:text-text hover:bg-surface transition-colors"
          aria-label={t("toolbar.prevDay")}
        >
          ‹
        </button>

        <button
          type="button"
          onClick={() => {
            setExportOpen(false);
            setCalendarOpen((v) => !v);
          }}
          className="min-w-[8.5rem] max-w-[11rem] truncate whitespace-nowrap px-3 py-2 text-left text-sm font-medium text-text hover:bg-surface transition-colors"
          title={isSelectedToday ? t("common.today") : formatDate(selectedDate, locale, true)}
        >
          {isSelectedToday ? t("common.today") : formatDate(selectedDate, locale, true)}
        </button>

        <button
          type="button"
          onClick={goNext}
          disabled={isSelectedToday}
          className="px-2.5 py-2 text-text-muted hover:text-text hover:bg-surface transition-colors disabled:opacity-30"
          aria-label={t("toolbar.nextDay")}
        >
          ›
        </button>
      </div>

      {!isSelectedToday && (
        <button
          type="button"
          onClick={() => onChange(todayISO())}
          className="shrink-0 whitespace-nowrap rounded-lg border border-accent/40 px-2.5 py-2 text-xs text-accent hover:bg-accent/10"
        >
          {t("common.today")}
        </button>
      )}

      <div className="relative shrink-0">
        <button
          type="button"
          disabled={exporting}
          onClick={() => {
            setCalendarOpen(false);
            setExportOpen((v) => !v);
          }}
          className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text hover:bg-surface disabled:opacity-50 flex items-center gap-1.5"
        >
          {exporting ? t("common.saving") : t("common.export")}
          <span className="text-text-muted text-xs">▾</span>
        </button>

        {exportOpen && (
          <div className="absolute right-0 top-full mt-1 z-30 w-56 rounded-xl border border-border bg-surface-elevated shadow-xl py-1">
            {exportOptions.map((opt) => (
              <button
                key={`${opt.scope}-${opt.format}`}
                type="button"
                onClick={() => runExport(opt.scope, opt.format)}
                className="w-full text-left px-3 py-2.5 hover:bg-surface transition-colors text-text"
              >
                <span className="block text-sm text-text">{opt.label}</span>
                <span className="block text-[11px] text-text-muted">{opt.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {calendarOpen && (
        <div className="absolute right-0 top-full mt-2 z-30 w-72 rounded-xl border border-border bg-surface-elevated shadow-xl p-4">
          <label className="block text-xs text-text-muted mb-1">{t("toolbar.pickDate")}</label>
          <input
            type="date"
            value={selectedDate}
            max={todayISO()}
            onChange={(e) => {
              const v = e.target.value;
              if (v && v <= todayISO()) {
                onChange(v);
                setCalendarOpen(false);
              }
            }}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text mb-3"
          />
          <p className="text-xs text-text-muted mb-2">{t("toolbar.recent7")}</p>
          <div className="grid grid-cols-7 gap-1">
            {quickDays.map((day) => {
              const selected = day === selectedDate;
              const hasData = availableSet.has(day);
              const d = parseISO(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    onChange(day);
                    setCalendarOpen(false);
                  }}
                  className={`flex flex-col items-center rounded-lg py-1.5 text-[11px] border transition-colors ${
                    selected
                      ? "bg-accent text-accent-foreground border-accent"
                      : hasData
                        ? "border-border hover:bg-surface"
                        : "border-border/40 text-text-muted hover:bg-surface"
                  }`}
                >
                  <span>{d.getDate()}</span>
                  {hasData && (
                    <span
                      className={`w-1 h-1 rounded-full mt-0.5 ${selected ? "bg-accent-foreground" : "bg-accent"}`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
