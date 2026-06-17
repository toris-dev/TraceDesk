import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { DailyStatistics } from "../api/client";
import { useI18n } from "../i18n";
import { useTheme } from "../theme";
import { CYBER } from "../theme/cyberTokens";
import { actionTotals } from "../utils/actionAnalytics";

interface Props {
  stats: DailyStatistics;
}

export function ActionDistributionChart({ stats }: Props) {
  const { t } = useI18n();
  const { chart } = useTheme();
  const totals = actionTotals(stats);

  if (totals.total === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-text-muted text-sm">
        {t("actions.noChartData")}
      </div>
    );
  }

  const data = [
    { key: "copy", name: t("actions.copy"), value: totals.copy, color: CYBER.green },
    { key: "paste", name: t("actions.paste"), value: totals.paste, color: CYBER.amber },
    { key: "screenshot", name: t("actions.capture"), value: totals.screenshot, color: CYBER.magenta },
  ].filter((d) => d.value > 0);

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <ResponsiveContainer width="100%" height={200} className="min-w-[180px] max-w-[220px]">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={78}
            paddingAngle={2}
            stroke="transparent"
          >
            {data.map((entry) => (
              <Cell key={entry.key} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: chart.tooltipBg,
              border: `1px solid ${chart.tooltipBorder}`,
              borderRadius: 8,
              color: chart.tooltipText,
              fontFamily: "var(--cyber-font-mono)",
              fontSize: 12,
            }}
            formatter={(value, name) => [`${value}회`, name]}
          />
        </PieChart>
      </ResponsiveContainer>
      <ul className="flex-1 space-y-2 text-sm w-full">
        {data.map((d) => {
          const pct = totals.total > 0 ? ((d.value / totals.total) * 100).toFixed(1) : "0";
          return (
            <li key={d.key} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 min-w-0">
                <span className="size-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                <span className="text-text-muted truncate">{d.name}</span>
              </span>
              <span className="font-data font-semibold shrink-0" style={{ color: d.color }}>
                {d.value}
                <span className="text-text-muted font-normal text-xs ml-1">({pct}%)</span>
              </span>
            </li>
          );
        })}
        <li className="pt-2 border-t border-border flex justify-between text-text-muted text-xs font-data">
          <span>{t("actions.total")}</span>
          <span className="text-text">{totals.total}</span>
        </li>
      </ul>
    </div>
  );
}
