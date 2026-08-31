import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Pencil, Trash2 } from "lucide-react";
import { useTimelogStore, useSelectionStore, useConflictStore } from "../stores";
import {
  dateToKey,
  getVisibleRange,
  intersectEntryWithRange,
  minutesToHHmm,
  minutesToLabel,
  type VisibleRange,
} from "../utils";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import type { TimeEntry } from "../types";
import type { Catalog } from "../catalog";
import { useDayEntries } from "../useDayEntries";
import { timelogApi } from "../api";
import ContextMenu from "../../../components/ContextMenu";

const LABEL_WIDTH = 44;
const TARGET_COL_WIDTH = 300;
const MIN_PX_PER_UNIT = 12;
const MAX_PX_PER_UNIT = 42;
const TARGET_PX_PER_UNIT = 38;

interface MergedBlock {
  activityId: string | null;
  categoryId: string | null;
  entries: TimeEntry[];
  start: Date;
  end: Date;
  rawEndTime: string;
}

interface Column {
  index: number;
  startG: number;
  endG: number;
  startMin: number;
  endMin: number;
}

/**
 * Day View — 多列时间网格（§6、§7、§9、§22）
 * 布局双向自适应铺满可视区域；拖动可跨列连续绘制；
 * 无活动时拖动生成「框选」，点击左侧活动填入。
 */
