import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ActionHourlyPoint } from "../api/client";
import { useI18n } from "../i18n";
import { useTheme } from "../theme";
import { CYBER } from "../theme/cyberTokens";

interface Props {
  data: ActionHourlyPoint[];
  variant?: "stacked" | "grouped";
  height?: number;
}

export function ActionChart({ data, variant = "grouped", height = 200 }: Props) {
  const { t } = useI18n();
  const { chart } = useTheme();
  const hasData = data.some((d) => d.copy + d.paste + d.screenshot > 0);

  if (!hasData) {
    return (
      <div
        className="flex items-center justify-center text-text-muted text-sm"
        style={{ height }}
      >
        {t("actions.noChartData")}
      </div>
    );
  }

  const chartData = data.map((d) => ({
    hour: `${d.hour}시`,
    copy: d.copy,
    paste: d.paste,
    screenshot: d.screenshot,
    total: d.copy + d.paste + d.screenshot,
  }));

  const tooltipStyle = {
    background: chart.tooltipBg,
    border: `1px solid ${chart.tooltipBorder}`,
    borderRadius: 8,
    color: chart.tooltipText,
    fontFamily: "var(--cyber-font-mono)",
    fontSize: 12,
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} barGap={variant === "grouped" ? 1 : 0} barCategoryGap="12%">
        <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
        <XAxis dataKey="hour" stroke={chart.axis} fontSize={10} interval={2} tick={{ fill: chart.axis }} />
        <YAxis stroke={chart.axis} fontSize={11} allowDecimals={false} tick={{ fill: chart.axis }} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, name) => [`${value}회`, name]}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: chart.tooltipText }} />
        {variant === "grouped" ? (
          <>
            <Bar dataKey="copy" name={t("actions.copy")} fill={CYBER.green} radius={[3, 3, 0, 0]} maxBarSize={14} />
            <Bar dataKey="paste" name={t("actions.paste")} fill={CYBER.amber} radius={[3, 3, 0, 0]} maxBarSize={14} />
            <Bar
              dataKey="screenshot"
              name={t("actions.capture")}
              fill={CYBER.magenta}
              radius={[3, 3, 0, 0]}
              maxBarSize={14}
            />
          </>
        ) : (
          <>
            <Bar dataKey="copy" name={t("actions.copy")} fill={CYBER.green} stackId="a" />
            <Bar dataKey="paste" name={t("actions.paste")} fill={CYBER.amber} stackId="a" />
            <Bar dataKey="screenshot" name={t("actions.capture")} fill={CYBER.magenta} stackId="a" radius={[4, 4, 0, 0]} />
          </>
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}
