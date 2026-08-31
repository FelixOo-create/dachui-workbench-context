import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DESKTOP_LAYOUT_VERSION } from "../src/shared/desktop";
import { createDefaultDesktopLayout, DESKTOP_SCENES, DESKTOP_WIDGETS } from "../src/shared/desktopManifest";
import { DesktopLayoutService, migrateDesktopLayout, validateDesktopLayout } from "../src/main/services/desktopLayout";

const temporaryDirectories: string[] = [];
const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("desktop simulated platform", () => {
  it("registers the integrated scenes and validates the today widget grid contract", () => {
    expect(DESKTOP_SCENES.map((scene) => scene.id)).toEqual(["today", "todo", "timelog", "habits", "memories", "canvas", "tools"]);
    expect(DESKTOP_SCENES.map((scene) => scene.shortcut)).toEqual(["Ctrl+Alt+1", "Ctrl+Alt+2", "Ctrl+Alt+3", "Ctrl+Alt+4", "Ctrl+Alt+5", "Ctrl+Alt+6", "Ctrl+Alt+7"]);
    const layout = createDefaultDesktopLayout("2026-08-29T00:00:00.000Z");
    const widgetIds = new Set(DESKTOP_WIDGETS.map((widget) => widget.id));
    expect(layout.version).toBe(DESKTOP_LAYOUT_VERSION);
    expect(layout.preset).toBe("smart");
    expect(layout.displayPlacements).toEqual({});
    expect(layout.placements).toHaveLength(DESKTOP_WIDGETS.length);
    expect(layout.placements.every((placement) => placement.sceneId === "today")).toBe(true);
    expect(layout.placements.every((placement) => widgetIds.has(placement.widgetId))).toBe(true);
    expect(layout.placements.every((placement) => Number.isInteger(placement.colSpan) && placement.colSpan >= 1 && placement.colSpan <= 12)).toBe(true);
    expect(layout.placements.every((placement) => Number.isInteger(placement.rowSpan) && placement.rowSpan >= 1 && placement.rowSpan <= 12)).toBe(true);
    expect(layout.placements.every((placement) => Number.isInteger(placement.order) && placement.order >= 0)).toBe(true);
    expect(validateDesktopLayout(layout)).toBe(true);
  });

  it("migrates v3 desktop-file placements into v4 shortcut mirrors", () => {
    const current = createDefaultDesktopLayout("2026-08-29T00:00:00.000Z");
    const legacy = { ...current, version: 3, placements: current.placements.map((item) => item.widgetId === "desktop.shortcuts" ? { ...item, widgetId: "desktop.files" } : item) };
    delete (legacy as Partial<typeof legacy>).preset;
    const migrated = migrateDesktopLayout(legacy)!;
    expect(migrated.version).toBe(4);
    expect(migrated.placements.some((item) => item.widgetId === "desktop.shortcuts")).toBe(true);
    expect(migrated.placements.some((item) => item.widgetId === "desktop.files")).toBe(false);
    expect(validateDesktopLayout(migrated)).toBe(true);
  });

  it("restores the last valid layout when the current copy is corrupted", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dachui-desktop-layout-"));
    temporaryDirectories.push(directory);
    const service = new DesktopLayoutService(directory);
    const saved = service.save({ ...service.load(), activeScene: "habits" });
    const file = path.join(directory, "desktop", "layout.json");
    fs.writeFileSync(file, "{broken", "utf8");
    const restored = service.load();
    expect(restored.activeScene).toBe("habits");
    expect(restored.updatedAt).toBe(saved.updatedAt);
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual(restored);
  });

  it("uses a simulated fullscreen desktop without transparent overlay or click-through", () => {
    const main = read("src/main/index.ts");
    const host = read("src/main/services/desktopHost.ts");
    const shell = read("src/renderer/desktop/DesktopShell.tsx");
    expect(main).toContain("frame: false");
    expect(main).toContain("skipTaskbar: false");
    expect(main).toContain("transparent: false");
    expect(main).toContain("globalShortcut.register");
    expect(main).toContain("openWorkspaceWindow");
    expect(main).toContain("weather.start(10)");
    expect(host).toContain('mode: "simulated"');
    expect(host).not.toContain("setIgnoreMouseEvents");
    expect(host).not.toContain("clickThrough");
    expect(host).not.toContain("SetParent");
    expect(host).not.toContain("spawnSync");
    expect(host).not.toContain("recovery");
    expect(shell).toContain("shell-wallpaper");
    expect(shell).toContain("shell-dock");
    expect(shell).toContain("SettingsWorkspaceScene");
    expect(shell).toContain('selectScene("tools")');
  });

  it("wires host, layout, desktop files and weather through the desktop IPC surface", () => {
    const main = read("src/main/index.ts");
    const ipc = read("src/main/desktopIpc.ts");
    const preload = read("src/preload/index.ts");
    expect(main).toContain("DesktopFilesService");
    expect(main).toContain("WeatherService");
    expect(main).toContain('label: "显示桌面组件"');
    expect(main).toContain("desktopHost.initialize()");
    expect(ipc).toContain('handle("desktop:host:get", () => host.getState())');
    expect(ipc).toContain('handle("desktop:edit-mode", (enabled: boolean) => host.setEditMode(Boolean(enabled)))');
    expect(ipc).toContain('handle("desktop:files:get", () => desktopFiles.getState())');
    expect(ipc).toContain('handle("desktop:files:save-groups",');
    expect(ipc).toContain('handle("desktop:files:update"');
    expect(ipc).toContain('handle("desktop:files:remove"');
    expect(ipc).toContain('handle("desktop:files:auto-sync"');
    expect(ipc).toContain('handle("desktop:weather:get", () => weather.refresh())');
    expect(ipc).not.toContain("click-through");
    expect(ipc).not.toContain("setClickThrough");
    expect(preload).toContain("onWeather");
    expect(preload).toContain("getDesktopFiles");
    expect(preload).toContain("saveDesktopGroups");
    expect(preload).toContain("updateDesktopMirror");
    expect(preload).not.toContain("stashDesktopFile");
  });

  it("ships a simulated desktop surface with wallpaper grid packing and dual themes", () => {
    const entry = read("src/renderer/main.tsx");
    const styles = read("src/renderer/styles.css");
    const desktopStyles = read("src/renderer/desktop/DesktopShell.css");
    expect(entry).toContain('document.documentElement.dataset.surface = workspaceMode ? "workspace" : "desktop"');
    expect(styles).toContain('html[data-surface="desktop"] #root');
    expect(styles).toContain('html[data-surface="workspace"] #root');
    expect(desktopStyles).toContain(".shell-wallpaper");
    expect(desktopStyles).toContain("shell-topbar");
    expect(desktopStyles).toContain(".shell-grid");
    expect(desktopStyles).toContain("grid-template-columns: repeat(12, minmax(0, 1fr))");
    expect(desktopStyles).toContain("grid-auto-flow: dense");
    expect(desktopStyles).toContain("shell-dock");
    expect(desktopStyles).toContain("data-desktop-theme");
    expect(desktopStyles).toContain(".shell-empty");
  });

  it("keeps high-risk system behavior gated and wires the new desktop services", () => {
    const system = read("src/main/services/systemActions.ts");
    const desktopFiles = read("src/main/services/desktopFiles.ts");
    const weather = read("src/main/services/weather.ts");
    expect(system).toContain("requestPowerAction");
    expect(system).toContain("confirmPowerAction");
    expect(system).toContain('spawn("shutdown.exe"');
    expect(desktopFiles).toContain("saveGroups");
    expect(desktopFiles).toContain("updateMirror");
    expect(desktopFiles).toContain("removeMirror");
    expect(desktopFiles).toContain("desktop-mirrors.json");
    expect(desktopFiles).not.toContain("rmSync");
    expect(weather).toContain("OPEN_METEO_GEOCODE");
    expect(weather).toContain("setPreferredCity");
  });
});
