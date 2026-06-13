import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDuration } from "../api/client";

interface Props {
  data: { application: string; duration: number }[];
}

const COLORS = [
  "#6366f1",
  "#818cf8",
  "#a5b4fc",
  "#4f46e5",
  "#4338ca",
  "#3730a3",
  "#312e81",
  "#1e1b4b",
];

export function AppUsageChart({ data }: Props) {
  const chartData = data.slice(0, 8).map((d) => ({
    name: d.application.length > 16 ? d.application.slice(0, 14) + "…" : d.application,
    minutes: Math.round(d.duration / 60),
    fullName: d.application,
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-text-muted">
        아직 앱 사용 데이터가 없습니다
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3d" horizontal={false} />
        <XAxis type="number" stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `${v}m`} />
        <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={12} width={100} />
        <Tooltip
          contentStyle={{
            background: "#1a1d27",
            border: "1px solid #2a2f3d",
            borderRadius: 8,
          }}
          formatter={(value, _name, props) => [
            formatDuration(Number(value)),
            (props?.payload as { fullName?: string })?.fullName ?? "사용 시간",
          ]}
        />
        <Bar dataKey="minutes" radius={[0, 4, 4, 0]}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
