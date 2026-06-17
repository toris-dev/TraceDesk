import type { ReactNode } from "react";

type Glow = "cyan" | "green" | "magenta" | "amber";

interface Props {
  title: string;
  subtitle?: string;
  glow?: Glow;
  className?: string;
  headerRight?: ReactNode;
  children: ReactNode;
  noPadding?: boolean;
}

export function CyberPanel({
  title,
  subtitle,
  glow = "cyan",
  className = "",
  headerRight,
  children,
  noPadding = false,
}: Props) {
  return (
    <div className={`cyber-panel cyber-panel-glow-${glow} flex flex-col min-h-0 ${className}`}>
      <div className="cyber-panel-header shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="cyber-panel-title truncate">{title}</span>
          {subtitle && <span className="cyber-panel-sub truncate">{subtitle}</span>}
        </div>
        {headerRight}
      </div>
      <div className={`cyber-panel-body flex-1 min-h-0 ${noPadding ? "!p-0" : ""}`}>
        {children}
      </div>
    </div>
  );
}
