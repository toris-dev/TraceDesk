import type { Theme } from "./types";

export interface ChartTheme {
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  accent: string;
  accentMuted: string;
  success: string;
  warning: string;
  danger: string;
  track: string;
}

export function readChartTheme(): ChartTheme {
  const style = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback;

  return {
    grid: pick("--color-chart-grid", "#2a2f3d"),
    axis: pick("--color-text-muted", "#94a3b8"),
    tooltipBg: pick("--color-surface-elevated", "#1a1d27"),
    tooltipBorder: pick("--color-border", "#2a2f3d"),
    tooltipText: pick("--color-text", "#e2e8f0"),
    accent: pick("--color-accent", "#6366f1"),
    accentMuted: pick("--color-accent-muted", "#818cf8"),
    success: pick("--color-success", "#22c55e"),
    warning: pick("--color-warning", "#f59e0b"),
    danger: pick("--color-danger", "#ef4444"),
    track: pick("--color-border", "#2a2f3d"),
  };
}

export const GANTT_PALETTE = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#a855f7",
] as const;

export const APP_USAGE_PALETTE_LIGHT = [
  "#6366f1",
  "#818cf8",
  "#a5b4fc",
  "#4f46e5",
  "#4338ca",
  "#3730a3",
  "#312e81",
  "#1e1b4b",
] as const;

export const APP_USAGE_PALETTE_DARK = APP_USAGE_PALETTE_LIGHT;

export function appUsagePalette(theme: Theme): readonly string[] {
  return theme === "light" ? APP_USAGE_PALETTE_LIGHT : APP_USAGE_PALETTE_DARK;
}
