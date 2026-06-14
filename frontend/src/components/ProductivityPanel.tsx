import type { ProductivityAnalysis, WeeklyReport } from "../api/client";
import { useTheme } from "../theme";
import { TortoiseMascot, scoreToMood } from "./mascot";

const GRADE_COLORS: Record<string, string> = {
  A: "#22c55e",
  B: "#6366f1",
  C: "#f59e0b",
  D: "#f97316",
  F: "#ef4444",
};

interface Props {
  analysis: ProductivityAnalysis;
}

export function ProductivityPanel({ analysis }: Props) {
  const { chart } = useTheme();
  const color = GRADE_COLORS[analysis.grade] ?? chart.axis;
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (analysis.score / 100) * circumference;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-6">
        <div className="relative w-32 h-32 shrink-0">
          {analysis.score >= 70 && (
            <div className="absolute -top-2 -right-2 z-10">
              <TortoiseMascot
                mood={scoreToMood(analysis.score)}
                size="xs"
                interactive
                showBubble={analysis.score >= 85}
                message={analysis.score >= 85 ? "오늘 최고! 🎉" : "잘하고 있어요!"}
              />
            </div>
          )}
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke={chart.track} strokeWidth="10" />
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke={color}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-all duration-700"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold" style={{ color }}>{analysis.score}</span>
            <span className="text-sm text-text-muted">/ 100</span>
          </div>
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span
              className="text-2xl font-bold px-2 py-0.5 rounded"
              style={{ color, background: `${color}20` }}
            >
              {analysis.grade}
            </span>
            <span className="text-text-muted text-sm">생산성 등급</span>
          </div>
          {analysis.focus_window && (
            <p className="text-sm">
              집중 피크{" "}
              <span className="text-accent font-medium">
                {analysis.focus_window.start}~{analysis.focus_window.end}
              </span>
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 text-xs text-text-muted">
            <span>활동 비율 {(analysis.active_ratio * 100).toFixed(0)}%</span>
            <span>평균 세션 {analysis.avg_session_minutes}분</span>
            <span>앱 전환 {analysis.app_switches}회</span>
          </div>
        </div>
      </div>

      {analysis.recommendations.length > 0 && (
        <div className="rounded-lg bg-surface border border-border p-4">
          <p className="text-sm font-medium mb-2">오늘의 추천</p>
          <ul className="space-y-2">
            {analysis.recommendations.map((rec, i) => (
              <li key={i} className="text-sm text-text-muted flex gap-2">
                <span className="text-accent shrink-0">→</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function WeeklyReportPanel({ report }: { report: WeeklyReport }) {
  const maxActive = Math.max(...report.daily.map((d) => d.active_minutes), 1);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-text-muted text-sm">주간 리포트</p>
          <p className="font-medium">
            {report.period_start} ~ {report.period_end}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-accent">{report.avg_productivity_score}</p>
          <p className="text-xs text-text-muted">평균 생산성</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-surface border border-border p-3">
          <p className="text-lg font-semibold">{report.total_active_hours}h</p>
          <p className="text-xs text-text-muted">총 활동</p>
        </div>
        <div className="rounded-lg bg-surface border border-border p-3">
          <p className="text-lg font-semibold">{report.avg_daily_active_minutes}m</p>
          <p className="text-xs text-text-muted">일 평균</p>
        </div>
        <div className="rounded-lg bg-surface border border-border p-3">
          <p className="text-lg font-semibold">
            {report.most_productive_day?.weekday_short ?? "—"}
          </p>
          <p className="text-xs text-text-muted">최고 생산성</p>
        </div>
      </div>

      {/* 주간 바 차트 */}
      <div className="space-y-2">
        {report.daily.map((day) => (
          <div key={day.date} className="flex items-center gap-3 text-sm">
            <span className="w-8 shrink-0 text-text-muted">{day.weekday_short}</span>
            <div className="flex-1 h-6 bg-surface rounded border border-border overflow-hidden relative">
              <div
                className="h-full bg-accent/70 rounded-sm transition-all"
                style={{ width: `${(day.active_minutes / maxActive) * 100}%`, minWidth: day.active_minutes > 0 ? 4 : 0 }}
              />
              {day.focus_window && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">
                  {day.focus_window}
                </span>
              )}
            </div>
            <span
              className="w-8 text-right font-mono text-xs shrink-0"
              style={{ color: GRADE_COLORS[day.grade] }}
            >
              {day.grade}
            </span>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-surface border border-border p-4">
        <p className="text-sm font-medium mb-1">집중 패턴</p>
        <p className="text-sm text-text-muted">{report.focus_pattern_summary}</p>
      </div>

      {report.recommendations.length > 0 && (
        <div className="rounded-lg bg-surface border border-border p-4">
          <p className="text-sm font-medium mb-2">주간 추천</p>
          <ul className="space-y-2">
            {report.recommendations.map((rec, i) => (
              <li key={i} className="text-sm text-text-muted flex gap-2">
                <span className="text-accent shrink-0">💡</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
