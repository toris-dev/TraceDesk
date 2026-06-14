import { ActionChart } from "../components/ActionChart";
import { ActivityGraph } from "../components/ActivityGraph";
import { AppUsageChart } from "../components/AppUsageChart";
import { IdleAnalysisPanel } from "../components/TimelineGantt";
import { ProductivityPanel, WeeklyReportPanel } from "../components/ProductivityPanel";
import type {
  ActionHourlyPoint,
  ApplicationUsage,
  HourlyActivity,
  IdleAnalysis,
  ProductivityAnalysis,
  WeeklyReport,
} from "../api/client";

interface Props {
  productivity: ProductivityAnalysis | null;
  weeklyReport: WeeklyReport | null;
  hourly: HourlyActivity[];
  actionHourly: ActionHourlyPoint[];
  applications: ApplicationUsage[];
  idleAnalysis: IdleAnalysis | null;
}

export function AnalyticsView({
  productivity,
  weeklyReport,
  hourly,
  actionHourly,
  applications,
  idleAnalysis,
}: Props) {
  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="grid lg:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-border bg-surface-elevated p-6">
          <h3 className="text-lg font-semibold mb-4">생산성 분석</h3>
          {productivity && <ProductivityPanel analysis={productivity} />}
        </section>
        <section className="rounded-2xl border border-border bg-surface-elevated p-6">
          <h3 className="text-lg font-semibold mb-4">주간 리포트</h3>
          {weeklyReport && <WeeklyReportPanel report={weeklyReport} />}
        </section>
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-border bg-surface-elevated p-6">
          <h3 className="text-lg font-semibold mb-4">시간별 집중도</h3>
          <ActivityGraph data={hourly} />
        </section>
        <section className="rounded-2xl border border-border bg-surface-elevated p-6">
          <h3 className="text-lg font-semibold mb-4">시간별 행동</h3>
          <ActionChart data={actionHourly} />
        </section>
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-border bg-surface-elevated p-6">
          <h3 className="text-lg font-semibold mb-4">앱 사용 통계</h3>
          <AppUsageChart data={applications} />
        </section>
        <section className="rounded-2xl border border-border bg-surface-elevated p-6">
          <h3 className="text-lg font-semibold mb-4">유휴 분석</h3>
          {idleAnalysis && <IdleAnalysisPanel analysis={idleAnalysis} />}
        </section>
      </div>
    </div>
  );
}
