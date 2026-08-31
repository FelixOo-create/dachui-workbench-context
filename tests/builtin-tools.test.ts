import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RegistryService } from "../src/main/services/registry";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("built-in tool policy", () => {
  it("keeps web collections registered when removal is requested", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-builtin-"));
    temporaryDirectories.push(root);
    const registry = new RegistryService(path.join(root, "data"));
    registry.saveTool({
      id: "bookmarks",
      name: "网页收藏",
      description: "测试内置功能",
      category: "效率",
      tags: [],
      relativePath: "大锤的工作台\\modules\\bookmarks",
      runtime: { type: "local-service", launch: { type: "none" }, healthCheck: { type: "none" } },
      display: { showInToolCenter: false, openMode: "embedded" },
    });

    expect(() => registry.removeTool("bookmarks")).toThrow("内置功能不能从工具中心移除");
    expect(registry.getTool("bookmarks").name).toBe("网页收藏");
  });
});
