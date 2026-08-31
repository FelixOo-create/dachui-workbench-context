import { useMemo } from "react";
import { format } from "date-fns";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { useConflictStore } from "../stores";
import type { Catalog } from "../catalog";

/** 全局时间冲突对话框（§9）：由绘制与「框选后填入」共用 */
export default function ConflictDialog({ catalog }: { catalog: Catalog }) {
  const pending = useConflictStore((s) => s.pending);
  const conflicts = useConflictStore((s) => s.conflicts);
  const cancel = useConflictStore((s) => s.cancel);
  const confirmOverwrite = useConflictStore((s) => s.confirmOverwrite);

  const activityMap = useMemo(() => {
    const map = new Map<string, { name: string; categoryId: string }>();
    for (const a of catalog.activities) map.set(a.id, { name: a.name, categoryId: a.categoryId });
    return map;
  }, [catalog.activities]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of catalog.categories) map.set(c.id, c.color);
    return map;
  }, [catalog.categories]);

  const categoryNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of catalog.categories) map.set(c.id, c.name);
    return map;
  }, [catalog.categories]);

  return (
    <Dialog open={pending !== null} onOpenChange={(o) => !o && cancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>时间冲突</DialogTitle>
          <DialogDescription>该时间段与已有记录重叠，同一时间只允许一个主要活动。</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          {conflicts.map((c) => {
            const act = c.activityId ? activityMap.get(c.activityId) : undefined;
            const catId = act?.categoryId ?? c.categoryId ?? undefined;
            const cat = catId ? categoryMap.get(catId) : undefined;
            const name = act?.name ?? (catId ? categoryNameMap.get(catId) : undefined) ?? "未知活动";
            return (
              <div
                key={c.id}
                className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-sm"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: cat ?? "#8B93A5" }}
                />
                <span className="font-medium">{name}</span>
                <span className="ml-auto tabular-nums text-muted-foreground">
                  {format(new Date(c.startTime), "MM-dd HH:mm")} -{" "}
                  {format(new Date(c.endTime), "MM-dd HH:mm")}
                </span>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={cancel}>
            取消
          </Button>
          <Button variant="destructive" onClick={confirmOverwrite}>
            覆盖原记录
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
