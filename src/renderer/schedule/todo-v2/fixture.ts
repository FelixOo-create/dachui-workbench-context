import type { CalendarEvent, List, Subtask, Task } from "../types";

export const TODO_V2_FIXTURE_DATE = "2026-08-30";

export const todoV2Lists: List[] = [
  { id: "work", name: "工作", color: "#86a6ba", sortOrder: 0, createdAt: "2026-08-01T08:00:00.000Z" },
  { id: "project", name: "个人项目", color: "#d2ad69", sortOrder: 1, createdAt: "2026-08-01T08:00:00.000Z" },
  { id: "life", name: "生活", color: "#84bea0", sortOrder: 2, createdAt: "2026-08-01T08:00:00.000Z" },
];

function task(id: string, title: string, patch: Partial<Task> = {}): Task {
  return {
    id,
    listId: "work",
    title,
    notes: "",
    priority: 0,
    dueDate: TODO_V2_FIXTURE_DATE,
    dueTime: null,
    isAllDay: false,
    status: "open",
    completedAt: null,
    reminderMinutes: null,
    repeatRule: null,
    sortOrder: 0,
    createdAt: "2026-08-20T08:00:00.000Z",
    updatedAt: "2026-08-29T08:00:00.000Z",
    ...patch,
  };
}

export const todoV2Tasks: Task[] = [
  task("task-iteration", "整理工作台迭代内容", { priority: 2, dueTime: "09:30", reminderMinutes: 10, sortOrder: 0 }),
  task("task-home", "确认首页视觉基准", { listId: "project", priority: 1, dueTime: "11:00", sortOrder: 1 }),
  task("task-deskbox", "完善桌面盒子入口分组", { dueTime: "14:00", sortOrder: 2 }),
  task("task-focus", "完成一个专注时段", { listId: "life", dueTime: "16:30", sortOrder: 3 }),
  task("task-review", "复核习惯页 V2 正式产物", { listId: "project", priority: 1, dueTime: null, sortOrder: 4 }),
  task("task-plan", "准备下周任务计划", { dueTime: null, sortOrder: 5 }),
  task("task-tomorrow-a", "整理工具中心失效入口", { dueDate: "2026-08-31", dueTime: "10:00", sortOrder: 6 }),
  task("task-tomorrow-b", "回顾本周时间投入", { listId: "life", dueDate: "2026-08-31", dueTime: null, sortOrder: 7 }),
  task("task-done-a", "完成习惯图标方案确认", { listId: "project", status: "completed", completedAt: "2026-08-30T07:20:00.000Z", dueTime: "08:30", sortOrder: 8 }),
  task("task-done-b", "更新工作台版本标识", { status: "completed", completedAt: "2026-08-30T07:40:00.000Z", dueTime: "09:00", sortOrder: 9 }),
];

export const todoV2Subtasks: Subtask[] = [
  { id: "sub-1", taskId: "task-iteration", title: "归纳本轮结果", completed: true, sortOrder: 0 },
  { id: "sub-2", taskId: "task-iteration", title: "准备候选预览", completed: false, sortOrder: 1 },
  { id: "sub-3", taskId: "task-home", title: "检查桌面快捷入口", completed: false, sortOrder: 0 },
];

export const todoV2Events: CalendarEvent[] = [
  { id: "event-review", title: "视觉复核", startAt: "2026-08-30T10:00:00.000Z", endAt: "2026-08-30T10:30:00.000Z", isAllDay: false, reminderMinutes: 10, color: "#d2ad69", notes: "", createdAt: "2026-08-01", updatedAt: "2026-08-29" },
  { id: "event-release", title: "版本整理", startAt: "2026-08-30T15:30:00.000Z", endAt: "2026-08-30T16:15:00.000Z", isAllDay: false, reminderMinutes: 10, color: "#84bea0", notes: "", createdAt: "2026-08-01", updatedAt: "2026-08-29" },
  { id: "event-next", title: "周计划", startAt: "2026-08-31T09:00:00.000Z", endAt: "2026-08-31T09:30:00.000Z", isAllDay: false, reminderMinutes: null, color: "#86a6ba", notes: "", createdAt: "2026-08-01", updatedAt: "2026-08-29" },
];
