import type { ReactNode } from "react";
import { AppLogo } from "../components/AppLogo";
import { MASCOT_SRC } from "../components/mascot";

export type DashboardPage =
  | "overview"
  | "actions"
  | "timeline"
  | "analytics"
  | "system"
  | "settings";

const NAV: {
  id: DashboardPage;
  label: string;
  description: string;
  icon: string;
}[] = [
  { id: "overview", label: "대시보드", description: "한눈에 보는 오늘", icon: "◫" },
  { id: "actions", label: "행동 기록", description: "복사 · 붙여넣기 · 캡처", icon: "⚡" },
  { id: "timeline", label: "타임라인", description: "앱 사용 흐름", icon: "▬" },
  { id: "analytics", label: "분석", description: "생산성 · 앱 · 유휴", icon: "◔" },
  { id: "system", label: "시스템", description: "CPU · 메모리 · 포트", icon: "⬡" },
  { id: "settings", label: "설정", description: "권한 · 보관", icon: "⚙" },
];

interface Props {
  page: DashboardPage;
  onPageChange: (page: DashboardPage) => void;
  connected: boolean;
  subtitle?: string;
  actionBadge?: number;
  toolbar?: ReactNode;
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
  onRefresh,
  refreshing,
  children,
}: Props) {
  const current = NAV.find((n) => n.id === page);

  return (
    <div className="min-h-screen flex bg-surface">
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-surface-elevated/80">
        <div className="p-5 border-b border-border">
          <AppLogo subtitle={subtitle} />
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map((item) => {
            const active = page === item.id;
            const badge = item.id === "actions" ? actionBadge : undefined;
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
                      active ? "bg-accent text-white" : "bg-surface text-text-muted"
                    }`}
                  >
                    {item.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${active ? "text-text" : ""}`}>
                        {item.label}
                      </span>
                      {badge != null && badge > 0 && (
                        <span className="rounded-full bg-accent/20 text-accent text-[10px] px-1.5 py-0.5 font-medium">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-text-muted truncate">{item.description}</p>
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
            {connected ? "수집 실행 중" : "연결 끊김"}
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur-md">
          <div className="px-4 md:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="md:hidden">
              <AppLogo subtitle={subtitle} />
            </div>
            <div className="hidden md:block">
              <h2 className="text-xl font-semibold">{current?.label}</h2>
              <p className="text-sm text-text-muted">{current?.description}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3 ml-auto">
              {toolbar}
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={refreshing}
                  className="rounded-lg border border-border px-3 py-2 text-sm text-text-muted hover:text-text hover:bg-surface-elevated disabled:opacity-50"
                >
                  {refreshing ? "새로고침…" : "새로고침"}
                </button>
              )}
              <div className="hidden sm:flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                <span
                  className={`w-2 h-2 rounded-full ${connected ? "bg-success animate-pulse" : "bg-red-500"}`}
                />
                <span className="text-sm text-text-muted">
                  {connected ? "Live" : "Offline"}
                </span>
              </div>
            </div>
          </div>

          <nav className="md:hidden flex gap-1 overflow-x-auto px-3 pb-3 scrollbar-none">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onPageChange(item.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm border transition-colors ${
                  page === item.id
                    ? "bg-accent text-white border-accent"
                    : "border-border text-text-muted"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </header>

        <main className="flex-1 px-4 md:px-8 py-6 overflow-y-auto">{children}</main>

        <footer className="border-t border-border px-8 py-4 flex items-center justify-between text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <img src={MASCOT_SRC} alt="" className="w-5 h-5 opacity-50 mascot-float" />
            TraceDesk · 로컬 저장
          </div>
          <span className="hidden sm:inline">Personal Computer Activity Intelligence</span>
        </footer>
      </div>
    </div>
  );
}

export function isActivityPage(page: DashboardPage): boolean {
  return ["overview", "actions", "timeline", "analytics"].includes(page);
}
