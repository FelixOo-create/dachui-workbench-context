// 与方案数据模型对应的前端类型定义

export type Priority = 0 | 1 | 2; // 低/中/高
export type TaskStatus = "open" | "completed";

export interface List {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  createdAt: string;
}

export interface Task {
  id: string;
  listId: string | null;
  title: string;
  notes: string;
  priority: Priority;
  dueDate: string | null; // YYYY-MM-DD
  dueTime: string | null; // HH:mm
  isAllDay: boolean;
  status: TaskStatus;
  completedAt: string | null;
  reminderMinutes: number | null;
  repeatRule: string | null; // JSON
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  completed: boolean;
  sortOrder: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startAt: string; // ISO
  endAt: string; // ISO
  isAllDay: boolean;
  reminderMinutes: number | null;
  color: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Habit {
  id: string;
  name: string;
  color: string;
  icon: string;
  targetCount: number; // 每日目标打卡次数，默认 1
  createdAt: string;
}

export interface HabitRecord {
  habitId: string;
  date: string; // YYYY-MM-DD
  count: number; // 当天已打卡次数
}

export interface AppStats {
  todayTotal: number;
  todayDone: number;
  overdue: number;
  planned: number;
}

export interface Attachment {
  id: string;
  ownerType: string;
  ownerId: string;
  name: string;
  path: string;
  mime: string;
  sizeBytes: number;
  createdAt: string;
}

export type SmartView = "today" | "tomorrow" | "planned" | "inbox" | "all" | "completed";

export interface ListWithCount extends List {
  openCount: number;
}
