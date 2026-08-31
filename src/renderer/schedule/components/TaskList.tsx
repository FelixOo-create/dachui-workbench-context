import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, ChevronDown, ChevronRight, Flag, Trash2, CalendarDays,
  Pencil, ListChecks, MoreHorizontal, ArrowUpDown, GripVertical, Bell, ListTree, Clock3,
} from "lucide-react";
import { addDays, format } from "date-fns";
import ContextMenu, { type MenuItem } from "./ContextMenu";
import { useAppStore, filterTasksByView } from "../store";
import { api } from "../api";
import type { SmartView, Task, Subtask } from "../types";
import { zhCN } from "date-fns/locale";
import "./TaskList.css";

interface Props {
  view: SmartView | "list";
  listId: string | null;
  selectedDate?: string | null;
  planningTaskId: string | null;
  onScheduleTask: (task: Task) => void;
}

const VIEW_TITLES: Record<SmartView, string> = {
  today: "今天",
  tomorrow: "明天",
  planned: "已计划",
  inbox: "收件箱",
  all: "全部",
  completed: "已完成",
};

const PRIORITY_FLAG: Record<number, string> = {
  0: "#9aa3b2",
  1: "#737ba5",
  2: "#c77b7f",
};

function SubtaskEditor({ task, onSummaryChange }: { task: Task; onSummaryChange: (items: Subtask[]) => void }) {
  const [subs, setSubs] = useState<Subtask[]>([]);
  const [newSub, setNewSub] = useState("");
  const toggleSubtask = useAppStore((s) => s.toggleSubtask);

  const load = async () => {
    const items = await api.subtasks.byTask(task.id);
    setSubs(items);
    onSummaryChange(items);
  };

  useEffect(() => {
    void load();
  }, [task.id]);

  const add = async () => {
    if (!newSub.trim()) return;
    await api.subtasks.create(task.id, newSub.trim());
    setNewSub("");
    void load();
  };

  const toggle = async (id: string, completed: boolean) => {
    await toggleSubtask(id, !completed);
    void load();
  };

  return (
    <div className="tl-subtasks">
      <div className="tl-subtask-list">
        {subs.map((s) => (
          <div key={s.id} className="tl-subtask">
            <button
              className={`tl-check tl-sub-check ${s.completed ? "is-done" : ""}`}
              title={s.completed ? "标记子任务未完成" : "标记子任务已完成"}
              aria-label={s.completed ? "标记子任务未完成" : "标记子任务已完成"}
              onClick={() => void toggle(s.id, s.completed)}
            >
              {s.completed && <span className="tl-checkmark">✓</span>}
            </button>
            <span className={`tl-sub-title ${s.completed ? "is-done-text" : ""}`}>{s.title}</span>
          </div>
        ))}
      </div>
      <div className="tl-sub-add">
        <input
          value={newSub}
          placeholder="添加子任务…"
          onChange={(e) => setNewSub(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void add()}
        />
        <button className="tl-sub-addbtn" disabled={!newSub.trim()} onClick={() => void add()}>
          <Plus size={12} /> 添加
        </button>
      </div>
    </div>
  );
}
export default function TaskList({ view, listId, selectedDate, planningTaskId, onScheduleTask }: Props) {
  const { tasks, quickAdd, toggleTask, updateTask, deleteTask, lists } = useAppStore();
  const [input, setInput] = useState("");
  const [showCompleted, setShowCompleted] = useState(view !== "completed");
  const quickAddInputRef = useRef<HTMLInputElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<"before" | "after" | null>(null);
  const [selectedListId, setSelectedListId] = useState<string>("list-default");
  const [taskMenu, setTaskMenu] = useState<{ x: number; y: number; task: Task } | null>(null);
  const [renamingTask, setRenamingTask] = useState<Task | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sortBy, setSortBy] = useState<"manual" | "priority" | "dueDate" | "createdAt">("manual");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const [subtaskTask, setSubtaskTask] = useState<Task | null>(null);
  const [subtaskSummary, setSubtaskSummary] = useState<Record<string, { completed: number; total: number }>>({});

  // 根据当前视图初始化/同步目标清单：清单视图固定为当前清单，智能视图默认收件箱
  useEffect(() => {
    if (view === "list") {
      setSelectedListId(listId ?? "list-default");
    } else if (view === "inbox") {
      setSelectedListId("list-default");
    } else {
      // 今天/明天/已计划/全部/已完成：默认收件箱，允许用户手动切换
      setSelectedListId((prev) => {
        const exists = lists.some((l) => l.id === prev);
        return exists ? prev : "list-default";
      });
    }
  }, [view, listId, lists]);

  // 点击外部关闭排序菜单
  useEffect(() => {
    if (!showSortMenu) return;
    const handler = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSortMenu]);

  useEffect(() => {
    if (!subtaskTask) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSubtaskTask(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [subtaskTask]);

  useEffect(() => {
    if (subtaskTask && !tasks.some((task) => task.id === subtaskTask.id)) setSubtaskTask(null);
  }, [tasks, subtaskTask]);

  const visible = useMemo(
    () => selectedDate ? tasks.filter((task) => task.dueDate === selectedDate) : filterTasksByView(tasks, view, listId),
    [tasks, view, listId, selectedDate],
  );
  const openTasks = visible.filter((t) => t.status === "open");
  const doneTasks = visible.filter((t) => t.status === "completed");
  const visibleTaskIds = visible.map((task) => task.id).join("|");

  useEffect(() => {
    let active = true;
    const ids = visibleTaskIds ? visibleTaskIds.split("|") : [];
    void Promise.all(ids.map(async (taskId) => [taskId, await api.subtasks.byTask(taskId)] as const)).then((entries) => {
      if (!active) return;
      setSubtaskSummary(Object.fromEntries(entries.map(([taskId, items]) => [taskId, {
        completed: items.filter((item) => item.completed).length,
        total: items.length,
      }])));
    }).catch(() => {
      // 子任务摘要失败不影响主任务列表；用户仍可从菜单手动打开子任务。
    });
    return () => { active = false; };
  }, [visibleTaskIds]);

  // 排序逻辑
  const sortedOpenTasks = useMemo(() => {
    const sorted = [...openTasks];
    if (sortBy === "priority") {
      sorted.sort((a, b) => b.priority - a.priority || a.sortOrder - b.sortOrder);
    } else if (sortBy === "dueDate") {
      sorted.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return a.sortOrder - b.sortOrder;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate) || a.sortOrder - b.sortOrder;
      });
    } else if (sortBy === "createdAt") {
      sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    // manual: 按 sortOrder
    else {
      sorted.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return sorted;
  }, [openTasks, sortBy]);

  const sortedDoneTasks = useMemo(() => {
    const sorted = [...doneTasks];
    if (sortBy === "priority") {
      sorted.sort((a, b) => b.priority - a.priority);
    } else if (sortBy === "dueDate") {
      sorted.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
    } else if (sortBy === "createdAt") {
      sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    return sorted;
  }, [doneTasks, sortBy]);

  // 拖拽排序：在列表内调整任务顺序
  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggingId || draggingId === targetId) return;
    setDragOverId(targetId);
    // 根据鼠标在目标元素中的 Y 位置判断放在上方还是下方
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDragPos(e.clientY < midY ? "before" : "after");
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // 只在实际离开元素时清除，防止子元素冒泡误清
    const related = e.relatedTarget as HTMLElement | null;
    if (!related || !(e.currentTarget as HTMLElement).contains(related)) {
      setDragOverId(null);
      setDragPos(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);
    setDragPos(null);
    const sourceId = e.dataTransfer.getData("text/plain");
    if (!sourceId || sourceId === targetId) return;

    const sourceTask = tasks.find((t) => t.id === sourceId);
    const targetTask = tasks.find((t) => t.id === targetId);
    if (!sourceTask || !targetTask) return;

    // 获取当前排序后的列表（含未完成和已完成）
    const allSorted = [...sortedOpenTasks, ...sortedDoneTasks];
    const srcIdx = allSorted.findIndex((t) => t.id === sourceId);
    const tgtIdx = allSorted.findIndex((t) => t.id === targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;

    // 从列表中移除源任务
    const list = [...allSorted];
    const removed = list.splice(srcIdx, 1)[0];
    // 重新计算目标位置（移除源后索引可能变化）
    const newTgtIdx = list.findIndex((t) => t.id === targetId);
    const insertAt = dragPos === "after" ? newTgtIdx + 1 : newTgtIdx;
    // 重新插入
    list.splice(insertAt, 0, removed);

    // 按新顺序重新编号 sortOrder
    for (let i = 0; i < list.length; i++) {
      const task = list[i];
      const newOrder = i * 1000;
      if (task.sortOrder !== newOrder) {
        await updateTask(task.id, { sortOrder: newOrder });
      }
    }
    setDraggingId(null);
  };

  const title = selectedDate
    ? format(new Date(`${selectedDate}T00:00:00`), "M月d日 EEEE", { locale: zhCN })
    : view === "list" ? (lists.find((l) => l.id === listId)?.name ?? "清单") : VIEW_TITLES[view];
  const todayStr = new Date().toISOString().slice(0, 10);

  // 空清单视图：自动聚焦快速添加框，引导用户立即添加
  useEffect(() => {
    if (view === "list" && openTasks.length === 0) {
      const t = setTimeout(() => quickAddInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [view, listId, openTasks.length]);

  const handleAdd = async () => {
    if (!input.trim()) return;
    // 清单视图直接归属当前清单，避免 state 同步延迟导致任务错放到收件箱
    const targetListId = view === "list" ? (listId ?? "list-default") : selectedListId;
    await quickAdd(input, targetListId);
    setInput("");
  };

  // 拖拽排期：拖到日历格子时通过事件传递日期
  useEffect(() => {
    const handler = (e: CustomEvent<string>) => {
      if (draggingId) {
        void updateTask(draggingId, { dueDate: e.detail });
        setDraggingId(null);
      }
    };
    window.addEventListener("task-drop-date", handler as EventListener);
    return () => window.removeEventListener("task-drop-date", handler as EventListener);
  }, [draggingId, updateTask]);

  const isOverdue = (t: Task) => t.status === "open" && t.dueDate !== null && t.dueDate < todayStr;

  const fmtDue = (t: Task) => {
    if (!t.dueDate) return null;
    const d = new Date(t.dueDate + "T00:00:00");
    const label = t.dueDate === todayStr ? "今天" : format(d, "M月d日", { locale: zhCN });
    return (
      <span className={`tl-due ${isOverdue(t) ? "is-overdue" : ""}`}>
        {label}
        {t.dueTime ? ` ${t.dueTime}` : ""}
      </span>
    );
  };

  const buildTaskMenuItems = (t: Task): MenuItem[] => {
    const shiftDate = (days: number) => {
      const base = new Date(`${t.dueDate ?? todayStr}T00:00:00`);
      void updateTask(t.id, { dueDate: format(addDays(base, days), "yyyy-MM-dd") });
    };
    return [
      {
        id: "edit",
        label: "编辑",
        icon: <Pencil size={14} />,
        onClick: () => {
          setRenamingTask(t);
          setRenameValue(t.title);
        },
      },
      {
        id: "priority",
        label: "优先级",
        icon: <Flag size={14} />,
        items: [
          { id: "p-high", label: "高优先级", icon: <Flag size={12} style={{ color: PRIORITY_FLAG[2] }} />, onClick: () => void updateTask(t.id, { priority: 2 }) },
          { id: "p-medium", label: "中优先级", icon: <Flag size={12} style={{ color: PRIORITY_FLAG[1] }} />, onClick: () => void updateTask(t.id, { priority: 1 }) },
          { id: "p-low", label: "低优先级", icon: <Flag size={12} style={{ color: PRIORITY_FLAG[0] }} />, onClick: () => void updateTask(t.id, { priority: 0 }) },
        ],
      },
      {
        id: "reminder",
        label: t.dueDate ? "提醒" : "提醒（先设置日期）",
        icon: <Bell size={14} />,
        disabled: !t.dueDate,
        items: [
          { id: "reminder-none", label: "不提醒", onClick: () => void updateTask(t.id, { reminderMinutes: null }) },
          { id: "reminder-now", label: "准时", onClick: () => void updateTask(t.id, { reminderMinutes: 0 }) },
          { id: "reminder-15", label: "提前 15 分钟", onClick: () => void updateTask(t.id, { reminderMinutes: 15 }) },
          { id: "reminder-60", label: "提前 1 小时", onClick: () => void updateTask(t.id, { reminderMinutes: 60 }) },
        ],
      },
      {
        id: "subtasks",
        label: "添加子任务",
        icon: <ListChecks size={14} />,
        onClick: () => setSubtaskTask(t),
      },
      {
        id: "move-list",
        label: "移动清单",
        icon: <ListTree size={14} />,
        items: lists.map((list) => ({
          id: `move-${list.id}`,
          label: list.name,
          disabled: list.id === t.listId,
          icon: <span className="ctx-dot" style={{ background: list.color }} />,
          onClick: () => void updateTask(t.id, { listId: list.id }),
        })),
      },
      {
        id: "postpone",
        label: "延期",
        icon: <Clock3 size={14} />,
        items: [
          { id: "postpone-1", label: t.dueDate ? "顺延 1 天" : "安排到明天", onClick: () => shiftDate(1) },
          { id: "postpone-3", label: t.dueDate ? "顺延 3 天" : "安排到 3 天后", onClick: () => shiftDate(3) },
          { id: "postpone-7", label: t.dueDate ? "顺延 1 周" : "安排到 1 周后", onClick: () => shiftDate(7) },
        ],
      },
      { id: "separator-delete", separator: true },
      {
        id: "delete",
        label: "删除",
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: () => void deleteTask(t.id),
      },
    ];
  };

  const renderTask = (t: Task) => {
    const over = isOverdue(t);
    const listInfo = view !== "list" && t.listId ? lists.find((l) => l.id === t.listId) : undefined;
    const isDragOver = dragOverId === t.id;
    const dragPosClass = isDragOver && dragPos ? `drop-${dragPos}` : "";
    const summary = subtaskSummary[t.id];
    const openRename = () => {
      setRenamingTask(t);
      setRenameValue(t.title);
    };
    return (
      <div
        key={t.id}
        className={`tl-task ${over ? "is-overdue-task" : ""} ${isDragOver ? "is-drag-over" : ""} ${dragPosClass}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", t.id);
          setDraggingId(t.id);
        }}
        onDragEnd={() => {
          setDraggingId(null);
          setDragOverId(null);
          setDragPos(null);
        }}
        onDragOver={(e) => handleDragOver(e, t.id)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, t.id)}
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest("input, textarea, button, select")) return;
          e.preventDefault();
          e.stopPropagation();
          setTaskMenu({ x: e.clientX, y: e.clientY, task: t });
        }}
      >
        <div className="tl-row">
          {sortBy === "manual" && (
            <GripVertical size={14} className="tl-drag-handle" style={{ color: "var(--text-2)", cursor: "grab" }} />
          )}
          <button
            className={`tl-check tl-main-check ${t.status === "completed" ? "is-done" : ""}`}
            title={t.status === "completed" ? "标记为未完成" : "标记为已完成"}
            aria-label={t.status === "completed" ? "标记为未完成" : "标记为已完成"}
            onClick={(e) => { e.stopPropagation(); void toggleTask(t.id); }}
          >
            {t.status === "completed" && <span className="tl-checkmark">✓</span>}
          </button>
          <span
            className={`tl-title ${t.status === "completed" ? "is-done-text" : ""}`}
            role="button"
            tabIndex={0}
            aria-label={`编辑任务：${t.title}`}
            onClick={openRename}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openRename();
              }
            }}
          >{t.title}</span>
          {listInfo && (
            <span
              className="tl-list-tag"
              style={{ color: listInfo.color, background: `${listInfo.color}1a`, borderColor: listInfo.color }}
            >
              {listInfo.name}
            </span>
          )}
          {t.priority > 0 && (
            <span className="tl-passive-priority" title={t.priority === 2 ? "高优先级" : "中优先级"}>
              <Flag size={12} style={{ color: PRIORITY_FLAG[t.priority] }} />
            </span>
          )}
          {summary?.total > 0 && (
            <span className="tl-subtask-summary" title="子任务完成进度">{summary.completed}/{summary.total}</span>
          )}
          {fmtDue(t)}
          <span className="tl-row-actions">
            <button
              className={`tl-act ${planningTaskId === t.id ? "is-active" : ""}`}
              title="安排日期"
              aria-label="安排日期"
              onClick={(e) => { e.stopPropagation(); onScheduleTask(t); }}
            ><CalendarDays size={15} /></button>
            <button
              className="tl-act"
              title="更多任务操作"
              aria-label="更多任务操作"
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setTaskMenu({ x: rect.right - 184, y: rect.bottom + 4, task: t });
              }}
            ><MoreHorizontal size={15} /></button>
          </span>
        </div>
        {subtaskTask?.id === t.id && (
          <div className="tl-subtask-popover-backdrop" onMouseDown={() => setSubtaskTask(null)}>
            <div className="tl-subtask-popover" onMouseDown={(e) => e.stopPropagation()}>
              <div className="tl-subtask-popover-head"><strong>子任务</strong><button className="tl-subtask-close" title="关闭子任务" aria-label="关闭子任务" onClick={() => setSubtaskTask(null)}>×</button></div>
              <SubtaskEditor task={t} onSummaryChange={(items) => setSubtaskSummary((current) => ({ ...current, [t.id]: { completed: items.filter((item) => item.completed).length, total: items.length } }))} />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="tasklist">
      <div className="tl-header">
        <h1 className="tl-title-h1">{title}</h1>
        <span className="tl-sub">{openTasks.length} 项未完成</span>
        <div className="tl-sort" ref={sortMenuRef}>
          <button
            className={`tl-sort-btn ${showSortMenu ? "is-active" : ""}`}
            onClick={() => setShowSortMenu((v) => !v)}
            title="排序"
            aria-label="排序"
          >
            <ArrowUpDown size={14} />
          </button>
          {showSortMenu && (
            <div className="tl-sort-menu">
              <button className={sortBy === "manual" ? "is-active" : ""} onClick={() => { setSortBy("manual"); setShowSortMenu(false); }}>
                手动排序
              </button>
              <button className={sortBy === "priority" ? "is-active" : ""} onClick={() => { setSortBy("priority"); setShowSortMenu(false); }}>
                按优先级
              </button>
              <button className={sortBy === "dueDate" ? "is-active" : ""} onClick={() => { setSortBy("dueDate"); setShowSortMenu(false); }}>
                按截止日期
              </button>
              <button className={sortBy === "createdAt" ? "is-active" : ""} onClick={() => { setSortBy("createdAt"); setShowSortMenu(false); }}>
                按创建时间
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="tl-quickadd">
        <Plus size={16} className="tl-quickadd-icon" />
        <input
          ref={quickAddInputRef}
          value={input}
          placeholder='添加任务，支持 "明天下午3点 交报告"'
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleAdd();
          }}
        />
        {view !== "list" && lists.length > 0 && (
          <select
            className="tl-list-select"
            value={selectedListId}
            onChange={(e) => setSelectedListId(e.target.value)}
            title="选择要添加到的清单"
          >
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        <button className="tl-addbtn" disabled={!input.trim()} onClick={() => void handleAdd()}>
          添加
        </button>
      </div>

      {view === "list" && (
        <div className="tl-hint">💡 拖动任务到右侧日历可快速排期</div>
      )}

      <div className="tl-group">
        {openTasks.map(renderTask)}
        {openTasks.length === 0 && <div className="tl-empty">暂无任务，添加一条吧 ✨</div>}
      </div>

      {doneTasks.length > 0 && (
        <div className="tl-group tl-done-group">
          <button className="tl-done-toggle" onClick={() => setShowCompleted((v) => !v)}>
            {showCompleted ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            已完成 {doneTasks.length}
          </button>
          {showCompleted && doneTasks.map(renderTask)}
        </div>
      )}

      {taskMenu && (
        <ContextMenu
          x={taskMenu.x}
          y={taskMenu.y}
          title={taskMenu.task.title}
          items={buildTaskMenuItems(taskMenu.task)}
          onClose={() => setTaskMenu(null)}
        />
      )}

      {renamingTask && (
        <div className="ctx-backdrop" onClick={() => setRenamingTask(null)}>
          <div className="ctx-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="ctx-dialog-title">重命名任务</div>
            <input
              autoFocus
              className="ctx-dialog-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && renameValue.trim()) {
                  void updateTask(renamingTask.id, { title: renameValue.trim() });
                  setRenamingTask(null);
                }
                if (e.key === "Escape") setRenamingTask(null);
              }}
            />
            <div className="ctx-dialog-actions">
              <button className="ctx-dialog-cancel" onClick={() => setRenamingTask(null)}>取消</button>
              <button
                className="ctx-dialog-save"
                disabled={!renameValue.trim()}
                onClick={() => {
                  void updateTask(renamingTask.id, { title: renameValue.trim() });
                  setRenamingTask(null);
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
