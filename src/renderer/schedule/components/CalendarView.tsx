import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, List, CalendarDays, Clock, Pencil, Trash2 } from "lucide-react";
import { useAppStore } from "../store";
import type { Task, CalendarEvent } from "../types";
import {
  format, startOfMonth, startOfWeek, addDays, isSameMonth, isSameDay,
  startOfDay, addWeeks,
} from "date-fns";
import { zhCN } from "date-fns/locale";
import ContextMenu from "./ContextMenu";
import "./CalendarView.css";

export type CalendarMode = "month" | "week" | "day";

interface Props {
  mode: CalendarMode;
  onModeChange: (m: CalendarMode) => void;
  planningTask: Task | null;
  onExitPlanning: () => void;
  onDateSelect?: (date: string) => void;
}

const REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "不提醒" },
  { value: 0, label: "准时" },
  { value: 5, label: "提前 5 分钟" },
  { value: 10, label: "提前 10 分钟" },
  { value: 30, label: "提前 30 分钟" },
  { value: 60, label: "提前 1 小时" },
  { value: 1440, label: "提前 1 天" },
];

export default function CalendarView({ mode, onModeChange, planningTask, onExitPlanning, onDateSelect }: Props) {
  const { tasks, events, lists, updateTask, deleteEvent, updateEvent } = useAppStore();
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [eventMenu, setEventMenu] = useState<{ x: number; y: number; event: CalendarEvent } | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editAllDay, setEditAllDay] = useState(false);
  const [editColor, setEditColor] = useState("#737ba5");

  useEffect(() => {
    if (!planningTask) return;
    const key = planningTask.dueDate ?? format(new Date(), "yyyy-MM-dd");
    setAnchor(startOfDay(new Date(`${key}T00:00:00`)));
    setSelected(key);
    setAdding(false);
  }, [planningTask?.id]);

  useEffect(() => {
    if (!planningTask) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onExitPlanning();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [planningTask, onExitPlanning]);

  const listColor = (listId: string | null) =>
    lists.find((l) => l.id === listId)?.color ?? "#737ba5";

  const cells = useMemo(() => {
    if (mode === "month") {
      const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
      const days: Date[] = [];
      for (let i = 0; i < 42; i++) days.push(addDays(start, i));
      return days;
    }
    if (mode === "week") {
      const start = startOfWeek(anchor, { weekStartsOn: 1 });
      const days: Date[] = [];
      for (let i = 0; i < 7; i++) days.push(addDays(start, i));
      return days;
    }
    return [anchor];
  }, [anchor, mode]);

  const nav = (dir: -1 | 1) => {
    if (mode === "month") setAnchor((a) => addDays(a, dir * 31));
    else if (mode === "week") setAnchor((a) => addWeeks(a, dir));
    else setAnchor((a) => addDays(a, dir));
  };

  const title = useMemo(() => {
    if (mode === "month") return format(anchor, "yyyy年M月", { locale: zhCN });
    if (mode === "week") {
      const s = startOfWeek(anchor, { weekStartsOn: 1 });
      return `${format(s, "M/d")} - ${format(addDays(s, 6), "M/d")}`;
    }
    return format(anchor, "yyyy年M月d日 EEEE", { locale: zhCN });
  }, [anchor, mode]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.dueDate || t.status !== "open") continue;
      const arr = map.get(t.dueDate) ?? [];
      arr.push(t);
      map.set(t.dueDate, arr);
    }
    return map;
  }, [tasks]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const d = e.startAt.slice(0, 10);
      const arr = map.get(d) ?? [];
      arr.push(e);
      map.set(d, arr);
    }
    return map;
  }, [events]);

  const dayItems = (key: string) => ({
    tasks: tasksByDate.get(key) ?? [],
    events: eventsByDate.get(key) ?? [],
  });

  const onDrop = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent("task-drop-date", { detail: key }));
  };

  const selectDate = (key: string) => {
    setSelected(key);
    if (planningTask) void updateTask(planningTask.id, { dueDate: key });
    else onDateSelect?.(key);
  };

  const hourSlots = Array.from({ length: 24 }, (_, i) => i);

  const renderTaskChip = (t: Task) => (
    <div key={t.id} className="cal-chip is-task" style={{ background: `${listColor(t.listId)}1a`, color: listColor(t.listId) }}>
      <span className="cal-chip-time">{t.dueTime ?? "全天"}</span>
      <span className="cal-chip-title">{t.title}</span>
    </div>
  );

  const openEventEdit = (e: CalendarEvent) => {
    setEditingEvent(e);
    setEditTitle(e.title);
    setEditDate(e.startAt.slice(0, 10));
    setEditStart(e.isAllDay ? "09:00" : e.startAt.slice(11, 16));
    setEditEnd(e.isAllDay ? "10:00" : e.endAt.slice(11, 16));
    setEditAllDay(e.isAllDay);
    setEditColor(e.color);
  };

  const renderEventChip = (e: CalendarEvent) => (
    <div
      key={e.id}
      className="cal-chip is-event"
      style={{ background: `${e.color}1a`, color: e.color }}
      onContextMenu={(ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        setEventMenu({ x: ev.clientX, y: ev.clientY, event: e });
      }}
    >
      <span className="cal-chip-time">{e.isAllDay ? "全天" : e.startAt.slice(11, 16)}</span>
      <span className="cal-chip-title">{e.title}</span>
    </div>
  );

  const selectedKey = selected;
  const selectedData = selectedKey ? dayItems(selectedKey) : null;

  return (
    <aside className={`cal-panel ${planningTask ? "is-planning" : ""}`}>
      <div className="cal-head">
        <button title="上一个时间段" aria-label="上一个时间段" onClick={() => nav(-1)}><ChevronLeft size={15} /></button>
        <span className="cal-title">{title}</span>
        <button title="下一个时间段" aria-label="下一个时间段" onClick={() => nav(1)}><ChevronRight size={15} /></button>
      </div>

      <div className="cal-modes">
        <button className={`cal-mode ${mode === "month" ? "is-active" : ""}`} title="月视图" aria-label="月视图" onClick={() => onModeChange("month")}>
          <List size={12} /> 月
        </button>
        <button className={`cal-mode ${mode === "week" ? "is-active" : ""}`} title="周视图" aria-label="周视图" onClick={() => onModeChange("week")}>
          <CalendarDays size={12} /> 周
        </button>
        <button className={`cal-mode ${mode === "day" ? "is-active" : ""}`} title="日视图" aria-label="日视图" onClick={() => onModeChange("day")}>
          <Clock size={12} /> 日
        </button>
      </div>

      {mode === "month" || mode === "week" ? (
        <>
          <div className="cal-weekdays">
            {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
              <div key={w} className="cal-wd">{w}</div>
            ))}
          </div>
          <div className="cal-grid">
            {cells.map((d) => {
              const key = format(d, "yyyy-MM-dd");
              const data = dayItems(key);
              const isSel = selected === key;
              const isToday = isSameDay(d, new Date());
              return (
                <div
                  key={key}
                  className={`cal-cell ${mode === "month" && !isSameMonth(d, anchor) ? "is-other" : ""} ${isToday ? "is-today" : ""} ${isSel ? "is-selected" : ""}`}
                  onClick={() => selectDate(key)}
                  onDragOver={(e) => { e.preventDefault(); }}
                  onDrop={(e) => onDrop(e, key)}
                >
                  <span className="cal-num">{format(d, "d")}</span>
                  <div className="cal-cell-items">
                    {data.events.slice(0, 2).map(renderEventChip)}
                    {data.tasks.slice(0, 2).map(renderTaskChip)}
                    {(data.events.length + data.tasks.length) > 2 && (
                      <span className="cal-more">+{data.events.length + data.tasks.length - 2}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="cal-dayview">
          {hourSlots.map((h) => {
            const hh = String(h).padStart(2, "0");
            const key = `${format(anchor, "yyyy-MM-dd")}T${hh}:`;
            const dayItemsForHour = (selectedKey ?? format(anchor, "yyyy-MM-dd")) === format(anchor, "yyyy-MM-dd")
              ? (dayItems(format(anchor, "yyyy-MM-dd")).tasks.filter((t) => (t.dueTime ?? "").startsWith(hh)))
              : [];
            const evForHour = dayItems(format(anchor, "yyyy-MM-dd")).events.filter((e) =>
              !e.isAllDay && e.startAt.slice(11, 13) === hh
            );
            return (
                 <div key={key} className="cal-hour-row" onClick={() => selectDate(format(anchor, "yyyy-MM-dd"))}>
                <span className="cal-hour-label">{h}:00</span>
                <div className="cal-hour-cell">
                  {evForHour.map(renderEventChip)}
                  {dayItemsForHour.map(renderTaskChip)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="cal-detail">
        {planningTask ? (
          <div className="cal-planning-detail">
            <div className="cal-planning-title">正在为《{planningTask.title}》选择日期</div>
            <div className="cal-planning-date">{planningTask.dueDate ? format(new Date(`${planningTask.dueDate}T00:00:00`), "yyyy年M月d日 EEEE", { locale: zhCN }) : "尚未选择日期"}</div>
            <label className="cal-planning-field"><span>时间</span><input type="time" disabled={!planningTask.dueDate} value={planningTask.dueTime ?? ""} onChange={(event) => void updateTask(planningTask.id, { dueTime: event.target.value || null })} /></label>
            <label className="cal-planning-field"><span>提醒</span><select disabled={!planningTask.dueDate} value={String(planningTask.reminderMinutes ?? "")} onChange={(event) => { const value = event.target.value; void updateTask(planningTask.id, { reminderMinutes: value === "" ? null : Number(value) }); }}>{REMINDER_OPTIONS.map((option) => <option key={String(option.value)} value={String(option.value ?? "")}>{option.label}</option>)}</select></label>
            <div className="cal-planning-actions"><button className="cal-clear" onClick={() => void updateTask(planningTask.id, { dueDate: null, dueTime: null, reminderMinutes: null })}>清除日期</button><button className="cal-finish" onClick={onExitPlanning}>完成</button></div>
            <button className="cal-exit" onClick={onExitPlanning}>退出选择日期</button>
          </div>
        ) : (
          <>
        <div className="cal-detail-head">
          <span>{selected ? format(new Date(selected + "T00:00:00"), "M月d日 EEEE", { locale: zhCN }) : "选择日期"}</span>
          {selected && (
            <button className="cal-add" onClick={() => setAdding((v) => !v)}><Plus size={13} /> 日程</button>
          )}
        </div>

        {adding && selected && (
          <div className="cal-new-event">
            <input
              autoFocus
              value={newTitle}
              placeholder="日程标题，回车创建"
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTitle.trim() && selected) {
                  void useAppStore.getState().addEvent({
                    title: newTitle.trim(),
                    startAt: `${selected}T09:00:00`,
                    endAt: `${selected}T10:00:00`,
                    isAllDay: false,
                  });
                  setNewTitle("");
                  setAdding(false);
                }
              }}
            />
          </div>
        )}

        {selectedData && (
          <>
            {selectedData.events.map(renderEventChip)}
            {selectedData.tasks.map(renderTaskChip)}
            {selectedData.events.length === 0 && selectedData.tasks.length === 0 && !adding && (
              <div className="cal-empty">当天暂无安排（可从左侧拖动任务排期）</div>
            )}
          </>
        )}
          </>
        )}
      </div>

      {eventMenu && (
        <ContextMenu
          x={eventMenu.x}
          y={eventMenu.y}
          title={eventMenu.event.title}
          items={[
            {
              id: "edit",
              label: "编辑",
              icon: <Pencil size={14} />,
              onClick: () => openEventEdit(eventMenu.event),
            },
            { id: "sep", separator: true },
            {
              id: "delete",
              label: "删除",
              icon: <Trash2 size={14} />,
              danger: true,
              onClick: () => void deleteEvent(eventMenu.event.id),
            },
          ]}
          onClose={() => setEventMenu(null)}
        />
      )}

      {editingEvent && (
        <div className="ctx-backdrop" onClick={() => setEditingEvent(null)}>
          <div className="ctx-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="ctx-dialog-title">编辑日程</div>
            <input
              autoFocus
              className="ctx-dialog-input"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="日程标题"
            />
            <div className="ctx-dialog-field">
              <label className="ctx-dialog-label">日期</label>
              <input
                type="date"
                className="ctx-dialog-input"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
            </div>
            <div className="ctx-dialog-field">
              <label className="ctx-dialog-label">
                <input
                  type="checkbox"
                  checked={editAllDay}
                  onChange={(e) => setEditAllDay(e.target.checked)}
                  style={{ marginRight: 6 }}
                />
                全天
              </label>
            </div>
            {!editAllDay && (
              <div className="ctx-dialog-field" style={{ display: "flex", gap: 8 }}>
                <input
                  type="time"
                  className="ctx-dialog-input"
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                />
                <span style={{ color: "var(--text-2)", alignSelf: "center" }}>至</span>
                <input
                  type="time"
                  className="ctx-dialog-input"
                  value={editEnd}
                  onChange={(e) => setEditEnd(e.target.value)}
                />
              </div>
            )}
            <div className="ctx-dialog-colors">
              {["#737ba5", "#5fa782", "#9882b8", "#bd7c62", "#c77b7f", "#5f9aa7", "#c69a61", "#6f7d8e"].map((c) => (
                <button
                  key={c}
                  className={`habit-color-swatch ${editColor === c ? "is-active" : ""}`}
                  style={{ background: c }}
                  onClick={() => setEditColor(c)}
                />
              ))}
            </div>
            <div className="ctx-dialog-actions">
              <button className="ctx-dialog-cancel" onClick={() => setEditingEvent(null)}>取消</button>
              <button
                className="ctx-dialog-save"
                disabled={!editTitle.trim() || !editDate}
                onClick={() => {
                  const startAt = editAllDay ? `${editDate}T00:00:00` : `${editDate}T${editStart}:00`;
                  const endAt = editAllDay ? `${editDate}T23:59:59` : `${editDate}T${editEnd}:00`;
                  void updateEvent(editingEvent.id, {
                    title: editTitle.trim(),
                    startAt,
                    endAt,
                    isAllDay: editAllDay,
                    color: editColor,
                  });
                  setEditingEvent(null);
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
