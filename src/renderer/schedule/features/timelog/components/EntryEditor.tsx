import { useEffect, useMemo, useState } from "react";
import { format, startOfDay } from "date-fns";
import { Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { timelogApi } from "../api";
import { useTimelogStore, useSelectionStore } from "../stores";
import { minutesToLabel, parseHHmm } from "../utils";
import type { Catalog } from "../catalog";
import { useDayEntries } from "../useDayEntries";

interface EntryEditorProps {
  catalog: Catalog;
}

interface PendingEdit {
  start: Date;
  end: Date;
}

function parseInput(str: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(str.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  if (h === 24 && min !== 0) return null;
  return h * 60 + min;
}

/** 选中记录的编辑面板：修改活动 / 开始时间 / 结束时间 / 删除，带冲突检测（§8、§9） */
export default function EntryEditor({ catalog }: EntryEditorProps) {
  const selectedDate = useTimelogStore((s) => s.selectedDate);
  const bumpDataVersion = useTimelogStore((s) => s.bumpDataVersion);
  const selectedEntryId = useSelectionStore((s) => s.selectedEntryId);
  const selectEntry = useSelectionStore((s) => s.select);
  const entries = useDayEntries(selectedDate);

  const entry = entries.find((e) => e.id === selectedEntryId);

  const [startStr, setStartStr] = useState("");
  const [endStr, setEndStr] = useState("");
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (entry) {
      setStartStr(format(new Date(entry.startTime), "HH:mm"));
      setEndStr(format(new Date(entry.endTime), "HH:mm"));
    }
  }, [entry]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    for (const c of catalog.categories) map.set(c.id, c);
    return map;
  }, [catalog.categories]);

  const groups = useMemo(() => {
    const activeCats = catalog.categories
      .filter((c) => !c.archived)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return activeCats.map((cat) => ({
      category: cat,
      activities: catalog.activities
        .filter((a) => a.categoryId === cat.id && !a.archived)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }));
  }, [catalog]);

  if (!entry) return null;
  // 守卫后固定引用，便于在闭包中使用
  const current = entry;

  const act = current.activityId ? catalog.activities.find((a) => a.id === current.activityId) : undefined;
  const cat = act ? categoryMap.get(act.categoryId) : current.categoryId ? categoryMap.get(current.categoryId) : undefined;
  const startMin = parseHHmm(format(new Date(current.startTime), "HH:mm"));
  const endMin = parseHHmm(format(new Date(current.endTime), "HH:mm"));
  const crossesMidnight = endMin <= startMin;
  const duration = minutesToLabel(
    (new Date(current.endTime).getTime() - new Date(current.startTime).getTime()) / 60_000,
  );

  async function changeActivity(activityId: string) {
    await timelogApi.timeEntries.update(current.id, { activityId });
    bumpDataVersion();
  }

  async function commitTimes() {
    const s = parseInput(startStr);
    const e = parseInput(endStr);
    if (s == null || e == null) {
      setStartStr(format(new Date(current.startTime), "HH:mm"));
      setEndStr(format(new Date(current.endTime), "HH:mm"));
      return;
    }
    const base = startOfDay(new Date(current.startTime));
    const start = new Date(base.getTime() + s * 60_000);
    const endMinutes = e <= s ? e + 24 * 60 : e;
    const end = new Date(base.getTime() + endMinutes * 60_000);
    if (end <= start) {
      setStartStr(format(new Date(current.startTime), "HH:mm"));
      setEndStr(format(new Date(current.endTime), "HH:mm"));
      return;
    }
    const conflicts = await timelogApi.timeEntries.conflicts(
      start.toISOString(),
      end.toISOString(),
      current.id,
    );
    if (conflicts.length > 0) {
      setPendingEdit({ start, end });
      return;
    }
    await timelogApi.timeEntries.update(current.id, {
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    });
    bumpDataVersion();
  }

  async function overwriteEdit() {
    if (!pendingEdit) return;
    const conflicts = await timelogApi.timeEntries.conflicts(
      pendingEdit.start.toISOString(),
      pendingEdit.end.toISOString(),
      current.id,
    );
    await timelogApi.timeEntries.update(current.id, {
      startTime: pendingEdit.start.toISOString(),
      endTime: pendingEdit.end.toISOString(),
    });
    for (const c of conflicts) {
      await timelogApi.timeEntries.remove(c.id);
    }
    setPendingEdit(null);
    bumpDataVersion();
  }

  async function handleDelete() {
    await timelogApi.timeEntries.remove(current.id);
    selectEntry(null);
    bumpDataVersion();
  }

  return (
    <>
      <section className="rounded-lg border border-border bg-card/40 p-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            选中记录
          </h2>
          <Badge variant="muted">{duration}</Badge>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>活动</Label>
            <Select
              value={current.activityId ?? `__CAT__${current.categoryId ?? ""}`}
              onValueChange={(v) => {
                if (v.startsWith("__CAT__")) {
                  const catId = v.slice("__CAT__".length);
                  void timelogApi.timeEntries.update(current.id, {
                    activityId: "",
                    categoryId: catId || undefined,
                  });
                  bumpDataVersion();
                } else {
                  void changeActivity(v);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>按分类（总标签）</SelectLabel>
                  {groups.map((g) => (
                    <SelectItem key={`cat-${g.category.id}`} value={`__CAT__${g.category.id}`}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: g.category.color }}
                        />
                        {g.category.name}（整个分类）
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
                {groups.map((g) => (
                  <SelectGroup key={g.category.id}>
                    <SelectLabel>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: g.category.color }}
                        />
                        {g.category.name}
                      </span>
                    </SelectLabel>
                    {g.activities.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>开始时间</Label>
            <Input
              data-testid="entry-start-input"
              value={startStr}
              onChange={(e) => setStartStr(e.target.value)}
              onBlur={commitTimes}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label>结束时间</Label>
              {crossesMidnight && <Badge variant="outline">次日</Badge>}
            </div>
            <Input
              data-testid="entry-end-input"
              value={endStr}
              onChange={(e) => setEndStr(e.target.value)}
              onBlur={commitTimes}
            />
          </div>
          {crossesMidnight && (
            <p className="text-[11px] text-muted-foreground">
              结束时间早于开始时间时，自动视为次日（跨午夜记录，§22）。
            </p>
          )}
          {act && cat && (
            <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs">
              <span className="h-2 w-2 rounded-full" style={{ background: cat.color }} />
              <span className="text-foreground/90">
                {cat.name} / {act.name}
              </span>
              <span className="ml-auto tabular-nums text-muted-foreground">
                {format(new Date(current.startTime), "HH:mm")} -{" "}
                {format(new Date(current.endTime), "HH:mm")}
              </span>
            </div>
          )}
          <Button
            variant="outline"
            className="w-full text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 /> 删除这条记录
          </Button>
        </div>
      </section>

      {/* 编辑冲突对话框 */}
      <Dialog open={pendingEdit !== null} onOpenChange={(o) => !o && setPendingEdit(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>时间冲突</DialogTitle>
            <DialogDescription>
              修改后的时间段与其它记录重叠。覆盖将删除冲突的其它记录。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingEdit(null)}>
              取消修改
            </Button>
            <Button variant="destructive" onClick={overwriteEdit}>
              覆盖冲突记录
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>删除这条记录？</DialogTitle>
            <DialogDescription>删除后不可恢复。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                setConfirmDelete(false);
                await handleDelete();
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
