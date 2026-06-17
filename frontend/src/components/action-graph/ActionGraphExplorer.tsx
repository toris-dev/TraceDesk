import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActivityItem } from "../../api/client";
import { clipboardContentSummary } from "../../api/client";
import { useI18n } from "../../i18n";
import { CYBER } from "../../theme/cyberTokens";
import type { ActionFilter } from "../../utils/actionAnalytics";
import {
  buildActionGraph,
  buildActionRecords,
  searchActionGraph,
  type ActionGraphNode,
  type ActionRecord,
} from "../../utils/actionGraph";
import { CopyableClipboardContent } from "../CopyableClipboardContent";
import { ActionGraphCanvas } from "./ActionGraphCanvas";

interface Props {
  events: ActivityItem[];
  loading?: boolean;
  dateLabel: string;
}

const FILTERS: { id: ActionFilter; labelKey: string }[] = [
  { id: "all", labelKey: "filterAll" },
  { id: "COPY", labelKey: "copy" },
  { id: "PASTE", labelKey: "paste" },
  { id: "SCREENSHOT", labelKey: "capture" },
];

function typeLabel(t: (k: string) => string, type: string): string {
  if (type === "COPY") return t("actions.copy");
  if (type === "PASTE") return t("actions.paste");
  return t("actions.capture");
}

function typeColor(type: string): string {
  if (type === "COPY") return CYBER.green;
  if (type === "PASTE") return CYBER.amber;
  return CYBER.magenta;
}

function RecordDetail({
  record,
  onFocus,
  selected,
}: {
  record: ActionRecord;
  onFocus: () => void;
  selected: boolean;
}) {
  const { t } = useI18n();
  const summary = clipboardContentSummary(record.raw.metadata, t);

  return (
    <button
      type="button"
      onClick={onFocus}
      className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
        selected
          ? "border-[var(--cyber-cyan)] bg-[var(--cyber-cyan-dim)]"
          : "border-border/60 hover:border-[var(--cyber-cyan)]/50 hover:bg-[var(--cyber-cyan-dim)]/40"
      }`}
    >
      <div className="flex items-center gap-2 text-xs font-data">
        <span className="text-text-muted shrink-0">{record.time}</span>
        <span className="font-semibold shrink-0" style={{ color: typeColor(record.type) }}>
          {typeLabel(t, record.type)}
        </span>
        {record.app && (
          <span className="text-text-muted truncate">{record.app}</span>
        )}
      </div>
      {summary && (
        <p className="mt-1.5 text-[11px] text-text leading-snug line-clamp-3 font-data">
          {summary}
        </p>
      )}
      {record.urls.length > 0 && (
        <p className="mt-1 text-[10px] text-[var(--cyber-amber)] truncate font-data">
          {record.urls[0]}
        </p>
      )}
    </button>
  );
}

function NodeInspector({ node }: { node: ActionGraphNode }) {
  const { t } = useI18n();
  const rec = node.record;

  if (node.kind === "event" && rec) {
    return (
      <div className="space-y-3 text-sm">
        <div>
          <p className="td-label">{typeLabel(t, rec.type)}</p>
          <p className="font-data text-[var(--cyber-cyan)]">{rec.time}</p>
        </div>
        {rec.app && (
          <p className="text-text-muted text-xs">
            {t("actions.inApp", { app: rec.app })}
          </p>
        )}
        {rec.window && (
          <p className="text-text-muted text-xs truncate" title={rec.window}>
            {t("actions.inWindow", { title: rec.window })}
          </p>
        )}
        {(rec.type === "COPY" || rec.type === "PASTE") && (
          <CopyableClipboardContent metadata={rec.raw.metadata} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="td-label">{node.kind.toUpperCase()}</p>
      <p className="font-data text-sm text-text break-all">{node.label}</p>
      <p className="text-xs text-text-muted">{t("actions.graphNodeHint")}</p>
    </div>
  );
}

export function ActionGraphExplorer({ events, loading, dateLabel }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ActionFilter>("all");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 480 });

  const records = useMemo(() => buildActionRecords(events), [events]);
  const graph = useMemo(() => buildActionGraph(records), [records]);
  const search = useMemo(
    () => searchActionGraph(graph, query, filter),
    [graph, query, filter],
  );

  const selectedNode = useMemo(
    () => graph.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [graph.nodes, selectedNodeId],
  );

  const focusRecord = useCallback((rec: ActionRecord) => {
    setSelectedNodeId(`ev:${rec.id}`);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const listRecords = search.rankedRecords.slice(0, 80);

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="flex-1 relative">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("actions.searchPlaceholder")}
            className="w-full rounded-lg border border-border bg-surface/50 px-4 py-2.5 pl-10 text-sm font-data text-text placeholder:text-text-muted focus:border-[var(--cyber-cyan)] focus:outline-none focus:ring-1 focus:ring-[var(--cyber-cyan-dim)]"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">
            ⌕
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
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
      </div>

      <p className="text-xs text-text-muted font-data">
        {t("actions.graphHint", { date: dateLabel, count: records.length })}
      </p>

      <div className="grid lg:grid-cols-5 gap-4 min-h-[520px]">
        <div className="lg:col-span-3 td-panel p-2 flex flex-col min-h-[420px] lg:min-h-[520px]">
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/40 mb-1">
            <span className="td-label">{t("actions.graphTitle")}</span>
            <span className="text-[10px] font-data text-text-muted">
              {t("actions.graphControls")}
            </span>
          </div>
          <div ref={containerRef} className="flex-1 min-h-[360px] relative">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center text-text-muted text-sm">
                {t("common.loading")}
              </div>
            ) : records.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted text-sm px-6 text-center gap-2">
                <p>{t("actions.empty")}</p>
                <p className="text-xs max-w-sm">{t("actions.emptyHint", {
                  inputMonitoring: t("actions.inputMonitoring"),
                  inputPermission: t("actions.inputPermission"),
                })}</p>
              </div>
            ) : (
              <ActionGraphCanvas
                graph={graph}
                matchedNodeIds={search.matchedNodeIds}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
                width={size.w}
                height={size.h}
              />
            )}
          </div>
        </div>

        <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
          {selectedNode && (
            <section className="td-panel p-4 shrink-0">
              <h3 className="td-label mb-3">{t("actions.selection")}</h3>
              <NodeInspector node={selectedNode} />
            </section>
          )}

          <section className="td-panel p-4 flex-1 flex flex-col min-h-0">
            <h3 className="td-label mb-2">
              {query.trim() ? t("actions.searchResults") : t("actions.recentActions")}
            </h3>
            <p className="text-[10px] text-text-muted mb-3 font-data">
              {t("actions.listHint")}
            </p>
            <div className="flex-1 overflow-y-auto cyber-scroll space-y-2 pr-1">
              {listRecords.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-8">{t("actions.noMatches")}</p>
              ) : (
                listRecords.map((rec) => (
                  <RecordDetail
                    key={rec.id}
                    record={rec}
                    selected={selectedNodeId === `ev:${rec.id}`}
                    onFocus={() => focusRecord(rec)}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
