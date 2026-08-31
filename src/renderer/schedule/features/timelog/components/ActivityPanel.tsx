import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  FolderPlus,
} from "lucide-react";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { timelogApi } from "../api";
import { useTimelogStore, useConflictStore } from "../stores";
import { cn } from "../ui/cn";
import type { Activity, Category } from "../types";
import type { Catalog } from "../catalog";
import { ActivityDialog, CategoryDialog, DeleteDialog } from "./dialogs";

type DialogState =
  | { type: "add-category" }
  | { type: "edit-category"; category: Category }
  | { type: "add-activity"; categoryId?: string }
  | { type: "edit-activity"; activity: Activity }
  | { type: "delete-category"; category: Category; allow: boolean }
  | { type: "delete-activity"; activity: Activity; allow: boolean }
  | null;

interface ActivityPanelProps {
  catalog: Catalog;
  onCatalogChange: () => void;
}

/** 左侧栏：活动分类 / 活动；支持「先框选时间段，再点击活动填入」 */
export default function ActivityPanel({ catalog, onCatalogChange }: ActivityPanelProps) {
  const selectedActivityId = useTimelogStore((s) => s.selectedActivityId);
  const setSelectedActivity = useTimelogStore((s) => s.setSelectedActivity);
  const selectedCategoryId = useTimelogStore((s) => s.selectedCategoryId);
  const setSelectedCategory = useTimelogStore((s) => s.setSelectedCategory);
  const rangeSelection = useTimelogStore((s) => s.rangeSelection);
  const requestCreate = useConflictStore((s) => s.requestCreate);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState>(null);

  const { categories, activities } = catalog;

  const activeCategories = useMemo(
    () => categories.filter((c) => !c.archived).sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  );
  const archivedCategories = useMemo(
    () => categories.filter((c) => c.archived).sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  );
  const archivedActivities = useMemo(
    () => activities.filter((a) => a.archived).sort((a, b) => a.sortOrder - b.sortOrder),
    [activities],
  );

  const activityCategoryId = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of activities) map.set(a.id, a.categoryId);
    return map;
  }, [activities]);

  const activityName = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of activities) map.set(a.id, a.name);
    return map;
  }, [activities]);

  const categoryColor = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) map.set(c.id, c.color);
    return map;
  }, [categories]);

  // 首次见到某分类时默认展开；保留用户手动折叠/展开的状态
  useEffect(() => {
    setExpanded((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const c of activeCategories) {
        if (!next.has(c.id)) {
          next.add(c.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activeCategories]);

  // 选中活动被归档 / 删除后自动清除选中
  useEffect(() => {
    if (!selectedActivityId) return;
    const act = activities.find((a) => a.id === selectedActivityId);
    if (!act || act.archived) setSelectedActivity(null);
  }, [activities, selectedActivityId, setSelectedActivity]);

  const refresh = useCallback(() => onCatalogChange(), [onCatalogChange]);

  async function openDeleteCategory(category: Category) {
    // 分类下仍有活动则不可直接删除（§36 默认归档）
    const allow = !activities.some((a) => a.categoryId === category.id && !a.archived);
    setDialog({ type: "delete-category", category, allow });
  }

  async function openDeleteActivity(activity: Activity) {
    const count = await timelogApi.timeEntries.countByActivity(activity.id);
    setDialog({ type: "delete-activity", activity, allow: count === 0 });
  }

  async function moveCategory(id: string, direction: -1 | 1) {
    const list = activeCategories;
    const idx = list.findIndex((c) => c.id === id);
    const target = list[idx + direction];
    if (!target) return;
    const ids = list.map((c) => c.id);
    [ids[idx], ids[idx + direction]] = [ids[idx + direction], ids[idx]];
    await timelogApi.categories.reorder(ids);
    refresh();
  }

  async function moveActivity(act: Activity, direction: -1 | 1) {
    const list = activities
      .filter((a) => a.categoryId === act.categoryId && !a.archived)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = list.findIndex((a) => a.id === act.id);
    const target = list[idx + direction];
    if (!target) return;
    const ids = list.map((a) => a.id);
    [ids[idx], ids[idx + direction]] = [ids[idx + direction], ids[idx]];
    await timelogApi.activities.reorder(act.categoryId, ids);
    refresh();
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * 点击活动：
   * - 始终把该活动设为当前画笔（清除分类选中）
   * - 若存在框选时间段 → 用该活动填入框选区域，并清除框选
   */
  function handleActivityClick(activity: Activity) {
    setSelectedActivity(activity.id);
    const sel = useTimelogStore.getState().rangeSelection;
    if (sel) {
      void (async () => {
        await requestCreate(
          { start: new Date(sel.startTime), end: new Date(sel.endTime) },
          activity.id,
        );
        useTimelogStore.getState().clearRangeSelection();
      })();
    }
  }

  /**
   * 点击分类（总标签）：
   * - 把该分类设为当前画笔（清除活动选中），支持直接拖动画布用分类填充
   * - 若存在框选时间段 → 用该分类填入框选区域，并清除框选
   */
  function handleCategoryClick(category: Category) {
    setSelectedCategory(category.id);
    const sel = useTimelogStore.getState().rangeSelection;
    if (sel) {
      void (async () => {
        await requestCreate(
          { start: new Date(sel.startTime), end: new Date(sel.endTime) },
          undefined,
          category.id,
        );
        useTimelogStore.getState().clearRangeSelection();
      })();
    }
  }

  // 删除确认对话框的内容（提前收窄，避免联合类型收窄问题）
  const deleteDialog = (() => {
    if (dialog?.type === "delete-category") {
      return {
        open: true,
        title: "删除分类？",
        allow: dialog.allow,
        description: dialog.allow
          ? "该分类下没有活动与历史记录，删除后不可恢复。"
          : "该分类下存在活动或历史记录，无法直接删除，建议改为归档（§36）。",
      };
    }
    if (dialog?.type === "delete-activity") {
      return {
        open: true,
        title: "删除活动？",
        allow: dialog.allow,
        description: dialog.allow
          ? "该活动没有历史时间记录，删除后不可恢复。"
          : "该活动存在历史时间记录，无法直接删除，建议改为归档（§36）。",
      };
    }
    return null;
  })();

  function categoryName(id?: string): string {
    return categories.find((c) => c.id === id)?.name ?? "未知分类";
  }

  return (
    <div
      data-testid="timelog-activity-panel"
      className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card/40"
    >
      <div className="flex items-center justify-between px-3 pb-1.5 pt-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          活动分类
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setDialog({ type: "add-category" })}
          aria-label="新增分类"
          data-testid="add-category"
        >
          <FolderPlus className="h-4 w-4" />
        </Button>
      </div>

      {/* 框选提示：点击活动填入框选时间段 */}
      {rangeSelection && (
        <div
          data-testid="panel-range-hint"
          className="mx-1.5 mb-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1.5 text-xs leading-relaxed text-primary"
        >
          已框选时间段，点击下方活动即可填入
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {activeCategories.map((cat, catIdx) => {
          const catActivities = activities
            .filter((a) => a.categoryId === cat.id && !a.archived)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          const isOpen = expanded.has(cat.id);
          return (
            <div key={cat.id} className="mb-0.5" data-testid="category-row">
              <div className="group flex items-center gap-0.5 rounded-md py-0.5 pr-1 hover:bg-accent/60">
                <button
                  onClick={() => toggleExpand(cat.id)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                  aria-label={isOpen ? "收起" : "展开"}
                >
                  <ChevronRight
                    className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-90")}
                  />
                </button>
                <button
                  onClick={() => handleCategoryClick(cat)}
                  aria-pressed={selectedCategoryId === cat.id}
                  title="点击选中该分类，可拖动时间块直接填充"
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-1.5 rounded py-0.5 text-left text-sm transition-colors",
                    selectedCategoryId === cat.id
                      ? "font-semibold text-primary"
                      : "text-foreground hover:text-primary",
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: cat.color }}
                  />
                  <span className="min-w-0 flex-1 truncate">{cat.name}</span>
                  {selectedCategoryId === cat.id && (
                    <span className="text-[10px] font-normal text-primary/70">已选</span>
                  )}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={`${cat.name} 操作`}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel>{cat.name}</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => setDialog({ type: "add-activity", categoryId: cat.id })}>
                      <Plus /> 新增活动
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDialog({ type: "edit-category", category: cat })}>
                      <Pencil /> 编辑分类
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={catIdx === 0}
                      onClick={() => moveCategory(cat.id, -1)}
                    >
                      <ArrowUp /> 上移
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={catIdx === activeCategories.length - 1}
                      onClick={() => moveCategory(cat.id, 1)}
                    >
                      <ArrowDown /> 下移
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => timelogApi.categories.setArchived(cat.id, true).then(refresh)}
                    >
                      <Archive /> 归档
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => openDeleteCategory(cat)}
                    >
                      <Trash2 /> 删除…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {isOpen && (
                <div className="ml-3.5 border-l border-border pl-1.5">
                  {catActivities.length === 0 && (
                    <div className="px-2 py-1 text-xs text-muted-foreground/70">暂无活动</div>
                  )}
                  {catActivities.map((act, actIdx) => {
                    const selected = selectedActivityId === act.id;
                    const catColor = categoryColor.get(cat.id);
                    return (
                      <div
                        key={act.id}
                        data-testid="activity-row"
                        data-selected={selected ? "true" : "false"}
                        className={cn(
                          "group relative flex items-center rounded-md transition-colors",
                          selected
                            ? "bg-primary/15 shadow-[inset_2px_0_0_0_var(--accent)]"
                            : "hover:bg-accent/60",
                        )}
                      >
                        <button
                          onClick={() => handleActivityClick(act)}
                          aria-pressed={selected}
                          className={cn(
                            "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md py-1 pl-2 pr-1 text-left text-sm transition-colors",
                            selected
                              ? "font-semibold text-primary"
                              : "text-foreground/90 hover:text-foreground",
                          )}
                        >
                          <span
                            className={cn(
                              "shrink-0 rounded-full transition-all",
                              selected ? "h-2.5 w-2.5 opacity-100" : "h-1.5 w-1.5 opacity-70",
                            )}
                            style={{ background: catColor }}
                          />
                          <span className="truncate">{act.name}</span>
                          {selected && (
                            <span
                              className="ml-auto pr-1 text-[10px] font-normal text-primary/70"
                              aria-label="已选中"
                            >
                              已选
                            </span>
                          )}
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="absolute right-1 top-0.5 h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                              aria-label={`${act.name} 操作`}
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuLabel>{act.name}</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => setDialog({ type: "edit-activity", activity: act })}>
                              <Pencil /> 编辑活动
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={actIdx === 0}
                              onClick={() => moveActivity(act, -1)}
                            >
                              <ArrowUp /> 上移
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={actIdx === catActivities.length - 1}
                              onClick={() => moveActivity(act, 1)}
                            >
                              <ArrowDown /> 下移
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => timelogApi.activities.setArchived(act.id, true).then(refresh)}
                            >
                              <Archive /> 归档
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => openDeleteActivity(act)}
                            >
                              <Trash2 /> 删除…
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {activeCategories.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            暂无分类，点击右上角或下方按钮创建。
          </div>
        )}
      </div>

      <div className="flex flex-col gap-0.5 border-t border-border p-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="justify-start text-muted-foreground hover:text-foreground"
          onClick={() => setDialog({ type: "add-activity" })}
        >
          <Plus /> 添加活动
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="justify-start text-muted-foreground hover:text-foreground"
          onClick={() => setDialog({ type: "add-category" })}
        >
          <FolderPlus /> 添加分类
        </Button>
      </div>

      {(archivedCategories.length > 0 || archivedActivities.length > 0) && (
        <>
          <Separator />
          <div className="max-h-40 overflow-y-auto px-1.5 py-1.5">
            <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">已归档</div>
            {archivedCategories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full opacity-60"
                  style={{ background: cat.color }}
                />
                <span className="min-w-0 flex-1 truncate">{cat.name}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`恢复 ${cat.name}`}
                  onClick={() => timelogApi.categories.setArchived(cat.id, false).then(refresh)}
                >
                  <ArchiveRestore className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {archivedActivities.map((act) => (
              <div
                key={act.id}
                className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full opacity-60"
                  style={{ background: categoryColor.get(activityCategoryId.get(act.id) ?? "") }}
                />
                <span className="min-w-0 flex-1 truncate">
                  {categoryName(activityCategoryId.get(act.id))} / {activityName.get(act.id)}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`恢复 ${act.name}`}
                  onClick={() => timelogApi.activities.setArchived(act.id, false).then(refresh)}
                >
                  <ArchiveRestore className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 对话框 */}
      <CategoryDialog
        open={dialog?.type === "add-category"}
        onOpenChange={(o) => !o && setDialog(null)}
        onSubmit={async (data) => {
          await timelogApi.categories.create(data);
          refresh();
        }}
      />
      <CategoryDialog
        open={dialog?.type === "edit-category"}
        onOpenChange={(o) => !o && setDialog(null)}
        category={dialog?.type === "edit-category" ? dialog.category : null}
        onSubmit={async (data) => {
          if (dialog?.type === "edit-category") {
            await timelogApi.categories.update(dialog.category.id, data);
            refresh();
          }
        }}
      />
      <ActivityDialog
        open={dialog?.type === "add-activity"}
        onOpenChange={(o) => !o && setDialog(null)}
        categories={activeCategories}
        defaultCategoryId={dialog?.type === "add-activity" ? dialog.categoryId : undefined}
        onSubmit={async (data) => {
          await timelogApi.activities.create(data);
          refresh();
        }}
      />
      <ActivityDialog
        open={dialog?.type === "edit-activity"}
        onOpenChange={(o) => !o && setDialog(null)}
        categories={activeCategories}
        activity={dialog?.type === "edit-activity" ? dialog.activity : null}
        onSubmit={async (data) => {
          if (dialog?.type === "edit-activity") {
            await timelogApi.activities.update(dialog.activity.id, data);
            refresh();
          }
        }}
      />
      <DeleteDialog
        open={deleteDialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        title={deleteDialog?.title ?? ""}
        description={deleteDialog?.description ?? ""}
        allowDelete={deleteDialog?.allow ?? false}
        onConfirm={async () => {
          if (dialog?.type === "delete-category" && dialog.allow) {
            await timelogApi.categories.remove(dialog.category.id);
            refresh();
          }
          if (dialog?.type === "delete-activity" && dialog.allow) {
            await timelogApi.activities.remove(dialog.activity.id);
            refresh();
          }
        }}
      />
    </div>
  );
}