export default function DayView({ catalog }: { catalog: Catalog }) {
  const selectedDate = useTimelogStore((s) => s.selectedDate);
  const settings = useTimelogStore((s) => s.settings);
  const selectedActivityId = useTimelogStore((s) => s.selectedActivityId);
  const selectedEntryId = useSelectionStore((s) => s.selectedEntryId);
  const selectEntry = useSelectionStore((s) => s.select);

  const entries = useDayEntries(selectedDate);
  const range = useMemo<VisibleRange>(
    () => getVisibleRange(selectedDate, settings.dayStart, settings.dayEnd),
    [selectedDate, settings.dayStart, settings.dayEnd],
  );

  const [painting, setPainting] = useState<{ startG: number; endG: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const rangeSelection = useTimelogStore((s) => s.rangeSelection);
  const setRangeSelection = useTimelogStore((s) => s.setRangeSelection);
  const clearRangeSelection = useTimelogStore((s) => s.clearRangeSelection);
  const requestCreate = useConflictStore((s) => s.requestCreate);

  const blockSize = settings.blockSize;

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

  const selectedCategoryId = useTimelogStore((s) => s.selectedCategoryId);

  const paintColor = useMemo(() => {
    if (selectedCategoryId) return categoryMap.get(selectedCategoryId) || "#5B6EF5";
    if (selectedActivityId) {
      const act = activityMap.get(selectedActivityId);
      return (act && categoryMap.get(act.categoryId)) || "#5B6EF5";
    }
    return "#5B6EF5";
  }, [selectedActivityId, selectedCategoryId, activityMap, categoryMap]);

  // 监听可视区域尺寸（宽 → 列数；高 → 单元格高度）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setView({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const columns = useMemo<Column[]>(() => {
    const totalMinutes = range.endMinutes - range.startMinutes;
    const totalUnits = Math.max(1, Math.round(totalMinutes / blockSize));
    const w = view.w || 878;
    const h = view.h || 640;
    const byWidth = Math.min(6, Math.max(2, Math.round(w / TARGET_COL_WIDTH)));
    const perColByHeight = Math.max(1, Math.floor(h / TARGET_PX_PER_UNIT));
    const byHeight = Math.min(6, Math.max(2, Math.ceil(totalUnits / perColByHeight)));
    const preferred = byHeight <= byWidth && w / byHeight >= 240 ? byHeight : byWidth;

    const segHours = Math.max(1, Math.ceil(totalMinutes / 60 / preferred));
    const segMin = segHours * 60;
    const cols: Column[] = [];
    let s = range.startMinutes;
    while (s < range.endMinutes) {
      const e = Math.min(s + segMin, range.endMinutes);
      cols.push({
        index: cols.length,
        startG: s - range.startMinutes,
        endG: e - range.startMinutes,
        startMin: s,
        endMin: e,
      });
      s = e;
    }
    return cols;
  }, [range, blockSize, view]);

  const unitsInCol = (col: Column): number =>
    Math.max(1, Math.round((col.endG - col.startG) / blockSize));

  const maxUnits = useMemo(
    () => Math.max(...columns.map((c) => unitsInCol(c)), 1),
    [columns],
  );
  const pxPerUnit = Math.min(
    MAX_PX_PER_UNIT,
    Math.max(MIN_PX_PER_UNIT, view.h > 0 ? Math.floor(view.h / maxUnits) : 20),
  );
  const pxPerMinute = pxPerUnit / blockSize;

  const blocks = useMemo<MergedBlock[]>(() => {
    const sorted = [...entries].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const result: MergedBlock[] = [];
    for (const e of sorted) {
      const slice = intersectEntryWithRange(new Date(e.startTime), new Date(e.endTime), range);
      if (!slice.start || !slice.end) continue;
      const last = result[result.length - 1];
      const sameTag =
        last &&
        last.activityId === e.activityId &&
        last.categoryId === e.categoryId &&
        last.rawEndTime === e.startTime;
      if (sameTag) {
        last.entries.push(e);
        last.end = slice.end;
        last.rawEndTime = e.endTime;
      } else {
        result.push({
          activityId: e.activityId,
          categoryId: e.categoryId,
          entries: [e],
          start: slice.start,
          end: slice.end,
          rawEndTime: e.endTime,
        });
      }
    }
    return result;
  }, [entries, range]);

  function colDates(col: Column): { start: Date; end: Date } {
    return {
      start: new Date(range.start.getTime() + col.startG * 60_000),
      end: new Date(range.start.getTime() + col.endG * 60_000),
    };
  }

  function pointInfo(clientX: number, clientY: number): { col: Column; unit: number } | null {
    const el = containerRef.current;
    if (!el || columns.length === 0) return null;
    const children = el.children;
    let idx = -1;
    for (let i = 0; i < children.length; i++) {
      const r = (children[i] as HTMLElement).getBoundingClientRect();
      if (clientX >= r.left && clientX < r.right) {
        idx = i;
        break;
      }
    }
    if (idx === -1) {
      const rect = el.getBoundingClientRect();
      idx = Math.min(
        columns.length - 1,
        Math.max(0, Math.floor((clientX - rect.left) / (rect.width / columns.length))),
      );
    }
    const r = (children[idx] as HTMLElement).getBoundingClientRect();
    const unit = Math.floor((clientY - r.top) / pxPerUnit);
    return { col: columns[idx], unit };
  }

  function globalMinute(info: { col: Column; unit: number }): number {
    const clamped = Math.min(Math.max(info.unit, 0), unitsInCol(info.col) - 1);
    return info.col.startG + clamped * blockSize;
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const info = pointInfo(e.clientX, e.clientY);
    if (!info) return;
    const g = globalMinute(info);
    e.currentTarget.setPointerCapture(e.pointerId);
    setPainting({ startG: g, endG: g });
    selectEntry(null);
    clearRangeSelection();
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!painting) return;
    const info = pointInfo(e.clientX, e.clientY);
    if (!info) return;
    setPainting((p) => (p ? { ...p, endG: globalMinute(info) } : p));
  }

  function releasePointerCaptureSafe(e: React.PointerEvent<HTMLDivElement>) {
    // 无论 painting 状态如何，都必须释放捕获，
    // 否则 pointercancel / 异常中断后捕获残留，会吞掉左侧面板的所有点击
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    releasePointerCaptureSafe(e);
    if (!painting) return;
    const { startG, endG } = painting;
    const [s, en] = startG <= endG ? [startG, endG] : [endG, startG];
    const start = new Date(range.start.getTime() + s * 60_000);
    const end = new Date(range.start.getTime() + (en + blockSize) * 60_000);
    setPainting(null);
    void commitCreate(start, end);
  }

  function handlePointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    releasePointerCaptureSafe(e);
    setPainting(null);
  }

  /**
   * 松手后的处理（§6.3）：
   * - 已选活动 → 立即创建记录（冲突走全局对话框）
   * - 未选活动 → 生成「框选」，等待点击左侧活动填入
   */
  async function commitCreate(start: Date, end: Date) {
    const activityId = useTimelogStore.getState().selectedActivityId;
    const categoryId = useTimelogStore.getState().selectedCategoryId;
    if (!activityId && !categoryId) {
      setRangeSelection({ startTime: start.toISOString(), endTime: end.toISOString() });
      return;
    }
    await requestCreate({ start, end }, activityId ?? undefined, categoryId ?? undefined);
  }

  function selectEntryAt(e: React.PointerEvent, block: MergedBlock) {
    e.stopPropagation();
    if (e.button !== 0) return;
    const info = pointInfo(e.clientX, e.clientY);
    if (!info) return;
    const tMs = range.start.getTime() + (info.col.startG + (info.unit + 0.5) * blockSize) * 60_000;
    const hit =
      block.entries.find(
        (en) =>
          new Date(en.startTime).getTime() <= tMs && tMs < new Date(en.endTime).getTime(),
      ) ?? block.entries[block.entries.length - 1];
    selectEntry(hit.id);
    clearRangeSelection();
  }

  // ---------- 右键菜单（删除/编辑时间块） ----------
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entryId: string; title: string } | null>(null);

  function entryAtPoint(clientX: number, clientY: number, block: MergedBlock): TimeEntry | null {
    const info = pointInfo(clientX, clientY);
    if (!info) return null;
    const tMs = range.start.getTime() + (info.col.startG + (info.unit + 0.5) * blockSize) * 60_000;
    return (
      block.entries.find(
        (en) =>
          new Date(en.startTime).getTime() <= tMs && tMs < new Date(en.endTime).getTime(),
      ) ?? block.entries[block.entries.length - 1]
    );
  }

  function handleBlockContextMenu(e: React.MouseEvent, block: MergedBlock) {
    e.preventDefault();
    e.stopPropagation();
    const hit = entryAtPoint(e.clientX, e.clientY, block);
    if (!hit) return;
    selectEntry(hit.id);
    clearRangeSelection();
    // 分类级记录显示分类名，活动级显示活动名
    const act = block.activityId ? activityMap.get(block.activityId) : undefined;
    const catId = act?.categoryId ?? block.categoryId ?? undefined;
    const title = act?.name ?? (catId ? categoryNameMap.get(catId) : undefined) ?? "未知活动";
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      entryId: hit.id,
      title,
    });
  }

  async function handleContextDelete(entryId: string) {
    await timelogApi.timeEntries.remove(entryId);
    selectEntry(null);
    useTimelogStore.getState().bumpDataVersion();
  }

  function handleContextEdit(entryId: string) {
    selectEntry(entryId);
    // 右侧「选中记录」面板会自动出现，滚动到编辑区由用户操作
  }

  const paintingMinG = painting ? Math.min(painting.startG, painting.endG) : 0;
  const paintingMaxG = painting ? Math.max(painting.startG, painting.endG) : 0;
  const hasEntries = entries.length > 0;
  const colHeight = maxUnits * pxPerUnit;

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-background">
      {/* 顶部提示条（流式，不遮挡时间表内容） */}
      {rangeSelection ? (
        <div
          data-testid="range-selection-bar"
          className="flex h-9 shrink-0 items-center justify-center gap-2 border-b border-primary/25 bg-primary/10 text-xs text-primary"
        >
          <span>
            已框选 {format(new Date(rangeSelection.startTime), "HH:mm")} –{" "}
            {format(new Date(rangeSelection.endTime), "HH:mm")}（
            {minutesToLabel(
              (new Date(rangeSelection.endTime).getTime() -
                new Date(rangeSelection.startTime).getTime()) /
                60_000,
            )}
            ）· 点击左侧活动填入该时间段
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-primary"
            onClick={clearRangeSelection}
            data-testid="clear-range-selection"
          >
            清除
          </Button>
        </div>
      ) : !selectedActivityId ? (
        <div className="flex h-9 shrink-0 items-center justify-center border-b border-border bg-card/30 text-xs text-muted-foreground">
          未选择活动
        </div>
      ) : null}

      <div
        ref={scrollRef}
        data-testid="dayview-scroll"
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      >
        <div
          ref={containerRef}
          data-testid="dayview-content"
          data-px-per-min={pxPerMinute}
          className="flex min-h-full w-full select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onLostPointerCapture={() => setPainting(null)}
        >
          {columns.map((col) => {
            const colD = colDates(col);
            const units = unitsInCol(col);
            const hourMarks: number[] = [col.startMin];
            for (let m = Math.ceil((col.startMin + 1) / 60) * 60; m < col.endMin; m += 60) {
              hourMarks.push(m);
            }
            if (hourMarks[hourMarks.length - 1] !== col.endMin && col.endMin % 60 === 0) {
              hourMarks.push(col.endMin);
            }
            return (
              <div
                key={col.index}
                data-testid="dayview-col"
                data-start-min={col.startMin}
                data-end-min={col.endMin}
                className="relative min-w-0 flex-1 border-l border-border first:border-l-0"
                style={{ height: colHeight }}
              >
                {hourMarks.map((m) => {
                  const isFirst = m === col.startMin;
                  const isLast = m === col.endMin;
                  return (
                    <div
                      key={`label-${col.index}-${m}`}
                      className={cn(
                        "pointer-events-none absolute left-0 z-10 w-[44px] pr-1.5 text-right text-[11px] tabular-nums text-muted-foreground",
                        isFirst ? "translate-y-0" : isLast ? "-translate-y-full" : "-translate-y-1/2",
                      )}
                      style={{ top: (m - col.startMin) * pxPerMinute }}
                    >
                      {minutesToHHmm(m)}
                    </div>
                  );
                })}

                {Array.from({ length: units + 1 }, (_, i) => {
                  const markMin = col.startMin + i * blockSize;
                  const isHour = markMin % 60 === 0;
                  return (
                    <div
                      key={`line-${col.index}-${i}`}
                      className={cn(
                        "pointer-events-none absolute left-[44px] right-0 border-t",
                        isHour ? "border-border" : "border-white/[0.03]",
                      )}
                      style={{ top: i * pxPerUnit }}
                    />
                  );
                })}

                {blocks.map((block, idx) => {
                  const cs = block.start < colD.start ? colD.start : block.start;
                  const ce = block.end > colD.end ? colD.end : block.end;
                  if (ce <= cs) return null;
                  // 分类级记录：activityId 为 null，显示分类名；活动级显示活动名
                  const act = block.activityId ? activityMap.get(block.activityId) : undefined;
                  const catId = act?.categoryId ?? block.categoryId ?? undefined;
                  const catName = catId ? categoryNameMap.get(catId) : undefined;
                  const blockLabel =
                    (act?.name ?? (block.categoryId ? catName : undefined)) || "未分类";
                  const color = catId ? categoryMap.get(catId) : "#8B93A5";
                  const top = ((cs.getTime() - colD.start.getTime()) / 60_000) * pxPerMinute;
                  const height = ((ce.getTime() - cs.getTime()) / 60_000) * pxPerMinute;
                  const fullDuration = minutesToLabel(
                    (block.end.getTime() - block.start.getTime()) / 60_000,
                  );
                  const sliceDuration = minutesToLabel((ce.getTime() - cs.getTime()) / 60_000);
                  const selEntry = block.entries.find((en) => en.id === selectedEntryId);
                  return (
                    <div
                      key={`${idx}-${col.index}`}
                      onPointerDown={(e) => selectEntryAt(e, block)}
                      onContextMenu={(e) => handleBlockContextMenu(e, block)}
                      data-testid="time-block"
                      className="group absolute z-[5] cursor-pointer overflow-hidden rounded-[5px] border-l-[3px] transition-[filter] hover:brightness-125"
                      style={{
                        top,
                        height,
                        left: LABEL_WIDTH + 6,
                        right: 8,
                        background: `${color}26`,
                        borderColor: color,
                      }}
                      title={`${blockLabel} · ${format(block.start, "HH:mm")} - ${format(block.end, "HH:mm")} (${fullDuration})`}
                    >
                      {selEntry && (
                        <div
                          className="pointer-events-none absolute inset-x-0 ring-2 ring-inset ring-foreground/80"
                          style={{
                            top:
                              ((new Date(selEntry.startTime).getTime() - cs.getTime()) / 60_000) *
                              pxPerMinute,
                            height:
                              ((new Date(selEntry.endTime).getTime() -
                                new Date(selEntry.startTime).getTime()) /
                                60_000) *
                              pxPerMinute,
                          }}
                        />
                      )}
                      <div className="flex h-full flex-col justify-center px-2 py-0.5">
                        {height >= 26 && (
                          <div className="truncate text-xs font-medium leading-tight" style={{ color }}>
                            {blockLabel}
                          </div>
                        )}
                        {height >= 40 && (
                          <div className="text-[11px] leading-tight text-muted-foreground">
                            {sliceDuration}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* 框选高亮（按列切片） */}
                {rangeSelection &&
                  (() => {
                    const rs = new Date(rangeSelection.startTime).getTime();
                    const re = new Date(rangeSelection.endTime).getTime();
                    const cs = Math.max(rs, colD.start.getTime());
                    const ce = Math.min(re, colD.end.getTime());
                    if (ce <= cs) return null;
                    return (
                      <div
                        data-testid="range-selection"
                        className="pointer-events-none absolute z-[4] rounded-[5px] border border-dashed border-primary/80 bg-primary/10"
                        style={{
                          top: ((cs - colD.start.getTime()) / 60_000) * pxPerMinute,
                          height: ((ce - cs) / 60_000) * pxPerMinute,
                          left: LABEL_WIDTH + 6,
                          right: 8,
                        }}
                      />
                    );
                  })()}

                {/* 绘制预览（按列切片） */}
                {painting &&
                  paintingMaxG > col.startG &&
                  paintingMinG < col.endG && (
                    <div
                      className="pointer-events-none absolute z-[6] rounded-[5px] border-l-[3px] opacity-70"
                      style={{
                        top: (Math.max(paintingMinG, col.startG) - col.startG) * pxPerMinute,
                        height:
                          (Math.min(paintingMaxG + blockSize, col.endG) -
                            Math.max(paintingMinG, col.startG)) *
                          pxPerMinute,
                        left: LABEL_WIDTH + 6,
                        right: 8,
                        background: `${paintColor}33`,
                        borderColor: paintColor,
                      }}
                    >
                      {(Math.min(paintingMaxG, col.endG) - Math.max(paintingMinG, col.startG)) /
                        blockSize >=
                        2 && (
                        <span className="px-2 text-[11px] text-muted-foreground">
                          {minutesToHHmm(range.startMinutes + paintingMinG)} -{" "}
                          {minutesToHHmm(range.startMinutes + paintingMaxG + blockSize)} ·{" "}
                          {minutesToLabel(paintingMaxG - paintingMinG + blockSize)}
                        </span>
                      )}
                    </div>
                  )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 空状态（§31） */}
      {!hasEntries && !painting && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-lg border border-dashed border-border bg-background/80 px-6 py-5 text-center">
            <p className="text-sm text-foreground/85">
              {dateToKey(new Date()) === selectedDate ? "今天暂无时间记录" : "这一天暂无时间记录"}
            </p>
          </div>
        </div>
      )}

      {/* 右键菜单：删除 / 编辑时间块 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          title={contextMenu.title}
          items={[
            {
              id: "edit",
              label: "编辑",
              icon: <Pencil size={14} />,
              onClick: () => handleContextEdit(contextMenu.entryId),
            },
            { id: "sep", separator: true },
            {
              id: "delete",
              label: "删除",
              icon: <Trash2 size={14} />,
              danger: true,
              onClick: () => void handleContextDelete(contextMenu.entryId),
            },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
