import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock3,
  GripVertical,
  Home,
  ListChecks,
  ListTodo,
  MoreHorizontal,
  MoveRight,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { CalendarEvent, List as TodoList, Priority, SmartView, Subtask, Task } from "../types";
import {
  addDateDays,
  buildMonthDays,
  filterTodoTasks,
  groupTodoTasks,
  smartViewCounts,
  sortTodoTasks,
  tasksAndEventsForDate,
  type TodoSort,
  type TodoView,
} from "./selectors";
import "./TodoSceneV2.css";

export type TodoCalendarMode = "month" | "week" | "day";

export interface TodoSceneV2Props {
  tasks: Task[];
  lists: TodoList[];
  events: CalendarEvent[];
  subtasks?: Subtask[];
  selectedView: TodoView;
  selectedListId: string | null;
  selectedDate: string;
  todayDate: string;
  schedulingTaskId: string | null;
  calendarMode: TodoCalendarMode;
  sortMode: TodoSort;
  initialOpenMenuTaskId?: string | null;
  onCreateTask?: (title: string, listId: string | null, dueDate: string) => void | Promise<void>;
  onToggleTask?: (taskId: string) => void | Promise<void>;
  onUpdateTask?: (taskId: string, patch: Partial<Task>) => void | Promise<void>;
  onDeleteTask?: (taskId: string) => void | Promise<void>;
  onEditTask?: (taskId: string) => void;
  onSelectView?: (view: SmartView) => void;
  onSelectList?: (listId: string) => void;
  onSelectedDateChange?: (date: string) => void;
  onSchedulingTaskChange?: (taskId: string | null) => void;
  onAssignTaskDate?: (taskId: string, date: string) => void | Promise<void>;
  onPriorityChange?: (taskId: string, priority: Priority) => void | Promise<void>;
  onManageSubtasks?: (taskId: string) => void;
  onMoveTaskToList?: (taskId: string, listId: string | null) => void | Promise<void>;
  onCalendarModeChange?: (mode: TodoCalendarMode) => void;
  onSortModeChange?: (sort: TodoSort) => void;
  onReorderTask?: (taskId: string, targetTaskId: string) => void | Promise<void>;
}

const SMART_VIEWS: Array<{ id: SmartView; label: string; icon: typeof Home }> = [
  { id: "today", label: "今天", icon: Home },
  { id: "tomorrow", label: "明天", icon: CalendarDays },
  { id: "planned", label: "已计划", icon: Clock3 },
  { id: "all", label: "全部", icon: ListTodo },
  { id: "completed", label: "已完成", icon: CircleCheck },
];

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const PRIORITY_LABEL: Record<Priority, string> = { 0: "低", 1: "中", 2: "高" };

function displayDate(date: string, withYear = false): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("zh-CN", {
    ...(withYear ? { year: "numeric" as const } : {}),
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "UTC",
  }).format(value);
}

function displayMonth(date: string): string {
  const value = new Date(`${date.slice(0, 7)}-01T00:00:00.000Z`);
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", timeZone: "UTC" }).format(value);
}

function stop(event: MouseEvent): void {
  event.stopPropagation();
}

