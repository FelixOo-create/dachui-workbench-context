import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");
const legacyPath = ["E:\\Vibecoding", "书签页工具"].join("\\");

describe("bookmarks retirement boundary", () => {
  it("keeps active source and docs free of the retired runtime path", () => {
    const files = [
      "src/main/index.ts",
      "src/main/services/registry.ts",
      "docs/CURRENT_STATE.md",
    ];
    const text = files.map((file) => fs.readFileSync(path.join(projectRoot, file), "utf8")).join("\n");
    expect(text).not.toContain(legacyPath);
    expect(text).toContain("modules\\bookmarks");
    expect(text).toContain("userData");
  });
});
