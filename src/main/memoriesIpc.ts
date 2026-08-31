import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import type { MemoryEntryInput } from "../shared/memories";
import { MemoriesService } from "./services/memories";

export function registerMemoriesIpc(
  window: BrowserWindow,
  memories: MemoriesService,
  isTrustedWindow: (event: IpcMainInvokeEvent) => boolean = (event) => event.sender.id === window.webContents.id,
): void {
  const trusted = (event: IpcMainInvokeEvent) => {
    if (!isTrustedWindow(event)) throw new Error("非法 IPC 来源");
  };
  const handle = (channel: string, listener: (event: IpcMainInvokeEvent, ...args: never[]) => unknown) => {
    ipcMain.handle(channel, (event, ...args) => {
      trusted(event);
      return listener(event, ...(args as never[]));
    });
  };

  handle("memories:list", () => memories.list());
  handle("memories:save", (_event, input: MemoryEntryInput) => memories.save(input));
  handle("memories:remove", (_event, id: string) => memories.remove(id));
  handle("memories:pick-cover", async () => {
    const result = await dialog.showOpenDialog(window, {
      properties: ["openFile"],
      filters: [{ name: "封面图片", extensions: ["jpg", "jpeg", "png", "webp", "gif"] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    return { path: filePath, dataUrl: memories.previewLocalCover(filePath) };
  });
}
