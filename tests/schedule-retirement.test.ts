import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const retiredProjectPath = "E:\\Vibecoding\\日程&待办工具";
const retiredProjectName = "日程&待办工具";

describe("retired standalone schedule project boundary", () => {
  it("keeps active code and current documentation independent from the retired path", () => {
    for (const relativePath of [
      "src/main/index.ts",
      "src/main/services/schedule.ts",
      "AGENTS.md",
      "README.md",
      "ARCHITECTURE.md",
      "docs/CURRENT_STATE.md",
    ]) {
      const content = fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
      expect(content, relativePath).not.toContain(retiredProjectPath);
    }
  });

  it("does not register the retired project as a Workbench tool", () => {
    const toolsDirectory = path.join(projectRoot, "data", "tools");
    for (const fileName of fs.readdirSync(toolsDirectory).filter((item) => item.endsWith(".json"))) {
      const tool = JSON.parse(fs.readFileSync(path.join(toolsDirectory, fileName), "utf8")) as {
        relativePath?: string;
      };
      expect(tool.relativePath ?? "", fileName).not.toContain(retiredProjectName);
    }
  });
});
