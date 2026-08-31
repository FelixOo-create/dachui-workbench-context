import { useEffect, useState } from "react";
import { timelogApi } from "./api";
import { useTimelogStore } from "./stores";
import type { TimeEntry } from "./types";
import { dateToKey, getVisibleRange, intersectEntryWithRange, keyToDate } from "./utils";

export type StatRange = "day" | "week" | "month" | "year";

/** 由 statRange + 当前日期计算本地日范围 [startKey, endKey]（含两端） */
export function rangeBounds(
  statRange: StatRange,
  dateKey: string,
): { startKey: string; endKey: string } {
  const d = new Date(dateKey + "T00:00:00");
  const key = (x: Date) => {
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const dd = String(x.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };
  switch (statRange) {
    case "day":
      return { startKey: dateKey, endKey: dateKey };
    case "week": {
      // 周一为一周起点
      const dow = (d.getDay() + 6) % 7;
      const start = new Date(d.getTime() - dow * 86400_000);
      const end = new Date(start.getTime() + 6 * 86400_000);
      return { startKey: key(start), endKey: key(end) };
    }
    case "month": {
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return { startKey: key(start), endKey: key(end) };
    }
    case "year": {
      const start = new Date(d.getFullYear(), 0, 1);
      const end = new Date(d.getFullYear(), 11, 31);
      return { startKey: key(start), endKey: key(end) };
    }
  }
}

export function rangeDateKeys(statRange: StatRange, dateKey: string): string[] {
  const { startKey, endKey } = rangeBounds(statRange, dateKey);
  const keys: string[] = [];
  for (
    let cursor = keyToDate(startKey), end = keyToDate(endKey);
    cursor <= end;
    cursor = new Date(cursor.getTime() + 86400_000)
  ) {
    keys.push(dateToKey(cursor));
  }
  return keys;
}

export function shiftDateKeyByRange(dateKey: string, statRange: StatRange, step: number): string {
  const date = keyToDate(dateKey);
  if (statRange === "day") date.setDate(date.getDate() + step);
  if (statRange === "week") date.setDate(date.getDate() + step * 7);
  if (statRange === "month") date.setMonth(date.getMonth() + step);
  if (statRange === "year") date.setFullYear(date.getFullYear() + step);
  return dateToKey(date);
}

export function durationInStatRange(
  entry: TimeEntry,
  statRange: StatRange,
  dateKey: string,
  dayStart: string,
  dayEnd: string,
): number {
  const entryStart = new Date(entry.startTime);
  const entryEnd = new Date(entry.endTime);
  return rangeDateKeys(statRange, dateKey).reduce((total, key) => {
    const visibleRange = getVisibleRange(key, dayStart, dayEnd);
    const slice = intersectEntryWithRange(entryStart, entryEnd, visibleRange);
    if (!slice.start || !slice.end) return total;
    return total + (slice.end.getTime() - slice.start.getTime()) / 60_000;
  }, 0);
}

export function availableMinutesInStatRange(
  statRange: StatRange,
  dateKey: string,
  dayStart: string,
  dayEnd: string,
): number {
  const firstDayRange = getVisibleRange(dateKey, dayStart, dayEnd);
  return rangeDateKeys(statRange, dateKey).length * (firstDayRange.endMinutes - firstDayRange.startMinutes);
}

/** 按统计范围加载时间记录（含跨范围，日期相交即计入） */
export function useRangeEntries(statRange: StatRange, dateKey: string): TimeEntry[] {
  const dataVersion = useTimelogStore((s) => s.dataVersion);
  const [entries, setEntries] = useState<TimeEntry[]>([]);

  useEffect(() => {
    let on = true;
    const { startKey, endKey } = rangeBounds(statRange, dateKey);
    // 本地日界转 ISO（时区 08:00 偏移避免歧义）
    const startIso = new Date(`${startKey}T00:00:00`).toISOString();
    const endIso = new Date(`${endKey}T23:59:59.999`).toISOString();
    timelogApi.timeEntries
      .byRange(startIso, endIso)
      .then((list) => {
        if (on) setEntries(list);
      })
      .catch((err) => console.error("加载范围时间记录失败", err));
    return () => {
      on = false;
    };
  }, [statRange, dateKey, dataVersion]);

  return entries;
}
