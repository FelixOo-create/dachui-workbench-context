import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { DESKTOP_SCENES, DESKTOP_WIDGETS } from "../shared/desktopManifest";
import type { DesktopFileEntry, DesktopFileGroup, DesktopLayout, DesktopSceneId } from "../shared/desktop";
import { DesktopHostController } from "./services/desktopHost";
import { DesktopLayoutService } from "./services/desktopLayout";
import { DesktopFilesService } from "./services/desktopFiles";
import { FocusTimerService } from "./services/focusTimer";
import { SystemActionService } from "./services/systemActions";
import { WeatherService } from "./services/weather";

const WORKSPACE_MODULES = new Set(["schedule.todo", "schedule.timelog", "schedule.habits", "memories", "bookmarks", "tools", "settings"]);

export function registerDesktopIpc(
  isTrusted: (event: IpcMainInvokeEvent) => boolean,
  windows: () => BrowserWindow[],
  layout: DesktopLayoutService,
  host: DesktopHostController,
  desktopFiles: DesktopFilesService,
  focusTimer: FocusTimerService,
  systemActions: SystemActionService,
  weather: WeatherService,
  openWorkspace: (moduleId: string) => void,
): () => void {
  const broadcastLayout = (value: DesktopLayout) => {
    for (const window of windows()) if (!window.isDestroyed()) window.webContents.send("desktop:layout-state", value);
    return value;
  };
  const handle = <T extends unknown[]>(channel: string, callback: (...args: T) => unknown) => {
    ipcMain.handle(channel, (event, ...args: T) => {
      if (!isTrusted(event)) throw new Error("拒绝未知渲染进程调用");
      return callback(...args);
    });
  };

  handle("desktop:scenes", () => DESKTOP_SCENES);
  handle("desktop:widgets", () => DESKTOP_WIDGETS);
  handle("desktop:layout:get", () => layout.load());
  handle("desktop:layout:save", (value: DesktopLayout) => broadcastLayout(layout.save(value)));
  handle("desktop:layout:reset", () => broadcastLayout(layout.reset()));
  handle("desktop:host:get", () => host.getState());
  handle("desktop:edit-mode", (enabled: boolean) => host.setEditMode(Boolean(enabled)));
  handle("desktop:hidden", (hidden: boolean) => broadcastLayout(layout.patch({ hidden: Boolean(hidden) })));
  handle("desktop:scene", (sceneId: DesktopSceneId) => broadcastLayout(layout.patch({ activeScene: sceneId })));
  handle("desktop:display", (displayId: string | null) => {
    const state = host.setTargetDisplay(displayId);
    broadcastLayout(layout.load());
    return state;
  });
  handle("desktop:workspace", (moduleId: string) => {
    if (!WORKSPACE_MODULES.has(moduleId)) throw new Error("未知子工作区");
    openWorkspace(moduleId);
  });
  handle("desktop:focus:get", () => focusTimer.get());
  handle("desktop:focus:start", (durationSeconds: number, metadata?: { activityId?: string | null; categoryId?: string | null }) => focusTimer.start(durationSeconds, metadata));
  handle("desktop:focus:pause", () => focusTimer.pause());
  handle("desktop:focus:finish", (status: "completed" | "saved") => focusTimer.finish(status));
  handle("desktop:focus:reset", () => focusTimer.reset());
  handle("desktop:recycle-bin", () => systemActions.openRecycleBin());
  handle("desktop:power:request", (action: "shutdown" | "restart") => {
    if (action !== "shutdown" && action !== "restart") throw new Error("未知电源操作");
    return systemActions.requestPowerAction(action);
  });
  handle("desktop:power:confirm", (token: string) => systemActions.confirmPowerAction(token));
  handle("desktop:files:get", () => desktopFiles.getState());
  handle("desktop:files:refresh", () => desktopFiles.sync());
  handle("desktop:files:save-groups", (groups: DesktopFileGroup[]) => {
    if (!Array.isArray(groups)) throw new Error("分组数据无效");
    return desktopFiles.saveGroups(groups);
  });
  handle("desktop:files:update", (fileId: string, patch: Partial<Pick<DesktopFileEntry, "displayName" | "groupId" | "order" | "pinned">>) => desktopFiles.updateMirror(String(fileId), patch ?? {}));
  handle("desktop:files:remove", (fileId: string) => desktopFiles.removeMirror(String(fileId)));
  handle("desktop:files:auto-sync", (enabled: boolean) => desktopFiles.setAutoSync(Boolean(enabled)));
  handle("desktop:files:open", (fileId: string) => desktopFiles.openEntry(String(fileId)));
  handle("desktop:weather:get", () => weather.refresh());

  const stopHost = host.subscribe((state) => {
    for (const window of windows()) if (!window.isDestroyed()) window.webContents.send("desktop:host-state", state);
  });
  const stopTimer = focusTimer.subscribe((state) => {
    for (const window of windows()) if (!window.isDestroyed()) window.webContents.send("desktop:focus-state", state);
  });
  const stopWeather = weather.subscribe((state) => {
    for (const window of windows()) if (!window.isDestroyed()) window.webContents.send("desktop:weather-state", state);
  });

  return () => {
    stopHost();
    stopTimer();
    stopWeather();
  };
}
