import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PortInfo, ProcessInfo, SystemSnapshot } from "../api/client";
import { formatMemoryGb, formatMemoryUsage, getSystemSnapshot, killPortProcess } from "../api/client";
import { useTheme } from "../theme";
import { MascotScene } from "./mascot";

const POLL_MS = 1_000;
const HISTORY_LEN = 60;

interface Props {
  connected: boolean;
}

export function SystemMonitor({ connected }: Props) {
  const { chart } = useTheme();
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);
  const [history, setHistory] = useState<{ t: string; cpu: number; mem: number }[]>([]);
  const [portFilter, setPortFilter] = useState("");
  const [sortBy, setSortBy] = useState<"port" | "process" | "pid">("port");
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [killingPid, setKillingPid] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (paused) return;
    try {
      const data = await getSystemSnapshot();
      setSnapshot(data);
      setError(null);
      const label = new Date().toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      setHistory((prev) =>
        [...prev, { t: label, cpu: data.cpu_usage_percent, mem: data.memory.used_percent }].slice(
          -HISTORY_LEN,
        ),
      );
    } catch {
      setError("시스템 데이터를 불러올 수 없습니다.");
    }
  }, [paused]);

  useEffect(() => {
    if (!connected) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [connected, load]);

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
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "프로세스 종료에 실패했습니다.");
      } finally {
        setKillingPid(null);
      }
    },
    [load],
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text">시스템 모니터</h2>
          <p className="text-sm text-text-muted">CPU · 메모리 · 포트 — 1초마다 갱신</p>
        </div>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
            paused
              ? "border-warning text-warning-text bg-warning/10"
              : "border-border text-text hover:bg-surface-elevated"
          }`}
        >
          {paused ? "▶ 재개" : "⏸ 일시정지"}
        </button>
      </div>

      {error && (
        <MascotScene
          mood="confused"
          title="시스템 데이터를 불러올 수 없습니다"
          description={error}
          size="md"
        />
      )}

      {snapshot && (
        <>
          <div className="grid md:grid-cols-3 gap-4">
            <MetricCard
              label="CPU 사용률"
              value={`${snapshot.cpu_usage_percent.toFixed(1)}%`}
              percent={snapshot.cpu_usage_percent}
              color="#6366f1"
            />
            <MetricCard
              label="메모리 사용"
              value={formatMemoryUsage(snapshot.memory.used_mb, snapshot.memory.total_mb)}
              subValue={`${snapshot.memory.used_percent.toFixed(1)}% 사용 중`}
              percent={snapshot.memory.used_percent}
              color="#22c55e"
            />
            <div className="rounded-xl border border-border bg-surface-elevated p-4">
              <p className="text-text-muted text-sm mb-1">TraceDesk 프로세스</p>
              {snapshot.tracedesk ? (
                <div className="space-y-1">
                  <p className="text-lg font-semibold text-text">
                    CPU {snapshot.tracedesk.cpu_percent.toFixed(1)}% ·{" "}
                    {formatMemoryGb(snapshot.tracedesk.memory_mb)}
                  </p>
                  <p className="text-xs text-text-muted font-mono">PID {snapshot.tracedesk.pid}</p>
                </div>
              ) : (
                <p className="text-text-muted">—</p>
              )}
              <p className="text-xs text-text-muted mt-2">
                LISTEN 포트 {snapshot.port_count}개
              </p>
            </div>
          </div>

          <section className="rounded-xl border border-border bg-surface-elevated p-6">
            <h3 className="font-semibold mb-4 text-text">실시간 추이 (최근 {HISTORY_LEN}초)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chart.accent} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={chart.accent} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chart.success} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={chart.success} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis dataKey="t" stroke={chart.axis} fontSize={10} interval="preserveStartEnd" />
                <YAxis stroke={chart.axis} fontSize={11} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={{
                    background: chart.tooltipBg,
                    border: `1px solid ${chart.tooltipBorder}`,
                    borderRadius: 8,
                    color: chart.tooltipText,
                  }}
                  formatter={(v, name) => [`${Number(v).toFixed(1)}%`, name === "cpu" ? "CPU" : "메모리"]}
                />
                <Area type="monotone" dataKey="cpu" stroke={chart.accent} fill="url(#cpuGrad)" strokeWidth={2} name="cpu" />
                <Area type="monotone" dataKey="mem" stroke={chart.success} fill="url(#memGrad)" strokeWidth={2} name="mem" />
              </AreaChart>
            </ResponsiveContainer>
          </section>

          <div className="grid lg:grid-cols-2 gap-6">
            <section className="rounded-xl border border-border bg-surface-elevated p-6">
              <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                <h3 className="font-semibold text-text">사용 중인 포트</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="포트/프로세스 검색"
                    value={portFilter}
                    onChange={(e) => setPortFilter(e.target.value)}
                    className="text-sm px-3 py-1.5 rounded-lg bg-surface border border-border text-text w-40 placeholder:text-text-muted"
                  />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    className="text-sm px-2 py-1.5 rounded-lg bg-surface border border-border text-text"
                  >
                    <option value="port">포트순</option>
                    <option value="process">프로세스순</option>
                    <option value="pid">PID순</option>
                  </select>
                </div>
              </div>
              <PortTable ports={filteredPorts} killingPid={killingPid} onKill={handleKillPort} />
            </section>

            <section className="rounded-xl border border-border bg-surface-elevated p-6">
              <h3 className="font-semibold mb-4 text-text">CPU Top 프로세스</h3>
              <ProcessTable processes={snapshot.top_processes} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  subValue,
  percent,
  color,
}: {
  label: string;
  value: string;
  subValue?: string;
  percent: number;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-4">
      <p className="text-text-muted text-sm mb-1">{label}</p>
      <p className="text-xl font-semibold mb-1 text-text">{value}</p>
      {subValue && <p className="text-xs text-text-muted mb-3">{subValue}</p>}
      {!subValue && <div className="mb-3" />}
      <div className="h-2 bg-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${Math.min(percent, 100)}%`, background: color }}
        />
      </div>
    </div>
  );
}

