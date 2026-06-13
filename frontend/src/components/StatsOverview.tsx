import { formatDuration } from "../api/client";
import type { DailyStatistics } from "../api/client";

interface Props {
  stats: DailyStatistics;
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-4">
      <p className="text-text-muted text-sm mb-1">{label}</p>
      <p className="text-2xl font-semibold" style={{ color: accent ?? "inherit" }}>
        {value}
      </p>
    </div>
  );
}

export function StatsOverview({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        label="활동 시간"
        value={formatDuration(stats.active)}
        accent="#6366f1"
      />
      <StatCard
        label="유휴 시간"
        value={formatDuration(stats.idle)}
        accent="#94a3b8"
      />
      <StatCard label="복사" value={`${stats.copy}회`} accent="#22c55e" />
      <StatCard label="붙여넣기" value={`${stats.paste}회`} accent="#f59e0b" />
    </div>
  );
}

export function ActivityBar({
  activeMinutes,
  title = "오늘의 활동",
}: {
  activeMinutes: number;
  title?: string;
}) {
  const totalMinutes = 24 * 60;
  const pct = Math.min((activeMinutes / totalMinutes) * 100, 100);

  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-accent-muted font-mono text-sm">
          08:00 ─────────── 24:00
        </span>
      </div>
      <div className="h-4 bg-border rounded-full overflow-hidden mb-3">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-accent-muted transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-text-muted text-sm">
        총 활동 시간{" "}
        <span className="text-text font-semibold">
          {formatDuration(activeMinutes)}
        </span>
      </p>
    </div>
  );
}
