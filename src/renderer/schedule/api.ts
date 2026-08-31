// 数据访问层：优先走 Tauri invoke（桌面端 SQLite），浏览器环境走内存 mock
import type {
  List,
  Task,
  Subtask,
  Tag,
  CalendarEvent,
  Habit,
  HabitRecord,
  AppStats,
  Attachment,
  Priority,
  TaskStatus,
} from "./types";

export interface TaskInput {
  title: string;
  listId?: string | null;
  notes?: string;
  priority?: Priority;
  dueDate?: string | null;
  dueTime?: string | null;
  isAllDay?: boolean;
  reminderMinutes?: number | null;
  repeatRule?: string | null;
}

export interface EventInput {
  title: string;
  startAt: string;
  endAt: string;
  isAllDay?: boolean;
  reminderMinutes?: number | null;
  color?: string;
  notes?: string;
}

export interface HabitInput {
  name: string;
  color?: string;
  icon?: string;
  targetCount?: number;
}

function normalizeHabitInput(input: string | HabitInput): HabitInput {
  return typeof input === "string" ? { name: input } : input;
}

// 检测是否运行在 Workbench（Electron 桥）环境
function scheduleBridge(): { invoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown> } | null {
  const w = window as unknown as {
    workbench?: { schedule?: { invoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown> } };
  };
  return w.workbench?.schedule ?? null;
}

// 检测是否运行在 Tauri 环境
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// 检测是否运行在 Workbench 桌面宿主
export function isDesktop(): boolean {
  return scheduleBridge() !== null;
}

async function invoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  const bridge = scheduleBridge();
  if (bridge) return bridge.invoke(cmd, args) as Promise<T>;
  return mockInvoke(cmd, args) as Promise<T>;
}

// ---------- 内存 mock 实现 ----------
let memSeq = 0;
const nid = (p: string) => `${p}-${Date.now().toString(36)}-${(memSeq++).toString(36)}`;
const now = () => new Date().toISOString();

const memLists: List[] = [
  { id: "list-default", name: "收件箱", color: "#737ba5", sortOrder: 0, createdAt: now() },
];
const memTasks: Task[] = [
  {
    id: nid("task"), listId: "list-default", title: "欢迎使用待办日程工具",
    notes: "", priority: 1, dueDate: null, dueTime: null, isAllDay: false,
    status: "open", completedAt: null, reminderMinutes: null, repeatRule: null,
    sortOrder: 0, createdAt: now(), updatedAt: now(),
  },
];
const memSubs: Subtask[] = [];
// 标签功能将在 P1 子任务/标签阶段接入，占位保留类型引用
void (null as unknown as Tag[]);
const memEvents: CalendarEvent[] = [];
const memHabits: Habit[] = [];
let memHabitRecords: HabitRecord[] = [];
const memAttachments: Attachment[] = [];

