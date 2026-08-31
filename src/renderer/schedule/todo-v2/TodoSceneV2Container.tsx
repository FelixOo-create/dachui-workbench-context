import { useEffect, useMemo, useState } from "react";
import { Bell, CalendarDays, Check, ListChecks, X } from "lucide-react";
import { api } from "../api";
import { useAppStore } from "../store";
import type { Priority, Subtask, Task } from "../types";
import { addDateDays, filterTodoTasks, sortTodoTasks, type TodoSort, type TodoView } from "./selectors";
import TodoSceneV2, { type TodoCalendarMode } from "./TodoSceneV2";
import {
  buildReorderPatches,
  buildTaskDatePatch,
  buildTaskEditPatch,
  buildTodoCreateInput,
  executeTodoMutation,
} from "./production";

function localDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function storedValue<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = window.localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function SubtaskDialog({ task, onClose, onError, onChanged }: {
  task: Task;
  onClose: () => void;
  onError: (message: string) => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<Subtask[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const result = await executeTodoMutation(() => api.subtasks.byTask(task.id), "无法加载子任务");
    if (result.ok) setItems(result.value);
    else onError(result.message);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [task.id]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const add = async () => {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    const result = await executeTodoMutation(() => api.subtasks.create(task.id, nextTitle), "无法添加子任务");
    if (!result.ok) return onError(result.message);
    setTitle("");
    await load();
    onChanged();
  };

  const toggle = async (item: Subtask) => {
    const result = await executeTodoMutation(() => api.subtasks.update(item.id, { completed: !item.completed }), "无法更新子任务");
    if (!result.ok) return onError(result.message);
    await load();
    onChanged();
  };

  return (
    <div className="t2-dialog-backdrop" onMouseDown={onClose}>
      <section className="t2-dialog t2-subtask-dialog" role="dialog" aria-modal="true" aria-label={`管理 ${task.title} 的子任务`} onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span className="t2-eyebrow">SUBTASKS</span><h3>{task.title}</h3></div><button type="button" aria-label="关闭子任务" onClick={onClose}><X size={16} /></button></header>
        <div className="t2-subtask-items">
          {loading ? <p>正在加载…</p> : items.length ? items.map((item) => (
            <button type="button" key={item.id} onClick={() => void toggle(item)}><span className={item.completed ? "checked" : ""}>{item.completed && <Check size={12} />}</span><b className={item.completed ? "done" : ""}>{item.title}</b></button>
          )) : <p>还没有子任务。</p>}
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void add(); }}><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="添加子任务…" /><button type="submit" disabled={!title.trim()}>添加</button></form>
      </section>
    </div>
  );
}

