import { useMemo } from "react";
import { useTimelogStore } from "../stores";
import { minutesToLabel, type CategoryBreakdownItem } from "../utils";
import { durationInStatRange, useRangeEntries } from "../useRangeEntries";
import type { Catalog } from "../catalog";
import StatsRangeSwitch from "./StatsRangeSwitch";

/** 分类统计（环形图 + 时间排行），支持日/周/月/年范围 */
export default function CategoryBreakdown({
  catalog,
  showRangeSwitch = true,
}: {
  catalog: Catalog;
  showRangeSwitch?: boolean;
}) {
  const selectedDate = useTimelogStore((s) => s.selectedDate);
  const settings = useTimelogStore((s) => s.settings);
  const statRange = useTimelogStore((s) => s.statRange);
  const entries = useRangeEntries(statRange, selectedDate);

  const activityCategory = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of catalog.activities) map.set(a.id, a.categoryId);
    return map;
  }, [catalog.activities]);

  const items = useMemo(() => {
    const acc = new Map<string, number>();
    for (const entry of entries) {
      const minutes = durationInStatRange(entry, statRange, selectedDate, settings.dayStart, settings.dayEnd);
      if (minutes <= 0) continue;
      const categoryId = (entry.activityId ? activityCategory.get(entry.activityId) : undefined) ?? entry.categoryId ?? undefined;
      if (!categoryId) continue;
      acc.set(categoryId, (acc.get(categoryId) ?? 0) + minutes);
    }
    const total = [...acc.values()].reduce((sum, minutes) => sum + minutes, 0);
    return [...acc.entries()]
      .map(([categoryId, minutes]): CategoryBreakdownItem => {
        const category = catalog.categories.find((item) => item.id === categoryId);
        return {
          categoryId,
          name: category?.name ?? "未知分类",
          color: category?.color ?? "#8B93A5",
          minutes,
          percent: total > 0 ? (minutes / total) * 100 : 0,
        };
      })
      .sort((a, b) => b.minutes - a.minutes);
  }, [activityCategory, catalog.categories, entries, selectedDate, settings.dayEnd, settings.dayStart, statRange]);

  if (items.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">分类统计</h2>
          {showRangeSwitch && <StatsRangeSwitch className="w-28" />}
        </div>
        <p className="py-8 text-center text-sm text-muted-foreground">
          当前周期还没有记录，暂无分类统计。
        </p>
      </section>
    );
  }

  const total = items.reduce((a, b) => a + b.minutes, 0);

  return (
    <section className="rounded-xl border border-border bg-card/60 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">分类统计</h2>
        {showRangeSwitch && <StatsRangeSwitch className="w-28" />}
      </div>
      <div className="flex items-start gap-6">
        <Donut items={items} total={total} />
        <ul className="min-w-0 flex-1 space-y-3">
          {items.map((it) => (
            <li key={it.categoryId}>
              <div className="mb-1.5 flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: it.color }} />
                <span className="min-w-0 flex-1 font-medium">{it.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {minutesToLabel(it.minutes)}
                </span>
                <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">
                  {it.percent.toFixed(1)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted/60">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, it.percent)}%`, background: it.color }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Donut({ items, total }: { items: CategoryBreakdownItem[]; total: number }) {
  const R = 48;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: 120, height: 120 }}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="16" />
        {items.map((it) => {
          const frac = total > 0 ? it.minutes / total : 0;
          const dash = frac * C;
          const el = (
            <circle
              key={it.categoryId}
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke={it.color}
              strokeWidth="16"
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-semibold tabular-nums text-foreground">
          {minutesToLabel(total)}
        </span>
        <span className="text-xs text-muted-foreground">已记录</span>
      </div>
    </div>
  );
}
