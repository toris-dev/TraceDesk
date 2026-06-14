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

interface Props {
  data: ActionHourlyPoint[];
}

export function ActionChart({ data }: Props) {
  const { t } = useI18n();
  const { chart } = useTheme();
  const hasData = data.some((d) => d.copy + d.paste + d.screenshot > 0);

  if (!hasData) {
    return (
      <div className="flex h-40 items-center justify-center text-text-muted text-sm">
        {t("actions.noChartData")}
      </div>
    );
  }

  const chartData = data.map((d) => ({
    hour: `${d.hour}시`,
    copy: d.copy,
    paste: d.paste,
    screenshot: d.screenshot,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
        <XAxis dataKey="hour" stroke={chart.axis} fontSize={10} interval={3} />
        <YAxis stroke={chart.axis} fontSize={11} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            background: chart.tooltipBg,
            border: `1px solid ${chart.tooltipBorder}`,
            borderRadius: 8,
            color: chart.tooltipText,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: chart.tooltipText }} />
        <Bar dataKey="copy" name={t("actions.copy")} fill={chart.success} stackId="a" radius={[0, 0, 0, 0]} />
        <Bar dataKey="paste" name={t("actions.paste")} fill={chart.warning} stackId="a" />
        <Bar dataKey="screenshot" name={t("events.SCREENSHOT")} fill={chart.danger} stackId="a" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
