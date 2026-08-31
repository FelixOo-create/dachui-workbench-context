import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Habit, HabitRecord } from "../src/renderer/schedule/types";
import { calculateHabitMetrics } from "../src/renderer/schedule/habits-v2/metrics";
import { habitActionError, loadAllHabitRecords, replaceHabitRecord } from "../src/renderer/schedule/habits-v2/adapter";

const selectedDate = "2026-08-30";

describe("习惯页 V2 指标", () => {
  it("空数据返回稳定的零值和空排行", () => {
    const metrics = calculateHabitMetrics([], [], selectedDate, 30);

    expect(metrics).toMatchObject({
      todayCompleted: 0,
      todayTotal: 0,
      longestStreak: 0,
      weekCompletionRate: 0,
      monthCheckins: 0,
      rangeCompletionRate: 0,
      ranking: [],
    });
    expect(metrics.heatmap).toHaveLength(56);
    expect(metrics.heatmap.every((day) => day.level === 0 && day.total === 0)).toBe(true);
  });

  it("按每个习惯自己的 targetCount 计算完成、连续和热力等级", () => {
    const habits: Habit[] = [
      { id: "read", name: "阅读", color: "#79ad93", icon: "book", targetCount: 1, createdAt: "2026-08-01" },
      { id: "water", name: "喝水", color: "#7697ad", icon: "droplets", targetCount: 3, createdAt: "2026-08-01" },
    ];
    const records: HabitRecord[] = [
      { habitId: "read", date: "2026-08-30", count: 1 },
      { habitId: "read", date: "2026-08-29", count: 1 },
      { habitId: "read", date: "2026-08-28", count: 1 },
      { habitId: "water", date: "2026-08-30", count: 2 },
      { habitId: "water", date: "2026-08-29", count: 3 },
      { habitId: "water", date: "2026-08-28", count: 3 },
    ];

    const metrics = calculateHabitMetrics(habits, records, selectedDate, 7);

    expect(metrics.todayCompleted).toBe(1);
    expect(metrics.todayTotal).toBe(2);
    expect(metrics.longestStreak).toBe(3);
    expect(metrics.weekCompletionRate).toBe(36);
    expect(metrics.rangeCompletionRate).toBe(36);
    expect(metrics.monthCheckins).toBe(11);
    expect(metrics.ranking.map(({ habit, streak }) => [habit.id, streak])).toEqual([
      ["read", 3],
      ["water", 2],
    ]);
    expect(metrics.heatmap.at(-1)).toMatchObject({ date: selectedDate, completed: 1, total: 2, level: 2 });
    expect(metrics.heatmap.at(-2)).toMatchObject({ date: "2026-08-29", completed: 2, total: 2, level: 4 });
  });
});

describe("习惯页 V2 正式适配", () => {
  it("打卡框及其数字与勾图标使用双层居中契约", () => {
    const css = readFileSync(new URL("../src/renderer/schedule/habits-v2/HabitsSceneV2.css", import.meta.url), "utf8");
    const checkRule = css.match(/\.h2v2-check \{([^}]+)\}/)?.[1] ?? "";
    expect(checkRule).toContain("justify-self: center");
    expect(checkRule).toContain("align-self: center");
    expect(checkRule).toContain("place-items: center");
    expect(checkRule).toContain("padding: 0");
    expect(css).toContain(".h2v2-check > span");
    expect(css).toContain(".h2v2-check > svg");
  });

  it("方案 A 提供语义图标且不再把完成勾作为新习惯选项", () => {
    const source = readFileSync(new URL("../src/renderer/schedule/habits-v2/HabitsSceneV2.tsx", import.meta.url), "utf8");
    expect(source).toContain('{ value: "sunrise", label: "早起" }');
    expect(source).toContain('{ value: "shield-check", label: "避免坏习惯" }');
    expect(source).toContain('{ value: "moon", label: "早睡" }');
    expect(source).not.toContain('{ value: "check",');
    expect(source).toContain("check: Check");
  });

  it("正式习惯路由挂载 V2 Container 且不再渲染旧 HabitsView", () => {
    const source = readFileSync(new URL("../src/renderer/schedule/App.tsx", import.meta.url), "utf8");
    expect(source).toContain('import HabitsSceneV2Container from "./habits-v2/HabitsSceneV2Container"');
    expect(source).toContain("<HabitsSceneV2Container />");
    expect(source).not.toContain("<HabitsView");
  });

  it("合并每个习惯的历史记录并在任一读取失败时拒绝刷新", async () => {
    const habits: Habit[] = [
      { id: "a", name: "A", color: "#79ad93", icon: "check", targetCount: 1, createdAt: "2026-08-01" },
      { id: "b", name: "B", color: "#7697ad", icon: "book", targetCount: 2, createdAt: "2026-08-01" },
    ];
    await expect(loadAllHabitRecords(habits, async (habitId) => [
      { habitId, date: selectedDate, count: habitId === "a" ? 1 : 2 },
    ])).resolves.toHaveLength(2);
    await expect(loadAllHabitRecords(habits, async (habitId) => {
      if (habitId === "b") throw new Error("隔离读取失败");
      return [{ habitId, date: selectedDate, count: 1 }];
    })).rejects.toThrow("隔离读取失败");
  });

  it("乐观记录替换支持增加、撤销到零和稳定错误文案", () => {
    const first = replaceHabitRecord([], "water", selectedDate, 1);
    expect(replaceHabitRecord(first, "water", selectedDate, 2)).toEqual([
      { habitId: "water", date: selectedDate, count: 2 },
    ]);
    expect(replaceHabitRecord(first, "water", selectedDate, 0)).toEqual([]);
    expect(habitActionError(new Error("保存失败"))).toBe("保存失败");
    expect(habitActionError(null)).toBe("操作未完成，请重试");
  });
});
