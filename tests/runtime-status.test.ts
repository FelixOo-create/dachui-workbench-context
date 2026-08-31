import { createServer, type Server } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ shell: { openPath: vi.fn(), openExternal: vi.fn() } }));
import { RegistryService } from "../src/main/services/registry";
import { RuntimeManager } from "../src/main/services/runtime";

const temporaryDirectories: string[] = [];
const healthServers: Server[] = [];
afterEach(async () => {
  await Promise.all(healthServers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

async function startHealthServer(body: unknown, raw = false): Promise<string> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(raw ? String(body) : JSON.stringify(body));
  });
  healthServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("health server did not bind");
  return `http://127.0.0.1:${address.port}/api/health`;
}

function createHttpTool(root: string, url: string, expectedServiceId?: string): { registry: RegistryService; marker: string } {
  const workspace = path.join(root, "workspace");
  const toolRoot = path.join(workspace, "http-tool");
  const marker = path.join(root, "launch-marker.txt");
  fs.mkdirSync(toolRoot, { recursive: true });
  fs.writeFileSync(path.join(toolRoot, "launch.mjs"), `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(marker)}, "launched");`, "utf8");
  const registry = new RegistryService(path.join(root, "data"));
  registry.saveSettings({ workspaceRoot: workspace, theme: "dark", compactMode: false, fontSizeMode: "medium" });
  registry.saveTool({
    id: "http-tool",
    name: "HTTP 工具",
    description: "",
    category: "测试",
    tags: [],
    relativePath: "http-tool",
    runtime: {
      type: "local-service",
      launch: { type: "node", path: "launch.mjs" },
      healthCheck: { type: "http", url, timeout: 1000, expectedServiceId },
      startupTimeout: 2500,
    },
    display: { showInToolCenter: true, openMode: "folder" },
  });
  return { registry, marker };
}

describe("RuntimeManager error state", () => {
  it("preserves a startup error across ordinary status refreshes", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-runtime-status-"));
    temporaryDirectories.push(root);
    const workspace = path.join(root, "workspace");
    fs.mkdirSync(path.join(workspace, "broken-tool"), { recursive: true });
    const registry = new RegistryService(path.join(root, "data"));
    registry.saveSettings({ workspaceRoot: workspace, theme: "dark", compactMode: false, fontSizeMode: "medium" });
    registry.saveTool({ id: "broken-tool", name: "失败工具", description: "", category: "测试", tags: [], relativePath: "broken-tool", runtime: { type: "command", launch: { type: "bat", path: "missing.bat" }, healthCheck: { type: "none" } }, display: { showInToolCenter: true, openMode: "folder" }, startupPolicy: "manual" });
    const runtime = new RuntimeManager(registry, path.join(root, "logs"));
    const failed = await runtime.start("broken-tool");
    const refreshed = await runtime.getStatus("broken-tool");
    const listed = await runtime.getStatuses();
    expect(failed).toMatchObject({ status: "error", message: expect.stringContaining("启动脚本不存在") });
    expect(refreshed).toEqual(failed);
    expect(listed.find((status) => status.toolId === "broken-tool")).toEqual(failed);
  });
});

describe("RuntimeManager HTTP service identity", () => {
  it("accepts a matching service identity", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-runtime-identity-"));
    temporaryDirectories.push(root);
    const url = await startHealthServer({ ok: true, serviceId: "test-service" });
    const { registry } = createHttpTool(root, url, "test-service");
    const status = await new RuntimeManager(registry, path.join(root, "logs")).getStatus("http-tool");
    expect(status.status).toBe("running");
  });

  it.each([
    ["missing serviceId", {}, false],
    ["invalid JSON", "not-json", true],
  ])("rejects %s before launch", async (_label, body, raw) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-runtime-identity-"));
    temporaryDirectories.push(root);
    const url = await startHealthServer(body, raw);
    const { registry, marker } = createHttpTool(root, url, "test-service");
    const status = await new RuntimeManager(registry, path.join(root, "logs")).start("http-tool");
    expect(status).toMatchObject({ status: "error", message: expect.stringMatching(/端口 .*服务身份不匹配.*其他服务占用/) });
    expect(fs.existsSync(marker)).toBe(false);
  });

  it("keeps ordinary HTTP checks compatible when no identity is configured", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-runtime-identity-"));
    temporaryDirectories.push(root);
    const url = await startHealthServer("not-json", true);
    const { registry } = createHttpTool(root, url);
    const status = await new RuntimeManager(registry, path.join(root, "logs")).getStatus("http-tool");
    expect(status.status).toBe("running");
  });
});