function TaskEditDialog({ task, lists, onClose, onSave }: {
  task: Task;
  lists: ReturnType<typeof useAppStore.getState>["lists"];
  onClose: () => void;
  onSave: (patch: Partial<Task>) => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [listId, setListId] = useState(task.listId ?? "list-default");
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [dueTime, setDueTime] = useState(task.dueTime ?? "");
  const [reminder, setReminder] = useState(task.reminderMinutes === null ? "" : String(task.reminderMinutes));
  const [priority, setPriority] = useState<Priority>(task.priority);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const save = async () => {
    if (!title.trim()) return;
    await onSave(buildTaskEditPatch({
      title,
      listId: listId || null,
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      reminderMinutes: reminder === "" ? null : Number(reminder),
      priority,
    }));
  };

  return (
    <div className="t2-dialog-backdrop" onMouseDown={onClose}>
      <section className="t2-dialog" role="dialog" aria-modal="true" aria-label={`编辑任务 ${task.title}`} onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span className="t2-eyebrow">EDIT TASK</span><h3>编辑任务</h3></div><button type="button" aria-label="关闭编辑" onClick={onClose}><X size={16} /></button></header>
        <label><span>任务名称</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <div className="t2-dialog-grid">
          <label><span>清单</span><select value={listId} onChange={(event) => setListId(event.target.value)}>{lists.map((list) => <option value={list.id} key={list.id}>{list.name}</option>)}</select></label>
          <label><span>优先级</span><select value={priority} onChange={(event) => setPriority(Number(event.target.value) as Priority)}><option value={0}>低</option><option value={1}>中</option><option value={2}>高</option></select></label>
          <label><span>日期</span><input type="date" value={dueDate} onChange={(event) => { setDueDate(event.target.value); if (!event.target.value) { setDueTime(""); setReminder(""); } }} /></label>
          <label><span>时间</span><input type="time" value={dueTime} disabled={!dueDate} onChange={(event) => setDueTime(event.target.value)} /></label>
          <label><span>提醒</span><select value={reminder} disabled={!dueDate} onChange={(event) => setReminder(event.target.value)}><option value="">不提醒</option><option value="0">准时</option><option value="10">提前 10 分钟</option><option value="30">提前 30 分钟</option><option value="60">提前 1 小时</option></select></label>
        </div>
        <footer><button type="button" onClick={onClose}>取消</button><button className="primary" type="button" disabled={!title.trim()} onClick={() => void save()}>保存</button></footer>
      </section>
    </div>
  );
}

export default function TodoSceneV2Container() {
  const todayDate = localDate();
  const { tasks, lists, events, addTask, toggleTask, updateTask, deleteTask } = useAppStore();
  const [selectedView, setSelectedView] = useState<TodoView>(() => storedValue("workbench.todo.v2.view", ["today", "tomorrow", "planned", "inbox", "all", "completed", "list"] as const, "today"));
  const [selectedListId, setSelectedListId] = useState<string | null>(() => { try { return window.localStorage.getItem("workbench.todo.v2.list"); } catch { return null; } });
  const [selectedDate, setSelectedDate] = useState(() => { try { return window.localStorage.getItem("workbench.todo.v2.date") || todayDate; } catch { return todayDate; } });
  const [schedulingTaskId, setSchedulingTaskId] = useState<string | null>(null);
  const [calendarMode, setCalendarMode] = useState<TodoCalendarMode>(() => storedValue("workbench.todo.v2.calendar", ["month", "week", "day"] as const, "month"));
  const [sortMode, setSortMode] = useState<TodoSort>(() => storedValue("workbench.todo.v2.sort", ["list", "priority", "time"] as const, "list"));
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [subtaskTaskId, setSubtaskTaskId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem("workbench.todo.v2.view", selectedView);
      window.localStorage.setItem("workbench.todo.v2.date", selectedDate);
      window.localStorage.setItem("workbench.todo.v2.calendar", calendarMode);
      window.localStorage.setItem("workbench.todo.v2.sort", sortMode);
      if (selectedListId) window.localStorage.setItem("workbench.todo.v2.list", selectedListId);
      else window.localStorage.removeItem("workbench.todo.v2.list");
    } catch { /* 禁用本地存储时仍保持当前会话可用。 */ }
  }, [calendarMode, selectedDate, selectedListId, selectedView, sortMode]);

  useEffect(() => {
    if (selectedView === "list" && !lists.some((list) => list.id === selectedListId)) {
      setSelectedListId(lists[0]?.id ?? null);
    }
  }, [lists, selectedListId, selectedView]);

  useEffect(() => {
    if (schedulingTaskId && !tasks.some((task) => task.id === schedulingTaskId && task.status === "open")) setSchedulingTaskId(null);
    if (editingTaskId && !tasks.some((task) => task.id === editingTaskId)) setEditingTaskId(null);
    if (subtaskTaskId && !tasks.some((task) => task.id === subtaskTaskId)) setSubtaskTaskId(null);
  }, [editingTaskId, schedulingTaskId, subtaskTaskId, tasks]);

  const visibleTasks = useMemo(
    () => sortTodoTasks(filterTodoTasks(tasks, selectedView, selectedListId, selectedDate, todayDate), sortMode, lists),
    [lists, selectedDate, selectedListId, selectedView, sortMode, tasks, todayDate],
  );
  const visibleIds = visibleTasks.map((task) => task.id).join("|");

  const refreshVisibleSubtasks = async () => {
    const ids = visibleIds ? visibleIds.split("|") : [];
    const result = await executeTodoMutation(() => Promise.all(ids.map((id) => api.subtasks.byTask(id))), "无法加载子任务摘要");
    if (result.ok) setSubtasks(result.value.flat());
  };

  useEffect(() => { void refreshVisibleSubtasks(); }, [visibleIds]);

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setError(null);
    const result = await executeTodoMutation(action, fallback);
    if (!result.ok) setError(result.message);
    return result.ok;
  };

  const selectView = (view: TodoView) => {
    setSelectedView(view);
    if (view === "today") setSelectedDate(todayDate);
    if (view === "tomorrow") setSelectedDate(addDateDays(todayDate, 1));
  };

  const editingTask = tasks.find((task) => task.id === editingTaskId) ?? null;
  const subtaskTask = tasks.find((task) => task.id === subtaskTaskId) ?? null;

  return (
    <div className="todo-v2-production">
      {error && <div className="t2-error" role="alert"><span>{error}</span><button type="button" aria-label="关闭错误提示" onClick={() => setError(null)}><X size={14} /></button></div>}
      <TodoSceneV2
        tasks={tasks}
        lists={lists}
        events={events}
        subtasks={subtasks}
        selectedView={selectedView}
        selectedListId={selectedListId}
        selectedDate={selectedDate}
        todayDate={todayDate}
        schedulingTaskId={schedulingTaskId}
        calendarMode={calendarMode}
        sortMode={sortMode}
        onCreateTask={async (rawTitle, listId, dueDate) => {
          const input = buildTodoCreateInput(rawTitle, listId, dueDate);
          if (input) await run(() => addTask(input).then(() => undefined), "无法创建任务");
        }}
        onToggleTask={async (taskId) => { await run(() => toggleTask(taskId), "无法更新完成状态"); }}
        onUpdateTask={async (taskId, patch) => { await run(() => updateTask(taskId, patch), "无法更新任务"); }}
        onDeleteTask={async (taskId) => { if (window.confirm("确定删除这项任务吗？")) await run(() => deleteTask(taskId), "无法删除任务"); }}
        onEditTask={setEditingTaskId}
        onSelectView={selectView}
        onSelectList={(listId) => { setSelectedListId(listId); setSelectedView("list"); }}
        onSelectedDateChange={setSelectedDate}
        onSchedulingTaskChange={(taskId) => { setSchedulingTaskId(taskId); if (taskId) setCalendarMode("month"); }}
        onAssignTaskDate={async (taskId, date) => { await run(() => updateTask(taskId, buildTaskDatePatch(date)), "无法安排任务日期"); }}
        onPriorityChange={async (taskId, priority) => { await run(() => updateTask(taskId, { priority }), "无法更新优先级"); }}
        onManageSubtasks={setSubtaskTaskId}
        onMoveTaskToList={async (taskId, listId) => { await run(() => updateTask(taskId, { listId }), "无法移动任务"); }}
        onCalendarModeChange={setCalendarMode}
        onSortModeChange={setSortMode}
        onReorderTask={async (sourceId, targetId) => {
          const patches = buildReorderPatches(visibleTasks, sourceId, targetId);
          await run(async () => { for (const patch of patches) await updateTask(patch.id, { sortOrder: patch.sortOrder }); }, "无法保存任务排序");
        }}
      />
      {editingTask && <TaskEditDialog task={editingTask} lists={lists} onClose={() => setEditingTaskId(null)} onSave={async (patch) => { if (await run(() => updateTask(editingTask.id, patch), "无法保存任务")) setEditingTaskId(null); }} />}
      {subtaskTask && <SubtaskDialog task={subtaskTask} onClose={() => setSubtaskTaskId(null)} onError={setError} onChanged={() => void refreshVisibleSubtasks()} />}
    </div>
  );
}
