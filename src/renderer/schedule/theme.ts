// 日程模块外观设置：深色模式固定，主题色、字号和紧凑模式持久化到 localStorage。
const KEY = "todo-calendar-theme";

export type Theme = "dark";
export type AccentColor = "blue" | "green" | "purple" | "orange" | "rose";
export type FontScale = "small" | "normal" | "large";

export interface ThemeSettings {
  mode: Theme;
  accent: AccentColor;
  fontScale: FontScale;
  compact: boolean;
}

export const ACCENTS: Record<AccentColor, { light: string; dark: string; label: string }> = {
  blue: { light: "#4f6ef7", dark: "#7c93ff", label: "蓝" },
  green: { light: "#16a34a", dark: "#4ade80", label: "绿" },
  purple: { light: "#8b5cf6", dark: "#a78bfa", label: "紫" },
  orange: { light: "#ea580c", dark: "#fb923c", label: "橙" },
  rose: { light: "#e11d48", dark: "#fb7185", label: "玫红" },
};

const DEFAULT_SETTINGS: ThemeSettings = {
  mode: "dark",
  accent: "blue",
  fontScale: "normal",
  compact: false,
};

export function getThemeSettings(): ThemeSettings {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_SETTINGS, ...parsed, mode: "dark" };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}

export function applyThemeSettings(s: ThemeSettings) {
  const root = document.documentElement;
  root.style.setProperty("--schedule-accent", "var(--accent-primary)");
  root.style.setProperty("--schedule-accent-soft", "var(--accent-soft)");
  const fontMap = { small: "13px", normal: "14px", large: "15.5px" };
  root.style.setProperty("--base-font-size", fontMap[s.fontScale]);
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, mode: "dark" }));
  } catch {
    /* ignore */
  }
}
