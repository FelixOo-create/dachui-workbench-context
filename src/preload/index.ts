import { contextBridge, ipcRenderer } from "electron";
import type { EmbeddedBounds, ToolDefinition, WorkbenchApi, WorkbenchSettings } from "../shared/types";
import type {
  DesktopFileGroup,
  DesktopFileEntry,
  DesktopHostState,
  DesktopLayout,
  DesktopSceneId,
  FocusTimerState,
  WeatherState,
} from "../shared/desktop";

const api: WorkbenchApi = {
  desktop: {
    getScenes: () => ipcRenderer.invoke("desktop:scenes"),
    getWidgets: () => ipcRenderer.invoke("desktop:widgets"),
    getLayout: () => ipcRenderer.invoke("desktop:layout:get"),
    saveLayout: (layout: DesktopLayout) => ipcRenderer.invoke("desktop:layout:save", layout),
    resetLayout: () => ipcRenderer.invoke("desktop:layout:reset"),
    getHostState: () => ipcRenderer.invoke("desktop:host:get"),
    setEditMode: (enabled: boolean) => ipcRenderer.invoke("desktop:edit-mode", enabled),
    setHidden: (hidden: boolean) => ipcRenderer.invoke("desktop:hidden", hidden),
    setActiveScene: (sceneId: DesktopSceneId) => ipcRenderer.invoke("desktop:scene", sceneId),
    setTargetDisplay: (displayId: string | null) => ipcRenderer.invoke("desktop:display", displayId),
    openWorkspace: (moduleId: string) => ipcRenderer.invoke("desktop:workspace", moduleId),
    focusTimerGet: () => ipcRenderer.invoke("desktop:focus:get"),
    focusTimerStart: (durationSeconds: number, metadata?: { activityId?: string | null; categoryId?: string | null }) => ipcRenderer.invoke("desktop:focus:start", durationSeconds, metadata),
    focusTimerPause: () => ipcRenderer.invoke("desktop:focus:pause"),
    focusTimerFinish: (status: "completed" | "saved") => ipcRenderer.invoke("desktop:focus:finish", status),
    focusTimerReset: () => ipcRenderer.invoke("desktop:focus:reset"),
    openRecycleBin: () => ipcRenderer.invoke("desktop:recycle-bin"),
    requestPowerAction: (action: "shutdown" | "restart") => ipcRenderer.invoke("desktop:power:request", action),
    confirmPowerAction: (token: string) => ipcRenderer.invoke("desktop:power:confirm", token),
    getDesktopFiles: () => ipcRenderer.invoke("desktop:files:get"),
    refreshDesktopFiles: () => ipcRenderer.invoke("desktop:files:refresh"),
    saveDesktopGroups: (groups: DesktopFileGroup[]) => ipcRenderer.invoke("desktop:files:save-groups", groups),
    updateDesktopMirror: (fileId: string, patch: Partial<Pick<DesktopFileEntry, "displayName" | "groupId" | "order" | "pinned">>) => ipcRenderer.invoke("desktop:files:update", fileId, patch),
    removeDesktopMirror: (fileId: string) => ipcRenderer.invoke("desktop:files:remove", fileId),
    setDesktopAutoSync: (enabled: boolean) => ipcRenderer.invoke("desktop:files:auto-sync", enabled),
    openDesktopFile: (fileId: string) => ipcRenderer.invoke("desktop:files:open", fileId),
    getWeather: () => ipcRenderer.invoke("desktop:weather:get"),
    onHostState: (listener: (state: DesktopHostState) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, state: DesktopHostState) => listener(state);
      ipcRenderer.on("desktop:host-state", wrapped);
      return () => ipcRenderer.removeListener("desktop:host-state", wrapped);
    },
    onLayout: (listener: (layout: DesktopLayout) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, layout: DesktopLayout) => listener(layout);
      ipcRenderer.on("desktop:layout-state", wrapped);
      return () => ipcRenderer.removeListener("desktop:layout-state", wrapped);
    },
    onFocusTimer: (listener: (state: FocusTimerState) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, state: FocusTimerState) => listener(state);
      ipcRenderer.on("desktop:focus-state", wrapped);
      return () => ipcRenderer.removeListener("desktop:focus-state", wrapped);
    },
    onWeather: (listener: (state: WeatherState) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, state: WeatherState) => listener(state);
      ipcRenderer.on("desktop:weather-state", wrapped);
      return () => ipcRenderer.removeListener("desktop:weather-state", wrapped);
    },
  },
  schedule: {
    invoke: (cmd: string, args: Record<string, unknown>) => ipcRenderer.invoke("schedule:invoke", cmd, args),
    pickFile: () => ipcRenderer.invoke("schedule:pick-file"),
  },
  pickFile: () => ipcRenderer.invoke("dialog:pick-file"),
  pickFolder: () => ipcRenderer.invoke("dialog:pick-folder"),
  listTools: () => ipcRenderer.invoke("registry:list"),
  saveTool: (tool: ToolDefinition) => ipcRenderer.invoke("registry:save", tool),
  removeTool: (toolId: string) => ipcRenderer.invoke("registry:remove", toolId),
  scanWorkspace: () => ipcRenderer.invoke("registry:scan"),
  scanFolder: (folderPath: string) => ipcRenderer.invoke("registry:scan-folder", folderPath),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings: WorkbenchSettings) => ipcRenderer.invoke("settings:save", settings),
  getStatuses: () => ipcRenderer.invoke("runtime:statuses"),
  getStatus: (toolId: string) => ipcRenderer.invoke("runtime:status", toolId),
  startTool: (toolId: string) => ipcRenderer.invoke("runtime:start", toolId),
  stopTool: (toolId: string) => ipcRenderer.invoke("runtime:stop", toolId),
  restartTool: (toolId: string) => ipcRenderer.invoke("runtime:restart", toolId),
  openTool: (toolId: string) => ipcRenderer.invoke("runtime:open", toolId),
  openToolFolder: (toolId: string) => ipcRenderer.invoke("runtime:folder", toolId),
  getLogs: (toolId?: string) => ipcRenderer.invoke("runtime:logs", toolId),
  showEmbedded: (toolId: string, route: string | undefined, bounds: EmbeddedBounds) =>
    ipcRenderer.invoke("embedded:show", toolId, route, bounds),
  resizeEmbedded: (bounds: EmbeddedBounds) => ipcRenderer.invoke("embedded:resize", bounds),
  hideEmbedded: () => ipcRenderer.invoke("embedded:hide"),
};

contextBridge.exposeInMainWorld("workbench", api);
