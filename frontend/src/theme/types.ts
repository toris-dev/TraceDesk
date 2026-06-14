export type Theme = "dark" | "light";

export const THEMES: { id: Theme; icon: string }[] = [
  { id: "light", icon: "☀" },
  { id: "dark", icon: "☾" },
];

export function normalizeTheme(value: string | null | undefined): Theme {
  return value === "light" ? "light" : "dark";
}
