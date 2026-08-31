import type { DesktopLayout, DesktopSceneDefinition, WidgetManifest, WidgetPlacement } from "./desktop";
import { DESKTOP_LAYOUT_VERSION } from "./desktop";

export const DESKTOP_SCENES: DesktopSceneDefinition[] = [
  { id: "today", label: "今日", shortcut: "Ctrl+Alt+1", description: "今天需要关注的摘要与系统入口" },
  { id: "todo", label: "待办", shortcut: "Ctrl+Alt+2", description: "完整待办、清单与联动月历" },
  { id: "timelog", label: "时间块", shortcut: "Ctrl+Alt+3", description: "完整时间轴、活动与投入统计" },
  { id: "habits", label: "习惯", shortcut: "Ctrl+Alt+4", description: "今日打卡、历史与趋势" },
  { id: "memories", label: "记录册", shortcut: "Ctrl+Alt+5", description: "书籍、电影和剧集纪念记录" },
  { id: "canvas", label: "画布", shortcut: "Ctrl+Alt+6", description: "图片、文字与灵感画布" },
  { id: "tools", label: "工具", shortcut: "Ctrl+Alt+7", description: "完整工具中心与运行状态" },
];

const widget = (
  id: string,
  moduleId: string,
  title: string,
  description: string,
  icon: string,
  col: number,
  row: number,
  risk: WidgetManifest["risk"] = "normal",
  priority = 50,
): WidgetManifest => ({
  id, moduleId, title, description, icon, scenes: ["today"], views: ["card"], risk,
  defaultSpan: { col, row }, minSpan: { col: Math.min(col, 3), row: Math.min(row, 2) },
  preferredSpan: { col, row }, maxSpan: { col: Math.min(12, col * 2), row: Math.min(12, row * 2) },
  recommendedAspect: col / row, priority, densities: ["small", "medium", "large"],
});

/** 组件库只服务「今日」首页；完整业务场景由 SceneRenderer 直接渲染。 */
export const DESKTOP_WIDGETS: WidgetManifest[] = [
  widget("desktop.shortcuts", "desktop.shortcuts", "常用入口", "整理桌面与公共桌面的原始入口和系统图标", "layout-grid", 6, 6, "normal", 100),
  widget("today.tasks", "schedule.todo", "今日待办", "今天到期的任务与快速完成", "list-todo", 3, 4, "normal", 90),
  widget("today.calendar", "schedule.calendar", "日历", "今日日期与日程摘要", "calendar-days", 3, 4, "normal", 80),
  widget("today.focus", "focus.timer", "专注计时", "由主进程维护的番茄钟", "timer", 3, 3, "normal", 70),
  widget("today.weather", "weather", "天气", "天气摘要", "cloud-sun", 3, 2, "normal", 60),
  widget("today.history", "history.today", "历史上的今天", "历史详情后续接入", "history", 3, 2),
  widget("system.recycle-bin", "system.recycle-bin", "回收站", "只打开 Windows 回收站", "trash-2", 3, 2, "system"),
  widget("system.power", "system.power", "电源", "关机与重启需要明确二次确认", "power", 3, 2, "high-risk"),
];

export const DEFAULT_VISIBLE_TODAY_WIDGET_IDS = new Set([
  "desktop.shortcuts",
  "today.tasks",
  "today.calendar",
  "today.focus",
]);

const matchesLegacyDefaultPlacement = (placement: WidgetPlacement, manifest: WidgetManifest, order: number): boolean =>
  placement.widgetId === manifest.id
  && placement.sceneId === "today"
  && placement.order === order
  && placement.colSpan === manifest.defaultSpan.col
  && placement.rowSpan === manifest.defaultSpan.row
  && placement.hidden === false;

const matchesPreviousCuratedHome = (placement: WidgetPlacement, manifest: WidgetManifest, order: number): boolean =>
  placement.widgetId === manifest.id
  && placement.sceneId === "today"
  && placement.order === order
  && placement.colSpan === manifest.defaultSpan.col
  && placement.rowSpan === manifest.defaultSpan.row
  && placement.hidden === !new Set(["desktop.shortcuts", "today.tasks", "today.calendar", "today.focus", "today.weather"]).has(placement.widgetId);

/** 只收敛从未调整过的旧默认首页；用户改过的顺序、尺寸或显隐状态保持原样。 */
export function normalizeLegacyDefaultHomeLayout(layout: DesktopLayout): DesktopLayout {
  const untouchedLegacyDefault = layout.placements.length === DESKTOP_WIDGETS.length
    && DESKTOP_WIDGETS.every((manifest, order) => matchesLegacyDefaultPlacement(layout.placements[order], manifest, order));
  const untouchedPreviousCuratedHome = layout.placements.length === DESKTOP_WIDGETS.length
    && DESKTOP_WIDGETS.every((manifest, order) => matchesPreviousCuratedHome(layout.placements[order], manifest, order));
  if (!untouchedLegacyDefault && !untouchedPreviousCuratedHome) return layout;
  return {
    ...layout,
    placements: layout.placements.map((placement) => ({
      ...placement,
      hidden: !DEFAULT_VISIBLE_TODAY_WIDGET_IDS.has(placement.widgetId),
    })),
  };
}

export function createDefaultDesktopLayout(now = new Date().toISOString()): DesktopLayout {
  const placements: WidgetPlacement[] = DESKTOP_WIDGETS.map((manifest, order) => ({
    widgetId: manifest.id,
    sceneId: "today",
    order,
    colSpan: manifest.defaultSpan.col,
    rowSpan: manifest.defaultSpan.row,
    hidden: !DEFAULT_VISIBLE_TODAY_WIDGET_IDS.has(manifest.id),
  }));
  return {
    version: DESKTOP_LAYOUT_VERSION,
    activeScene: "today",
    hidden: false,
    editMode: false,
    targetDisplayId: null,
    rememberedDisplayId: null,
    placements,
    preset: "smart",
    previousPlacements: null,
    displayPlacements: {},
    updatedAt: now,
  };
}
