import type { ReactNode } from "react";
import { AppLogo } from "../components/AppLogo";
import { MASCOT_ICON_SRC } from "../components/mascot";
import { useI18n } from "../i18n";

export type DashboardPage =
  | "monitor"
  | "journal"
  | "overview"
  | "actions"
  | "timeline"
  | "analytics"
  | "system"
  | "settings";

const DASHBOARD_PAGES: DashboardPage[] = [
  "monitor",
  "journal",
  "overview",
  "actions",
  "timeline",
  "analytics",
  "system",
  "settings",
];

export function isDashboardPage(value: string): value is DashboardPage {
  return DASHBOARD_PAGES.includes(value as DashboardPage);
}

const NAV_IDS: { id: DashboardPage; labelKey: string; descKey: string; icon: string }[] = [
  { id: "monitor", labelKey: "nav.monitor", descKey: "nav.monitorDesc", icon: "◈" },
  { id: "journal", labelKey: "nav.journal", descKey: "nav.journalDesc", icon: "◎" },
  { id: "overview", labelKey: "nav.overview", descKey: "nav.overviewDesc", icon: "◫" },
  { id: "actions", labelKey: "nav.actions", descKey: "nav.actionsDesc", icon: "⚡" },
  { id: "timeline", labelKey: "nav.timeline", descKey: "nav.timelineDesc", icon: "▬" },
  { id: "analytics", labelKey: "nav.analytics", descKey: "nav.analyticsDesc", icon: "◔" },
  { id: "system", labelKey: "nav.system", descKey: "nav.systemDesc", icon: "⬡" },
  { id: "settings", labelKey: "nav.settings", descKey: "nav.settingsDesc", icon: "⚙" },
];

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
  const current = NAV_IDS.find((n) => n.id === page);

  return (
    <div className="h-screen flex overflow-hidden cyber-shell">
      <aside className="hidden md:flex w-60 shrink-0 h-full flex-col border-r cyber-sidebar">
        <div className="p-5 border-b border-border">
          <AppLogo subtitle={subtitle} />
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_IDS.map((item) => {
            const active = page === item.id;
            const badge =
              item.id === "journal" || item.id === "actions" ? actionBadge : undefined;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onPageChange(item.id)}
                className={`w-full text-left rounded-xl px-3 py-3 transition-all border ${
                  active
                    ? "cyber-nav-active text-text"
                    : "border-transparent hover:border-[var(--cyber-panel-border)] hover:bg-[var(--cyber-cyan-dim)]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-lg text-base ${
                      active ? "cyber-nav-icon-active" : "cyber-nav-icon text-text-muted"
                    }`}
                  >
                    {item.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-semibold font-display tracking-wide ${
                          active ? "text-[var(--cyber-cyan)]" : "text-text-muted"
                        }`}
                      >
                        {t(item.labelKey)}
                      </span>
                      {badge != null && badge > 0 && (
                        <span className="rounded-full bg-[var(--cyber-cyan-dim)] text-[var(--cyber-cyan)] text-[10px] px-1.5 py-0.5 font-data font-medium">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-text-muted truncate">{t(item.descKey)}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-2 text-xs font-data text-text-muted">
            <span
              className={`w-2 h-2 rounded-full ${connected ? "bg-success animate-pulse shadow-[0_0_8px_var(--cyber-green)]" : "bg-danger"}`}
            />
            {connected ? t("status.collecting") : t("status.disconnected")}
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="shrink-0 z-20 border-b cyber-header backdrop-blur-md">
          <div className="px-4 md:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="md:hidden">
              <AppLogo subtitle={subtitle} />
            </div>
            <div className="hidden md:block">
              <h2 className="text-xl font-display font-semibold tracking-wide text-[var(--cyber-cyan)]">
                {current ? t(current.labelKey) : ""}
              </h2>
              <p className="text-sm text-text-muted">
                {current ? t(current.descKey) : ""}
              </p>
            </div>

            <div className="relative flex flex-wrap items-center gap-2 ml-auto">
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

          <nav className="md:hidden flex gap-1 overflow-x-auto px-3 pb-3 scrollbar-none">
            {NAV_IDS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onPageChange(item.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-display tracking-wide border transition-colors ${
                  page === item.id
                    ? "bg-[var(--cyber-cyan)] text-[var(--td-accent-foreground)] border-[var(--cyber-cyan)]"
                    : "border-border text-text-muted hover:border-[var(--cyber-cyan)]"
                }`}
              >
                {t(item.labelKey)}
              </button>
            ))}
          </nav>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto px-4 md:px-8 py-6">{children}</main>

        <footer className="shrink-0 border-t border-border px-8 py-4 flex items-center justify-between text-xs font-data text-text-muted">
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
