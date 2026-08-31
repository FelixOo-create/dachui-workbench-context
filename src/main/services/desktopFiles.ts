import fs from "node:fs";
import path from "node:path";
import { app, shell } from "electron";
import type { DesktopFileEntry, DesktopFileGroup, DesktopFileKind, DesktopFilesState } from "../../shared/desktop";

const KIND_BY_EXTENSION: ReadonlyMap<string, DesktopFileKind> = new Map([
  [".png", "image"], [".jpg", "image"], [".jpeg", "image"], [".gif", "image"], [".webp", "image"],
  [".doc", "doc"], [".docx", "doc"], [".txt", "doc"], [".md", "doc"], [".pdf", "doc"],
  [".xls", "sheet"], [".xlsx", "sheet"], [".csv", "sheet"], [".ppt", "slide"], [".pptx", "slide"],
  [".zip", "archive"], [".rar", "archive"], [".7z", "archive"], [".exe", "app"], [".lnk", "app"], [".msi", "app"],
  [".mp4", "media"], [".mov", "media"], [".mkv", "media"], [".mp3", "media"], [".wav", "media"],
]);
const MIRROR_FILE = "desktop-mirrors.json";
const DEFAULT_GROUPS: DesktopFileGroup[] = ["工作", "设计", "PPT", "小红书", "常用软件", "临时"].map((label, index) => ({ id: `default-${index}`, label, fileIds: [] }));

function stableId(fullPath: string): string {
  return Buffer.from(path.resolve(fullPath).toLowerCase(), "utf8").toString("base64url").slice(-24);
}

function detectKind(entryPath: string, isDirectory: boolean): DesktopFileKind {
  return isDirectory ? "folder" : KIND_BY_EXTENSION.get(path.extname(entryPath).toLowerCase()) ?? "other";
}

function safeName(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : fallback;
}

export class DesktopFilesService {
  private readonly dataDirectory: string;
  private readonly metadataPath: string;
  private readonly userDesktopDirectory: string;
  private readonly publicDesktopDirectory: string | null;

  constructor(dataRoot: string, options: { desktopDir?: string; publicDesktopDir?: string | null } = {}) {
    this.dataDirectory = path.join(dataRoot, "desktop");
    this.metadataPath = path.join(this.dataDirectory, MIRROR_FILE);
    this.userDesktopDirectory = options.desktopDir ?? app.getPath("desktop");
    const publicRoot = process.env.PUBLIC;
    this.publicDesktopDirectory = options.publicDesktopDir === undefined ? (publicRoot ? path.join(publicRoot, "Desktop") : null) : options.publicDesktopDir;
    fs.mkdirSync(this.dataDirectory, { recursive: true });
  }

  getState(): DesktopFilesState {
    const saved = this.readState();
    return { ...saved, files: saved.files.map((entry) => ({ ...entry, exists: fs.existsSync(entry.path) })) };
  }

  async sync(): Promise<DesktopFilesState> {
    const saved = this.readState();
    const existing = new Map(saved.files.map((entry) => [entry.id, entry]));
    const scanned = [...await this.scanDirectory(this.userDesktopDirectory, "user"), ...(this.publicDesktopDirectory ? await this.scanDirectory(this.publicDesktopDirectory, "public") : [])];
    const files = scanned.map((entry, index) => {
      const previous = existing.get(entry.id);
      return { ...entry, displayName: previous?.displayName ?? entry.name, groupId: previous?.groupId ?? null, order: previous?.order ?? index, pinned: previous?.pinned ?? false };
    });
    return this.writeState({ ...saved, files, lastSyncedAt: new Date().toISOString() });
  }

  saveGroups(groups: DesktopFileGroup[]): DesktopFilesState {
    const normalized = groups.slice(0, 30).map((group, index) => ({ id: safeName(group.id, `group-${index}`).slice(0, 80), label: safeName(group.label, `分组 ${index + 1}`), fileIds: Array.isArray(group.fileIds) ? group.fileIds.filter((id) => typeof id === "string").slice(0, 500) : [] }));
    return this.writeState({ ...this.readState(), groups: normalized });
  }

  updateMirror(fileId: string, patch: Partial<Pick<DesktopFileEntry, "displayName" | "groupId" | "order" | "pinned">>): DesktopFilesState {
    const state = this.readState();
    if (!state.files.some((entry) => entry.id === fileId)) throw new Error("桌面镜像不存在");
    return this.writeState({ ...state, files: state.files.map((entry) => entry.id === fileId ? { ...entry, displayName: patch.displayName === undefined ? entry.displayName : safeName(patch.displayName, entry.name), groupId: patch.groupId === undefined ? entry.groupId : (typeof patch.groupId === "string" ? patch.groupId.slice(0, 80) : null), order: Number.isInteger(patch.order) ? Math.max(0, Math.min(9999, patch.order!)) : entry.order, pinned: typeof patch.pinned === "boolean" ? patch.pinned : entry.pinned } : entry) });
  }

  removeMirror(fileId: string): DesktopFilesState {
    const state = this.readState();
    return this.writeState({ ...state, files: state.files.filter((entry) => entry.id !== fileId), groups: state.groups.map((group) => ({ ...group, fileIds: group.fileIds.filter((id) => id !== fileId) })) });
  }

  setAutoSync(enabled: boolean): DesktopFilesState { return this.writeState({ ...this.readState(), autoSync: Boolean(enabled) }); }

  async openEntry(fileId: string): Promise<void> {
    const entry = this.getState().files.find((candidate) => candidate.id === fileId);
    if (!entry) throw new Error("桌面镜像不存在");
    if (!entry.exists) throw new Error("来源失效，请重新同步桌面");
    const result = await shell.openPath(entry.path);
    if (result) throw new Error(result);
  }

  private readState(): DesktopFilesState {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.metadataPath, "utf8")) as Partial<DesktopFilesState>;
      return { files: Array.isArray(parsed.files) ? parsed.files.filter((entry) => entry && typeof entry.id === "string" && typeof entry.path === "string") : [], groups: Array.isArray(parsed.groups) ? parsed.groups : DEFAULT_GROUPS, autoSync: parsed.autoSync === true, lastSyncedAt: typeof parsed.lastSyncedAt === "string" ? parsed.lastSyncedAt : null };
    } catch { return { files: [], groups: DEFAULT_GROUPS, autoSync: false, lastSyncedAt: null }; }
  }

  private writeState(state: DesktopFilesState): DesktopFilesState {
    const temporary = `${this.metadataPath}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    fs.renameSync(temporary, this.metadataPath);
    return this.getState();
  }

  private async scanDirectory(directory: string, source: "user" | "public"): Promise<DesktopFileEntry[]> {
    if (!fs.existsSync(directory)) return [];
    const results: DesktopFileEntry[] = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      let stats: fs.Stats;
      try { stats = fs.statSync(entryPath); } catch { continue; }
      let iconDataUrl: string | null = null;
      try { const icon = await app.getFileIcon(entryPath, { size: "normal" }); iconDataUrl = icon.isEmpty() ? null : icon.toDataURL(); } catch { /* 图标失败不影响镜像。 */ }
      results.push({ id: stableId(entryPath), name: entry.name, displayName: entry.name, path: entryPath, kind: detectKind(entryPath, entry.isDirectory()), size: stats.size, modifiedAt: stats.mtime.toISOString(), source, iconDataUrl, groupId: null, order: results.length, pinned: false, exists: true });
    }
    return results;
  }
}
