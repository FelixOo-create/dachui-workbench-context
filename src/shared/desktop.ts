export const DESKTOP_LAYOUT_VERSION = 4;

export const DESKTOP_SCENE_IDS = ["today", "todo", "timelog", "habits", "memories", "canvas", "tools"] as const;
export type DesktopSceneId = (typeof DESKTOP_SCENE_IDS)[number];

export type WidgetViewKind = "card" | "expanded" | "workspace";
export type WidgetRisk = "normal" | "system" | "high-risk";

export interface DesktopSceneDefinition {
  id: DesktopSceneId;
  label: string;
  shortcut: string;
  description: string;
}

export interface WidgetManifest {
  id: string;
  moduleId: string;
  title: string;
  description: string;
  icon: string;
  scenes: DesktopSceneId[];
  views: WidgetViewKind[];
  risk: WidgetRisk;
  defaultSpan: { col: number; row: number };
  minSpan: { col: number; row: number };
  preferredSpan: { col: number; row: number };
  maxSpan: { col: number; row: number };
  recommendedAspect: number;
  priority: number;
  densities: Array<"small" | "medium" | "large">;
}

export interface WidgetPlacement {
  widgetId: string;
  sceneId: DesktopSceneId;
  order: number;
  colSpan: number;
  rowSpan: number;
  hidden: boolean;
}

export interface DesktopLayout {
  version: number;
  activeScene: DesktopSceneId;
  hidden: boolean;
  editMode: boolean;
  targetDisplayId: string | null;
  rememberedDisplayId: string | null;
  placements: WidgetPlacement[];
  preset: DesktopLayoutPreset;
  previousPlacements: WidgetPlacement[] | null;
  displayPlacements: Record<string, WidgetPlacement[]>;
  updatedAt: string;
}

export type DesktopLayoutPreset = "smart" | "split" | "triple" | "quad" | "hero" | "free";

export interface DesktopDisplayInfo {
  id: string;
  label: string;
  primary: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
}

export type DesktopHostMode = "simulated" | "windowed-preview";

export interface DesktopHostState {
  mode: DesktopHostMode;
  message: string;
  boundDisplayId: string | null;
  editMode: boolean;
  displays: DesktopDisplayInfo[];
}

export interface FocusTimerState {
  phase: "idle" | "focus" | "break" | "paused";
  durationSeconds: number;
  remainingSeconds: number;
  endsAt: string | null;
  updatedAt: string;
  /** 当前番茄会话的起止片段；暂停区间不会出现在 segments 中。 */
  segments: Array<{ startAt: string; endAt: string | null }>;
  sessionId: string | null;
  activityId: string | null;
  categoryId: string | null;
  plannedSeconds: number;
  message?: string;
}

export interface PowerActionTicket {
  token: string;
  action: "shutdown" | "restart";
  expiresAt: string;
}

export type DesktopFileKind = "folder" | "image" | "doc" | "sheet" | "slide" | "archive" | "app" | "media" | "other";

export interface DesktopFileEntry {
  id: string;
  name: string;
  path: string;
  kind: DesktopFileKind;
  size: number;
  modifiedAt: string;
  source: "user" | "public";
  displayName: string;
  iconDataUrl: string | null;
  groupId: string | null;
  order: number;
  pinned: boolean;
  exists: boolean;
}

export interface DesktopFileGroup {
  id: string;
  label: string;
  fileIds: string[];
}

export interface DesktopFilesState {
  files: DesktopFileEntry[];
  groups: DesktopFileGroup[];
  autoSync: boolean;
  lastSyncedAt: string | null;
}

export interface WeatherState {
  status: "idle" | "loading" | "ok" | "error";
  city: string;
  temperature: number | null;
  weatherText: string;
  humidity: number | null;
  uvIndex: number | null;
  message?: string;
  updatedAt: string | null;
}

export interface DesktopApi {
  getScenes(): Promise<DesktopSceneDefinition[]>;
  getWidgets(): Promise<WidgetManifest[]>;
  getLayout(): Promise<DesktopLayout>;
  saveLayout(layout: DesktopLayout): Promise<DesktopLayout>;
  resetLayout(): Promise<DesktopLayout>;
  getHostState(): Promise<DesktopHostState>;
  setEditMode(enabled: boolean): Promise<DesktopHostState>;
  setHidden(hidden: boolean): Promise<DesktopLayout>;
  setActiveScene(sceneId: DesktopSceneId): Promise<DesktopLayout>;
  setTargetDisplay(displayId: string | null): Promise<DesktopHostState>;
  openWorkspace(moduleId: string): Promise<void>;
  focusTimerGet(): Promise<FocusTimerState>;
  focusTimerStart(durationSeconds: number, metadata?: { activityId?: string | null; categoryId?: string | null }): Promise<FocusTimerState>;
  focusTimerPause(): Promise<FocusTimerState>;
  focusTimerFinish(status: "completed" | "saved"): Promise<FocusTimerState>;
  focusTimerReset(): Promise<FocusTimerState>;
  openRecycleBin(): Promise<void>;
  requestPowerAction(action: "shutdown" | "restart"): Promise<PowerActionTicket>;
  confirmPowerAction(token: string): Promise<void>;
  getDesktopFiles(): Promise<DesktopFilesState>;
  refreshDesktopFiles(): Promise<DesktopFilesState>;
  saveDesktopGroups(groups: DesktopFileGroup[]): Promise<DesktopFilesState>;
  updateDesktopMirror(fileId: string, patch: Partial<Pick<DesktopFileEntry, "displayName" | "groupId" | "order" | "pinned">>): Promise<DesktopFilesState>;
  removeDesktopMirror(fileId: string): Promise<DesktopFilesState>;
  setDesktopAutoSync(enabled: boolean): Promise<DesktopFilesState>;
  openDesktopFile(fileId: string): Promise<void>;
  getWeather(): Promise<WeatherState>;
  onHostState(listener: (state: DesktopHostState) => void): () => void;
  onLayout(listener: (layout: DesktopLayout) => void): () => void;
  onFocusTimer(listener: (state: FocusTimerState) => void): () => void;
  onWeather(listener: (state: WeatherState) => void): () => void;
}
