import { useMemo } from "react";
import { useTimelogStore } from "../stores";
import { minutesToLabel } from "../utils";
import {
  availableMinutesInStatRange,
  durationInStatRange,
  useRangeEntries,
  type StatRange,
} from "../useRangeEntries";
import type { Catalog } from "../catalog";
import StatsRangeSwitch from "./StatsRangeSwitch";

const RANGE_LABEL: Record<StatRange, string> = {
  day: "当日",
  week: "本周",
  month: "本月",
  year: "本年",
};

/** 概览统计（日/周/月/年）：已记录 / 未记录 / 记录率 */
export default function DayOverview({
  catalog: _catalog,
  showRangeSwitch = true,
}: {
  catalog: Catalog;
  showRangeSwitch?: boolean;
}) {
  const selectedDate = useTimelogStore((s) => s.selectedDate);
  const settings = useTimelogStore((s) => s.settings);
  const statRange = useTimelogStore((s) => s.statRange);
  const entries = useRangeEntries(statRange, selectedDate);

  const summary = useMemo(() => {
    const available = availableMinutesInStatRange(
      statRange,
      selectedDate,
      settings.dayStart,
      settings.dayEnd,
    );
    const recorded = entries.reduce(
      (acc, entry) => acc + durationInStatRange(entry, statRange, selectedDate, settings.dayStart, settings.dayEnd),
      0,
    );
    const rate = available > 0 ? (recorded / available) * 100 : 0;
    return {
      recordedMinutes: recorded,
      unrecordedMinutes: Math.max(0, available - recorded),
      rate,
    };
  }, [entries, statRange, selectedDate, settings.dayStart, settings.dayEnd]);

  return (
    <section className="rounded-xl border border-border bg-card/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">
          {RANGE_LABEL[statRange]}概览
        </h2>
        {showRangeSwitch && <StatsRangeSwitch className="w-28" />}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="已记录" value={minutesToLabel(summary.recordedMinutes)} color="text-foreground" />
        <Stat label="未记录" value={minutesToLabel(summary.unrecordedMinutes)} color="text-muted-foreground" />
        <Stat label="记录率" value={`${summary.rate.toFixed(1)}%`} color="text-primary" highlight />
      </div>
      <div className="mt-3">
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.min(100, summary.rate)}%` }}
          />
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, color, highlight }: { label: string; value: string; color: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${highlight ? "bg-primary/10" : "bg-muted/40"}`}>
      <div className={`text-lg font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
