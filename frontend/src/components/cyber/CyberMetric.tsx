interface Props {
  label: string;
  value: string;
  subValue?: string;
  percent?: number;
  color?: string;
  compact?: boolean;
}

export function CyberMetric({
  label,
  value,
  subValue,
  percent,
  color = "var(--cyber-cyan)",
  compact = false,
}: Props) {
  return (
    <div className="cyber-metric">
      <span className="cyber-metric-label">{label}</span>
      <span
        className={`cyber-metric-value ${compact ? "!text-base" : ""}`}
        style={{ color }}
      >
        {value}
      </span>
      {subValue && (
        <span className="text-[0.6rem] font-mono text-text-muted">{subValue}</span>
      )}
      {percent != null && (
        <div className="cyber-metric-bar">
          <div
            className="cyber-metric-bar-fill"
            style={{
              width: `${Math.min(percent, 100)}%`,
              background: color,
              color,
            }}
          />
        </div>
      )}
    </div>
  );
}
