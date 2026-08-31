import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ToolDefinition } from "../src/shared/types";
import { RegistryService, validateTool } from "../src/main/services/registry";

const temporaryDirectories: string[] = [];

function createRegistry() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-registry-"));
  temporaryDirectories.push(root);
  return { root, registry: new RegistryService(path.join(root, "data")) };
}

function tool(relativePath = "示例工具"): ToolDefinition {
  return {
    id: "sample-tool",
    name: "示例工具",
    description: "测试",
    category: "测试",
    tags: [],
    relativePath,
    runtime: { type: "folder", launch: { type: "none" }, healthCheck: { type: "none" } },
    display: { showInToolCenter: true, openMode: "folder" },
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("Tool Registry", () => {
  it("persists a valid tool definition", () => {
    const { registry } = createRegistry();
    registry.saveTool(tool());
    expect(registry.listTools()).toHaveLength(1);
    expect(registry.getTool("sample-tool").name).toBe("示例工具");
  });

  it("rejects absolute and escaping paths", () => {
    expect(() => validateTool(tool("E:\\outside"))).toThrow(/相对路径/);
    const { root, registry } = createRegistry();
    const workspace = path.join(root, "workspace");
    fs.mkdirSync(workspace);
    registry.saveSettings({ workspaceRoot: workspace, theme: "dark", compactMode: false, fontSizeMode: "medium" });
    const invalid = tool("..\\outside");
    expect(() => registry.resolveToolRoot(invalid)).toThrow(/越过/);
  });

  it("cleans wrapping spaces and quotes from the workspace root", () => {
    const { root, registry } = createRegistry();
    const workspace = path.join(root, "workspace");
    fs.mkdirSync(workspace);

    const saved = registry.saveSettings({
      workspaceRoot: `  “${workspace}”  `,
      theme: "dark",
      compactMode: false,
      fontSizeMode: "medium",
    });

    expect(saved.workspaceRoot).toBe(path.resolve(workspace));
    expect(registry.getSettings().workspaceRoot).toBe(path.resolve(workspace));
  });

  it("normalizes legacy theme settings to dark", () => {
    const { root, registry } = createRegistry();
    const workspace = path.join(root, "workspace");
    fs.mkdirSync(workspace);

    const saved = registry.saveSettings({
      workspaceRoot: workspace,
      theme: "light",
      compactMode: false,
      fontSizeMode: "medium",
    });

    expect(saved.theme).toBe("dark");
    expect(registry.getSettings().theme).toBe("dark");
  });

  it("finds only unregistered first-level directories", () => {
    const { root, registry } = createRegistry();
    const workspace = path.join(root, "workspace");
    fs.mkdirSync(path.join(workspace, "示例工具"), { recursive: true });
    fs.mkdirSync(path.join(workspace, "新工具"), { recursive: true });
    fs.writeFileSync(path.join(workspace, "新工具", "package.json"), "{}");
    registry.saveSettings({ workspaceRoot: workspace, theme: "dark", compactMode: false, fontSizeMode: "medium" });
    registry.saveTool(tool());
    expect(registry.scanWorkspace()).toEqual([
      expect.objectContaining({ name: "新工具", detectedType: "command", markers: ["package.json"] }),
    ]);
  });

  it("ignores the default workspace governance directories but keeps normal projects", () => {
    const { root, registry } = createRegistry();
    const workspace = path.join(root, "workspace");
    for (const name of ["_归档", "_管理", "node_modules", "release", "dist", "build", "out", ".cache", "正常工具"]) {
      fs.mkdirSync(path.join(workspace, name), { recursive: true });
      fs.writeFileSync(path.join(workspace, name, "package.json"), "{}", "utf8");
    }
    registry.saveSettings({ workspaceRoot: workspace, theme: "dark", compactMode: false, fontSizeMode: "medium" });

    const candidates = registry.scanWorkspace();

    expect(candidates.map((item) => item.name)).toEqual(["正常工具"]);
    expect(registry.getSettings().ignoredWorkspaceDirectories).toEqual([
      "_归档", "_管理", "node_modules", "release", "dist", "build", "out", ".cache",
    ]);
  });

  it("normalizes custom ignored directories and still scans one explicitly selected", () => {
    const { root, registry } = createRegistry();
    const workspace = path.join(root, "workspace");
    const ignored = path.join(workspace, "私人候选");
    const normal = path.join(workspace, "正常工具");
    fs.mkdirSync(ignored, { recursive: true });
    fs.mkdirSync(normal, { recursive: true });
    fs.writeFileSync(path.join(ignored, "package.json"), "{}", "utf8");
    fs.writeFileSync(path.join(normal, "package.json"), "{}", "utf8");
    registry.saveSettings({
      workspaceRoot: workspace,
      theme: "dark",
      compactMode: false,
      fontSizeMode: "medium",
      ignoredWorkspaceDirectories: [" 私人候选 ", "PRIVATE CANDIDATE", "private candidate", ""],
    });

    expect(registry.getSettings().ignoredWorkspaceDirectories).toEqual(["私人候选", "PRIVATE CANDIDATE"]);
    expect(registry.scanWorkspace().map((item) => item.name)).toEqual(["正常工具"]);
    expect(registry.scanFolder(ignored)[0]).toMatchObject({ name: "私人候选", relativePath: "私人候选" });
  });

  it("detects a startup script and local service port without executing it", () => {
    const { root, registry } = createRegistry();
    const workspace = path.join(root, "workspace");
    const sourceTool = path.join(workspace, "演示服务");
    fs.mkdirSync(sourceTool, { recursive: true });
    fs.writeFileSync(path.join(sourceTool, "启动工作台.bat"), "@echo off\nstart http://127.0.0.1:4567\n", "utf8");
    registry.saveSettings({ workspaceRoot: workspace, theme: "dark", compactMode: false, fontSizeMode: "medium" });

    const [candidate] = registry.scanFolder(sourceTool);

    expect(candidate).toMatchObject({
      name: "演示服务",
      relativePath: "演示服务",
      detectedType: "local-service",
      launch: { type: "bat", path: "启动工作台.bat" },
      openUrl: "http://127.0.0.1:4567",
      healthCheck: { type: "http", url: "http://127.0.0.1:4567" },
      confidence: "high",
    });
    expect(fs.readFileSync(path.join(sourceTool, "启动工作台.bat"), "utf8")).toContain("127.0.0.1:4567");
  });

  it("detects safe Node and Python entry suggestions", () => {
    const { root, registry } = createRegistry();
    const workspace = path.join(root, "workspace");
    const nodeTool = path.join(workspace, "Node工具");
    const pythonTool = path.join(workspace, "Python工具");
    fs.mkdirSync(nodeTool, { recursive: true });
    fs.mkdirSync(pythonTool, { recursive: true });
    fs.writeFileSync(path.join(nodeTool, "package.json"), JSON.stringify({ main: "server.js", description: "Node 服务" }), "utf8");
    fs.writeFileSync(path.join(nodeTool, "server.js"), "console.log('test')", "utf8");
    fs.writeFileSync(path.join(pythonTool, "main.py"), "print('test')", "utf8");
    registry.saveSettings({ workspaceRoot: workspace, theme: "dark", compactMode: false, fontSizeMode: "medium" });

    const candidates = registry.scanWorkspace();

    expect(candidates.find((item) => item.name === "Node工具")).toMatchObject({ launch: { type: "node", path: "server.js" }, detectedType: "command" });
    expect(candidates.find((item) => item.name === "Python工具")).toMatchObject({ launch: { type: "python", path: "main.py" }, detectedType: "command" });
  });

  it("matches an existing registration by relative path and rejects folders outside the workspace", () => {
    const { root, registry } = createRegistry();
    const workspace = path.join(root, "workspace");
    const sourceTool = path.join(workspace, "已有工具");
    const outside = path.join(root, "outside");
    fs.mkdirSync(sourceTool, { recursive: true });
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(sourceTool, "start.bat"), "@echo off", "utf8");
    registry.saveSettings({ workspaceRoot: workspace, theme: "dark", compactMode: false, fontSizeMode: "medium" });
    registry.saveTool({ ...tool("已有工具"), id: "existing-tool" });

    expect(registry.scanFolder(sourceTool)[0].existingToolId).toBe("existing-tool");
    expect(() => registry.scanFolder(outside)).toThrow(/Workspace Root/);
  });

  it("removes only the workbench shortcut definition", () => {
    const { root, registry } = createRegistry();
    const workspace = path.join(root, "workspace");
    const sourceTool = path.join(workspace, "示例工具");
    fs.mkdirSync(sourceTool, { recursive: true });
    registry.saveSettings({ workspaceRoot: workspace, theme: "dark", compactMode: false, fontSizeMode: "medium" });
    registry.saveTool(tool());

    registry.removeTool("sample-tool");

    expect(registry.listTools()).toHaveLength(0);
    expect(fs.existsSync(sourceTool)).toBe(true);
  });
});
