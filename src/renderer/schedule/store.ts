import { create } from "zustand";
import type { Task, List, CalendarEvent, Habit, AppStats, SmartView } from "./types";
import { api, type HabitInput } from "./api";
import { parseQuickAdd } from "./utils/dateParser";

interface AppState {
  tasks: Task[];
  lists: List[];
  events: CalendarEvent[];
  habits: Habit[];
  stats: AppStats | null;
  loaded: boolean;
  loadAll: () => Promise<void>;
  refreshStats: () => Promise<void>;
  quickAdd: (raw: string, listId?: string | null) => Promise<Task | null>;
  addTask: (input: Parameters<typeof api.tasks.create>[0]) => Promise<Task | null>;
  toggleTask: (id: string) => Promise<void>;
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  addList: (name: string, color?: string) => Promise<List | null>;
  renameList: (id: string, name: string) => Promise<void>;
  setListColor: (id: string, color: string) => Promise<void>;
  deleteList: (id: string) => Promise<void>;
  addSubtask: (taskId: string, title: string) => Promise<void>;
  toggleSubtask: (id: string, completed: boolean) => Promise<void>;
  addEvent: (input: Parameters<typeof api.events.create>[0]) => Promise<CalendarEvent | null>;
  updateEvent: (id: string, patch: Partial<CalendarEvent>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  addHabit: (input: string | HabitInput) => Promise<Habit>;
  updateHabit: (id: string, inputOrName: HabitInput | string, color?: string, targetCount?: number) => Promise<Habit>;
  deleteHabit: (id: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  tasks: [],
  lists: [],
  events: [],
  habits: [],
  stats: null,
  loaded: false,

  loadAll: async () => {
    const [tasks, lists, events, habits, stats] = await Promise.all([
      api.tasks.byList(null),
      api.lists.all(),
      api.events.all(),
      api.habits.all(),
      api.stats(),
    ]);
    set({ tasks, lists, events, habits, stats, loaded: true });
  },

  refreshStats: async () => {
    const stats = await api.stats();
    set({ stats });
  },

  quickAdd: async (raw, listId) => {
    const { title, dueDate, dueTime } = parseQuickAdd(raw);
    if (!title) return null;
    const task = await api.tasks.create({
      title,
      listId: listId ?? "list-default",
      dueDate,
      dueTime,
      reminderMinutes: dueTime ? 0 : null,
    });
    set({ tasks: [...get().tasks, task] });
    void get().refreshStats();
    return task;
  },

  addTask: async (input) => {
    const task = await api.tasks.create(input);
    set({ tasks: [...get().tasks, task] });
    void get().refreshStats();
    return task;
  },

  toggleTask: async (id) => {
    const t = get().tasks.find((x) => x.id === id);
    if (!t) return;
    const status = t.status === "open" ? "completed" : "open";
    const updated = await api.tasks.setStatus(id, status);
    set({ tasks: get().tasks.map((x) => (x.id === id ? updated : x)) });
    void get().refreshStats();
  },

  updateTask: async (id, patch) => {
    const updated = await api.tasks.update(id, patch);
    set({ tasks: get().tasks.map((x) => (x.id === id ? updated : x)) });
    void get().refreshStats();
  },

  deleteTask: async (id) => {
    await api.tasks.remove(id);
    set({ tasks: get().tasks.filter((x) => x.id !== id) });
    void get().refreshStats();
  },

  addEvent: async (input) => {
    const ev = await api.events.create(input);
    set({ events: [...get().events, ev] });
    return ev;
  },

  updateEvent: async (id, patch) => {
    const updated = await api.events.update(id, patch);
    set({ events: get().events.map((x) => (x.id === id ? updated : x)) });
  },

  deleteEvent: async (id) => {
    await api.events.remove(id);
    set({ events: get().events.filter((x) => x.id !== id) });
  },

  addHabit: async (input) => {
    const h = await api.habits.create(input);
    set({ habits: [...get().habits, h] });
    return h;
  },

  updateHabit: async (id, inputOrName, color, targetCount) => {
    const current = get().habits.find((habit) => habit.id === id);
    const input: HabitInput = typeof inputOrName === "string"
      ? { name: inputOrName, color, icon: current?.icon, targetCount }
      : inputOrName;
    const updated = await api.habits.update(id, input);
    set({ habits: get().habits.map((x) => (x.id === id ? updated : x)) });
    return updated;
  },

  deleteHabit: async (id) => {
    await api.habits.remove(id);
    set({ habits: get().habits.filter((x) => x.id !== id) });
  },

  addList: async (name, color) => {
    const l = await api.lists.create(name, color);
    if (!l) return null;
    set({ lists: [...get().lists, l] });
    return l;
  },

  renameList: async (id, name) => {
    const updated = await api.lists.rename(id, name);
    set({ lists: get().lists.map((x) => (x.id === id ? updated : x)) });
  },

  setListColor: async (id, color) => {
    const updated = await api.lists.setColor(id, color);
    set({ lists: get().lists.map((x) => (x.id === id ? updated : x)) });
  },

  deleteList: async (id) => {
    await api.lists.remove(id);
    set({ lists: get().lists.filter((x) => x.id !== id) });
    // 该清单任务移到收件箱：刷新任务
    const tasks = await api.tasks.byList(null);
    set({ tasks });
    void get().refreshStats();
  },

  addSubtask: async (taskId, title) => {
    await api.subtasks.create(taskId, title);
  },

  toggleSubtask: async (id, completed) => {
    await api.subtasks.update(id, { completed });
  },
}));

/** 按智能视图过滤任务 */
export function filterTasksByView(tasks: Task[], view: SmartView | "list", listId: string | null): Task[] {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const tomorrowStr = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);

  const sortByDate = (a: Task, b: Task) => {
    // 逾期优先置顶（仅 open 任务）
    const aOver = a.status === "open" && a.dueDate !== null && a.dueDate < todayStr ? 0 : 1;
    const bOver = b.status === "open" && b.dueDate !== null && b.dueDate < todayStr ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    const da = a.dueDate ?? "9999-99-99";
    const db = b.dueDate ?? "9999-99-99";
    if (da !== db) return da < db ? -1 : 1;
    const ta = a.dueTime ?? "99:99";
    const tb = b.dueTime ?? "99:99";
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  };

  switch (view) {
    case "today":
      return tasks.filter((t) => t.status === "open" && t.dueDate === todayStr).sort(sortByDate);
    case "tomorrow":
      return tasks.filter((t) => t.status === "open" && t.dueDate === tomorrowStr).sort(sortByDate);
    case "planned":
      return tasks.filter((t) => t.status === "open" && t.dueDate !== null).sort(sortByDate);
    case "inbox":
      // 收件箱（兼容旧类型）：未分类任务 = 无归属(NULL) 或 收件箱清单(list-default)
      return tasks
        .filter((t) => t.status === "open" && (t.listId === null || t.listId === "list-default"))
        .sort(sortByDate);
    case "all":
      return tasks.filter((t) => t.status === "open").sort(sortByDate);
    case "completed":
      return tasks.filter((t) => t.status === "completed").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
    case "list":
      // 收件箱清单 = 未分类任务（list-default 或 NULL）；其他清单精确匹配
      if (listId === "list-default") {
        return tasks
          .filter((t) => t.status === "open" && (t.listId === "list-default" || t.listId === null))
          .sort(sortByDate);
      }
      return tasks.filter((t) => t.status === "open" && t.listId === listId).sort(sortByDate);
    default:
      return tasks;
  }
}
