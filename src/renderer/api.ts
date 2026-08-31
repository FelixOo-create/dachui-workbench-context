import type {
  ScanCandidate,
  ToolDefinition,
  ToolStatusResult,
  WorkbenchApi,
  WorkbenchSettings,
} from "../shared/types";
import type {
  DesktopFileGroup,
  DesktopFilesState,
  DesktopHostState,
  DesktopLayout,
  FocusTimerState,
  WeatherState,
} from "../shared/desktop";
import { DESKTOP_SCENES, DESKTOP_WIDGETS, createDefaultDesktopLayout } from "../shared/desktopManifest";

const demoTools: ToolDefinition[] = [
  {
    id: "bookmarks",
    name: "书签页工具",
    description: "本地书签瀑布流、快捷入口与项目启动页",
    relativePath: "大锤的工作台\\modules\\bookmarks",
    category: "效率",
    tags: ["书签", "Node"],
    icon: "bookmark",
    runtime: {
      type: "local-service",
      launch: { type: "cmd", path: "scripts\\start-bookmarks-service.cmd", environment: { DACHUI_WORKBENCH: "1" } },
      healthCheck: { type: "http", url: "http://127.0.0.1:4173/api/health" },
      openUrl: "http://127.0.0.1:4173",
    },
    display: { showInToolCenter: true, openMode: "embedded", sortOrder: 30 },
  },
  {
    id: "check",
    name: "Check",
    description: "外部桌面工具",
    relativePath: "Check",
    category: "外部工具",
    tags: [],
    icon: "layout-dashboard",
    runtime: { type: "desktop-app", launch: { type: "none" }, healthCheck: { type: "none" } },
    display: { showInToolCenter: true, openMode: "external", sortOrder: 40 },
  },
  {
    id: "xhs-workbench",
    name: "小红书工作台",
    description: "外部桌面工具",
    relativePath: "RedNote工作台",
    category: "外部工具",
    tags: [],
    icon: "notebook-pen",
    runtime: { type: "desktop-app", launch: { type: "none" }, healthCheck: { type: "none" } },
    display: { showInToolCenter: true, openMode: "external", sortOrder: 50 },
  },
  {
    id: "infinite-canvas",
    name: "无限画布",
    description: "外部项目目录",
    relativePath: "无限画布",
    category: "外部工具",
    tags: [],
    icon: "layout-dashboard",
    runtime: { type: "folder", launch: { type: "none" }, healthCheck: { type: "none" } },
    display: { showInToolCenter: true, openMode: "folder", sortOrder: 60 },
  },
  {
    id: "tooler",
    name: "Tooler 工坊",
    description: "外部项目目录",
    relativePath: "Tooler",
    category: "外部工具",
    tags: [],
    icon: "layout-dashboard",
    runtime: { type: "folder", launch: { type: "none" }, healthCheck: { type: "none" } },
    display: { showInToolCenter: true, openMode: "folder", sortOrder: 70 },
  },
];

let demoSettings: WorkbenchSettings = { workspaceRoot: "E:\\Vibecoding", theme: "dark", compactMode: false, fontSizeMode: "medium" };
let demoRegistry = [...demoTools];
const demoStatuses = new Map<string, ToolStatusResult>(
  demoTools.map((tool) => [
    tool.id,
    {
      toolId: tool.id,
      status: tool.id === "bookmarks" ? "running" : tool.runtime.type === "folder" ? "unknown" : "stopped",
      checkedAt: new Date().toISOString(),
    },
  ]),
);

let demoDesktopLayout: DesktopLayout = createDefaultDesktopLayout();
let demoFocusTimer: FocusTimerState = {
  phase: "idle",
  durationSeconds: 25 * 60,
  remainingSeconds: 25 * 60,
  endsAt: null,
  updatedAt: new Date().toISOString(),
  segments: [],
  sessionId: null,
  activityId: null,
  categoryId: null,
  plannedSeconds: 25 * 60,
};
const demoHostState: DesktopHostState = {
  mode: "windowed-preview",
  message: "浏览器窗口预览模式",
  boundDisplayId: "preview",
  editMode: false,
  displays: [{ id: "preview", label: "浏览器预览", primary: true, bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: { x: 0, y: 0, width: 1440, height: 860 }, scaleFactor: 1 }],
};

