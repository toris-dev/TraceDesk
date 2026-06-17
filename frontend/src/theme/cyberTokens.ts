/** Cyber palette — matches index.css tokens (for inline styles & charts). */
export const CYBER = {
  cyan: "#00e5ff",
  green: "#00ff88",
  amber: "#ffaa00",
  magenta: "#ff2eb8",
  violet: "#a78bfa",
  muted: "#7a9aab",
  danger: "#ff4d6d",
} as const;

export const EVENT_ACCENT: Record<string, string> = {
  COPY: CYBER.green,
  PASTE: CYBER.amber,
  SCREENSHOT: CYBER.magenta,
  WINDOW_FOCUS: CYBER.cyan,
  IDLE_START: CYBER.muted,
  IDLE_END: CYBER.muted,
};

export const GRADE_COLORS: Record<string, string> = {
  A: CYBER.green,
  B: CYBER.cyan,
  C: CYBER.amber,
  D: "#ff7b00",
  F: CYBER.danger,
};

export const GANTT_PALETTE = [
  CYBER.cyan,
  CYBER.green,
  CYBER.amber,
  CYBER.magenta,
  "#06b6d4",
  CYBER.violet,
  "#84cc16",
  "#f472b6",
] as const;
