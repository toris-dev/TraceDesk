import { TurtleIcon } from "./mascot/TurtleIcon";

interface Props {
  subtitle?: string;
  compact?: boolean;
}

export function AppLogo({ subtitle, compact = false }: Props) {
  if (compact) {
    return (
      <div className="flex items-center justify-center">
        <TurtleIcon size="lg" className="shrink-0" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 min-w-0">
      <TurtleIcon size="lg" className="shrink-0" />
      <div className="min-w-0 max-w-[12.75rem]">
        <h1 className="whitespace-nowrap text-[1.48rem] font-display font-bold tracking-[0.08em] leading-none text-text">
          TRACE<span className="text-[var(--cyber-cyan)]">DESK</span>
        </h1>
        {subtitle && (
          <p
            className="mt-1 max-w-[12.5rem] truncate whitespace-nowrap text-[0.78rem] leading-none text-text-muted font-data tracking-[0.04em]"
            title={subtitle}
          >
            {subtitle}
          </p>
        )}
        {!subtitle && (
          <p className="mt-1 text-text-muted text-xs font-data tracking-wide">개인 PC 활동 기록</p>
        )}
      </div>
    </div>
  );
}