const demoWeather: WeatherState = {
  status: "ok",
  city: "上海 · 上海市",
  temperature: 28,
  weatherText: "多云",
  humidity: 72,
  uvIndex: 5,
  updatedAt: new Date().toISOString(),
};

const demoFiles: DesktopFilesState = {
  files: [
    { id: "a", name: "项目进度.xlsx", displayName: "项目进度", path: "/preview/项目进度.xlsx", kind: "sheet", size: 12_000, modifiedAt: new Date().toISOString(), source: "user", iconDataUrl: null, groupId: "work", order: 0, pinned: true, exists: true },
    { id: "b", name: "PowerPoint.lnk", displayName: "PowerPoint", path: "/preview/PowerPoint.lnk", kind: "app", size: 1_000, modifiedAt: new Date().toISOString(), source: "public", iconDataUrl: null, groupId: "ppt", order: 1, pinned: true, exists: true },
    { id: "c", name: "设计素材", displayName: "设计素材", path: "/preview/设计素材", kind: "folder", size: 0, modifiedAt: new Date().toISOString(), source: "user", iconDataUrl: null, groupId: "design", order: 2, pinned: false, exists: true },
  ],
  groups: [
    { id: "fav", label: "收藏", fileIds: ["b"] },
    { id: "work", label: "工作", fileIds: ["a", "c"] },
  ],
  autoSync: false,
  lastSyncedAt: new Date().toISOString(),
};