async function mockInvoke(cmd: string, args: Record<string, unknown>): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 30));
  switch (cmd) {
    case "list_lists": return memLists.map((list) => ({ ...list }));
    case "create_list": {
      const input = args.input as { name: string; color?: string };
      const l: List = {
        id: nid("list"), name: input.name, color: input.color ?? "#737ba5",
        sortOrder: memLists.length, createdAt: now(),
      };
      memLists.push(l);
      return l;
    }
    case "rename_list": {
      const l = memLists.find((x) => x.id === args.id);
      if (l) l.name = args.name as string;
      return l;
    }
    case "set_list_color": {
      const l = memLists.find((x) => x.id === args.id);
      if (l) l.color = args.color as string;
      return l;
    }
    case "delete_list": {
      const i = memLists.findIndex((x) => x.id === args.id);
      if (i >= 0) memLists.splice(i, 1);
      return null;
    }
    case "list_tasks": {
      const listId = args.listId as string | null;
      if (listId === null || listId === undefined) return memTasks.map((task) => ({ ...task }));
      return memTasks.filter((task) => task.listId === listId).map((task) => ({ ...task }));
    }
    case "list_attachments": {
      return memAttachments.filter((a) => a.ownerType === args.ownerType && a.ownerId === args.ownerId);
    }
    case "add_attachment": {
      const input = args.input as { ownerType: string; ownerId: string; name: string; path: string; mime?: string };
      const a: Attachment = {
        id: nid("attach"), ownerType: input.ownerType, ownerId: input.ownerId,
        name: input.name, path: input.path, mime: input.mime ?? "",
        sizeBytes: 0, createdAt: now(),
      };
      memAttachments.push(a);
      return a;
    }
    case "remove_attachment": {
      const i = memAttachments.findIndex((x) => x.id === args.id);
      if (i >= 0) memAttachments.splice(i, 1);
      return null;
    }
    case "reveal_attachment": return null;
    case "create_task": {
      const input = args.input as TaskInput;
      const t: Task = {
        id: nid("task"), listId: input.listId ?? null, title: input.title,
        notes: input.notes ?? "", priority: input.priority ?? 1,
        dueDate: input.dueDate ?? null, dueTime: input.dueTime ?? null,
        isAllDay: input.isAllDay ?? false, status: "open", completedAt: null,
        reminderMinutes: input.reminderMinutes ?? null, repeatRule: input.repeatRule ?? null,
        sortOrder: memTasks.length, createdAt: now(), updatedAt: now(),
      };
      memTasks.push(t);
      return t;
    }
    case "update_task": {
      const t = memTasks.find((x) => x.id === args.id);
      if (!t) throw new Error("task not found");
      Object.assign(t, args.patch, { updatedAt: now() });
      return t;
    }
    case "set_task_status": {
      const t = memTasks.find((x) => x.id === args.id);
      if (!t) throw new Error("task not found");
      const status = args.status as TaskStatus;
      t.status = status;
      t.completedAt = status === "completed" ? now() : null;
      t.updatedAt = now();
      return t;
    }
    case "delete_task": {
      const i = memTasks.findIndex((x) => x.id === args.id);
      if (i >= 0) memTasks.splice(i, 1);
      return null;
    }
    case "list_subtasks": return memSubs.filter((s) => s.taskId === args.taskId);
    case "create_subtask": {
      const s: Subtask = {
        id: nid("sub"), taskId: args.taskId as string, title: args.title as string,
        completed: false, sortOrder: memSubs.length,
      };
      memSubs.push(s);
      return s;
    }
    case "update_subtask": {
      const s = memSubs.find((x) => x.id === args.id);
      if (s) Object.assign(s, args.patch);
      return s;
    }
    case "list_events": return memEvents;
    case "create_event": {
      const input = args.input as EventInput;
      const e: CalendarEvent = {
        id: nid("event"), title: input.title, startAt: input.startAt, endAt: input.endAt,
        isAllDay: input.isAllDay ?? false, reminderMinutes: input.reminderMinutes ?? null,
        color: input.color ?? "#737ba5", notes: input.notes ?? "",
        createdAt: now(), updatedAt: now(),
      };
      memEvents.push(e);
      return e;
    }
    case "update_event": {
      const e = memEvents.find((x) => x.id === args.id);
      if (e) Object.assign(e, args.patch, { updatedAt: now() });
      return e;
    }
    case "delete_event": {
      const i = memEvents.findIndex((x) => x.id === args.id);
      if (i >= 0) memEvents.splice(i, 1);
      return null;
    }
    case "list_habits": return memHabits;
    case "get_habit_records": return memHabitRecords.filter((h) => h.habitId === args.habitId);
    case "create_habit": {
      const h: Habit = {
        id: nid("habit"),
        name: String(args.name ?? "").trim(),
        color: typeof args.color === "string" ? args.color : "#4f6ef7",
        icon: typeof args.icon === "string" ? args.icon : "check",
        targetCount: typeof args.targetCount === "number" ? args.targetCount : 1,
        createdAt: now(),
      };
      memHabits.push(h);
      return h;
    }
    case "set_habit_record": {
      const habitId = args.habitId as string;
      const date = args.date as string;
      const count = args.count as number;
      const existing = memHabitRecords.find((r) => r.habitId === habitId && r.date === date);
      if (existing) existing.count = count;
      else memHabitRecords.push({ habitId, date, count });
      return null;
    }
    case "update_habit": {
      const h = memHabits.find((x) => x.id === args.id);
      if (!h) throw new Error("habit not found");
      h.name = (args.name as string).trim() || h.name;
      h.color = (args.color as string) || h.color;
      h.icon = (args.icon as string) || h.icon;
      h.targetCount = (args.targetCount as number) || h.targetCount;
      return h;
    }
    case "delete_habit": {
      const i = memHabits.findIndex((x) => x.id === args.id);
      if (i >= 0) memHabits.splice(i, 1);
      memHabitRecords = memHabitRecords.filter((r) => r.habitId !== args.id);
      return null;
    }
    case "get_stats": {
      const today = new Date().toISOString().slice(0, 10);
      const open = memTasks.filter((t) => t.status === "open");
      return {
        todayTotal: open.filter((t) => t.dueDate === today).length,
        todayDone: memTasks.filter((t) => t.status === "completed" && (t.completedAt ?? "").slice(0, 10) === today).length,
        overdue: open.filter((t) => t.dueDate && t.dueDate < today).length,
        planned: open.filter((t) => t.dueDate !== null).length,
      } as AppStats;
    }
    case "import_wubian_backup": {
      return { importedTasks: 0, importedAnniversaries: 0 };
    }
    default:
      throw new Error("unknown command " + cmd);
  }
}

