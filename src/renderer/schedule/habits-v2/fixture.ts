import type { Habit, HabitRecord } from "../types";
import { addDays } from "./metrics";

export const HABITS_V2_FIXTURE_DATE = "2026-08-30";

export const habitsV2Fixture: Habit[] = [
  { id: "habit-reading", name: "晨间阅读", color: "#d1a85f", icon: "book", targetCount: 1, createdAt: "2026-07-01T08:00:00.000Z" },
  { id: "habit-water", name: "喝水 8 杯", color: "#7697ad", icon: "droplets", targetCount: 8, createdAt: "2026-07-01T08:00:00.000Z" },
  { id: "habit-focus", name: "专注工作", color: "#79ad93", icon: "clock", targetCount: 2, createdAt: "2026-07-01T08:00:00.000Z" },
  { id: "habit-english", name: "英语学习", color: "#7697ad", icon: "languages", targetCount: 1, createdAt: "2026-07-10T08:00:00.000Z" },
  { id: "habit-strength", name: "力量训练", color: "#d1a85f", icon: "dumbbell", targetCount: 3, createdAt: "2026-07-10T08:00:00.000Z" },
  { id: "habit-review", name: "睡前复盘", color: "#79ad93", icon: "check", targetCount: 1, createdAt: "2026-07-15T08:00:00.000Z" },
];

const streakLengths: Record<string, number> = {
  "habit-reading": 28,
  "habit-water": 12,
  "habit-focus": 9,
  "habit-english": 6,
  "habit-strength": 2,
  "habit-review": 15,
};

export const habitsV2FixtureRecords: HabitRecord[] = habitsV2Fixture.flatMap((habit, habitIndex) => {
  const records: HabitRecord[] = [];
  const completedToday = habit.id !== "habit-strength" && habit.id !== "habit-review";
  const streakStart = completedToday ? 0 : 1;
  for (let offset = 0; offset < 90; offset += 1) {
    const date = addDays(HABITS_V2_FIXTURE_DATE, -offset);
    const inCurrentStreak = offset >= streakStart && offset < streakStart + streakLengths[habit.id];
    const streakBarrier = offset === streakStart + streakLengths[habit.id] || (!completedToday && offset === 0);
    const patternedCompletion = (offset + habitIndex * 2) % (habitIndex % 2 === 0 ? 5 : 4) !== 0;
    const complete = inCurrentStreak || (!streakBarrier && patternedCompletion);
    if (!complete) continue;
    records.push({
      habitId: habit.id,
      date,
      count: habit.targetCount + ((offset + habitIndex) % 7 === 0 ? 1 : 0),
    });
  }
  return records;
});
