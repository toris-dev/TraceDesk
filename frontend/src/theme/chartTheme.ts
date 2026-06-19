import type { Theme } from "./types";
import { GANTT_PALETTE } from "./cyberTokens";

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

export function readChartTheme(_theme?: Theme): ChartTheme {
  void _theme;
  const style = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback;

  return {
    grid: pick("--color-chart-grid", "#00e5ff1a"),
    axis: pick("--color-text-muted", "#7a9aab"),
    tooltipBg: pick("--color-surface-elevated", "#0a1018"),
    tooltipBorder: pick("--color-border", "#00e5ff24"),
    tooltipText: pick("--color-text", "#dff8fb"),
    accent: pick("--color-accent", "#00e5ff"),
    accentMuted: pick("--color-accent-muted", "#67e8f9"),
    success: pick("--color-success", "#00ff88"),
    warning: pick("--color-warning", "#ffaa00"),
    danger: pick("--color-danger", "#ff4d6d"),
    track: pick("--color-border", "#00e5ff24"),
  };
}

export { GANTT_PALETTE };

export const APP_USAGE_PALETTE_LIGHT = [
  "#0891b2",
  "#06b6d4",
  "#22d3ee",
  "#00e5ff",
  "#0e7490",
  "#155e75",
  "#164e63",
  "#083344",
] as const;

export const APP_USAGE_PALETTE_DARK = [
  "#00e5ff",
  "#67e8f9",
  "#22d3ee",
  "#00ff88",
  "#06b6d4",
  "#5eead4",
  "#a78bfa",
  "#f472b6",
] as const;

export function appUsagePalette(theme: Theme): readonly string[] {
  return theme === "light" ? APP_USAGE_PALETTE_LIGHT : APP_USAGE_PALETTE_DARK;
}
