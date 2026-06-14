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
import { appUsagePalette, useTheme } from "../theme";

interface Props {
  data: { application: string; duration: number }[];
}

export function AppUsageChart({ data }: Props) {
  const { theme, chart } = useTheme();
  const colors = appUsagePalette(theme);
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
        <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} horizontal={false} />
        <XAxis type="number" stroke={chart.axis} fontSize={12} tickFormatter={(v) => `${v}m`} />
        <YAxis type="category" dataKey="name" stroke={chart.axis} fontSize={12} width={100} />
        <Tooltip
          contentStyle={{
            background: chart.tooltipBg,
            border: `1px solid ${chart.tooltipBorder}`,
            borderRadius: 8,
            color: chart.tooltipText,
          }}
          formatter={(value, _name, props) => [
            formatDuration(Number(value)),
            (props?.payload as { fullName?: string })?.fullName ?? "사용 시간",
          ]}
        />
        <Bar dataKey="minutes" radius={[0, 4, 4, 0]}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