const mockApi: WorkbenchApi = {
  desktop: {
    async getScenes() { return DESKTOP_SCENES; },
    async getWidgets() { return DESKTOP_WIDGETS; },
    async getLayout() { return demoDesktopLayout; },
    async saveLayout(layout) { demoDesktopLayout = { ...layout, updatedAt: new Date().toISOString() }; return demoDesktopLayout; },
    async resetLayout() { demoDesktopLayout = createDefaultDesktopLayout(); return demoDesktopLayout; },
    async getHostState() { return demoHostState; },
    async setEditMode(enabled) { demoHostState.editMode = enabled; return { ...demoHostState }; },
    async setHidden(hidden) { demoDesktopLayout = { ...demoDesktopLayout, hidden }; return demoDesktopLayout; },
    async setActiveScene(activeScene) { demoDesktopLayout = { ...demoDesktopLayout, activeScene }; return demoDesktopLayout; },
    async setTargetDisplay() { return demoHostState; },
    async openWorkspace(moduleId) {
      const query = moduleId.startsWith("schedule.") ? `?workspace=${moduleId}` : `?workspace=${moduleId}`;
      window.open(query, "_blank", "noopener");
    },
    async focusTimerGet() { return demoFocusTimer; },
    async focusTimerStart(durationSeconds, metadata) {
      const now = new Date().toISOString();
      const segments = demoFocusTimer.phase === "paused" ? demoFocusTimer.segments : [];
      demoFocusTimer = { ...demoFocusTimer, phase: "focus", durationSeconds, remainingSeconds: durationSeconds, endsAt: new Date(Date.now() + durationSeconds * 1000).toISOString(), updatedAt: now, segments: [...segments, { startAt: now, endAt: null }], sessionId: demoFocusTimer.sessionId ?? crypto.randomUUID(), activityId: metadata?.activityId ?? demoFocusTimer.activityId, categoryId: metadata?.categoryId ?? demoFocusTimer.categoryId, plannedSeconds: durationSeconds };
      return demoFocusTimer;
    },
    async focusTimerPause() { const now = new Date().toISOString(); demoFocusTimer = { ...demoFocusTimer, phase: "paused", endsAt: null, updatedAt: now, segments: demoFocusTimer.segments.map((segment, i) => i === demoFocusTimer.segments.length - 1 && !segment.endAt ? { ...segment, endAt: now } : segment) }; return demoFocusTimer; },
    async focusTimerFinish() { const now = new Date().toISOString(); demoFocusTimer = { ...demoFocusTimer, phase: "idle", endsAt: null, updatedAt: now, segments: demoFocusTimer.segments.map((segment, i) => i === demoFocusTimer.segments.length - 1 && !segment.endAt ? { ...segment, endAt: now } : segment) }; return demoFocusTimer; },
    async focusTimerReset() { demoFocusTimer = { phase: "idle", durationSeconds: 25 * 60, remainingSeconds: 25 * 60, endsAt: null, updatedAt: new Date().toISOString(), segments: [], sessionId: null, activityId: null, categoryId: null, plannedSeconds: 25 * 60 }; return demoFocusTimer; },
    async openRecycleBin() {},
    async requestPowerAction(action) { return { token: "preview", action, expiresAt: new Date(Date.now() + 30_000).toISOString() }; },
    async confirmPowerAction() {},
    async getDesktopFiles() { return demoFiles; },
    async refreshDesktopFiles() { return demoFiles; },
    async saveDesktopGroups(groups: DesktopFileGroup[]) { return { ...demoFiles, groups }; },
    async updateDesktopMirror(fileId, patch) { return { ...demoFiles, files: demoFiles.files.map((file) => file.id === fileId ? { ...file, ...patch } : file) }; },
    async removeDesktopMirror(fileId) { return { ...demoFiles, files: demoFiles.files.filter((file) => file.id !== fileId) }; },
    async setDesktopAutoSync(autoSync) { return { ...demoFiles, autoSync }; },
    async openDesktopFile() {},
    async getWeather() { return demoWeather; },
    onHostState() { return () => undefined; },
    onLayout() { return () => undefined; },
    onFocusTimer() { return () => undefined; },
    onWeather() { return () => undefined; },
  },
  schedule: {
    async invoke() {
      throw new Error("浏览器预览模式不支持日程数据（请使用 Electron 桌面版）");
    },
    async pickFile() {
      return null;
    },
  },
  async pickFile() { return null; },
  async pickFolder() { return null; },
  async listTools() { return [...demoRegistry]; },
  async saveTool(tool) {
    demoRegistry = [...demoRegistry.filter((item) => item.id !== tool.id), tool];
    demoStatuses.set(tool.id, { toolId: tool.id, status: "stopped", checkedAt: new Date().toISOString() });
    return tool;
  },
  async removeTool(toolId) { demoRegistry = demoRegistry.filter((item) => item.id !== toolId); },
  async scanWorkspace(): Promise<ScanCandidate[]> {
    return [{
      name: "新发现的工具",
      relativePath: "新发现的工具",
      detectedType: "folder",
      markers: ["README.md"],
      description: "扫描发现的本地工具",
      category: "未分类",
      tags: [],
      launch: { type: "none" },
      warnings: [],
      confidence: "low",
    }];
  },
  async scanFolder(folderPath: string): Promise<ScanCandidate[]> {
    return [{
      name: folderPath.split(/[\\/]/).pop() ?? "新发现的工具",
      relativePath: folderPath.split(/[\\/]/).pop() ?? "新发现的工具",
      detectedType: "folder",
      markers: ["README.md"],
      description: "扫描发现的本地工具",
      category: "未分类",
      tags: [],
      launch: { type: "none" },
      warnings: [],
      confidence: "low",
    }];
  },
  async getSettings() { return { ...demoSettings }; },
  async saveSettings(settings) { demoSettings = settings; return settings; },
  async getStatuses() { return demoRegistry.map((tool) => demoStatuses.get(tool.id) ?? { toolId: tool.id, status: "unknown", checkedAt: new Date().toISOString() }); },
  async getStatus(toolId) { return demoStatuses.get(toolId) ?? { toolId, status: "unknown", checkedAt: new Date().toISOString() }; },
  async startTool(toolId) {
    const value: ToolStatusResult = { toolId, status: "running", checkedAt: new Date().toISOString() };
    demoStatuses.set(toolId, value);
    return value;
  },
  async stopTool(toolId) {
    const value: ToolStatusResult = { toolId, status: "stopped", checkedAt: new Date().toISOString() };
    demoStatuses.set(toolId, value);
    return value;
  },
  async restartTool(toolId) {
    const value: ToolStatusResult = { toolId, status: "running", checkedAt: new Date().toISOString() };
    demoStatuses.set(toolId, value);
    return value;
  },
  async openTool() {},
  async openToolFolder() {},
  async getLogs(toolId) { return "2026-08-18T08:10:12.000Z [" + (toolId ?? "workbench") + "] status ready\n2026-08-18T08:10:14.000Z [" + (toolId ?? "workbench") + "] health success"; },
  async showEmbedded(toolId) { return demoRegistry.find((tool) => tool.id === toolId)?.runtime.openUrl ?? ""; },
  async resizeEmbedded() {},
  async hideEmbedded() {},
};

export const isDesktop = Boolean(window.workbench);
export const api: WorkbenchApi = window.workbench ?? mockApi;
