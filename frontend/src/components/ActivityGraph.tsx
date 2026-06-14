import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HourlyActivity } from "../api/client";
import { useTheme } from "../theme";

interface Props {
  data: HourlyActivity[];
}

export function ActivityGraph({ data }: Props) {
  const { chart } = useTheme();
  const chartData = data.map((d) => ({
    hour: `${d.hour}:00`,
    activity: Math.round(d.activity),
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="activityGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={chart.accent} stopOpacity={0.4} />
            <stop offset="95%" stopColor={chart.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
        <XAxis dataKey="hour" stroke={chart.axis} fontSize={11} interval={2} />
        <YAxis stroke={chart.axis} fontSize={11} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
        <Tooltip
          contentStyle={{
            background: chart.tooltipBg,
            border: `1px solid ${chart.tooltipBorder}`,
            borderRadius: 8,
            color: chart.tooltipText,
          }}
          formatter={(value) => [`${value}%`, "활동량"]}
        />
        <Area
          type="monotone"
          dataKey="activity"
          stroke={chart.accent}
          fill="url(#activityGradient)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
