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

interface Props {
  data: ActionHourlyPoint[];
}

export function ActionChart({ data }: Props) {
  const hasData = data.some((d) => d.copy + d.paste + d.screenshot > 0);

  if (!hasData) {
    return (
      <div className="flex h-40 items-center justify-center text-text-muted text-sm">
        복사/붙여넣기/스크린샷 이벤트가 없습니다
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
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3d" />
        <XAxis dataKey="hour" stroke="#94a3b8" fontSize={10} interval={3} />
        <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            background: "#1a1d27",
            border: "1px solid #2a2f3d",
            borderRadius: 8,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="copy" name="복사" fill="#22c55e" stackId="a" radius={[0, 0, 0, 0]} />
        <Bar dataKey="paste" name="붙여넣기" fill="#f59e0b" stackId="a" />
        <Bar dataKey="screenshot" name="스크린샷" fill="#ef4444" stackId="a" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
