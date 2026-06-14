export type Locale = "ko" | "en";

export const LOCALES: { id: Locale; label: string; native: string }[] = [
  { id: "ko", label: "Korean", native: "한국어" },
  { id: "en", label: "English", native: "English" },
];

export function normalizeLocale(value: string | null | undefined): Locale {
  return value === "en" ? "en" : "ko";
}
