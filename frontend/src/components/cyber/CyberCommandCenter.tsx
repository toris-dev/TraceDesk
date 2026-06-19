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
  ApplicationUsage,
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
  llmChat,
} from "../../api/client";
import { ActionChart } from "../ActionChart";
import { CyberEventStream } from "./CyberEventStream";
import { ActivityGraph } from "../ActivityGraph";
import { useTheme } from "../../theme";
import { CyberMetric } from "./CyberMetric";
import { CyberPanel } from "./CyberPanel";
import { HISTORY_LEN, LIGHT_HISTORY_LEN, useSystemMetrics } from "./useSystemMetrics";
import type { LlmChatResult } from "../../api/client";

interface Props {
  connected: boolean;
  stats: DailyStatistics;
  applications: ApplicationUsage[];
  selectedDate: string;
  performanceMode: boolean;
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
  applications,
  selectedDate,
  performanceMode,
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
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<LlmChatResult | null>(null);
  const { snapshot, history, error, reload } = useSystemMetrics(connected, paused, performanceMode);
  const behaviorProfile = useMemo(
    () => buildBehaviorProfile(stats, applications, productivity, actionHourly, hourly, fullTimeline),
    [stats, applications, productivity, actionHourly, hourly, fullTimeline],
  );

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

  const runAiScan = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await llmChat(buildAiProfilePrompt(behaviorProfile, stats), true, selectedDate);
      setAiResult(result);
    } catch (e) {
      setAiError(typeof e === "string" ? e : String(e));
      setAiResult(null);
    } finally {
      setAiLoading(false);
    }
  }, [behaviorProfile, selectedDate, stats]);

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
          <div className="cyber-hud-bar-item">
            <span className="cyber-hud-bar-label">MODE</span>
            <span
              className="cyber-hud-bar-value"
              style={{ color: performanceMode ? "var(--cyber-green)" : "var(--cyber-cyan)" }}
            >
              {performanceMode ? "LIGHT" : "FULL"}
            </span>
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

        {/* AI Behavior Profile */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
          <CyberPanel
            title="AI.IDENTITY.SCAN"
            subtitle="BEHAVIOR MODEL"
            glow="cyan"
            className="xl:col-span-6"
          >
            <div className="ai-profile-hero">
              <div className="ai-profile-orbit" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <div className="min-w-0 flex-1">
                <p className="ai-profile-kicker">TRACE PERSONA</p>
                <h3 className="ai-profile-title">{behaviorProfile.archetype}</h3>
                <p className="ai-profile-desc">{behaviorProfile.description}</p>
                <div className="ai-profile-tags">
                  {behaviorProfile.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
              <div className="ai-confidence">
                <span>{behaviorProfile.confidence}%</span>
                <small>AI MATCH</small>
              </div>
            </div>
          </CyberPanel>

          <CyberPanel
            title="PATTERN.VECTOR"
            subtitle="COPY · PASTE · CAPTURE"
            glow="magenta"
            className="xl:col-span-3"
          >
            <div className="space-y-3">
              {behaviorProfile.vectors.map((vector) => (
                <div key={vector.label} className="ai-vector-row">
                  <div className="flex items-center justify-between gap-3">
                    <span>{vector.label}</span>
                    <strong style={{ color: vector.color }}>{vector.value}%</strong>
                  </div>
                  <div className="ai-vector-track">
                    <div
                      style={{
                        width: `${vector.value}%`,
                        background: vector.color,
                        boxShadow: `0 0 12px ${vector.color}`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CyberPanel>

          <CyberPanel
            title="AI.READOUT"
            subtitle={behaviorProfile.peakLabel}
            glow="green"
            className="xl:col-span-3"
          >
            <div className="ai-readout">
              {behaviorProfile.insights.map((insight) => (
                <div key={insight.label} className="ai-readout-line">
                  <span>{insight.label}</span>
                  <strong>{insight.value}</strong>
                  <small>{insight.detail}</small>
                </div>
              ))}
            </div>
          </CyberPanel>

          <CyberPanel
            title="AI.DEEP.SCAN"
            subtitle={aiResult ? `${aiResult.provider} · ${aiResult.model}` : "LLM READY"}
            glow="amber"
            className="xl:col-span-12"
            headerRight={
              <button
                type="button"
                onClick={runAiScan}
                disabled={aiLoading}
                className="cyber-btn"
              >
                {aiLoading ? "SCANNING..." : "RUN SCAN"}
              </button>
            }
          >
            <div className="ai-scan-panel">
              <div>
                <p className="ai-scan-title">AI가 활동 로그를 읽고 성향과 행동 패턴을 해석합니다.</p>
                <p className="ai-scan-desc">
                  복사, 붙여넣기, 캡처, 앱 전환 기록을 함께 보내 현재 날짜의 작업 성향을 요약합니다.
                </p>
              </div>
              {aiError ? (
                <p className="ai-scan-error">{aiError}</p>
              ) : aiResult ? (
                <div className="ai-scan-result">{aiResult.answer}</div>
              ) : (
                <div className="ai-scan-empty">
                  RUN SCAN을 누르면 LLM 설정에 연결된 모델이 오늘의 행동 기록을 분석합니다.
                </div>
              )}
            </div>
          </CyberPanel>
        </div>

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
              subtitle={`${performanceMode ? LIGHT_HISTORY_LEN * 10 : HISTORY_LEN * 3}s ROLLING`}
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

          {!performanceMode && (
            <>
              {/* Activity Charts */}
              <div className="xl:col-span-6">
                <CyberPanel title="ACTIVITY.SIGNAL" subtitle="HOURLY" glow="cyan" className="h-[220px]">
                  <ActivityGraph data={hourly} />
                </CyberPanel>
              </div>
              <div className="xl:col-span-6">
                <CyberPanel title="ACTION.SIGNAL" subtitle="HOURLY" glow="magenta" className="h-[220px]">
                  <ActionChart data={actionHourly} variant="grouped" height={180} />
                </CyberPanel>
              </div>
            </>
          )}

          {/* Timeline */}
          <div className="xl:col-span-12">
            <CyberPanel title="TIMELINE.FEED" subtitle={dateLabel} glow="amber" noPadding>
              <div className="cyber-scroll max-h-28 px-3 py-2">
                <CompactTimeline items={fullTimeline} />
              </div>
            </CyberPanel>
          </div>

          {/* Ports */}
          <div className={performanceMode ? "xl:col-span-7" : "xl:col-span-5"}>
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
          <div className={performanceMode ? "xl:col-span-5" : "xl:col-span-3"}>
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
          {!performanceMode && <div className="xl:col-span-4">
            <CyberPanel
              title="EVENT.STREAM"
              subtitle={viewingToday ? "LIVE" : "ARCHIVE"}
              glow="magenta"
            >
              <div className="cyber-scroll max-h-48">
                <CyberEventStream events={activityEvents.slice(0, 15)} />
              </div>
            </CyberPanel>
          </div>}
        </div>
      </div>
    </div>
  );
}

interface BehaviorVector {
  label: string;
  value: number;
  color: string;
}

interface BehaviorInsight {
  label: string;
  value: string;
  detail: string;
}

function buildBehaviorProfile(
  stats: DailyStatistics,
  applications: ApplicationUsage[],
  productivity: ProductivityAnalysis | null,
  actionHourly: ActionHourlyPoint[],
  hourly: HourlyActivity[],
  fullTimeline: FullTimelineItem[],
) {
  const totalActions = stats.copy + stats.paste + stats.screenshot;
  const activeHours = Math.max(stats.active / 60, 0.1);
  const actionDensity = totalActions / activeHours;
  const copyPasteTotal = stats.copy + stats.paste;
  const reuseRatio = totalActions > 0 ? copyPasteTotal / totalActions : 0;
  const captureRatio = totalActions > 0 ? stats.screenshot / totalActions : 0;
  const pasteRatio = copyPasteTotal > 0 ? stats.paste / copyPasteTotal : 0;
  const copyRatio = copyPasteTotal > 0 ? stats.copy / copyPasteTotal : 0;
  const activeRatio = productivity?.active_ratio ?? stats.active / (24 * 60);
  const avgSession = productivity?.avg_session_minutes ?? stats.active / Math.max(applications.length, 1);
  const switchCount =
    productivity?.app_switches ??
    fullTimeline.filter((item) => item.kind === "app" && item.duration).length;

  const peakAction = actionHourly.reduce(
    (best, point) => {
      const total = point.copy + point.paste + point.screenshot;
      return total > best.total ? { hour: point.hour, total } : best;
    },
    { hour: 0, total: 0 },
  );
  const peakActivity = hourly.reduce(
    (best, point) => (point.activity > best.activity ? point : best),
    { hour: 0, activity: 0 },
  );
  const peakHour = peakAction.total > 0 ? peakAction.hour : peakActivity.hour;

  let archetype = "조용한 관찰형";
  let description = "활동 신호가 낮아 아직 뚜렷한 작업 페르소나를 확정하기 어렵습니다.";
  const tags = ["LOW SIGNAL", "LEARNING"];

  if (totalActions > 0 || stats.active > 0) {
    tags.length = 0;
    if (captureRatio >= 0.34) {
      archetype = "시각 증거 수집가";
      description = "캡처 빈도가 높아 화면 상태를 증거로 남기고 비교하며 판단하는 경향이 강합니다.";
      tags.push("VISUAL MEMORY", "REFERENCE-FIRST");
    } else if (reuseRatio >= 0.72 && pasteRatio >= 0.48) {
      archetype = "정보 조립형 실행가";
      description = "복사한 재료를 빠르게 붙여 넣고 재구성하는 흐름이 두드러집니다.";
      tags.push("FAST ASSEMBLY", "CONTEXT MIXING");
    } else if (copyRatio >= 0.68) {
      archetype = "탐색형 리서처";
      description = "복사 이벤트가 많아 여러 소스에서 단서를 채집하고 비교하는 행동이 보입니다.";
      tags.push("SOURCE HUNTING", "CURIOUS");
    } else if (activeRatio >= 0.45 && avgSession >= 18) {
      archetype = "깊은 몰입형";
      description = "긴 활성 세션과 낮은 산만도 신호가 보여 한 주제에 오래 머무르는 편입니다.";
      tags.push("DEEP WORK", "LOW DRIFT");
    } else if (switchCount >= 28) {
      archetype = "멀티 컨텍스트 조율자";
      description = "앱 전환과 행동 신호가 분산되어 여러 업무 흐름을 병렬로 관리하는 패턴입니다.";
      tags.push("MULTI-CONTEXT", "RAPID SWITCH");
    } else {
      archetype = "균형형 작업자";
      description = "수집, 실행, 대기 시간이 비교적 균형 있게 섞여 안정적인 작업 리듬을 보입니다.";
      tags.push("BALANCED", "STEADY RHYTHM");
    }
  }

  const confidence = clamp(
    Math.round(
      42 +
        Math.min(totalActions, 80) * 0.45 +
        Math.min(stats.active, 360) * 0.08 +
        Math.min(fullTimeline.length, 60) * 0.25,
    ),
    38,
    96,
  );

  const vectors: BehaviorVector[] = [
    {
      label: "수집성",
      value: clamp(Math.round(copyRatio * 62 + captureRatio * 38), 0, 100),
      color: "var(--cyber-green)",
    },
    {
      label: "실행성",
      value: clamp(Math.round(pasteRatio * 72 + Math.min(actionDensity * 5, 28)), 0, 100),
      color: "var(--cyber-amber)",
    },
    {
      label: "시각기억",
      value: clamp(Math.round(captureRatio * 100), 0, 100),
      color: "var(--cyber-magenta)",
    },
    {
      label: "몰입도",
      value: clamp(Math.round(activeRatio * 100), 0, 100),
      color: "var(--cyber-cyan)",
    },
  ];

  const topApp = applications[0]?.application ?? stats.top_application ?? "UNKNOWN";
  const insights: BehaviorInsight[] = [
    {
      label: "PEAK",
      value: formatHourLabel(peakHour),
      detail: peakAction.total > 0 ? `${peakAction.total} action bursts` : "activity peak",
    },
    {
      label: "SOURCE",
      value: topApp,
      detail: "dominant context",
    },
    {
      label: "TEMPO",
      value: `${actionDensity.toFixed(1)}/h`,
      detail: "copy/paste/capture density",
    },
  ];

  return {
    archetype,
    description,
    confidence,
    tags,
    vectors,
    insights,
    peakLabel: peakAction.total > 0 ? "ACTION PEAK" : "ACTIVITY PEAK",
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatHourLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function buildAiProfilePrompt(
  profile: ReturnType<typeof buildBehaviorProfile>,
  stats: DailyStatistics,
) {
  return [
    "아래 TraceDesk 행동 프로파일과 실제 활동 기록을 바탕으로 사용자가 어떤 사람인지와 행동 패턴을 분석해줘.",
    "근거 없는 단정은 피하고, 기록에서 보이는 신호와 불확실성을 구분해줘.",
    "한국어로 5개 섹션만 짧게 답해줘: 한 줄 정체성, 행동 패턴, 강점, 주의할 점, 내일의 제안.",
    "",
    `현재 로컬 프로파일: ${profile.archetype}`,
    `프로파일 설명: ${profile.description}`,
    `매칭 신뢰도: ${profile.confidence}%`,
    `태그: ${profile.tags.join(", ")}`,
    `액션 카운트: copy ${stats.copy}, paste ${stats.paste}, screenshot ${stats.screenshot}`,
    `활성 시간(분): ${stats.active}`,
    `유휴 시간(분): ${stats.idle}`,
    `상위 앱: ${stats.top_application ?? "UNKNOWN"}`,
  ].join("\n");
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
