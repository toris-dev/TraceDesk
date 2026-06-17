import { useCallback, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ActionHourlyPoint,
  ActivityItem,
  DailyStatistics,
  FullTimelineItem,
  HourlyActivity,
  PortInfo,
  ProductivityAnalysis,
} from "../../api/client";
import {
  formatDuration,
  formatMemoryGb,
  formatMemoryUsage,
  killPortProcess,
} from "../../api/client";
import { ActionChart } from "../ActionChart";
import { CyberEventStream } from "./CyberEventStream";
import { ActivityGraph } from "../ActivityGraph";
import { useTheme } from "../../theme";
import { CyberMetric } from "./CyberMetric";
import { CyberPanel } from "./CyberPanel";
import { HISTORY_LEN, useSystemMetrics } from "./useSystemMetrics";

interface Props {
  connected: boolean;
  stats: DailyStatistics;
  productivity: ProductivityAnalysis | null;
  actionHourly: ActionHourlyPoint[];
  hourly: HourlyActivity[];
  fullTimeline: FullTimelineItem[];
  activityEvents: ActivityItem[];
  dateLabel: string;
  viewingToday: boolean;
}

export function CyberCommandCenter({
  connected,
  stats,
  productivity,
  actionHourly,
  hourly,
  fullTimeline,
  activityEvents,
  dateLabel,
  viewingToday,
}: Props) {
  const { chart } = useTheme();
  const [paused, setPaused] = useState(false);
  const [portFilter, setPortFilter] = useState("");
  const [killingPid, setKillingPid] = useState<number | null>(null);
  const { snapshot, history, error, reload } = useSystemMetrics(connected, paused);

  const totalMinutes = 24 * 60;
  const activePct = Math.min((stats.active / totalMinutes) * 100, 100);

  const filteredPorts = useMemo(() => {
    if (!snapshot) return [];
    const q = portFilter.trim().toLowerCase();
    let ports = snapshot.ports;
    if (q) {
      ports = ports.filter(
        (p) =>
          String(p.port).includes(q) ||
          p.process?.toLowerCase().includes(q) ||
          p.address.toLowerCase().includes(q),
      );
    }
    return [...ports].sort((a, b) => a.port - b.port).slice(0, 12);
  }, [snapshot, portFilter]);

  const handleKillPort = useCallback(
    async (port: PortInfo) => {
      if (!port.pid || port.is_tracedesk) return;
      const label = port.process ?? `PID ${port.pid}`;
      const ok = window.confirm(
        `포트 ${port.port} (${port.address})를 사용 중인 「${label}」(PID ${port.pid}) 프로세스를 종료할까요?`,
      );
      if (!ok) return;
      setKillingPid(port.pid);
      try {
        await killPortProcess(port.pid);
        await reload();
      } catch {
        /* handled by parent */
      } finally {
        setKillingPid(null);
      }
    },
    [reload],
  );

  const now = new Date().toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="cyber-bg -mx-4 md:-mx-8 -my-6 px-4 md:px-8 py-4 min-h-full">
      <div className="space-y-3 max-w-[1920px] mx-auto">
        {/* HUD Status Bar */}
        <div className="cyber-hud-bar">
          <div className="cyber-hud-bar-item">
            <span
              className={`cyber-status-dot ${connected ? "cyber-status-dot-live" : "cyber-status-dot-off"}`}
            />
            <span className="cyber-hud-bar-label">LINK</span>
            <span className="cyber-hud-bar-value">{connected ? "ONLINE" : "OFFLINE"}</span>
          </div>
          <div className="cyber-hud-bar-item">
            <span className="cyber-hud-bar-label">DATE</span>
            <span className="cyber-hud-bar-value">{dateLabel}</span>
          </div>
          <div className="cyber-hud-bar-item">
            <span className="cyber-hud-bar-label">SYNC</span>
            <span className="cyber-hud-bar-value">{now}</span>
          </div>
          {snapshot && (
            <>
              <div className="cyber-hud-bar-item">
                <span className="cyber-hud-bar-label">CPU</span>
                <span className="cyber-hud-bar-value" style={{ color: "var(--cyber-cyan)" }}>
                  {snapshot.cpu_usage_percent.toFixed(1)}%
                </span>
              </div>
              <div className="cyber-hud-bar-item">
                <span className="cyber-hud-bar-label">MEM</span>
                <span className="cyber-hud-bar-value" style={{ color: "var(--cyber-green)" }}>
                  {snapshot.memory.used_percent.toFixed(1)}%
                </span>
              </div>
              <div className="cyber-hud-bar-item">
                <span className="cyber-hud-bar-label">PORTS</span>
                <span className="cyber-hud-bar-value">{snapshot.port_count}</span>
              </div>
            </>
          )}
          <div className="ml-auto">
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className="cyber-btn"
            >
              {paused ? "▶ RESUME" : "⏸ PAUSE"}
            </button>
          </div>
        </div>

        {error && (
          <div className="cyber-panel cyber-panel-glow-magenta px-4 py-2 text-sm font-mono text-danger-text">
            ⚠ {error}
          </div>
        )}

        {/* Activity KPI Row */}
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          <CyberMetric
            label="ACTIVE"
            value={formatDuration(stats.active)}
            subValue={`${activePct.toFixed(0)}%`}
            percent={activePct}
            color="var(--cyber-cyan)"
            compact
          />
          <CyberMetric
            label="COPY"
            value={`${stats.copy}`}
            color="var(--cyber-green)"
            compact
          />
          <CyberMetric
            label="PASTE"
            value={`${stats.paste}`}
            color="var(--cyber-amber)"
            compact
          />
          <CyberMetric
            label="CAPTURE"
            value={`${stats.screenshot}`}
            color="var(--cyber-magenta)"
            compact
          />
          <CyberMetric
            label="IDLE"
            value={formatDuration(stats.idle)}
            color="var(--td-text-muted)"
            compact
          />
          {productivity && (
            <CyberMetric
              label="SCORE"
              value={`${productivity.score}`}
              subValue={`GRADE ${productivity.grade}`}
              percent={productivity.score}
              color="var(--cyber-green)"
              compact
            />
          )}
          {snapshot && (
            <CyberMetric
              label="SYS CPU"
              value={`${snapshot.cpu_usage_percent.toFixed(1)}%`}
              percent={snapshot.cpu_usage_percent}
              color="var(--cyber-cyan)"
              compact
            />
          )}
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3" style={{ minHeight: "calc(100vh - 280px)" }}>
          {/* System Chart */}
          <div className="xl:col-span-8">
            <CyberPanel
              title="SYS.TELEMETRY"
              subtitle={`${HISTORY_LEN}s ROLLING`}
              glow="cyan"
              className="h-full"
            >
              {snapshot ? (
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={history}>
                    <defs>
                      <linearGradient id="cyberCpuGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--cyber-cyan)" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="var(--cyber-cyan)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="cyberMemGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--cyber-green)" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="var(--cyber-green)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 4" stroke={chart.grid} opacity={0.5} />
                    <XAxis dataKey="t" stroke={chart.axis} fontSize={9} interval="preserveStartEnd" tick={{ fill: chart.axis }} />
                    <YAxis stroke={chart.axis} fontSize={9} domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: chart.axis }} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--cyber-panel-bg)",
                        border: "1px solid var(--cyber-panel-border)",
                        borderRadius: 0,
                        fontFamily: "var(--cyber-font-mono)",
                        fontSize: 11,
                        color: chart.tooltipText,
                      }}
                      formatter={(v, name) => [`${Number(v).toFixed(1)}%`, name === "cpu" ? "CPU" : "MEM"]}
                    />
                    <Area type="monotone" dataKey="cpu" stroke="var(--cyber-cyan)" fill="url(#cyberCpuGrad)" strokeWidth={1.5} name="cpu" />
                    <Area type="monotone" dataKey="mem" stroke="var(--cyber-green)" fill="url(#cyberMemGrad)" strokeWidth={1.5} name="mem" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-40 flex items-center justify-center text-text-muted font-mono text-xs">
                  AWAITING TELEMETRY...
                </div>
              )}
            </CyberPanel>
          </div>

          {/* TraceDesk Process + Top App */}
          <div className="xl:col-span-4 flex flex-col gap-3">
            <CyberPanel title="TRACEDESK.PROC" glow="green" className="flex-1">
              {snapshot?.tracedesk ? (
                <div className="space-y-2 font-mono text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-muted text-xs">CPU</span>
                    <span style={{ color: "var(--cyber-cyan)" }}>
                      {snapshot.tracedesk.cpu_percent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted text-xs">MEM</span>
                    <span style={{ color: "var(--cyber-green)" }}>
                      {formatMemoryGb(snapshot.tracedesk.memory_mb)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted text-xs">PID</span>
                    <span>{snapshot.tracedesk.pid}</span>
                  </div>
                </div>
              ) : (
                <p className="text-text-muted font-mono text-xs">NO SIGNAL</p>
              )}
              {stats.top_application && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="cyber-metric-label">TOP APP</p>
                  <p className="font-mono text-sm truncate" style={{ color: "var(--cyber-amber)" }}>
                    {stats.top_application}
                  </p>
                </div>
              )}
            </CyberPanel>

            <CyberPanel title="MEMORY" glow="green">
              {snapshot ? (
                <CyberMetric
                  label="USAGE"
                  value={formatMemoryUsage(snapshot.memory.used_mb, snapshot.memory.total_mb)}
                  subValue={`${snapshot.memory.used_percent.toFixed(1)}%`}
                  percent={snapshot.memory.used_percent}
                  color="var(--cyber-green)"
                />
              ) : (
                <p className="text-text-muted font-mono text-xs">—</p>
              )}
            </CyberPanel>
          </div>

          {/* Activity Charts */}
          <div className="xl:col-span-6">
            <CyberPanel title="ACTIVITY.SIGNAL" subtitle="HOURLY" glow="cyan" className="h-[220px]">
              <ActivityGraph data={hourly} />
            </CyberPanel>
          </div>
          <div className="xl:col-span-6">
            <CyberPanel title="ACTION.SIGNAL" subtitle="HOURLY" glow="magenta" className="h-[220px]">
              <ActionChart data={actionHourly} />
            </CyberPanel>
          </div>

          {/* Timeline */}
          <div className="xl:col-span-12">
            <CyberPanel title="TIMELINE.FEED" subtitle={dateLabel} glow="amber" noPadding>
              <div className="cyber-scroll max-h-28 px-3 py-2">
                <CompactTimeline items={fullTimeline} />
              </div>
            </CyberPanel>
          </div>

          {/* Ports */}
          <div className="xl:col-span-5">
            <CyberPanel
              title="NET.PORTS"
              subtitle={`${filteredPorts.length} ACTIVE`}
              glow="cyan"
              headerRight={
                <input
                  type="text"
                  placeholder="FILTER"
                  value={portFilter}
                  onChange={(e) => setPortFilter(e.target.value)}
                  className="cyber-input w-24"
                />
              }
            >
              <div className="cyber-scroll max-h-48">
                <table className="cyber-table">
                  <thead>
                    <tr>
                      <th>PORT</th>
                      <th>PROC</th>
                      <th>PID</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPorts.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center text-text-muted py-4">
                          NO PORTS
                        </td>
                      </tr>
                    ) : (
                      filteredPorts.map((p) => (
                        <tr
                          key={`${p.protocol}-${p.address}-${p.port}-${p.pid}`}
                          className={p.is_tracedesk ? "opacity-80" : ""}
                        >
                          <td style={{ color: p.is_tracedesk ? "var(--cyber-green)" : undefined }}>
                            {p.port}
                          </td>
                          <td className="truncate max-w-[100px]">{p.process ?? "—"}</td>
                          <td>{p.pid ?? "—"}</td>
                          <td>
                            {p.pid && !p.is_tracedesk && (
                              <button
                                type="button"
                                disabled={killingPid === p.pid}
                                onClick={() => handleKillPort(p)}
                                className="cyber-btn cyber-btn-danger !px-2 !py-0.5"
                              >
                                {killingPid === p.pid ? "…" : "KILL"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CyberPanel>
          </div>

          {/* Top Processes */}
          <div className="xl:col-span-3">
            <CyberPanel title="PROC.TOP" subtitle="CPU" glow="green">
              <div className="cyber-scroll max-h-48">
                <table className="cyber-table">
                  <thead>
                    <tr>
                      <th>NAME</th>
                      <th>CPU</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(snapshot?.top_processes ?? []).slice(0, 8).map((p) => (
                      <tr key={p.pid}>
                        <td className="truncate max-w-[90px]" title={p.name}>
                          {p.name}
                        </td>
                        <td style={{ color: "var(--cyber-cyan)" }}>
                          {p.cpu_percent.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CyberPanel>
          </div>

          {/* Activity Feed */}
          <div className="xl:col-span-4">
            <CyberPanel
              title="EVENT.STREAM"
              subtitle={viewingToday ? "LIVE" : "ARCHIVE"}
              glow="magenta"
            >
              <div className="cyber-scroll max-h-48">
                <CyberEventStream events={activityEvents.slice(0, 15)} />
              </div>
            </CyberPanel>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompactTimeline({ items }: { items: FullTimelineItem[] }) {
  if (items.length === 0) {
    return <p className="text-text-muted font-mono text-xs text-center py-2">NO TIMELINE DATA</p>;
  }

  const colors = ["var(--cyber-cyan)", "var(--cyber-green)", "var(--cyber-amber)", "var(--cyber-magenta)"];
  const apps = items.filter((i) => i.kind === "app" && i.duration).slice(0, 20);

  return (
    <div className="flex gap-0.5 h-6 items-stretch">
      {apps.map((item, idx) => {
        const width = Math.max((item.duration ?? 0) / 60, 2);
        return (
          <div
            key={`${item.start}-${item.label}-${idx}`}
            className="rounded-sm min-w-[2px] transition-opacity hover:opacity-100 opacity-70"
            style={{
              flex: width,
              background: colors[idx % colors.length],
              boxShadow: `0 0 4px ${colors[idx % colors.length]}`,
            }}
            title={`${item.label} (${item.duration ?? 0}m)`}
          />
        );
      })}
    </div>
  );
}
