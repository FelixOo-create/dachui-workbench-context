// 时间记录板块数据层：优先走 Tauri invoke（桌面端 SQLite），浏览器环境走内存 mock
// 与主应用 src/api.ts 采用同一模式；Rust 侧命令见 src-tauri/src/commands.rs
import type { Activity, Category, TimeEntry, TimelogSettings } from "./types";
import { CATEGORY_PRESETS, DEFAULT_SETTINGS } from "./constants";
import { nowIso } from "./utils";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function scheduleBridge(): { invoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown> } | null {
  const w = window as unknown as {
    workbench?: { schedule?: { invoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown> } };
  };
  return w.workbench?.schedule ?? null;
}

async function invoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  const bridge = scheduleBridge();
  if (bridge) return bridge.invoke(cmd, args) as Promise<T>;
  return mockInvoke(cmd, args) as Promise<T>;
}

// ---------- 内存 mock（浏览器开发模式） ----------

let seq = 0;
const nid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

const memCategories: Category[] = [];
const memActivities: Activity[] = [];
const memEntries: TimeEntry[] = [];
const memFocusSessions: Array<{ id: string; activityId: string | null; categoryId: string | null; plannedSeconds: number; startedAt: string; endedAt: string | null; status: "started" | "completed" | "saved" | "cancelled" }> = [];
let memSettings: TimelogSettings = { ...DEFAULT_SETTINGS };
let seeded = false;

function ensureSeeded() {
  if (seeded) return;
  seeded = true;
  let co = 0;
  for (const preset of CATEGORY_PRESETS) {
    co += 1;
    const ts = nowIso();
    const catId = nid("cat");
    memCategories.push({
      id: catId,
      name: preset.name,
      color: preset.color,
      sortOrder: co,
      archived: false,
      createdAt: ts,
      updatedAt: ts,
    });
    let ao = 0;
    for (const name of preset.activities) {
      ao += 1;
      memActivities.push({
        id: nid("act"),
        categoryId: catId,
        name,
        sortOrder: ao,
        archived: false,
        createdAt: ts,
        updatedAt: ts,
      });
    }
  }
}

