import { describe, expect, it } from "vitest";
import {
  availableMinutesInStatRange,
  durationInStatRange,
  rangeBounds,
  shiftDateKeyByRange,
} from "../src/renderer/schedule/features/timelog/useRangeEntries";
import type { TimeEntry } from "../src/renderer/schedule/features/timelog/types";

function entry(startTime: string, endTime: string): TimeEntry {
  return {
    id: "entry-1",
    activityId: "activity-1",
    categoryId: null,
    startTime,
    endTime,
    note: undefined,
    createdAt: startTime,
    updatedAt: endTime,
  };
}

describe("timelog range statistics", () => {
  it("counts entries inside the selected week, not only the selected day", () => {
    const item = entry("2026-08-19T02:00:00.000Z", "2026-08-19T03:30:00.000Z");

    expect(durationInStatRange(item, "week", "2026-08-18", "00:00", "24:00")).toBe(90);
    expect(availableMinutesInStatRange("week", "2026-08-18", "00:00", "24:00")).toBe(7 * 24 * 60);
  });

  it("navigates by the active statistics range", () => {
    expect(shiftDateKeyByRange("2026-08-18", "day", 1)).toBe("2026-08-19");
    expect(shiftDateKeyByRange("2026-08-18", "week", 1)).toBe("2026-08-25");
    expect(shiftDateKeyByRange("2026-08-18", "month", 1)).toBe("2026-09-18");
    expect(shiftDateKeyByRange("2026-08-18", "year", 1)).toBe("2027-08-18");
  });

  it("uses full local period bounds", () => {
    expect(rangeBounds("week", "2026-08-18")).toEqual({ startKey: "2026-08-17", endKey: "2026-08-23" });
    expect(rangeBounds("month", "2026-08-18")).toEqual({ startKey: "2026-08-01", endKey: "2026-08-31" });
    expect(rangeBounds("year", "2026-08-18")).toEqual({ startKey: "2026-01-01", endKey: "2026-12-31" });
  });
});
