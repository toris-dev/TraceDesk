import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { readChartTheme, type ChartTheme } from "./chartTheme";
import { normalizeTheme, type Theme } from "./types";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  chart: ChartTheme;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

interface Props {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  children: ReactNode;
}

export function ThemeProvider({ theme, setTheme, children }: Props) {
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const chart = useMemo(() => readChartTheme(theme), [theme]);

  const value = useMemo(
    () => ({ theme, setTheme, chart }),
    [theme, setTheme, chart],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

export function useThemeSetter() {
  const { setTheme } = useTheme();
  return useCallback((value: string | null | undefined) => {
    setTheme(normalizeTheme(value));
  }, [setTheme]);
}

export { normalizeTheme, type Theme };
