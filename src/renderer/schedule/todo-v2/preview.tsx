import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Bell, BookOpen, CheckSquare, Clock3, Grid2X2, Home, Search, Settings2, Sparkles, Wrench } from "lucide-react";
import type { Priority, SmartView, Subtask, Task } from "../types";
import TodoSceneV2, { type TodoCalendarMode } from "./TodoSceneV2";
import { scheduleTaskForDate, type TodoSort, type TodoView } from "./selectors";
import { TODO_V2_FIXTURE_DATE, todoV2Events, todoV2Lists, todoV2Subtasks, todoV2Tasks } from "./fixture";
import "../../../../docs/视觉参考/todo-v2-react-preview/preview.css";

const params = new URLSearchParams(window.location.search);
const initialTasks = params.get("state") === "empty" ? [] : todoV2Tasks.map((task) => ({ ...task }));

function TodoV2Preview() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [subtasks, setSubtasks] = useState<Subtask[]>(todoV2Subtasks.map((subtask) => ({ ...subtask })));
  const [view, setView] = useState<TodoView>("today");
  const [listId, setListId] = useState<string | null>(null);
  const [date, setDate] = useState(TODO_V2_FIXTURE_DATE);
  const [schedulingTaskId, setSchedulingTaskId] = useState<string | null>(params.get("state") === "scheduling" ? "task-iteration" : null);
  const [calendarMode, setCalendarMode] = useState<TodoCalendarMode>("month");
  const [sortMode, setSortMode] = useState<TodoSort>("list");
  const [notice, setNotice] = useState("");

  const updateTask = (taskId: string, patch: Partial<Task>) => setTasks((current) => current.map((task) => task.id === taskId ? { ...task, ...patch, updatedAt: new Date().toISOString() } : task));

  return (
    <main className="t2-preview-shell">
      <header className="t2-preview-topbar">
        <div className="t2-preview-context"><span />上海 <small>22° 多云</small><i /><Clock3 size={15} />8月30日 <small>星期日</small><strong>15:24</strong></div>
        <nav aria-label="场景导航"><button><Home size={15} />今日</button><button className="active"><CheckSquare size={15} />待办</button><button><Clock3 size={15} />时间块</button><button><Sparkles size={15} />习惯</button><button><BookOpen size={15} />记录册</button></nav>
        <div className="t2-preview-actions"><button><Search size={16} /></button><button><Bell size={16} /></button><span>REACT V2</span></div>
      </header>
      <div className="t2-preview-stage">
        <TodoSceneV2
          tasks={tasks}
          lists={todoV2Lists}
          events={todoV2Events}
          subtasks={subtasks}
          selectedView={view}
          selectedListId={listId}
          selectedDate={date}
          todayDate={TODO_V2_FIXTURE_DATE}
          schedulingTaskId={schedulingTaskId}
          calendarMode={calendarMode}
          sortMode={sortMode}
          initialOpenMenuTaskId={params.get("state") === "menu" ? "task-iteration" : null}
          onCreateTask={(title, nextListId, dueDate) => setTasks((current) => [...current, {
            ...todoV2Tasks[0], id: `preview-${Date.now()}`, title, listId: nextListId, dueDate, dueTime: null, priority: 0,
            status: "open", completedAt: null, reminderMinutes: null, sortOrder: current.length,
          }])}
          onToggleTask={(taskId) => setTasks((current) => current.map((task) => task.id === taskId ? { ...task, status: task.status === "open" ? "completed" : "open", completedAt: task.status === "open" ? new Date().toISOString() : null } : task))}
          onUpdateTask={updateTask}
          onDeleteTask={(taskId) => setTasks((current) => current.filter((task) => task.id !== taskId))}
          onEditTask={(taskId) => setNotice(`已打开“${tasks.find((task) => task.id === taskId)?.title}”编辑入口（预览内存态）`)}
          onSelectView={(next: SmartView) => { setView(next); setListId(null); }}
          onSelectList={(nextListId) => { setView("list"); setListId(nextListId); }}
          onSelectedDateChange={(nextDate) => { setDate(nextDate); setView("today"); setListId(null); }}
          onSchedulingTaskChange={setSchedulingTaskId}
          onAssignTaskDate={(taskId, nextDate) => setTasks((current) => scheduleTaskForDate(current, taskId, nextDate))}
          onPriorityChange={(taskId, priority: Priority) => updateTask(taskId, { priority })}
          onManageSubtasks={(taskId) => { setSubtasks((current) => current.some((subtask) => subtask.taskId === taskId) ? current : [...current, { id: `sub-${Date.now()}`, taskId, title: "预览子任务", completed: false, sortOrder: 0 }]); setNotice("子任务入口已响应"); }}
          onMoveTaskToList={(taskId, nextListId) => updateTask(taskId, { listId: nextListId })}
          onCalendarModeChange={setCalendarMode}
          onSortModeChange={setSortMode}
          onReorderTask={(taskId, targetTaskId) => setTasks((current) => {
            const from = current.findIndex((task) => task.id === taskId); const to = current.findIndex((task) => task.id === targetTaskId);
            if (from < 0 || to < 0) return current; const next = [...current]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); return next.map((task, index) => ({ ...task, sortOrder: index }));
          })}
        />
      </div>
      {notice && <button className="t2-preview-toast" type="button" onClick={() => setNotice("")}>{notice}</button>}
      <footer className="t2-preview-dock"><button><Grid2X2 size={16} />全部工具</button><i /><button className="active"><span>B</span>书签</button><button><span className="red">R</span>RedNote</button><button><span className="amber">T</span>Tooler</button><button><span className="green">C</span>Check</button><b /><button><Wrench size={15} />工具</button><button><Settings2 size={15} />设置</button><time><strong>15:24</strong><small>8/30 周日</small></time></footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<TodoV2Preview />);
