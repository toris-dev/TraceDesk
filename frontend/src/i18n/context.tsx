import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { getCatalog, type TranslationTree } from "./translations";
import { normalizeLocale, type Locale } from "./types";

type Params = Record<string, string | number>;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Params) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getNested(obj: TranslationTree, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    params[key] != null ? String(params[key]) : `{{${key}}}`,
  );
}

interface Props {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  children: ReactNode;
}

export function I18nProvider({ locale, setLocale, children }: Props) {
  const catalog = useMemo(() => getCatalog(locale), [locale]);

  const t = useCallback(
    (key: string, params?: Params) => {
      const value = getNested(catalog, key);
      if (value) return interpolate(value, params);
      const fallback = getNested(getCatalog("ko"), key);
      return fallback ? interpolate(fallback, params) : key;
    },
    [catalog],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function usePlatformStrings(platform: string) {
  const { t } = useI18n();
  const isMac = platform === "macos";

  return {
    autostartDescription: t(
      platform === "macos"
        ? "platform.autostartMac"
        : platform === "windows"
          ? "platform.autostartWin"
          : "platform.autostartOther",
    ),
    activitySectionTitle: t(isMac ? "platform.activityMac" : "platform.activityOther"),
    accessibilityLabel: t(isMac ? "platform.accessibilityMac" : "platform.accessibilityOther"),
    accessibilityDescription: t(
      platform === "macos"
        ? "platform.accessibilityMacDesc"
        : platform === "windows"
          ? "platform.accessibilityWinDesc"
          : "platform.accessibilityOtherDesc",
    ),
    inputMonitoringLabel: t(isMac ? "platform.inputMac" : "platform.inputOther"),
    inputMonitoringDescription: t(
      platform === "macos"
        ? "platform.inputMacDesc"
        : platform === "windows"
          ? "platform.inputWinDesc"
          : "platform.inputOtherDesc",
    ),
    activitySectionHint: t(isMac ? "platform.hintMac" : "platform.hintOther"),
  };
}

export { normalizeLocale, type Locale };
