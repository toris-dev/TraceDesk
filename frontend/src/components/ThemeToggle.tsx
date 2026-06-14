import { useI18n } from "../i18n";
import { THEMES, useTheme } from "../theme";
import { updateSettings } from "../api/client";
import type { AppSettings } from "../api/client";

interface Props {
  onSettingsChange?: (settings: AppSettings) => void;
  disabled?: boolean;
}

export function ThemeToggle({ onSettingsChange, disabled }: Props) {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();

  const toggle = async () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      const settings = await updateSettings({ theme: next });
      onSettingsChange?.(settings);
    } catch {
      setTheme(theme);
    }
  };

  const current = THEMES.find((item) => item.id === theme) ?? THEMES[1];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={toggle}
      className="rounded-lg border border-border px-3 py-2 text-sm text-text-muted hover:text-text hover:bg-surface-elevated disabled:opacity-50 transition-colors"
      title={theme === "dark" ? t("theme.light") : t("theme.dark")}
      aria-label={theme === "dark" ? t("theme.light") : t("theme.dark")}
    >
      <span aria-hidden>{current.icon}</span>
    </button>
  );
}
