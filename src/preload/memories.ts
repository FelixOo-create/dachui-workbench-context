import { contextBridge, ipcRenderer } from "electron";
import type { MemoriesApi } from "../shared/memories";

const memories: MemoriesApi = {
  list: () => ipcRenderer.invoke("memories:list"),
  save: (input) => ipcRenderer.invoke("memories:save", input),
  remove: (id) => ipcRenderer.invoke("memories:remove", id),
  pickCover: () => ipcRenderer.invoke("memories:pick-cover"),
};

contextBridge.exposeInMainWorld("memories", memories);
