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
import type { PortInfo } from "../api/client";
import { formatMemoryGb, formatMemoryUsage, killPortProcess } from "../api/client";
import { useTheme } from "../theme";
import { MascotScene } from "./mascot";
import { CyberMetric } from "./cyber/CyberMetric";
import { CyberPanel } from "./cyber/CyberPanel";
import { HISTORY_LEN, useSystemMetrics } from "./cyber/useSystemMetrics";

interface Props {
  connected: boolean;
}

export function SystemMonitor({ connected }: Props) {
  const { chart } = useTheme();
  const [portFilter, setPortFilter] = useState("");
  const [sortBy, setSortBy] = useState<"port" | "process" | "pid">("port");
  const [paused, setPaused] = useState(false);
  const [killingPid, setKillingPid] = useState<number | null>(null);
  const { snapshot, history, error, reload } = useSystemMetrics(connected, paused);

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
      } catch (e) {
        /* error shown via parent */
        void e;
      } finally {
        setKillingPid(null);
      }
    },
    [reload],
  );

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
    return [...ports].sort((a, b) => {
      if (sortBy === "port") return a.port - b.port;
      if (sortBy === "pid") return (a.pid ?? 0) - (b.pid ?? 0);
      return (a.process ?? "").localeCompare(b.process ?? "");
    });
  }, [snapshot, portFilter, sortBy]);

  if (!connected) {
    return (
      <MascotScene
        mood="sleeping"
        title="시스템 모니터 대기 중"
        description="TraceDesk 에이전트가 실행 중일 때 CPU·메모리·포트를 확인할 수 있어요."
      />
    );
  }

  return (
    <div className="cyber-bg -mx-4 md:-mx-8 -my-6 px-4 md:px-8 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-sm font-bold tracking-widest uppercase"
            style={{ fontFamily: "var(--cyber-font-display)", color: "var(--cyber-cyan)" }}
          >
            SYS.MONITOR
          </h2>
          <p className="text-xs font-mono text-text-muted">1s POLL · {HISTORY_LEN}s HISTORY</p>
        </div>
        <button type="button" onClick={() => setPaused((p) => !p)} className="cyber-btn">
          {paused ? "▶ RESUME" : "⏸ PAUSE"}
        </button>
      </div>

      {error && (
        <div className="cyber-panel cyber-panel-glow-magenta px-4 py-2 text-sm font-mono text-danger-text">
          ⚠ {error}
        </div>
      )}

      {snapshot && (
        <>
          <div className="grid md:grid-cols-3 gap-2">
            <CyberMetric
              label="CPU"
              value={`${snapshot.cpu_usage_percent.toFixed(1)}%`}
              percent={snapshot.cpu_usage_percent}
              color="var(--cyber-cyan)"
            />
            <CyberMetric
              label="MEMORY"
              value={formatMemoryUsage(snapshot.memory.used_mb, snapshot.memory.total_mb)}
              subValue={`${snapshot.memory.used_percent.toFixed(1)}%`}
              percent={snapshot.memory.used_percent}
              color="var(--cyber-green)"
            />
            <CyberPanel title="TRACEDESK" glow="green">
              {snapshot.tracedesk ? (
                <div className="font-mono text-sm space-y-1">
                  <p>
                    CPU{" "}
                    <span style={{ color: "var(--cyber-cyan)" }}>
                      {snapshot.tracedesk.cpu_percent.toFixed(1)}%
                    </span>
                    {" · "}
                    MEM{" "}
                    <span style={{ color: "var(--cyber-green)" }}>
                      {formatMemoryGb(snapshot.tracedesk.memory_mb)}
                    </span>
                  </p>
                  <p className="text-xs text-text-muted">PID {snapshot.tracedesk.pid}</p>
                </div>
              ) : (
                <p className="text-text-muted font-mono text-xs">—</p>
              )}
              <p className="text-xs font-mono text-text-muted mt-2">
                LISTEN {snapshot.port_count} PORTS
              </p>
            </CyberPanel>
          </div>

          <CyberPanel title="TELEMETRY" subtitle={`${HISTORY_LEN}s ROLLING`} glow="cyan">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="sysCpuGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--cyber-cyan)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--cyber-cyan)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="sysMemGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--cyber-green)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--cyber-green)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke={chart.grid} opacity={0.5} />
                <XAxis dataKey="t" stroke={chart.axis} fontSize={9} interval="preserveStartEnd" />
                <YAxis stroke={chart.axis} fontSize={9} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
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
                <Area type="monotone" dataKey="cpu" stroke="var(--cyber-cyan)" fill="url(#sysCpuGrad)" strokeWidth={1.5} name="cpu" />
                <Area type="monotone" dataKey="mem" stroke="var(--cyber-green)" fill="url(#sysMemGrad)" strokeWidth={1.5} name="mem" />
              </AreaChart>
            </ResponsiveContainer>
          </CyberPanel>

          <div className="grid lg:grid-cols-2 gap-3">
            <CyberPanel
              title="NET.PORTS"
              glow="cyan"
              headerRight={
                <div className="flex gap-1">
                  <input
                    type="text"
                    placeholder="FILTER"
                    value={portFilter}
                    onChange={(e) => setPortFilter(e.target.value)}
                    className="cyber-input w-24"
                  />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    className="cyber-input"
                  >
                    <option value="port">PORT</option>
                    <option value="process">PROC</option>
                    <option value="pid">PID</option>
                  </select>
                </div>
              }
            >
              <div className="cyber-scroll max-h-80">
                <table className="cyber-table">
                  <thead>
                    <tr>
                      <th>PORT</th>
                      <th>ADDR</th>
                      <th>PROC</th>
                      <th>PID</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPorts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center text-text-muted py-8">
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
                            {p.is_tracedesk && (
                              <span className="ml-1 text-[0.55rem]" style={{ color: "var(--cyber-green)" }}>
                                TD
                              </span>
                            )}
                          </td>
                          <td className="text-xs text-text-muted truncate max-w-[100px]">{p.address}</td>
                          <td className="truncate max-w-[120px]">{p.process ?? "—"}</td>
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

            <CyberPanel title="PROC.TOP" subtitle="CPU" glow="green">
              <div className="cyber-scroll max-h-80">
                <table className="cyber-table">
                  <thead>
                    <tr>
                      <th>NAME</th>
                      <th>CPU</th>
                      <th>MEM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.top_processes.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="text-center text-text-muted py-8">
                          NO DATA
                        </td>
                      </tr>
                    ) : (
                      snapshot.top_processes.map((p) => (
                        <tr key={p.pid}>
                          <td>
                            <span className="truncate block max-w-[140px]" title={p.name}>
                              {p.name}
                            </span>
                            <span className="text-[0.55rem] text-text-muted">PID {p.pid}</span>
                          </td>
                          <td style={{ color: "var(--cyber-cyan)" }}>
                            {p.cpu_percent.toFixed(1)}%
                          </td>
                          <td>{formatMemoryGb(p.memory_mb)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CyberPanel>
          </div>
        </>
      )}
    </div>
  );
}