// ---------- 导出 API ----------
export const api = {
  isTauri,
  isDesktop,
  pickFile: (): Promise<string | null> => {
    const w = window as unknown as {
      workbench?: { schedule?: { pickFile?: () => Promise<string | null> } };
    };
    const pick = w.workbench?.schedule?.pickFile;
    return pick ? pick() : Promise.resolve(null);
  },
  lists: {
    all: () => invoke<List[]>("list_lists"),
    create: (name: string, color?: string) => invoke<List>("create_list", { input: { name, color } }),
    rename: (id: string, name: string) => invoke<List>("rename_list", { id, name }),
    setColor: (id: string, color: string) => invoke<List>("set_list_color", { id, color }),
    remove: (id: string) => invoke<null>("delete_list", { id }),
  },
  tasks: {
    byList: (listId: string | null) => invoke<Task[]>("list_tasks", { listId }),
    create: (input: TaskInput) => invoke<Task>("create_task", { input }),
    update: (id: string, patch: Partial<Task>) => invoke<Task>("update_task", { id, patch }),
    setStatus: (id: string, status: TaskStatus) => invoke<Task>("set_task_status", { id, status }),
    remove: (id: string) => invoke<null>("delete_task", { id }),
  },
  subtasks: {
    byTask: (taskId: string) => invoke<Subtask[]>("list_subtasks", { taskId }),
    create: (taskId: string, title: string) => invoke<Subtask>("create_subtask", { taskId, title }),
    update: (id: string, patch: Partial<Subtask>) => invoke<Subtask>("update_subtask", { id, patch }),
  },
  events: {
    all: () => invoke<CalendarEvent[]>("list_events"),
    create: (input: EventInput) => invoke<CalendarEvent>("create_event", { input }),
    update: (id: string, patch: Partial<CalendarEvent>) => invoke<CalendarEvent>("update_event", { id, patch }),
    remove: (id: string) => invoke<null>("delete_event", { id }),
  },
  habits: {
    all: () => invoke<Habit[]>("list_habits"),
    create: (input: string | HabitInput) => invoke<Habit>("create_habit", { ...normalizeHabitInput(input) }),
    update: (id: string, input: HabitInput) => invoke<Habit>("update_habit", { id, ...input }),
    remove: (id: string) => invoke<null>("delete_habit", { id }),
    records: (habitId: string) => invoke<HabitRecord[]>("get_habit_records", { habitId }),
    setRecord: (habitId: string, date: string, count: number) =>
      invoke<null>("set_habit_record", { habitId, date, count }),
  },
  attachments: {
    byOwner: (ownerType: string, ownerId: string) =>
      invoke<Attachment[]>("list_attachments", { ownerType, ownerId }),
    add: (input: { ownerType: string; ownerId: string; name: string; path: string; mime?: string }) =>
      invoke<Attachment>("add_attachment", { input }),
    remove: (id: string) => invoke<null>("remove_attachment", { id }),
    reveal: (id: string) => invoke<null>("reveal_attachment", { id }),
  },
  stats: () => invoke<AppStats>("get_stats"),
  importWubian: (fileContent: string) =>
    invoke<{ importedTasks: number; importedAnniversaries: number }>("import_wubian_backup", { fileContent }),
};

export type { Tag };
