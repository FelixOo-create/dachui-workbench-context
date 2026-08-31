import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ScheduleService, type CategoryRow, type HabitRecordRow, type HabitRow, type TaskRow, type TimeEntryRow } from "../src/main/services/schedule";

describe("ScheduleService", () => {
  let directory: string;
  let service: ScheduleService;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "dachui-schedule-"));
    service = new ScheduleService(path.join(directory, "schedule.db"));
  });

  afterEach(() => {
    service.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("persists tasks and clears nullable planning fields", () => {
    const created = service.dispatch("create_task", {
      input: {
        title: "完成工作台验收",
        dueDate: "2026-08-18",
        dueTime: "21:30",
        reminderMinutes: 15,
        repeatRule: JSON.stringify({ type: "daily", interval: 1 }),
      },
    }) as TaskRow;

    const updated = service.dispatch("update_task", {
      id: created.id,
      patch: { dueDate: null, dueTime: null, reminderMinutes: null, repeatRule: null },
    }) as TaskRow;

    expect(updated).toMatchObject({
      title: "完成工作台验收",
      dueDate: null,
      dueTime: null,
      reminderMinutes: null,
      repeatRule: null,
    });
  });

  it("supports habit records and time blocks", () => {
    const habit = service.dispatch("create_habit", { name: "阅读" }) as { id: string };
    service.dispatch("set_habit_record", { habitId: habit.id, date: "2026-08-18", count: 1 });
    const records = service.dispatch("get_habit_records", { habitId: habit.id }) as HabitRecordRow[];
    expect(records).toEqual([{ habitId: habit.id, date: "2026-08-18", count: 1 }]);

    service.dispatch("seed_timelog_defaults");
    const categories = service.dispatch("list_categories", { includeArchived: false }) as CategoryRow[];
    const entry = service.dispatch("create_time_entry", {
      input: {
        categoryId: categories[0].id,
        startTime: "2026-08-18T01:00:00.000Z",
        endTime: "2026-08-18T02:00:00.000Z",
        note: "工作台开发",
      },
    }) as TimeEntryRow;
    const entries = service.dispatch("list_time_entries_by_range", {
      startTime: "2026-08-18T00:00:00.000Z",
      endTime: "2026-08-19T00:00:00.000Z",
    }) as TimeEntryRow[];

    expect(entries).toEqual([entry]);
    expect(entry.source).toBe("manual");
  });

  it("records pomodoro segments atomically with source and session metadata", () => {
    service.dispatch("seed_timelog_defaults");
    const categories = service.dispatch("list_categories", { includeArchived: false }) as CategoryRow[];
    const rows = service.dispatch("create_pomodoro_entries", {
      input: {
        categoryId: categories[0].id,
        pomodoroSessionId: "session-test",
        pomodoroStatus: "saved",
        plannedSeconds: 1500,
        segments: [
          { startAt: "2026-08-18T01:00:00.000Z", endAt: "2026-08-18T01:10:00.000Z" },
          { startAt: "2026-08-18T01:20:00.000Z", endAt: "2026-08-18T01:35:00.000Z" },
        ],
      },
    }) as TimeEntryRow[];
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.source === "pomodoro" && row.pomodoroSessionId === "session-test" && row.pomodoroStatus === "saved" && row.pomodoroPlannedSeconds === 1500 && row.categoryId === categories[0].id)).toBe(true);
    expect(() => service.dispatch("create_pomodoro_entries", { input: { categoryId: categories[0].id, pomodoroSessionId: "bad", segments: [{ startAt: "2026-08-18T01:00:00.000Z", endAt: "2026-08-18T01:00:00.000Z" }] } })).toThrow();
    expect((service.dispatch("list_time_entries_by_range", { startTime: "2026-08-18T00:00:00.000Z", endTime: "2026-08-19T00:00:00.000Z" }) as TimeEntryRow[])).toHaveLength(2);
  });

  it("migrates a legacy source-less table without dropping category links", () => {
    service.close();
    const dbPath = path.join(directory, "legacy.db");
    const legacy = new DatabaseSync(dbPath);
    legacy.exec("CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, sort_order INTEGER NOT NULL, archived INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE time_entries (id TEXT PRIMARY KEY, activity_id TEXT, category_id TEXT, start_time TEXT NOT NULL, end_time TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL); INSERT INTO categories VALUES ('cat-legacy','工作','#5B6EF5',1,0,'x','x'); INSERT INTO time_entries VALUES ('te-legacy',NULL,'cat-legacy','2026-08-18T01:00:00.000Z','2026-08-18T02:00:00.000Z','legacy','x','x');");
    legacy.close();
    service = new ScheduleService(dbPath);
    const rows = service.dispatch("list_time_entries_by_range", { startTime: "2026-08-18T00:00:00.000Z", endTime: "2026-08-19T00:00:00.000Z" }) as TimeEntryRow[];
    expect(rows[0]).toMatchObject({ categoryId: "cat-legacy", source: "manual" });
  });

  it("keeps legacy habit creation while persisting V2 visual fields", () => {
    const legacy = service.dispatch("create_habit", { name: "旧调用" }) as HabitRow;
    expect(legacy).toMatchObject({ name: "旧调用", color: "#4f6ef7", icon: "check", targetCount: 1 });

    const created = service.dispatch("create_habit", {
      name: "喝水",
      color: "#7697AD",
      icon: "droplets",
      targetCount: 8,
    }) as HabitRow;
    expect(created).toMatchObject({ name: "喝水", color: "#7697ad", icon: "droplets", targetCount: 8 });

    const updated = service.dispatch("update_habit", {
      id: created.id,
      name: "晨间喝水",
      color: "#79ad93",
      icon: "book",
      targetCount: 3,
    }) as HabitRow;
    expect(updated).toMatchObject({ name: "晨间喝水", color: "#79ad93", icon: "book", targetCount: 3 });

    const sanitized = service.dispatch("update_habit", {
      id: created.id,
      name: "晨间喝水",
      color: "not-a-color",
      icon: "unknown-icon",
      targetCount: 99,
    }) as HabitRow;
    expect(sanitized).toMatchObject({ color: "#79ad93", icon: "book", targetCount: 20 });

    const semanticIcon = service.dispatch("update_habit", {
      id: created.id,
      name: "晨间喝水",
      color: "#79ad93",
      icon: "sunrise",
      targetCount: 3,
    }) as HabitRow;
    expect(semanticIcon).toMatchObject({ icon: "sunrise" });
    expect(() => service.dispatch("create_habit", { name: "   " })).toThrow("习惯名称不能为空");
  });

  it("persists increment and undo counts for multi-target habits", () => {
    const habit = service.dispatch("create_habit", { name: "喝水", targetCount: 3 }) as HabitRow;
    service.dispatch("set_habit_record", { habitId: habit.id, date: "2026-08-30", count: 1 });
    service.dispatch("set_habit_record", { habitId: habit.id, date: "2026-08-30", count: 2 });
    service.dispatch("set_habit_record", { habitId: habit.id, date: "2026-08-30", count: 1 });

    expect(service.dispatch("get_habit_records", { habitId: habit.id })).toEqual([
      { habitId: habit.id, date: "2026-08-30", count: 1 },
    ]);

    service.dispatch("delete_habit", { id: habit.id });
    expect(service.dispatch("get_habit_records", { habitId: habit.id })).toEqual([]);
    expect((service.dispatch("list_habits") as HabitRow[]).some((item) => item.id === habit.id)).toBe(false);
  });

  it("keeps legacy repeat rules without creating a task when completed", () => {
    const task = service.dispatch("create_task", {
      input: {
        title: "旧重复任务",
        dueDate: "2026-08-18",
        repeatRule: JSON.stringify({ type: "daily", interval: 1 }),
      },
    }) as TaskRow;

    const completed = service.dispatch("set_task_status", { id: task.id, status: "completed" }) as TaskRow;
    expect(completed.repeatRule).toBe(task.repeatRule);
    expect(service.dispatch("list_tasks", { listId: null })).toHaveLength(1);
  });
});
