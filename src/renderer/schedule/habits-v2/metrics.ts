import type { Habit, HabitRecord } from "../types";

export type HabitTrendRange = 7 | 30 | 90;

export interface HabitDaySummary {
  date: string;
  completed: number;
  total: number;
  rate: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface HabitRankingItem {
  habit: Habit;
  streak: number;
}

export interface HabitMetrics {
  todayCompleted: number;
  todayTotal: number;
  longestStreak: number;
  weekCompletionRate: number;
  monthCheckins: number;
  rangeCompletionRate: number;
  heatmap: HabitDaySummary[];
  ranking: HabitRankingItem[];
}

const DAY_MS = 86_400_000;

function toUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, amount: number): string {
  return dateKey(new Date(toUtcDate(value).getTime() + amount * DAY_MS));
}

function recordIndex(records: HabitRecord[]): Map<string, number> {
  return new Map(records.map((record) => [`${record.habitId}:${record.date}`, record.count]));
}

function countFor(index: Map<string, number>, habitId: string, date: string): number {
  return index.get(`${habitId}:${date}`) ?? 0;
}

function isComplete(index: Map<string, number>, habit: Habit, date: string): boolean {
  return countFor(index, habit.id, date) >= Math.max(1, habit.targetCount);
}

function currentStreak(index: Map<string, number>, habit: Habit, selectedDate: string): number {
  let cursor = selectedDate;
  if (!isComplete(index, habit, cursor)) cursor = addDays(cursor, -1);
  let streak = 0;
  while (isComplete(index, habit, cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function rangeDates(selectedDate: string, length: number): string[] {
  return Array.from({ length }, (_, index) => addDays(selectedDate, index - length + 1));
}

function completionRate(
  habits: Habit[],
  index: Map<string, number>,
  dates: string[],
): number {
  const possible = habits.length * dates.length;
  if (!possible) return 0;
  const completed = dates.reduce(
    (total, date) => total + habits.filter((habit) => isComplete(index, habit, date)).length,
    0,
  );
  return Math.round((completed / possible) * 100);
}

function weekDates(selectedDate: string): string[] {
  const date = toUtcDate(selectedDate);
  const day = date.getUTCDay();
  const offsetFromMonday = (day + 6) % 7;
  const monday = addDays(selectedDate, -offsetFromMonday);
  return Array.from({ length: offsetFromMonday + 1 }, (_, index) => addDays(monday, index));
}

export function calculateHabitMetrics(
  habits: Habit[],
  records: HabitRecord[],
  selectedDate: string,
  range: HabitTrendRange = 30,
): HabitMetrics {
  const index = recordIndex(records);
  const todayCompleted = habits.filter((habit) => isComplete(index, habit, selectedDate)).length;
  const ranking = habits
    .map((habit) => ({ habit, streak: currentStreak(index, habit, selectedDate) }))
    .sort((a, b) => b.streak - a.streak || a.habit.name.localeCompare(b.habit.name, "zh-CN"));
  const heatmapDates = rangeDates(selectedDate, 56);
  const heatmap = heatmapDates.map<HabitDaySummary>((date) => {
    const completed = habits.filter((habit) => isComplete(index, habit, date)).length;
    const rate = habits.length ? completed / habits.length : 0;
    const level = Math.min(4, Math.ceil(rate * 4)) as HabitDaySummary["level"];
    return { date, completed, total: habits.length, rate, level };
  });
  const monthPrefix = selectedDate.slice(0, 7);
  const monthCheckins = records
    .filter((record) => record.date.startsWith(monthPrefix))
    .reduce((total, record) => total + Math.max(0, record.count), 0);

  return {
    todayCompleted,
    todayTotal: habits.length,
    longestStreak: ranking[0]?.streak ?? 0,
    weekCompletionRate: completionRate(habits, index, weekDates(selectedDate)),
    monthCheckins,
    rangeCompletionRate: completionRate(habits, index, rangeDates(selectedDate, range)),
    heatmap,
    ranking,
  };
}

export function getHabitCount(records: HabitRecord[], habitId: string, date: string): number {
  return records.find((record) => record.habitId === habitId && record.date === date)?.count ?? 0;
}
