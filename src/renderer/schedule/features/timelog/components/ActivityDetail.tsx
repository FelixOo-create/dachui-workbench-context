import { useMemo } from "react";
import { useTimelogStore } from "../stores";
import { minutesToLabel, type ActivityDetailItem } from "../utils";
import { durationInStatRange, useRangeEntries } from "../useRangeEntries";
import type { Catalog } from "../catalog";
import StatsRangeSwitch from "./StatsRangeSwitch";

/** 活动明细：按分类分组展示各活动时长与占比，支持日/周/月/年范围 */
export default function ActivityDetail({
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

  const items = useMemo(() => {
    const acc = new Map<string, number>();
    for (const entry of entries) {
      const minutes = durationInStatRange(entry, statRange, selectedDate, settings.dayStart, settings.dayEnd);
      if (minutes <= 0) continue;
      const key = entry.activityId ?? `__cat__${entry.categoryId ?? ""}`;
      acc.set(key, (acc.get(key) ?? 0) + minutes);
    }
    const total = [...acc.values()].reduce((sum, minutes) => sum + minutes, 0);
    const activities = new Map(catalog.activities.map((activity) => [activity.id, activity]));
    const categories = new Map(catalog.categories.map((category) => [category.id, category]));
    return [...acc.entries()]
      .map(([key, minutes]): ActivityDetailItem => {
        if (key.startsWith("__cat__")) {
          const categoryId = key.slice("__cat__".length);
          const category = categories.get(categoryId);
          return {
            activityId: null,
            activityName: category?.name ?? "未知分类",
            categoryId,
            categoryName: category?.name ?? "未知分类",
            categoryColor: category?.color ?? "#8B93A5",
            minutes,
            percent: total > 0 ? (minutes / total) * 100 : 0,
          };
        }
        const activity = activities.get(key);
        const category = activity ? categories.get(activity.categoryId) : undefined;
        return {
          activityId: key,
          activityName: activity?.name ?? "未知活动",
          categoryId: activity?.categoryId ?? "",
          categoryName: category?.name ?? "未知分类",
          categoryColor: category?.color ?? "#8B93A5",
          minutes,
          percent: total > 0 ? (minutes / total) * 100 : 0,
        };
      })
      .sort((a, b) => b.minutes - a.minutes);
  }, [catalog.activities, catalog.categories, entries, selectedDate, settings.dayEnd, settings.dayStart, statRange]);

  const groups = useMemo(() => {
    const byCat = new Map<string, ActivityDetailItem[]>();
    for (const it of items) {
      const list = byCat.get(it.categoryId) ?? [];
      list.push(it);
      byCat.set(it.categoryId, list);
    }
    return [...byCat.entries()]
      .map(([categoryId, list]) => ({
        categoryId,
        name: list[0].categoryName,
        color: list[0].categoryColor,
        minutes: list.reduce((a, b) => a + b.minutes, 0),
        activities: list,
      }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [items]);

  return (
    <section className="rounded-lg border border-border bg-card/40 p-2">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          活动明细
        </h2>
        {showRangeSwitch && <StatsRangeSwitch className="w-28" />}
      </div>
      {groups.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">暂无活动明细。</p>
      ) : (
        <div className="space-y-1.5 overflow-y-auto pr-1">
          {groups.map((g) => (
            <div key={g.categoryId}>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: g.color }} />
                <span className="font-medium text-foreground/90">{g.name}</span>
                <span className="ml-auto tabular-nums text-muted-foreground">
                  {minutesToLabel(g.minutes)}
                </span>
              </div>
              <div className="mt-0.5 space-y-0.5">
                {g.activities.map((it) => (
                  <div key={it.activityId} className="flex items-center gap-1.5 pl-3 text-[11px]">
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {it.activityName}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {minutesToLabel(it.minutes)}
                    </span>
                    <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground/70">
                      {it.percent.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
