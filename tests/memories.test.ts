import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { MemoriesService } from "../src/main/services/memories";

const onePixelPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xb6z4QAAAABJRU5ErkJggg==";
const cleanup: Array<{ root: string; service: MemoriesService }> = [];

function createService(): MemoriesService {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dachui-memories-"));
  const service = new MemoriesService(root);
  cleanup.push({ root, service });
  return service;
}

afterEach(() => {
  for (const item of cleanup.splice(0)) {
    item.service.close();
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});

describe("MemoriesService", () => {
  it("persists personal entries and cached pasted covers", async () => {
    const service = createService();
    const saved = await service.save({
      mediaType: "book",
      title: "测试作品",
      creator: "测试作者",
      completedOn: "2026-08-26",
      rating: 4.5,
      shortReview: "值得记住",
      tags: ["阅读", "阅读", "年度喜欢"],
      coverDataUrl: onePixelPng,
      coverAttribution: "粘贴图片",
    });

    expect(saved.title).toBe("测试作品");
    expect(saved.tags).toEqual(["阅读", "年度喜欢"]);
    expect(saved.coverDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(service.list()).toHaveLength(1);

    service.close();
    const reopened = new MemoriesService(cleanup[0].root);
    cleanup[0].service = reopened;
    expect(reopened.list()[0].title).toBe("测试作品");
  });

  it("allows repeated completion records and removes cached files with the entry", async () => {
    const service = createService();
    const first = await service.save({ mediaType: "movie", title: "同一作品", completedOn: "2026-08-20" });
    const second = await service.save({ mediaType: "movie", title: "同一作品", completedOn: "2026-08-26", isRepeat: true, coverDataUrl: onePixelPng });

    expect(service.list().map((item) => item.id)).toEqual([second.id, first.id]);
    expect(service.list()[0].isRepeat).toBe(true);
    service.remove(second.id);
    expect(service.list()).toHaveLength(1);
  });

  it("keeps the legacy token setting untouched while validating required fields", async () => {
    const service = createService();
    const database = new DatabaseSync(path.join(cleanup[0].root, "memories.db"));
    database.prepare("INSERT INTO memory_settings(key, value) VALUES('tmdb_token', ?1)").run("legacy-token");
    expect(database.prepare("SELECT value FROM memory_settings WHERE key = 'tmdb_token'").get()).toEqual({ value: "legacy-token" });
    database.close();

    await expect(service.save({ mediaType: "book", title: "", completedOn: "2026-08-26" })).rejects.toThrow("请填写作品名称");
    await expect(service.save({ mediaType: "book", title: "测试", completedOn: "2026-99-99" })).rejects.toThrow("完成日期无效");
  });
});
