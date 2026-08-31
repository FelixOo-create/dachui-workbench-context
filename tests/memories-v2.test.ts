import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { MemoryEntry } from "../src/shared/memories";
import {
  buildMemoryYearSummary,
  clampTimelineIndex,
  filterMemoryEntries,
  memoryTypeCounts,
  memoryYears,
  sortTimelineEntries,
} from "../src/renderer/memories/selectors";

const projectRoot = path.resolve(__dirname, "..");
const journalSource = () => fs.readFileSync(path.join(projectRoot, "src/renderer/memories/MemoryJournal.tsx"), "utf8");

function entry(id: string, mediaType: MemoryEntry["mediaType"], completedOn: string, tags: string[] = []): MemoryEntry {
  return {
    id,
    mediaType,
    title: `作品 ${id}`,
    creator: `作者 ${id}`,
    releaseYear: 2020,
    seasonLabel: "",
    completedOn,
    rating: 4.5,
    shortReview: `${id} 的短评`,
    review: "",
    tags,
    isRepeat: false,
    coverDataUrl: null,
    coverAttribution: "",
    externalProvider: null,
    externalId: null,
    createdAt: `${completedOn}T12:00:00.000Z`,
    updatedAt: `${completedOn}T12:00:00.000Z`,
  };
}

describe("纪念册 V2 派生数据", () => {
  const entries = [
    entry("a", "book", "2026-08-29", ["年度推荐", "成长"]),
    entry("b", "movie", "2026-08-18", ["年度推荐", "灵感"]),
    entry("c", "series", "2025-12-02", ["灵感"]),
  ];

  it("搜索和分类只使用当前记录字段", () => {
    expect(filterMemoryEntries(entries, "movie", "年度推荐").map((item) => item.id)).toEqual(["b"]);
    expect(filterMemoryEntries(entries, "all", "作者 c").map((item) => item.id)).toEqual(["c"]);
    expect(memoryTypeCounts(entries)).toEqual({ all: 3, book: 1, movie: 1, series: 1 });
  });

  it("年度地图、月份节奏和关键词由记录计算", () => {
    const summary = buildMemoryYearSummary(entries, "2026");
    expect(summary.total).toBe(2);
    expect(summary.categories).toEqual({ book: 1, movie: 1, series: 0 });
    expect(summary.months[7]).toBe(2);
    expect(summary.topTags[0]).toEqual({ tag: "年度推荐", count: 2 });
    expect(memoryYears(entries)).toEqual([{ year: "2026", count: 2 }, { year: "2025", count: 1 }]);
  });

  it("时间长廊按完成时间排序并限制活动索引", () => {
    expect(sortTimelineEntries(entries).map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(clampTimelineIndex(-1, 3)).toBe(0);
    expect(clampTimelineIndex(9, 3)).toBe(2);
  });

  it("默认、创建和时间长廊三种实装视图共享同一业务入口", () => {
    const source = journalSource();
    expect(source).toContain("memory-v2-cover-workspace");
    expect(source).toContain("memory-v2-grid");
    expect(source).toContain("memory-v2-detail");
    expect(source).toContain("memory-v2-timeline-stage");
    expect(source).toContain("memory-v2-year-map");
    expect(source).toContain("memory-v2-editor");
    expect(source).toContain("memoriesApi.list()");
    expect(source).toContain("memoriesApi.save(input)");
    expect(source).toContain("memoriesApi.remove(entry.id)");
  });

  it("使用统一页面壳层并把边框留给真实内部面板", () => {
    const scene = fs.readFileSync(path.join(projectRoot, "src/renderer/desktop/SceneRenderer.tsx"), "utf8");
    const shell = fs.readFileSync(path.join(projectRoot, "src/renderer/desktop/DesktopShell.css"), "utf8");
    const styles = fs.readFileSync(path.join(projectRoot, "src/renderer/memories/MemoryJournal.css"), "utf8");
    expect(scene).toContain('className="desktop-full-scene desktop-scene-page memories-scene"');
    expect(shell).toContain(".desktop-scene-page { padding: 14px 18px 18px; }");
    expect(shell).toMatch(/\.memories-scene \{[\s\S]*?border: 0;[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/);
    expect(styles).toContain(".memory-v2-panel { border: 1px solid var(--memory-line);");
  });
});
