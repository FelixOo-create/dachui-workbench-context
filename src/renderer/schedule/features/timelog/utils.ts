import { format } from "date-fns";
import type { Activity, Category, TimeEntry } from "./types";

// ---------- id ----------

export function newId(): string {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).toLowerCase();
}

export function nowIso(): string {
  return new Date().toISOString();
}

// ---------- 时间工具（§6 / §21 / §22） ----------

export const MINUTES_PER_DAY = 24 * 60;

export function dateToKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function keyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** 'HH:mm' → 当日分钟数（'24:00' = 1440，即次日 00:00） */
export function parseHHmm(str: string): number {
  const [h, m] = str.split(":").map(Number);
  return h * 60 + m;
}

/** 当日分钟数 → 'HH:mm'（1440 显示为 '24:00'） */
export function minutesToHHmm(minutes: number): string {
  if (minutes === MINUTES_PER_DAY) return "24:00";
  const clamped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 时长展示（§21）：<60m → '45m'；整小时 → '3h'；其余 → '2h30m' */
export function minutesToLabel(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h${rem}m`;
}

export function snapDateToBlock(date: Date, blockSize: 15 | 30): Date {
  const ms = blockSize * 60_000;
  return new Date(Math.floor(date.getTime() / ms) * ms);
}

export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export interface VisibleRange {
  start: Date;
  end: Date;
  startMinutes: number;
  endMinutes: number;
}

export function getVisibleRange(
  dateKey: string,
  dayStart: string,
  dayEnd: string,
): VisibleRange {
  const startMin = parseHHmm(dayStart);
  const endMinRaw = parseHHmm(dayEnd);
  const endMinutes = endMinRaw <= startMin ? endMinRaw + MINUTES_PER_DAY : endMinRaw;
  const base = keyToDate(dateKey);
  return {
    start: new Date(base.getTime() + startMin * 60_000),
    end: new Date(base.getTime() + endMinutes * 60_000),
    startMinutes: startMin,
    endMinutes,
  };
}

export interface DaySlice {
  start: Date | null;
  end: Date | null;
}

export function intersectEntryWithRange(
  entryStart: Date,
  entryEnd: Date,
  range: VisibleRange,
): DaySlice {
  const start = entryStart < range.start ? range.start : entryStart;
  const end = entryEnd > range.end ? range.end : entryEnd;
  if (end <= start) return { start: null, end: null };
  return { start, end };
}

// ---------- 统计（§35 集中在 utils，只依赖 TimeEntry） ----------

export interface DaySummary {
  recordedMinutes: number;
  unrecordedMinutes: number;
  totalMinutes: number;
  rate: number;
}

export function summarizeDay(entries: TimeEntry[], range: VisibleRange): DaySummary {
  const totalMinutes = (range.end.getTime() - range.start.getTime()) / 60_000;
  let recordedMinutes = 0;
  for (const entry of entries) {
    const slice = intersectEntryWithRange(
      new Date(entry.startTime),
      new Date(entry.endTime),
      range,
    );
    if (slice.start && slice.end) {
      recordedMinutes += (slice.end.getTime() - slice.start.getTime()) / 60_000;
    }
  }
  const unrecordedMinutes = Math.max(0, totalMinutes - recordedMinutes);
  const rate = totalMinutes > 0 ? (recordedMinutes / totalMinutes) * 100 : 0;
  return { recordedMinutes, unrecordedMinutes, totalMinutes, rate };
}

export interface CategoryBreakdownItem {
  categoryId: string;
  name: string;
  color: string;
  minutes: number;
  percent: number;
}

export function getDurationByCategory(
  entries: TimeEntry[],
  range: VisibleRange,
  categories: Category[],
  activityCategory: Map<string, string>,
): CategoryBreakdownItem[] {
  const acc = new Map<string, number>();
  for (const entry of entries) {
    const slice = intersectEntryWithRange(
      new Date(entry.startTime),
      new Date(entry.endTime),
      range,
    );
    if (!slice.start || !slice.end) continue;
    // 活动级记录取所属分类；分类级记录直接用 categoryId
    const catId =
      (entry.activityId ? activityCategory.get(entry.activityId) : undefined) ??
      entry.categoryId ??
      undefined;
    if (!catId) continue;
    const mins = (slice.end.getTime() - slice.start.getTime()) / 60_000;
    acc.set(catId, (acc.get(catId) ?? 0) + mins);
  }
  const total = [...acc.values()].reduce((a, b) => a + b, 0);
  return [...acc.entries()]
    .map(([categoryId, minutes]) => {
      const cat = categories.find((c) => c.id === categoryId);
      return {
        categoryId,
        name: cat?.name ?? "未知分类",
        color: cat?.color ?? "#8B93A5",
        minutes,
        percent: total > 0 ? (minutes / total) * 100 : 0,
      };
    })
    .sort((a, b) => b.minutes - a.minutes);
}

export interface ActivityDetailItem {
  activityId: string | null;
  activityName: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  minutes: number;
  percent: number;
}

export function getDurationByActivity(
  entries: TimeEntry[],
  range: VisibleRange,
  activities: Activity[],
  categories: Category[],
): ActivityDetailItem[] {
  const acc = new Map<string, number>();
  for (const entry of entries) {
    const slice = intersectEntryWithRange(
      new Date(entry.startTime),
      new Date(entry.endTime),
      range,
    );
    if (!slice.start || !slice.end) continue;
    const mins = (slice.end.getTime() - slice.start.getTime()) / 60_000;
    // 活动级记录按 activityId 聚合；分类级记录用 "__cat__" 前缀区分
    const key = entry.activityId ?? `__cat__${entry.categoryId ?? ""}`;
    acc.set(key, (acc.get(key) ?? 0) + mins);
  }
  const total = [...acc.values()].reduce((a, b) => a + b, 0);
  const actMap = new Map(activities.map((a) => [a.id, a]));
  const catMap = new Map(categories.map((c) => [c.id, c]));
  return [...acc.entries()]
    .map(([key, minutes]) => {
      if (key.startsWith("__cat__")) {
        const catId = key.slice("__cat__".length);
        const cat = catMap.get(catId);
        return {
          activityId: null,
          activityName: cat?.name ?? "未知分类",
          categoryId: catId,
          categoryName: cat?.name ?? "未知分类",
          categoryColor: cat?.color ?? "#8B93A5",
          minutes,
          percent: total > 0 ? (minutes / total) * 100 : 0,
        };
      }
      const act = actMap.get(key);
      const cat = act ? catMap.get(act.categoryId) : undefined;
      return {
        activityId: key,
        activityName: act?.name ?? "未知活动",
        categoryId: act?.categoryId ?? "",
        categoryName: cat?.name ?? "未知分类",
        categoryColor: cat?.color ?? "#8B93A5",
        minutes,
        percent: total > 0 ? (minutes / total) * 100 : 0,
      };
    })
    .sort((a, b) => b.minutes - a.minutes);
}
