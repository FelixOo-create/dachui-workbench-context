import { useTimelogStore } from "../stores";
import type { StatRange } from "../useRangeEntries";
import { cn } from "../ui/cn";

const OPTIONS: { value: StatRange; label: string }[] = [
  { value: "day", label: "日" },
  { value: "week", label: "周" },
  { value: "month", label: "月" },
  { value: "year", label: "年" },
];

/** 统计范围切换器（日/周/月/年） */
export default function StatsRangeSwitch({ className }: { className?: string }) {
  const statRange = useTimelogStore((s) => s.statRange);
  const setStatRange = useTimelogStore((s) => s.setStatRange);
  return (
    <div className={cn("flex items-center gap-0.5 rounded-md bg-muted/60 p-0.5", className)}>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => setStatRange(o.value)}
          aria-pressed={statRange === o.value}
          className={cn(
            "flex-1 rounded px-1.5 py-0.5 text-[11px] transition-colors",
            statRange === o.value
              ? "bg-background font-semibold text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
