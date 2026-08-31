import type { Habit, HabitRecord } from "../types";

export type HabitRecordReader = (habitId: string) => Promise<HabitRecord[]>;

export async function loadAllHabitRecords(
  habits: Habit[],
  readRecords: HabitRecordReader,
): Promise<HabitRecord[]> {
  const batches = await Promise.all(habits.map((habit) => readRecords(habit.id)));
  return batches.flat();
}

export function replaceHabitRecord(
  records: HabitRecord[],
  habitId: string,
  date: string,
  count: number,
): HabitRecord[] {
  const remaining = records.filter((record) => !(record.habitId === habitId && record.date === date));
  return count > 0 ? [...remaining, { habitId, date, count }] : remaining;
}

export function habitActionError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return "操作未完成，请重试";
}