function dayBounds(date: string): { startIso: string; endIso: string } {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start.getTime() + 86400_000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function mockInvoke(cmd: string, args: Record<string, unknown>): unknown {
  ensureSeeded();
  const get = (k: string) => args[k];
  const getObj = <T>(k: string) => (args[k] ?? {}) as Record<string, unknown> & T;

  switch (cmd) {
    case "seed_timelog_defaults":
      return undefined;

    // ---------- 分类 ----------
    case "list_categories": {
      const inc = get("includeArchived") as boolean;
      return inc
        ? [...memCategories].sort((a, b) => a.sortOrder - b.sortOrder)
        : memCategories.filter((c) => !c.archived).sort((a, b) => a.sortOrder - b.sortOrder);
    }
    case "create_category": {
      const { name, color } = getObj<{ name: string; color: string }>("input");
      const max = Math.max(0, ...memCategories.map((c) => c.sortOrder));
      const ts = nowIso();
      const cat: Category = {
        id: nid("cat"),
        name: name.trim(),
        color: color ?? "#737ba5",
        sortOrder: max + 1,
        archived: false,
        createdAt: ts,
        updatedAt: ts,
      };
      memCategories.push(cat);
      return cat;
    }
    case "update_category": {
      const id = get("id") as string;
      const patch = getObj<{ name?: string; color?: string }>("patch");
      const cat = memCategories.find((c) => c.id === id);
      if (!cat) throw new Error("分类不存在");
      if (patch.name !== undefined) cat.name = patch.name.trim();
      if (patch.color !== undefined) cat.color = patch.color;
      cat.updatedAt = nowIso();
      return { ...cat };
    }
    case "set_category_archived": {
      const cat = memCategories.find((c) => c.id === get("id"));
      if (cat) {
        cat.archived = get("archived") as boolean;
        cat.updatedAt = nowIso();
      }
      return undefined;
    }
    case "delete_category":
      memCategories.splice(memCategories.findIndex((c) => c.id === get("id")), 1);
      return undefined;
    case "reorder_categories": {
      const ids = get("ids") as string[];
      ids.forEach((id, i) => {
        const cat = memCategories.find((c) => c.id === id);
        if (cat) cat.sortOrder = i + 1;
      });
      return undefined;
    }

    // ---------- 活动 ----------
    case "list_activities": {
      const inc = get("includeArchived") as boolean;
      return inc
        ? [...memActivities].sort((a, b) => a.sortOrder - b.sortOrder)
        : memActivities.filter((a) => !a.archived).sort((a, b) => a.sortOrder - b.sortOrder);
    }
    case "create_activity": {
      const { categoryId, name } = getObj<{ categoryId: string; name: string }>("input");
      const list = memActivities.filter((a) => a.categoryId === categoryId);
      const max = Math.max(0, ...list.map((a) => a.sortOrder));
      const ts = nowIso();
      const act: Activity = {
        id: nid("act"),
        categoryId,
        name: name.trim(),
        sortOrder: max + 1,
        archived: false,
        createdAt: ts,
        updatedAt: ts,
      };
      memActivities.push(act);
      return act;
    }
    case "update_activity": {
      const id = get("id") as string;
      const patch = getObj<{ name?: string; categoryId?: string }>("patch");
      const act = memActivities.find((a) => a.id === id);
      if (!act) throw new Error("活动不存在");
      if (patch.name !== undefined) act.name = patch.name.trim();
      if (patch.categoryId !== undefined) act.categoryId = patch.categoryId;
      act.updatedAt = nowIso();
      return { ...act };
    }
    case "set_activity_archived": {
      const act = memActivities.find((a) => a.id === get("id"));
      if (act) {
        act.archived = get("archived") as boolean;
        act.updatedAt = nowIso();
      }
      return undefined;
    }
    case "delete_activity":
      memActivities.splice(memActivities.findIndex((a) => a.id === get("id")), 1);
      return undefined;
    case "reorder_activities": {
      const categoryId = get("categoryId") as string;
      const ids = get("ids") as string[];
      ids.forEach((id, i) => {
        const act = memActivities.find((a) => a.id === id && a.categoryId === categoryId);
        if (act) act.sortOrder = i + 1;
      });
      return undefined;
    }

    // ---------- 时间记录 ----------
    case "list_time_entries_by_range": {
      const start = get("startTime") as string;
      const end = get("endTime") as string;
      return memEntries.filter((e) => e.startTime <= end && e.endTime > start);
    }
    case "create_time_entry": {
      const input = getObj<{ activityId?: string; categoryId?: string; startTime: string; endTime: string; note?: string; source?: "manual" | "pomodoro" }>("input");
      if (new Date(input.endTime) <= new Date(input.startTime)) {
        throw new Error("非法区间：endTime 必须晚于 startTime");
      }
      const ts = nowIso();
      const entry: TimeEntry = {
        id: nid("te"),
        activityId: input.activityId ?? null,
        categoryId: input.categoryId ?? null,
        startTime: input.startTime,
        endTime: input.endTime,
        note: input.note,
        source: input.source === "pomodoro" ? "pomodoro" : "manual",
        createdAt: ts,
        updatedAt: ts,
      };
      memEntries.push(entry);
      return { ...entry };
    }
    case "create_pomodoro_entries": {
      const input = getObj<{ activityId?: string; categoryId?: string; pomodoroSessionId: string; pomodoroStatus: "completed" | "saved"; plannedSeconds?: number; segments: Array<{ startAt: string; endAt: string }> }>("input");
      if (!input.pomodoroSessionId || !Array.isArray(input.segments) || input.segments.length === 0) throw new Error("番茄会话缺少有效专注片段");
      const created: TimeEntry[] = [];
      for (const segment of input.segments) {
        if (new Date(segment.endAt) <= new Date(segment.startAt)) throw new Error("非法区间：endTime 必须晚于 startTime");
        const ts = nowIso();
        const entry: TimeEntry = { id: nid("te"), activityId: input.activityId ?? null, categoryId: input.categoryId ?? null, startTime: segment.startAt, endTime: segment.endAt, note: undefined, source: "pomodoro", pomodoroSessionId: input.pomodoroSessionId, pomodoroStatus: input.pomodoroStatus, pomodoroPlannedSeconds: input.plannedSeconds ?? 25 * 60, createdAt: ts, updatedAt: ts };
        memEntries.push(entry); created.push({ ...entry });
      }
      return created;
    }
    case "start_focus_session": {
      const input = getObj<{ id: string; activityId?: string | null; categoryId?: string | null; plannedSeconds: number; startedAt: string }>("input");
      const session = { id: input.id, activityId: input.activityId ?? null, categoryId: input.categoryId ?? null, plannedSeconds: input.plannedSeconds, startedAt: input.startedAt, endedAt: null, status: "started" as const }; memFocusSessions.push(session); return session;
    }
    case "finish_focus_session": {
      const id = get("id") as string; const session = memFocusSessions.find((item) => item.id === id); if (session) { session.status = (get("status") as "completed" | "saved") ?? "saved"; session.endedAt = nowIso(); } return session ?? null;
    }
    case "cancel_focus_session": { const session = memFocusSessions.find((item) => item.id === get("id")); if (session) { session.status = "cancelled"; session.endedAt = nowIso(); } return undefined; }
    case "list_focus_sessions_by_range": {
      const start = get("startTime") as string;
      const end = get("endTime") as string;
      const grouped = new Map<string, TimeEntry[]>();
      for (const entry of memEntries.filter((item) => item.source === "pomodoro" && item.pomodoroSessionId && item.startTime < end && item.endTime > start)) {
        const list = grouped.get(entry.pomodoroSessionId!) ?? []; list.push(entry); grouped.set(entry.pomodoroSessionId!, list);
      }
      const fromEntries = [...grouped].map(([id, list]) => ({ id, activityId: list[0].activityId, categoryId: list[0].categoryId, plannedSeconds: list[0].pomodoroPlannedSeconds ?? 25 * 60, startedAt: list[0].startTime, endedAt: list.reduce((max, item) => item.endTime > max ? item.endTime : max, list[0].endTime), status: list[0].pomodoroStatus ?? "saved" as const }));
      return [...memFocusSessions.filter((session) => session.startedAt < end && (session.endedAt == null || session.endedAt > start)), ...fromEntries.filter((entry) => !memFocusSessions.some((session) => session.id === entry.id))];
    }
    case "update_time_entry": {
      const id = get("id") as string;
      const patch = getObj<{
        activityId?: string;
        categoryId?: string;
        startTime?: string;
        endTime?: string;
        note?: string;
      }>("patch");
      const entry = memEntries.find((e) => e.id === id);
      if (!entry) throw new Error("记录不存在");
      if (patch.activityId !== undefined) entry.activityId = patch.activityId ?? null;
      if (patch.categoryId !== undefined) entry.categoryId = patch.categoryId ?? null;
      if (patch.startTime !== undefined) entry.startTime = patch.startTime;
      if (patch.endTime !== undefined) entry.endTime = patch.endTime;
      if (patch.note !== undefined) entry.note = patch.note;
      if (new Date(entry.endTime) <= new Date(entry.startTime)) {
        throw new Error("非法区间：endTime 必须晚于 startTime");
      }
      entry.updatedAt = nowIso();
      return { ...entry };
    }
    case "delete_time_entry":
      memEntries.splice(memEntries.findIndex((e) => e.id === get("id")), 1);
      return undefined;
    case "find_time_entry_conflicts": {
      const start = get("startTime") as string;
      const end = get("endTime") as string;
      const exclude = get("excludeId") as string | null | undefined;
      return memEntries.filter((e) => e.id !== exclude && overlaps(e.startTime, e.endTime, start, end));
    }
    case "replace_time_entries": {
      const conflictIds = (get("conflictIds") as string[]) ?? [];
      const input = getObj<{ activityId?: string; categoryId?: string; startTime: string; endTime: string; note?: string; source?: "manual" | "pomodoro" }>("input");
      for (const id of conflictIds) {
        const i = memEntries.findIndex((e) => e.id === id);
        if (i >= 0) memEntries.splice(i, 1);
      }
      const ts = nowIso();
      const entry: TimeEntry = {
        id: nid("te"),
        activityId: input.activityId ?? null,
        categoryId: input.categoryId ?? null,
        startTime: input.startTime,
        endTime: input.endTime,
        note: input.note,
        source: input.source === "pomodoro" ? "pomodoro" : "manual",
        createdAt: ts,
        updatedAt: ts,
      };
      memEntries.push(entry);
      return { ...entry };
    }
    case "count_time_entries_by_activity":
      return memEntries.filter((e) => e.activityId === get("activityId")).length;

    // ---------- 设置 ----------
    case "get_timelog_settings":
      return JSON.stringify(memSettings);
    case "set_timelog_settings": {
      const parsed = JSON.parse(get("json") as string) as Partial<TimelogSettings>;
      memSettings = { ...memSettings, ...parsed };
      return undefined;
    }

    default:
      throw new Error("未知的时间记录命令: " + cmd);
  }
}

// ---------- 导出 API ----------

export const timelogApi = {
  isTauri,
  seedDefaults: () => invoke<void>("seed_timelog_defaults"),

  categories: {
    all: (includeArchived: boolean) => invoke<Category[]>("list_categories", { includeArchived }),
    create: (input: { name: string; color: string }) => invoke<Category>("create_category", { input }),
    update: (id: string, patch: { name?: string; color?: string }) =>
      invoke<Category>("update_category", { id, patch }),
    setArchived: (id: string, archived: boolean) => invoke<void>("set_category_archived", { id, archived }),
    remove: (id: string) => invoke<void>("delete_category", { id }),
    reorder: (ids: string[]) => invoke<void>("reorder_categories", { ids }),
  },

  activities: {
    all: (includeArchived: boolean) => invoke<Activity[]>("list_activities", { includeArchived }),
    create: (input: { categoryId: string; name: string }) => invoke<Activity>("create_activity", { input }),
    update: (id: string, patch: { name?: string; categoryId?: string }) =>
      invoke<Activity>("update_activity", { id, patch }),
    setArchived: (id: string, archived: boolean) => invoke<void>("set_activity_archived", { id, archived }),
    remove: (id: string) => invoke<void>("delete_activity", { id }),
    reorder: (categoryId: string, ids: string[]) => invoke<void>("reorder_activities", { categoryId, ids }),
  },

  timeEntries: {
    /** 查询与某本地日（yyyy-MM-dd）相交的记录；本地日界由前端换算为 ISO，避免时区歧义 */
    byDate: (date: string) => {
      const { startIso, endIso } = dayBounds(date);
      return invoke<TimeEntry[]>("list_time_entries_by_range", { startTime: startIso, endTime: endIso });
    },
    /** 查询与某 ISO 时间区间相交的记录 */
    byRange: (startIso: string, endIso: string) =>
      invoke<TimeEntry[]>("list_time_entries_by_range", { startTime: startIso, endTime: endIso }),
    create: (input: { activityId?: string; categoryId?: string; startTime: string; endTime: string; note?: string; source?: "manual" | "pomodoro" }) =>
      invoke<TimeEntry>("create_time_entry", { input }),
    createPomodoro: (input: { activityId?: string; categoryId?: string; pomodoroSessionId: string; pomodoroStatus: "completed" | "saved"; plannedSeconds?: number; segments: Array<{ startAt: string; endAt: string }> }) =>
      invoke<TimeEntry[]>("create_pomodoro_entries", { input }),
    update: (
      id: string,
      patch: { activityId?: string | null; categoryId?: string | null; startTime?: string; endTime?: string; note?: string },
    ) => invoke<TimeEntry>("update_time_entry", { id, patch }),
    remove: (id: string) => invoke<void>("delete_time_entry", { id }),
    conflicts: (startTime: string, endTime: string, excludeId?: string | null) =>
      invoke<TimeEntry[]>("find_time_entry_conflicts", { startTime, endTime, excludeId }),
    replace: (
      conflictIds: string[],
      input: { activityId?: string; categoryId?: string; startTime: string; endTime: string; note?: string; source?: "manual" | "pomodoro" },
    ) => invoke<TimeEntry>("replace_time_entries", { conflictIds, input }),
    countByActivity: (activityId: string) => invoke<number>("count_time_entries_by_activity", { activityId }),
  },

  focusSessions: {
    byRange: (startIso: string, endIso: string) => invoke<Array<{ id: string; activityId: string | null; categoryId: string | null; plannedSeconds: number; startedAt: string; endedAt: string | null; status: "started" | "completed" | "saved" | "cancelled" }>>("list_focus_sessions_by_range", { startTime: startIso, endTime: endIso }),
    start: (input: { id: string; activityId?: string | null; categoryId?: string | null; plannedSeconds: number; startedAt: string }) => invoke("start_focus_session", { input }),
    finish: (id: string, status: "completed" | "saved") => invoke("finish_focus_session", { id, status }),
    cancel: (id: string) => invoke("cancel_focus_session", { id }),
  },

  settings: {
    get: async (): Promise<TimelogSettings> => {
      const raw = await invoke<string>("get_timelog_settings");
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<TimelogSettings>) };
    },
    set: async (patch: Partial<TimelogSettings>): Promise<TimelogSettings> => {
      const raw = await invoke<string>("get_timelog_settings");
      const next = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<TimelogSettings>), ...patch };
      await invoke<void>("set_timelog_settings", { json: JSON.stringify(next) });
      return next;
    },
  },
};
