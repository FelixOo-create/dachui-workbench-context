import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultDesktopLayout, DESKTOP_WIDGETS, normalizeLegacyDefaultHomeLayout } from "../src/shared/desktopManifest";
import { applyLayoutPreset, reorderPlacement, resizePlacement, undoLayoutPreset, updatePlacement } from "../src/renderer/desktop/panels";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("simulated desktop interaction contracts", () => {
  it("exposes a real library/add-hide/drag-resize persistence path", () => {
    const shell = read("src/renderer/desktop/DesktopShell.tsx");
    expect(shell).toContain("组件库");
    expect(shell).toContain("onAdd");
    expect(shell).toContain("onHide");
    expect(shell).toContain("onResize");
    expect(shell).toContain("reorderPlacement");
    expect(shell).toContain("saveLayout");

    let layout = createDefaultDesktopLayout();
    layout = updatePlacement(layout, "today.tasks", { hidden: true });
    expect(layout.placements.find((item) => item.widgetId === "today.tasks")?.hidden).toBe(true);
    layout = updatePlacement(layout, "today.tasks", { hidden: false });
    layout = resizePlacement(layout, "today.tasks", 2, 1);
    expect(layout.placements.find((item) => item.widgetId === "today.tasks")).toMatchObject({ colSpan: 5, rowSpan: 5 });
    layout = reorderPlacement(layout, "today", "today.tasks", 1);
    expect(layout.placements.find((item) => item.widgetId === "today.tasks")?.order).toBe(2);
    const arranged = applyLayoutPreset(layout, DESKTOP_WIDGETS, "triple");
    expect(arranged.preset).toBe("triple");
    expect(arranged.previousPlacements).not.toBeNull();
    expect(undoLayoutPreset(arranged).placements).toEqual(layout.placements);
  });

  it("renders core modules in the current scene and does not retain automatic power execution", () => {
    const shell = read("src/renderer/desktop/DesktopShell.tsx");
    const sceneRenderer = read("src/renderer/desktop/SceneRenderer.tsx");
    const settingsScene = read("src/renderer/desktop/SettingsWorkspaceScene.tsx");
    const registry = read("src/renderer/desktop/registry.tsx");
    expect(shell).toContain("<SceneRenderer sceneId={activeSceneId}");
    expect(shell).toContain("<SettingsWorkspaceScene");
    expect(settingsScene).toContain("api.getSettings()");
    expect(settingsScene).toContain("api.saveSettings(draft)");
    expect(settingsScene).not.toContain('openWorkspace("settings")');
    expect(shell).not.toContain("打开对应工作区");
    expect(sceneRenderer).toContain('lazy(() => import("../schedule/App"))');
    expect(sceneRenderer).toContain('lazy(() => import("../memories/MemoryJournal"))');
    expect(sceneRenderer).toContain('lazy(() => import("../tools/ToolsWorkspaceScene"))');
    expect(sceneRenderer).toContain('sceneId === "todo" ? "todo"');
    expect(sceneRenderer).toContain('sceneId === "timelog" ? "timelog"');
    expect(registry).toContain("confirmPowerAction");
    expect(registry).toContain("取消");
    expect(registry).not.toContain("setTimeout");
    expect(registry).not.toContain("打开任务");
    const toolsScene = read("src/renderer/tools/ToolsWorkspaceScene.tsx");
    expect(toolsScene).toContain("扫描工作区");
    expect(toolsScene).toContain("添加工具");
    expect(toolsScene).toContain("编辑配置");
    expect(toolsScene).toContain("运行日志");
  });

  it("shows the package version in the persistent desktop shell", () => {
    const shell = read("src/renderer/desktop/DesktopShell.tsx");
    const shellCss = read("src/renderer/desktop/DesktopShell.css");
    const packageMetadata = JSON.parse(read("package.json")) as { version: string };
    expect(packageMetadata.version).toBe("0.5.1");
    expect(shell).toContain('import packageMetadata from "../../../package.json"');
    expect(shell).toContain("const APP_VERSION = `v${packageMetadata.version}`");
    expect(shell).toContain('className="shell-version"');
    expect(shell).toContain("当前版本 ${APP_VERSION}");
    expect(shellCss).toContain(".shell-version");
  });

  it("keeps the daily overview focused without overwriting customized layouts", () => {
    const defaults = createDefaultDesktopLayout("2026-08-30T00:00:00.000Z");
    expect(defaults.placements.filter((item) => !item.hidden).map((item) => item.widgetId)).toEqual([
      "desktop.shortcuts", "today.tasks", "today.calendar", "today.focus",
    ]);
    const legacy = { ...defaults, placements: defaults.placements.map((item) => ({ ...item, hidden: false })) };
    expect(normalizeLegacyDefaultHomeLayout(legacy).placements.filter((item) => !item.hidden)).toHaveLength(4);
    const customized = { ...legacy, placements: legacy.placements.map((item, index) => index === 0 ? { ...item, colSpan: 4 } : item) };
    expect(normalizeLegacyDefaultHomeLayout(customized)).toBe(customized);
  });

  it("disables deferred entries and reports dock launch failures instead of swallowing them", () => {
    const shell = read("src/renderer/desktop/DesktopShell.tsx");
    expect(shell).toContain('scene.id === "canvas"');
    expect(shell).toContain('widget.id === "today.history"');
    expect(shell).toContain("后续开放");
    expect(shell).toContain("请检查工具或来源配置");
    expect(shell).not.toContain("catch(() => undefined)");
    expect(shell).not.toContain("切换浅色");
  });

  it("keeps every manifest represented and makes deferred widgets explicit", () => {
    const registry = read("src/renderer/desktop/registry.tsx");
    for (const widget of DESKTOP_WIDGETS) expect(registry).toContain(widget.id);
    expect(registry).toContain("该组件暂未接入，不提供无效操作");
    expect(registry).toContain("今天暂无到期任务");
    expect(registry).toContain("当前版本未开放城市设置，不提供无效入口");
    expect(registry).not.toContain('openWorkspace("settings")');
    expect(registry).not.toContain("MemoriesWidget");
    expect(registry).not.toContain("ToolStatusWidget");
  });
});
