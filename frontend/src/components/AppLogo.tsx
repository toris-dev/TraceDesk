import { TurtleIcon } from "./mascot/TurtleIcon";

interface Props {
  subtitle?: string;
}

export function AppLogo({ subtitle }: Props) {
  return (
    <div className="flex items-center gap-3">
      <TurtleIcon size="lg" className="shrink-0" />
      <div>
        <h1 className="text-xl font-display font-bold tracking-wider leading-tight text-text">
          TRACE<span className="text-[var(--cyber-cyan)]">DESK</span>
        </h1>
        {subtitle && <p className="text-text-muted text-sm font-data">{subtitle}</p>}
        {!subtitle && (
          <p className="text-text-muted text-xs font-data tracking-wide">개인 PC 활동 기록</p>
        )}
      </div>
    </div>
  );
}