export default function TodoSceneV2({
  tasks,
  lists,
  events,
  subtasks = [],
  selectedView,
  selectedListId,
  selectedDate,
  todayDate,
  schedulingTaskId,
  calendarMode,
  sortMode,
  initialOpenMenuTaskId = null,
  onCreateTask,
  onToggleTask,
  onUpdateTask,
  onDeleteTask,
  onEditTask,
  onSelectView,
  onSelectList,
  onSelectedDateChange,
  onSchedulingTaskChange,
  onAssignTaskDate,
  onPriorityChange,
  onManageSubtasks,
  onMoveTaskToList,
  onCalendarModeChange,
  onSortModeChange,
  onReorderTask,
}: TodoSceneV2Props) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [openMenuTaskId, setOpenMenuTaskId] = useState<string | null>(initialOpenMenuTaskId);
  const [monthCursor, setMonthCursor] = useState(selectedDate);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  useEffect(() => setMonthCursor(selectedDate), [selectedDate]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenMenuTaskId(null);
      setSearchOpen(false);
      onSchedulingTaskChange?.(null);
    };
    const onPointerDown = () => setOpenMenuTaskId(null);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onSchedulingTaskChange]);

  const viewCounts = useMemo(() => smartViewCounts(tasks, todayDate), [tasks, todayDate]);
  const visibleTasks = useMemo(() => {
    const filtered = filterTodoTasks(tasks, selectedView, selectedListId, selectedDate, todayDate)
      .filter((task) => !query.trim() || task.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
    return sortTodoTasks(filtered, sortMode, lists);
  }, [lists, query, selectedDate, selectedListId, selectedView, sortMode, tasks, todayDate]);
  const groups = useMemo(() => groupTodoTasks(visibleTasks), [visibleTasks]);
  const monthDays = useMemo(() => buildMonthDays(monthCursor), [monthCursor]);
  const selectedSummary = useMemo(() => tasksAndEventsForDate(tasks, events, selectedDate), [events, selectedDate, tasks]);
  const schedulingTask = tasks.find((task) => task.id === schedulingTaskId) ?? null;
  const completedForSelectedDate = tasks.filter((task) => task.status === "completed" && task.dueDate === selectedDate).length;
  const selectedList = lists.find((list) => list.id === selectedListId) ?? null;

  const submitQuickTask = (event: FormEvent) => {
    event.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;
    void onCreateTask?.(title, selectedView === "list" ? selectedListId : null, selectedDate);
    setQuickTitle("");
  };

  const selectCalendarDate = (date: string) => {
    if (schedulingTaskId) {
      void onAssignTaskDate?.(schedulingTaskId, date);
      onSchedulingTaskChange?.(null);
    }
    onSelectedDateChange?.(date);
  };

  const shiftMonth = (amount: number) => {
    const cursor = new Date(`${monthCursor.slice(0, 7)}-01T00:00:00.000Z`);
    cursor.setUTCMonth(cursor.getUTCMonth() + amount);
    setMonthCursor(cursor.toISOString().slice(0, 10));
  };

  const calendarTaskDates = new Set(tasks.filter((task) => task.dueDate).map((task) => task.dueDate as string));
  const calendarEventDates = new Set(events.map((event) => event.startAt.slice(0, 10)));

  return (
    <section className="todo-v2-root" aria-label="待办工作台">
      <header className="t2-scene-heading">
        <div><span className="t2-eyebrow">TASK WORKSPACE</span><h1>待办</h1><p>今天、清单与右侧月历保持在同一工作区</p></div>
        <div className="t2-heading-actions">
          {searchOpen ? (
            <label className="t2-search-field"><Search size={15} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务" /><button type="button" aria-label="关闭搜索" onClick={() => { setSearchOpen(false); setQuery(""); }}><X size={14} /></button></label>
          ) : <button className="t2-ghost-button" type="button" onClick={() => setSearchOpen(true)}><Search size={15} />搜索</button>}
          <button className="t2-primary-button" type="button" onClick={() => document.querySelector<HTMLInputElement>(".t2-quick-entry input")?.focus()}><Plus size={16} />新建任务</button>
        </div>
      </header>

      <section className="t2-layout">
        <aside className="t2-panel t2-sidebar">
          <header className="t2-panel-title"><span>视图</span><MoreHorizontal size={16} /></header>
          <nav className="t2-side-menu" aria-label="智能视图">
            {SMART_VIEWS.map(({ id, label, icon: Icon }) => (
              <button className={selectedView === id ? "active" : ""} type="button" key={id} onClick={() => onSelectView?.(id)}>
                <Icon size={15} /><span>{label}</span><b>{viewCounts[id] || ""}</b>
              </button>
            ))}
          </nav>
          <section className="t2-side-section">
            <header><span>我的清单</span><Plus size={14} /></header>
            {lists.map((list) => (
              <button className={selectedView === "list" && selectedListId === list.id ? "active" : ""} type="button" key={list.id} onClick={() => onSelectList?.(list.id)}>
                <i style={{ backgroundColor: list.color }} /><span>{list.name}</span><b>{tasks.filter((task) => task.status === "open" && task.listId === list.id).length}</b>
              </button>
            ))}
          </section>
          <footer><span /><small>所有更改已保存</small></footer>
        </aside>

        <main className="t2-panel t2-task-panel">
          <header className="t2-content-toolbar">
            <div><span className="t2-eyebrow">{selectedView === "list" ? "MY LIST" : selectedView.toUpperCase()}</span><h2>{selectedList?.name ?? displayDate(selectedDate)}</h2></div>
            <div className="t2-segmented" aria-label="任务排序">
              {(["list", "priority", "time"] as TodoSort[]).map((mode) => <button className={sortMode === mode ? "active" : ""} type="button" key={mode} onClick={() => onSortModeChange?.(mode)}>{mode === "list" ? "列表" : mode === "priority" ? "优先级" : "时间"}</button>)}
            </div>
          </header>

          <form className="t2-quick-entry" onSubmit={submitQuickTask}><Plus size={16} /><input value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} placeholder="快速记录一项待办…" /><button type="submit" aria-label="添加任务">Enter</button></form>

          <div className="t2-task-scroll">
            {groups.length ? groups.map((group) => (
              <section className="t2-task-group" key={group.id}>
                <header><span>{group.label}</span><b>{group.tasks.length} 项</b></header>
                {group.tasks.map((task) => {
                  const list = lists.find((item) => item.id === task.listId);
                  const taskSubtasks = subtasks.filter((subtask) => subtask.taskId === task.id);
                  return (
                    <article
                      className={`t2-task-row${task.status === "completed" ? " is-completed" : ""}${schedulingTaskId === task.id ? " is-scheduling" : ""}`}
                      key={task.id}
                      onClick={() => onEditTask?.(task.id)}
                      onDragOver={(event) => { if (draggingTaskId) event.preventDefault(); }}
                      onDrop={() => { if (draggingTaskId && draggingTaskId !== task.id) void onReorderTask?.(draggingTaskId, task.id); setDraggingTaskId(null); }}
                    >
                      <button className="t2-drag-handle" type="button" draggable aria-label={`拖动 ${task.title}`} onDragStart={() => setDraggingTaskId(task.id)} onDragEnd={() => setDraggingTaskId(null)} onClick={stop}><GripVertical size={15} /></button>
                      <button className="t2-task-check" type="button" aria-label={task.status === "completed" ? `取消完成 ${task.title}` : `完成 ${task.title}`} onClick={(event) => { stop(event); void onToggleTask?.(task.id); }}>{task.status === "completed" && <Check size={13} />}</button>
                      <div className="t2-task-copy"><strong>{task.title}</strong><small>{task.priority > 0 && <i className={`priority p${task.priority}`} />}{list?.name ?? "未分类"}{taskSubtasks.length > 0 && <span>· {taskSubtasks.filter((item) => item.completed).length}/{taskSubtasks.length} 个子任务</span>}</small></div>
                      <time>{task.dueTime ?? (task.dueDate && task.dueDate !== selectedDate ? task.dueDate.slice(5).replace("-", "/") : "待安排")}</time>
                      <button className="t2-row-action" data-active={schedulingTaskId === task.id || undefined} type="button" aria-label={`安排 ${task.title} 日期`} title="安排日期" onClick={(event) => { stop(event); onSchedulingTaskChange?.(schedulingTaskId === task.id ? null : task.id); }}><CalendarDays size={15} /></button>
                      <div className="t2-menu-wrap" onPointerDown={stop} onClick={stop}>
                        <button className="t2-row-action" type="button" aria-label={`${task.title} 更多操作`} aria-expanded={openMenuTaskId === task.id} onClick={() => setOpenMenuTaskId(openMenuTaskId === task.id ? null : task.id)}><MoreHorizontal size={16} /></button>
                        {openMenuTaskId === task.id && (
                          <div className="t2-task-menu" role="menu">
                            <section><span>设置优先级</span><div>{([0, 1, 2] as Priority[]).map((priority) => <button className={task.priority === priority ? "active" : ""} type="button" key={priority} onClick={() => { void onPriorityChange?.(task.id, priority); setOpenMenuTaskId(null); }}>{PRIORITY_LABEL[priority]}</button>)}</div></section>
                            <section><span>{task.dueDate ? "设置提醒" : "提醒（先设置日期）"}</span><div>{[{ value: null, label: "关闭" }, { value: 0, label: "准时" }, { value: 10, label: "10分" }, { value: 30, label: "30分" }].map((option) => <button className={task.reminderMinutes === option.value ? "active" : ""} disabled={!task.dueDate} type="button" key={option.label} onClick={() => { void onUpdateTask?.(task.id, { reminderMinutes: option.value }); setOpenMenuTaskId(null); }}>{option.label}</button>)}</div></section>
                            <button type="button" role="menuitem" onClick={() => { onManageSubtasks?.(task.id); setOpenMenuTaskId(null); }}><ListChecks size={14} />{taskSubtasks.length ? `查看子任务（${taskSubtasks.length}）` : "添加子任务"}</button>
                            <div className="t2-menu-lists"><span>移动到清单</span>{lists.map((item) => <button type="button" key={item.id} onClick={() => { void onMoveTaskToList?.(task.id, item.id); setOpenMenuTaskId(null); }}><i style={{ backgroundColor: item.color }} />{item.name}<MoveRight size={12} /></button>)}</div>
                            <button className="danger" type="button" role="menuitem" onClick={() => { void onDeleteTask?.(task.id); setOpenMenuTaskId(null); }}><Trash2 size={14} />删除任务</button>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </section>
            )) : (
              <div className="t2-empty"><span><ListChecks size={23} /></span><h3>{query ? "没有匹配的任务" : "这里暂时没有任务"}</h3><p>三栏工作区仍会保留。可以快速记录一项待办，或从右侧日历选择其他日期。</p><button className="t2-ghost-button" type="button" onClick={() => document.querySelector<HTMLInputElement>(".t2-quick-entry input")?.focus()}><Plus size={14} />记录任务</button></div>
            )}
          </div>
          <footer className="t2-inline-note"><span /><small>{selectedDate === todayDate ? `今天已完成 ${completedForSelectedDate} 项` : `${displayDate(selectedDate)}的任务`}</small><b>{tasks.length ? `${Math.round((tasks.filter((task) => task.status === "completed").length / tasks.length) * 100)}%` : "0%"}</b></footer>
        </main>

        <aside className={`t2-panel t2-calendar-panel${schedulingTask ? " is-scheduling" : ""}`}>
          <header className="t2-content-toolbar"><div><span className="t2-eyebrow">SCHEDULE</span><h2>日历</h2></div><div className="t2-segmented compact">{(["month", "week", "day"] as TodoCalendarMode[]).map((mode) => <button className={calendarMode === mode ? "active" : ""} type="button" key={mode} onClick={() => onCalendarModeChange?.(mode)}>{mode === "month" ? "月" : mode === "week" ? "周" : "日"}</button>)}</div></header>
          {schedulingTask && <div className="t2-scheduling-banner"><CalendarDays size={14} /><span>正在安排：<b>{schedulingTask.title}</b><small>点击日期完成排期</small></span><button type="button" aria-label="退出排期" onClick={() => onSchedulingTaskChange?.(null)}><X size={14} /></button></div>}
          <div className={`t2-calendar-body mode-${calendarMode}`}>
            <div className="t2-month-control"><button type="button" aria-label="上个月" onClick={() => shiftMonth(-1)}><ChevronLeft size={15} /></button><strong>{displayMonth(monthCursor)}</strong><button type="button" aria-label="下个月" onClick={() => shiftMonth(1)}><ChevronRight size={15} /></button></div>
            {calendarMode === "month" && <><div className="t2-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div><div className="t2-dates">{monthDays.map((day) => <button className={`${day.outside ? "outside " : ""}${day.date === selectedDate ? "selected " : ""}${calendarTaskDates.has(day.date) || calendarEventDates.has(day.date) ? "has-item " : ""}${draggingTaskId ? "drop-ready" : ""}`} type="button" key={day.date} onDragOver={(event) => { if (draggingTaskId) event.preventDefault(); }} onDrop={() => { if (draggingTaskId) { void onAssignTaskDate?.(draggingTaskId, day.date); setDraggingTaskId(null); onSelectedDateChange?.(day.date); } }} onClick={() => selectCalendarDate(day.date)}>{day.day}</button>)}</div></>}
            {calendarMode === "week" && <div className="t2-week-strip">{Array.from({ length: 7 }, (_, index) => addDateDays(selectedDate, index - 3)).map((date) => <button className={`${date === selectedDate ? "selected " : ""}${draggingTaskId ? "drop-ready" : ""}`} type="button" key={date} onDragOver={(event) => { if (draggingTaskId) event.preventDefault(); }} onDrop={() => { if (draggingTaskId) { void onAssignTaskDate?.(draggingTaskId, date); setDraggingTaskId(null); onSelectedDateChange?.(date); } }} onClick={() => selectCalendarDate(date)}><small>{WEEKDAYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7]}</small><b>{Number(date.slice(8))}</b></button>)}</div>}
            {calendarMode === "day" && <button className="t2-day-focus" type="button" onClick={() => selectCalendarDate(selectedDate)}><small>{displayMonth(selectedDate)}</small><strong>{Number(selectedDate.slice(8))}</strong><span>{displayDate(selectedDate)}</span></button>}
          </div>
          <section className="t2-schedule-list">
            <header><span>{displayDate(selectedDate)}</span><b>{selectedSummary.tasks.length + selectedSummary.events.length} 项</b></header>
            {selectedSummary.tasks.slice(0, 3).map((task) => <article key={task.id}><time>{task.dueTime ?? "任务"}</time><i className={`task p${task.priority}`} /><span><strong>{task.title}</strong><small>{lists.find((list) => list.id === task.listId)?.name ?? "未分类"}</small></span></article>)}
            {selectedSummary.events.slice(0, 3).map((event) => <article key={event.id}><time>{event.isAllDay ? "全天" : event.startAt.slice(11, 16)}</time><i style={{ backgroundColor: event.color }} /><span><strong>{event.title}</strong><small>{event.isAllDay ? "全天日程" : `${Math.max(0, Math.round((new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / 60000))} 分钟`}</small></span></article>)}
            {!selectedSummary.tasks.length && !selectedSummary.events.length && <p>这一天暂无任务或日程。</p>}
          </section>
        </aside>
      </section>
    </section>
  );
}
