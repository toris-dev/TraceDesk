import { useEffect, useMemo, useState } from "react";
import { AppLogo } from "../components/AppLogo";
import { useI18n } from "../i18n";
import type { DashboardPage } from "./DashboardLayout";

const SIDEBAR_STATE_KEY = "tracedesk-sidebar-collapsed:v1";

type NavItem = {
  id: DashboardPage;
  code: string;
  labelKey: string;
  descKey: string;
  group: "command" | "record" | "config";
};

const NAV_ITEMS: NavItem[] = [
  { id: "monitor", code: "01", labelKey: "nav.monitor", descKey: "nav.monitorDesc", group: "command" },
  { id: "ai", code: "02", labelKey: "nav.ai", descKey: "nav.aiDesc", group: "command" },
  { id: "pulse", code: "03", labelKey: "nav.pulse", descKey: "nav.pulseDesc", group: "command" },
  { id: "journal", code: "04", labelKey: "nav.journal", descKey: "nav.journalDesc", group: "record" },
  { id: "overview", code: "05", labelKey: "nav.overview", descKey: "nav.overviewDesc", group: "record" },
  { id: "actions", code: "06", labelKey: "nav.actions", descKey: "nav.actionsDesc", group: "record" },
  { id: "timeline", code: "07", labelKey: "nav.timeline", descKey: "nav.timelineDesc", group: "record" },
  { id: "analytics", code: "08", labelKey: "nav.analytics", descKey: "nav.analyticsDesc", group: "record" },
  { id: "settings", code: "09", labelKey: "nav.settings", descKey: "nav.settingsDesc", group: "config" },
];

const GROUP_ORDER: NavItem["group"][] = ["command", "record", "config"];

interface Props {
  page: DashboardPage;
  onPageChange: (page: DashboardPage) => void;
  connected: boolean;
  subtitle?: string;
  actionBadge?: number;
}

export function CyberSidebar({
  page,
  onPageChange,
  connected,
  subtitle,
  actionBadge,
}: Props) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_STATE_KEY) === "1";
  });
  const [hovered, setHovered] = useState<DashboardPage | null>(null);
  const [clock, setClock] = useState(formatClock);

  useEffect(() => {
    const id = window.setInterval(() => setClock(formatClock()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SIDEBAR_STATE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const grouped = useMemo(() => {
    return GROUP_ORDER.map((group) => ({
      group,
      items: NAV_ITEMS.filter((item) => item.group === group),
    }));
  }, []);

  return (
    <aside
      className={`cyber-sidebar cyber-app-rail cyber-sidebar-shell hidden md:flex shrink-0 h-full flex-col border-r transition-[width] duration-300 ease-out ${
        collapsed ? "w-[4.5rem]" : "w-[17.5rem]"
      }`}
      data-collapsed={collapsed ? "true" : "false"}
    >
      <div className={`cyber-brand-bay border-b border-border ${collapsed ? "px-2.5 py-4" : "px-4 py-5"}`}>
        <div className={`flex items-start ${collapsed ? "flex-col items-center gap-3" : "justify-between gap-3"}`}>
          <AppLogo subtitle={subtitle} compact={collapsed} />
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="cyber-sidebar-toggle"
            title={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
            aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
            aria-expanded={!collapsed}
          >
            <span className="cyber-sidebar-toggle-glyph">{collapsed ? "⟩" : "⟨"}</span>
          </button>
        </div>

        {!collapsed && (
          <div className="cyber-brand-status mt-4">
            <span
              className={
                connected ? "cyber-status-dot cyber-status-dot-live" : "cyber-status-dot cyber-status-dot-off"
              }
            />
            <span>{t("sidebar.traceCore")}</span>
            <span className="cyber-sidebar-clock font-data">{clock}</span>
          </div>
        )}
      </div>

      <nav
        className={`cyber-nav-rail flex-1 overflow-y-auto cyber-scroll relative ${
          collapsed ? "px-2 py-3" : "px-3 py-4"
        }`}
        aria-label={t("sidebar.navigation")}
      >
        <div className={`space-y-5 ${collapsed ? "space-y-3" : ""}`}>
          {grouped.map(({ group, items }) => (
            <section key={group} className="cyber-nav-section">
              {!collapsed && (
                <h2 className="cyber-nav-group-label">{t(`sidebar.group.${group}`)}</h2>
              )}
              <ul className={`space-y-1 ${collapsed ? "space-y-1.5" : ""}`}>
                {items.map((item) => {
                  const active = page === item.id;
                  const isHover = hovered === item.id;
                  const badge =
                    item.id === "journal" || item.id === "actions" ? actionBadge : undefined;

                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onPageChange(item.id)}
                        onMouseEnter={() => setHovered(item.id)}
                        onMouseLeave={() => setHovered(null)}
                        onFocus={() => setHovered(item.id)}
                        onBlur={() => setHovered(null)}
                        aria-current={active ? "page" : undefined}
                        title={collapsed ? t(item.labelKey) : undefined}
                        className={`cyber-nav-item w-full text-left ${active ? "is-active" : ""} ${
                          isHover && !active ? "is-hover" : ""
                        } ${collapsed ? "cyber-nav-item-collapsed" : ""}`}
                      >
                        <span className="cyber-nav-code font-data">{item.code}</span>
                        {!collapsed && (
                          <span className="cyber-nav-copy min-w-0 flex-1">
                            <span className="cyber-nav-title font-display">{t(item.labelKey)}</span>
                            <span className="cyber-nav-desc">{t(item.descKey)}</span>
                          </span>
                        )}
                        {!collapsed && badge != null && badge > 0 && (
                          <span className="cyber-nav-badge font-data">
                            {badge > 99 ? "99+" : badge}
                          </span>
                        )}
                        {collapsed && badge != null && badge > 0 && (
                          <span className="cyber-nav-badge-dot" aria-label={`${badge} events`} />
                        )}
                        <span className="cyber-nav-scan" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </nav>

      <div
        className={`cyber-sidebar-footer border-t border-border ${
          collapsed ? "px-2 py-3" : "px-4 py-4"
        }`}
      >
        <div
          className={`cyber-sidebar-link-status ${collapsed ? "justify-center" : ""}`}
          title={connected ? t("status.collecting") : t("status.disconnected")}
        >
          <span
            className={`cyber-sidebar-pulse-dot ${
              connected ? "is-live" : "is-off"
            }`}
          />
          {!collapsed && (
            <div className="min-w-0">
              <p className="cyber-sidebar-link-label font-data">
                {connected ? t("status.collecting") : t("status.disconnected")}
              </p>
              <p className="cyber-sidebar-link-hint">{t("sidebar.localOnly")}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function formatClock(): string {
  const now = new Date();
  return now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

export { NAV_ITEMS as SIDEBAR_NAV_ITEMS };
