import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import type { EmbeddedBounds, ToolDefinition, WorkbenchSettings } from "../shared/types";
import { EmbeddedViewManager } from "./services/embedded";
import { RegistryService } from "./services/registry";
import { RuntimeManager } from "./services/runtime";
import { ScheduleService } from "./services/schedule";

function validBounds(input: EmbeddedBounds): EmbeddedBounds {
  if (!input || [input.x, input.y, input.width, input.height].some((value) => !Number.isFinite(value))) throw new Error("无效内嵌区域");
  return input;
}

export function registerIpc(
  window: BrowserWindow,
  registry: RegistryService,
  runtime: RuntimeManager,
  embedded: EmbeddedViewManager,
  schedule: ScheduleService,
  isTrustedWindow: (event: IpcMainInvokeEvent) => boolean = (event) => event.sender.id === window.webContents.id,
): void {
  const trusted = (event: IpcMainInvokeEvent) => {
    if (!isTrustedWindow(event)) throw new Error("拒绝未知渲染进程调用");
  };
  const handle = <T extends unknown[]>(channel: string, callback: (...args: T) => unknown) => {
    ipcMain.handle(channel, (event, ...args: T) => {
      trusted(event);
      return callback(...args);
    });
  };

  handle("registry:list", () => registry.listTools());
  handle("registry:save", (tool: ToolDefinition) => registry.saveTool(tool));
  handle("registry:remove", (toolId: string) => registry.removeTool(toolId));
  handle("registry:scan", () => registry.scanWorkspace());
  handle("registry:scan-folder", (folderPath: string) => registry.scanFolder(folderPath));
  handle("settings:get", () => registry.getSettings());
  handle("settings:save", (settings: WorkbenchSettings) => registry.saveSettings(settings));

  handle("runtime:statuses", () => runtime.getStatuses());
  handle("runtime:status", (toolId: string) => runtime.getStatus(toolId));
  handle("runtime:start", (toolId: string) => runtime.start(toolId));
  handle("runtime:stop", (toolId: string) => runtime.stop(toolId));
  handle("runtime:restart", (toolId: string) => runtime.restart(toolId));
  handle("runtime:open", (toolId: string) => runtime.open(toolId));
  handle("runtime:folder", (toolId: string) => runtime.openFolder(toolId));
  handle("runtime:logs", (toolId?: string) => runtime.getLogs(toolId));

  handle("embedded:show", (toolId: string, route: string | undefined, bounds: EmbeddedBounds) =>
    embedded.show(toolId, route, validBounds(bounds)),
  );
  handle("embedded:resize", (bounds: EmbeddedBounds) => embedded.resize(validBounds(bounds)));
  handle("embedded:hide", () => embedded.hide());

  handle("schedule:invoke", (cmd: string, args: Record<string, unknown>) => schedule.dispatch(cmd, args));
  handle("schedule:pick-file", async () => {
    const result = await dialog.showOpenDialog(window, { properties: ["openFile"] });
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });
  handle("dialog:pick-file", async () => {
    const result = await dialog.showOpenDialog(window, { properties: ["openFile"] });
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });
  handle("dialog:pick-folder", async () => {
    const result = await dialog.showOpenDialog(window, { properties: ["openDirectory"] });
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });
}
