import { create } from "zustand";
import { addDays } from "date-fns";
import { timelogApi } from "./api";
import { DEFAULT_SETTINGS } from "./constants";
import { dateToKey, newId, nowIso } from "./utils";
import type { TimeEntry, TimelogSettings } from "./types";

// ---------- 主状态 ----------

interface TimelogState {
  ready: boolean;
  settings: TimelogSettings;
  selectedDate: string; // 'yyyy-MM-dd'
  selectedActivityId: string | null;
  selectedCategoryId: string | null;
  rangeSelection: { startTime: string; endTime: string } | null;
  statRange: "day" | "week" | "month" | "year";
  dataVersion: number;
  init: () => Promise<void>;
  updateSettings: (patch: Partial<TimelogSettings>) => Promise<void>;
  setSelectedDate: (key: string) => void;
  goToToday: () => void;
  shiftDate: (days: number) => void;
  setSelectedActivity: (id: string | null) => void;
  setSelectedCategory: (id: string | null) => void;
  setRangeSelection: (sel: { startTime: string; endTime: string } | null) => void;
  clearRangeSelection: () => void;
  setStatRange: (r: "day" | "week" | "month" | "year") => void;
  bumpDataVersion: () => void;
}

export const useTimelogStore = create<TimelogState>()((set, get) => ({
  ready: false,
  settings: { ...DEFAULT_SETTINGS },
  selectedDate: dateToKey(new Date()),
  selectedActivityId: null,
  selectedCategoryId: null,
  rangeSelection: null,
  statRange: "day",
  dataVersion: 0,

  async init() {
    await timelogApi.seedDefaults();
    const settings = await timelogApi.settings.get();
    set({ settings, ready: true });
  },

  async updateSettings(patch) {
    const settings = await timelogApi.settings.set(patch);
    set({ settings });
  },

  setSelectedDate(key) {
    set({ selectedDate: key });
  },

  goToToday() {
    set({ selectedDate: dateToKey(new Date()) });
  },

  shiftDate(days) {
    const next = addDays(new Date(get().selectedDate + "T00:00:00"), days);
    set({ selectedDate: dateToKey(next) });
  },

  setSelectedActivity(id) {
    // 选中活动时清除分类选中（互斥）
    set({ selectedActivityId: id, selectedCategoryId: null });
  },

  setSelectedCategory(id) {
    // 选中分类时清除活动选中（互斥）
    set({ selectedCategoryId: id, selectedActivityId: null });
  },

  setRangeSelection(sel) {
    set({ rangeSelection: sel });
  },

  clearRangeSelection() {
    set({ rangeSelection: null });
  },

  setStatRange(r) {
    set({ statRange: r });
  },

  bumpDataVersion() {
    set((s) => ({ dataVersion: s.dataVersion + 1 }));
  },
}));

// ---------- 选中 TimeEntry ----------

interface SelectionState {
  selectedEntryId: string | null;
  select: (id: string | null) => void;
}

export const useSelectionStore = create<SelectionState>()((set) => ({
  selectedEntryId: null,
  select: (id) => set({ selectedEntryId: id }),
}));

// ---------- 冲突处理（绘制与框选填入共用，§9） ----------

interface PendingCreate {
  start: Date;
  end: Date;
  activityId?: string;
  categoryId?: string;
}

interface ConflictState {
  pending: PendingCreate | null;
  conflicts: TimeEntry[];
  requestCreate: (
    range: { start: Date; end: Date },
    activityId?: string,
    categoryId?: string,
  ) => Promise<boolean>;
  confirmOverwrite: () => Promise<void>;
  cancel: () => void;
}

export const useConflictStore = create<ConflictState>()((set, get) => ({
  pending: null,
  conflicts: [],

  async requestCreate(range, activityId, categoryId) {
    const found = await timelogApi.timeEntries.conflicts(
      range.start.toISOString(),
      range.end.toISOString(),
    );
    if (found.length > 0) {
      set({ pending: { ...range, activityId, categoryId }, conflicts: found });
      return false;
    }
    await timelogApi.timeEntries.create({
      activityId,
      categoryId,
      startTime: range.start.toISOString(),
      endTime: range.end.toISOString(),
    });
    useTimelogStore.getState().bumpDataVersion();
    useTimelogStore.getState().setSelectedActivity(null);
    return true;
  },

  async confirmOverwrite() {
    const { pending, conflicts } = get();
    if (!pending) return;
    await timelogApi.timeEntries.replace(
      conflicts.map((c) => c.id),
      {
        activityId: pending.activityId,
        categoryId: pending.categoryId,
        startTime: pending.start.toISOString(),
        endTime: pending.end.toISOString(),
      },
    );
    set({ pending: null, conflicts: [] });
    useTimelogStore.getState().bumpDataVersion();
    useTimelogStore.getState().setSelectedActivity(null);
  },

  cancel() {
    set({ pending: null, conflicts: [] });
  },
}));

export { newId, nowIso };
