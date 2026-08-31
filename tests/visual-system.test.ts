import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("black-gray frosted visual contract", () => {
  it("defines one semantic token source with opaque glass fallback", () => {
    const global = read("src/renderer/styles.css");
    for (const token of [
      "--wb-bg-deep", "--wb-surface-shell", "--wb-surface-panel", "--wb-surface-row",
      "--wb-surface-glass", "--wb-surface-glass-strong", "--wb-border-default",
      "--wb-text-primary", "--wb-accent", "--wb-focus-ring", "--wb-shadow-float",
    ]) expect(global).toContain(token);
    expect(global).toContain("@supports (backdrop-filter: blur(1px))");
    expect(global).toContain("background: var(--wb-surface-glass-strong)");
  });

  it("removes the retired purple-magenta shell palette", () => {
    const cssRoot = path.join(root, "src/renderer");
    const css = fs.readdirSync(cssRoot, { recursive: true })
      .filter((entry) => String(entry).endsWith(".css"))
      .map((entry) => fs.readFileSync(path.join(cssRoot, String(entry)), "utf8"))
      .join("\n")
      .toLowerCase();
    for (const retired of ["#a086ff", "#5e4dd1", "#ff7ab6", "#6f82ff", "#8b5cf6", "#d39cbb"]) {
      expect(css).not.toContain(retired);
    }
    const shell = read("src/renderer/desktop/DesktopShell.css");
    expect(shell).toContain("rgba(126, 164, 192, 0.17)");
    expect(shell).toContain("background: var(--wb-surface-panel-fallback)");
  });

  it("uses one glass owner per panel and keeps settings in the current desktop shell", () => {
    const global = read("src/renderer/styles.css");
    const shell = read("src/renderer/desktop/DesktopShell.css");
    const shellView = read("src/renderer/desktop/DesktopShell.tsx");
    const settings = read("src/renderer/desktop/SettingsWorkspaceScene.css");
    const schedule = read("src/renderer/schedule/Workbench.css");
    expect(shell).toContain(".desktop-scene-page { padding: 14px 18px 18px; }");
    expect(shell).toContain(".memories-scene {");
    expect(shell).toContain("background: transparent;");
    expect(shell).toContain(".tools-scene {");
    expect(shell).toContain(".shell-stage.is-full-scene");
    expect(schedule).toContain('.schedule-workspace[data-module="timelog"]');
    expect(schedule).toContain('.schedule-workspace[data-module="habits"]');
    expect(schedule).toContain(".todo-center-pane");
    expect(schedule).toContain("background: var(--wb-surface-panel)");
    expect(shellView).toContain("SettingsWorkspaceScene");
    expect(settings).toContain(".settings-workspace-scene");
    expect(global).toContain(".app-shell.workspace-window");
    expect(global).toContain("grid-template-columns: minmax(0, 1fr)");
  });

  it("keeps complete scenes and applies the todo baseline without changing layout routes", () => {
    const shell = read("src/renderer/desktop/DesktopShell.tsx");
    const shellCss = read("src/renderer/desktop/DesktopShell.css");
    const schedule = read("src/renderer/schedule/App.tsx");
    const todo = read("src/renderer/schedule/todo-v2/TodoSceneV2.tsx");
    const todoCss = read("src/renderer/schedule/todo-v2/TodoSceneV2.css");
    expect(shell).toContain("<SceneRenderer sceneId={activeSceneId}");
    expect(schedule).toContain("<TodoSceneV2Container />");
    expect(todo).toContain("t2-sidebar");
    expect(todo).toContain("t2-task-panel");
    expect(todo).toContain("t2-calendar-panel");
    expect(shell).toContain('data-scene={settingsOpen ? "settings" : activeSceneId}');
    expect(shellCss).toContain(".shell-stage.is-full-scene");
    expect(schedule).toContain('data-module={module === "todo" ? "todo-v2" : module}');
    expect(todoCss).toContain("grid-template-columns: 220px minmax(430px, 1fr) 352px");
    expect(todoCss).toContain("backdrop-filter: blur(18px)");
    expect(todoCss).toContain("--t2-row: rgba(255, 255, 255, .025)");
    expect(todoCss).toContain(".t2-task-row:focus-within");
    expect(todoCss).toContain(".t2-task-menu");
    expect(todoCss).toContain("backdrop-filter: blur(28px)");
  });
});
