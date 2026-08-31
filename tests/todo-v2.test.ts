import { describe, expect, it } from "vitest";
import type { CalendarEvent, List, Task } from "../src/renderer/schedule/types";
import {
  filterTodoTasks,
  groupTodoTasks,
  scheduleTaskForDate,
  tasksAndEventsForDate,
} from "../src/renderer/schedule/todo-v2/selectors";

const baseTask = (patch: Partial<Task>): Task => ({
  id: "task",
  listId: "work",
  title: "任务",
  notes: "",
  priority: 0,
  dueDate: "2026-08-30",
  dueTime: null,
  isAllDay: false,
  status: "open",
  completedAt: null,
  reminderMinutes: null,
  repeatRule: null,
  sortOrder: 0,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...patch,
});

const lists: List[] = [{ id: "work", name: "工作", color: "#7d9caf", sortOrder: 0, createdAt: "2026-08-01" }];

describe("待办页 V2 selectors", () => {
  it("空数据保持稳定分组和日期摘要", () => {
    expect(groupTodoTasks([])).toEqual([]);
    expect(filterTodoTasks([], "today", null, "2026-08-30", "2026-08-30")).toEqual([]);
    expect(tasksAndEventsForDate([], [], "2026-08-30")).toEqual({ tasks: [], events: [] });
  });

  it("按真实 dueTime 字段分为上午、下午和待安排", () => {
    const groups = groupTodoTasks([
      baseTask({ id: "am", dueTime: "09:30" }),
      baseTask({ id: "pm", dueTime: "14:00" }),
      baseTask({ id: "none", dueTime: null }),
    ]);
    expect(groups.map((group) => [group.id, group.tasks.map((task) => task.id)])).toEqual([
      ["morning", ["am"]],
      ["afternoon", ["pm"]],
      ["unscheduled", ["none"]],
    ]);
  });

  it("日期选择只筛选目标日期任务和日程", () => {
    const tasks = [baseTask({ id: "today" }), baseTask({ id: "next", dueDate: "2026-08-31" })];
    const events: CalendarEvent[] = [{
      id: "event", title: "复核", startAt: "2026-08-30T10:00:00.000Z", endAt: "2026-08-30T10:30:00.000Z",
      isAllDay: false, reminderMinutes: null, color: "#d1a85f", notes: "", createdAt: "2026-08-01", updatedAt: "2026-08-01",
    }];
    expect(filterTodoTasks(tasks, "today", null, "2026-08-31", "2026-08-30").map((task) => task.id)).toEqual(["next"]);
    expect(tasksAndEventsForDate(tasks, events, "2026-08-30")).toMatchObject({ tasks: [{ id: "today" }], events: [{ id: "event" }] });
  });

  it("排期只更新目标任务 dueDate 并保留其他字段", () => {
    const tasks = [baseTask({ id: "target", dueDate: null }), baseTask({ id: "other", dueDate: "2026-08-31" })];
    const scheduled = scheduleTaskForDate(tasks, "target", "2026-09-02");
    expect(scheduled.find((task) => task.id === "target")).toMatchObject({ dueDate: "2026-09-02", title: "任务" });
    expect(scheduled.find((task) => task.id === "other")).toEqual(tasks[1]);
    expect(lists).toHaveLength(1);
  });
});
