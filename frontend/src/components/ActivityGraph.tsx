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

interface Props {
  data: HourlyActivity[];
}

export function ActivityGraph({ data }: Props) {
  const chartData = data.map((d) => ({
    hour: `${d.hour}:00`,
    activity: Math.round(d.activity),
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="activityGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3d" />
        <XAxis dataKey="hour" stroke="#94a3b8" fontSize={11} interval={2} />
        <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
        <Tooltip
          contentStyle={{
            background: "#1a1d27",
            border: "1px solid #2a2f3d",
            borderRadius: 8,
          }}
          formatter={(value) => [`${value}%`, "활동량"]}
        />
        <Area
          type="monotone"
          dataKey="activity"
          stroke="#6366f1"
          fill="url(#activityGradient)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