function PortTable({
  ports,
  killingPid,
  onKill,
}: {
  ports: PortInfo[];
  killingPid: number | null;
  onKill: (port: PortInfo) => void;
}) {
  if (ports.length === 0) {
    return <p className="text-sm text-text-muted py-8 text-center">표시할 포트가 없습니다</p>;
  }
  return (
    <div className="overflow-auto max-h-80">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-text-muted text-left border-b border-border">
            <th className="pb-2 pr-3 font-medium">포트</th>
            <th className="pb-2 pr-3 font-medium">주소</th>
            <th className="pb-2 pr-3 font-medium">프로세스</th>
            <th className="pb-2 pr-3 font-medium">PID</th>
            <th className="pb-2 font-medium w-16" />
          </tr>
        </thead>
        <tbody>
          {ports.map((p) => (
            <tr
              key={`${p.protocol}-${p.address}-${p.port}-${p.pid}`}
              className={`border-b border-border/50 ${p.is_tracedesk ? "bg-accent/10" : ""}`}
            >
              <td className="py-2 pr-3 font-mono">
                {p.port}
                {p.is_tracedesk && (
                  <span className="ml-1 text-[10px] text-accent">TraceDesk</span>
                )}
              </td>
              <td className="py-2 pr-3 font-mono text-xs text-text-muted truncate max-w-[120px]">
                {p.address}
              </td>
              <td className="py-2 pr-3 truncate max-w-[140px]">{p.process ?? "—"}</td>
              <td className="py-2 pr-3 font-mono text-text-muted">{p.pid ?? "—"}</td>
              <td className="py-2">
                {p.pid && !p.is_tracedesk ? (
                  <button
                    type="button"
                    disabled={killingPid === p.pid}
                    onClick={() => onKill(p)}
                    className="text-xs px-2 py-1 rounded border border-danger/40 text-danger-text hover:bg-danger/10 disabled:opacity-50 transition-colors"
                    title="프로세스 종료"
                  >
                    {killingPid === p.pid ? "…" : "종료"}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProcessTable({ processes }: { processes: ProcessInfo[] }) {
  if (processes.length === 0) {
    return <p className="text-sm text-text-muted py-8 text-center">프로세스 데이터 없음</p>;
  }
  return (
    <div className="overflow-auto max-h-80">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-text-muted text-left border-b border-border">
            <th className="pb-2 pr-3 font-medium">프로세스</th>
            <th className="pb-2 pr-3 font-medium">CPU</th>
            <th className="pb-2 font-medium">메모리</th>
          </tr>
        </thead>
        <tbody>
          {processes.map((p) => (
            <tr key={p.pid} className="border-b border-border/50">
              <td className="py-2 pr-3">
                <span className="truncate block max-w-[160px]" title={p.name}>
                  {p.name}
                </span>
                <span className="text-xs text-text-muted font-mono">PID {p.pid}</span>
              </td>
              <td className="py-2 pr-3 font-mono">{p.cpu_percent.toFixed(1)}%</td>
              <td className="py-2 font-mono">{formatMemoryGb(p.memory_mb)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
