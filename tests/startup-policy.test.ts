import { describe, expect, it, vi } from "vitest";
import type { ToolDefinition } from "../src/shared/types";
import { StartupPolicyRunner } from "../src/main/services/startupPolicy";

function tool(id: string, startupPolicy: ToolDefinition["startupPolicy"] = "manual"): ToolDefinition {
  return {
    id, name: id, description: "", category: "测试", tags: [], relativePath: id,
    runtime: { type: "command", launch: { type: "bat", path: "start.bat" }, healthCheck: { type: "none" } },
    display: { showInToolCenter: true, openMode: "folder" }, startupPolicy,
  };
}

describe("StartupPolicyRunner", () => {
  it("只应用一次，并隔离单个工具失败", async () => {
    const runner = new StartupPolicyRunner();
    const run = vi.fn(async (toolId: string) => { if (toolId === "failed") throw new Error("模拟启动失败"); });
    const tools = [tool("first", "on-workbench-start"), tool("failed", "on-workbench-start"), tool("manual")];
    await runner.apply(tools, run);
    await runner.apply(tools, run);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledWith("first");
    expect(run).toHaveBeenCalledWith("failed");
  });
});
