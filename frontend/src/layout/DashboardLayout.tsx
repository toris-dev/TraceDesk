import { type ReactNode } from "react";
import { AppLogo } from "../components/AppLogo";
import { MASCOT_ICON_SRC } from "../components/mascot";
import { useI18n } from "../i18n";
import { CyberSidebar, SIDEBAR_NAV_ITEMS } from "./CyberSidebar";

export type DashboardPage =
  | "monitor"
  | "journal"
  | "overview"
  | "actions"
  | "timeline"
  | "analytics"
  | "ai"
  | "pulse"
  | "settings";

const DASHBOARD_PAGES: DashboardPage[] = [
  "monitor",
  "journal",
  "overview",
  "actions",
  "timeline",
  "analytics",
  "ai",
  "pulse",
  "settings",
];

export function isDashboardPage(value: string): value is DashboardPage {
  return DASHBOARD_PAGES.includes(value as DashboardPage);
}

interface Props {
  page: DashboardPage;
  onPageChange: (page: DashboardPage) => void;
  connected: boolean;
  subtitle?: string;
  actionBadge?: number;
  toolbar?: ReactNode;
  themeToggle?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  children: ReactNode;
}

export function DashboardLayout({
  page,
  onPageChange,
  connected,
  subtitle,
  actionBadge,
  toolbar,
  themeToggle,
  onRefresh,
  refreshing,
  children,
}: Props) {
  const { t } = useI18n();
  const current = SIDEBAR_NAV_ITEMS.find((n) => n.id === page);

  return (
    <div className="h-screen flex overflow-hidden cyber-shell">
      <CyberSidebar
        page={page}
        onPageChange={onPageChange}
        connected={connected}
        subtitle={subtitle}
        actionBadge={actionBadge}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="shrink-0 z-20 border-b cyber-header cyber-topbar backdrop-blur-md">
          <div className="px-4 py-4 md:px-8 flex items-center justify-between gap-4 md:flex-nowrap cyber-topbar-inner">
            <div className="md:hidden">
              <AppLogo subtitle={subtitle} />
            </div>
            <div className="hidden min-w-0 flex-1 md:block">
              <p className="cyber-window-kicker whitespace-nowrap">TRACEDESK / LOCAL ACTIVITY OS</p>
              <h2 className="truncate whitespace-nowrap text-xl font-display font-semibold tracking-wide text-[var(--cyber-cyan)]">
                {current ? t(current.labelKey) : ""}
              </h2>
              <p className="truncate whitespace-nowrap text-sm text-text-muted">
                {current ? t(current.descKey) : ""}
              </p>
            </div>

            <div className="relative ml-auto flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto scrollbar-none">
              {toolbar}
              {themeToggle}
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={refreshing}
                  className="rounded-lg border border-border px-3 py-2 text-sm font-data text-text-muted hover:text-[var(--cyber-cyan)] hover:border-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan-dim)] disabled:opacity-50 transition-colors"
                  title={t("status.refreshData")}
                >
                  {refreshing ? "…" : "↻"}
                </button>
              )}
              <div
                className="hidden sm:flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2"
                title={connected ? t("status.bgCollecting") : t("status.disconnected")}
              >
                <span
                  className={`w-2 h-2 rounded-full ${connected ? "bg-success animate-pulse" : "bg-danger"}`}
                />
              </div>
            </div>
          </div>

          <nav className="md:hidden flex gap-1.5 overflow-x-auto px-3 pb-3 scrollbar-none cyber-mobile-nav">
            {SIDEBAR_NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onPageChange(item.id)}
                aria-current={page === item.id ? "page" : undefined}
                className={`cyber-mobile-nav-chip shrink-0 ${page === item.id ? "is-active" : ""}`}
              >
                <span className="font-data text-[10px] opacity-70">{item.code}</span>
                <span>{t(item.labelKey)}</span>
              </button>
            ))}
          </nav>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto px-4 md:px-8 py-6 cyber-workspace">{children}</main>

        <footer className="shrink-0 border-t border-border px-8 py-4 flex items-center justify-between text-xs font-data text-text-muted cyber-footerbar">
          <div className="flex items-center gap-2">
            <img src={MASCOT_ICON_SRC} alt="" className="w-5 h-5 rounded-md object-cover opacity-60 mascot-float" />
            TraceDesk · {t("common.localStorage")}
          </div>
          <span className="hidden sm:inline">{t("common.tagline")}</span>
        </footer>
      </div>
    </div>
  );
}

export function isActivityPage(page: DashboardPage): boolean {
  return ["monitor", "journal", "overview", "actions", "timeline", "analytics"].includes(page);
}

/** Activity bundle auto-refresh cadence — monitor/analytics poll less often. */
export function activityRefreshInterval(page: DashboardPage): number {
  if (page === "monitor") return 120_000;
  if (page === "analytics") return 120_000;
  if (page === "overview") return 90_000;
  return 75_000;
}
