import type { ReactNode } from "react";
import { AppLogo } from "../components/AppLogo";
import { MASCOT_SRC } from "../components/mascot";
import { useI18n } from "../i18n";

export type DashboardPage =
  | "journal"
  | "overview"
  | "actions"
  | "timeline"
  | "analytics"
  | "system"
  | "settings";

const DASHBOARD_PAGES: DashboardPage[] = [
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
    <div className="h-screen flex overflow-hidden bg-surface">
      <aside className="hidden md:flex w-60 shrink-0 h-full flex-col border-r border-border bg-surface-elevated/80">
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
                className={`w-full text-left rounded-xl px-3 py-3 transition-all ${
                  active
                    ? "bg-accent/15 border border-accent/40 shadow-sm shadow-accent/10"
                    : "border border-transparent hover:bg-surface hover:border-border"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-lg text-base ${
                      active ? "bg-accent text-accent-foreground" : "bg-surface text-text-muted"
                    }`}
                  >
                    {item.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${active ? "text-text" : "text-text-muted"}`}>
                        {t(item.labelKey)}
                      </span>
                      {badge != null && badge > 0 && (
                        <span className="rounded-full bg-accent/20 text-accent text-[10px] px-1.5 py-0.5 font-medium">
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
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span
              className={`w-2 h-2 rounded-full ${connected ? "bg-success animate-pulse" : "bg-red-500"}`}
            />
            {connected ? t("status.collecting") : t("status.disconnected")}
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="shrink-0 z-20 border-b border-border bg-[var(--color-header-backdrop)] backdrop-blur-md">
          <div className="px-4 md:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="md:hidden">
              <AppLogo subtitle={subtitle} />
            </div>
            <div className="hidden md:block">
              <h2 className="text-xl font-semibold text-text">
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
                  className="rounded-lg border border-border px-3 py-2 text-sm text-text-muted hover:text-text hover:bg-surface-elevated disabled:opacity-50"
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
                  className={`w-2 h-2 rounded-full ${connected ? "bg-success animate-pulse" : "bg-red-500"}`}
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
                className={`shrink-0 rounded-full px-4 py-2 text-sm border transition-colors ${
                  page === item.id
                    ? "bg-accent text-accent-foreground border-accent"
                    : "border-border text-text-muted"
                }`}
              >
                {t(item.labelKey)}
              </button>
            ))}
          </nav>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto px-4 md:px-8 py-6">{children}</main>

        <footer className="shrink-0 border-t border-border px-8 py-4 flex items-center justify-between text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <img src={MASCOT_SRC} alt="" className="w-5 h-5 opacity-50 mascot-float" />
            TraceDesk · {t("common.localStorage")}
          </div>
          <span className="hidden sm:inline">{t("common.tagline")}</span>
        </footer>
      </div>
    </div>
  );
}

export function isActivityPage(page: DashboardPage): boolean {
  return ["journal", "overview", "actions", "timeline", "analytics"].includes(page);
}
