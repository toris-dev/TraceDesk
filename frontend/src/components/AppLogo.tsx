import { TortoiseMascot } from "./mascot";

interface Props {
  subtitle?: string;
}

export function AppLogo({ subtitle }: Props) {
  return (
    <div className="flex items-center gap-3">
      <TortoiseMascot mood="idle" size="sm" interactive className="shrink-0" />
      <div>
        <h1 className="text-xl font-bold tracking-tight leading-tight text-text">
          Trace<span className="text-accent">Desk</span>
        </h1>
        {subtitle && <p className="text-text-muted text-sm">{subtitle}</p>}
        {!subtitle && (
          <p className="text-text-muted text-xs">개인 PC 활동 기록</p>
        )}
      </div>
    </div>
  );
}
