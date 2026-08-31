import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { getPath: () => ".", getFileIcon: vi.fn(async () => ({ toDataURL: () => "data:image/png;base64,fixture" })) }, shell: { openPath: vi.fn(async () => "") } }));
import { DesktopFilesService } from "../src/main/services/desktopFiles";

const temporaryDirectories: string[] = [];
afterEach(() => { for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });

describe("desktop shortcut mirror isolated flow", () => {
  it("syncs user and public desktop metadata without moving source files", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dachui-desktop-files-"));
    temporaryDirectories.push(root);
    const desktop = path.join(root, "desktop-files");
    const publicDesktop = path.join(root, "public-desktop");
    const data = path.join(root, "data");
    fs.mkdirSync(desktop, { recursive: true });
    fs.mkdirSync(publicDesktop, { recursive: true });
    fs.writeFileSync(path.join(desktop, "isolated.txt"), "fixture", "utf8");
    fs.writeFileSync(path.join(publicDesktop, "Shared.lnk"), "fixture", "utf8");
    const service = new DesktopFilesService(data, { desktopDir: desktop, publicDesktopDir: publicDesktop });
    const synced = await service.sync();
    expect(synced.files.map((entry) => [entry.name, entry.source])).toEqual(expect.arrayContaining([["isolated.txt", "user"], ["Shared.lnk", "public"]]));
    const original = synced.files.find((entry) => entry.name === "isolated.txt")!;
    service.updateMirror(original.id, { displayName: "隔离文件", pinned: true });
    expect(fs.existsSync(path.join(desktop, "isolated.txt"))).toBe(true);
    service.removeMirror(original.id);
    expect(fs.existsSync(path.join(desktop, "isolated.txt"))).toBe(true);
  });
});
