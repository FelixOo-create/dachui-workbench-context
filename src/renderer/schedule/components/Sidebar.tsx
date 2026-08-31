import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sun, CalendarDays, CheckSquare, ListTodo, Plus,
  Palette, Pencil, Trash2, X, Check,
} from "lucide-react";
import { useAppStore } from "../store";
import type { SmartView, List } from "../types";
import ContextMenu from "./ContextMenu";
import "./Sidebar.css";

interface Props {
  view: SmartView | "list";
  activeListId: string | null;
  onSelectView: (v: SmartView) => void;
  onSelectList: (id: string) => void;
}

const LIST_COLORS = [
  "#737ba5", "#5fa782", "#9882b8", "#bd7c62",
  "#c77b7f", "#5f9aa7", "#c69a61", "#6f7d8e",
  "#b8789a", "#5f9a90", "#8fa86b", "#9c7b55",
];

export default function Sidebar({
  view, activeListId, onSelectView, onSelectList,
}: Props) {
  const { tasks, lists, stats, addList, renameList, setListColor, deleteList, updateTask } = useAppStore();
  const [addingList, setAddingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListColor, setNewListColor] = useState(LIST_COLORS[0]);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [pickingColorFor, setPickingColorFor] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [listMenu, setListMenu] = useState<{ x: number; y: number; list: List } | null>(null);
  const [dragOverListId, setDragOverListId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const colorPickerRef = useRef<HTMLDivElement | null>(null);
  const confirmDeleteRef = useRef<HTMLDivElement | null>(null);

  // 编辑/改色/删除确认等弹出态：点击外部自动关闭
  useEffect(() => {
    if (!editingListId && !pickingColorFor && !confirmDelete) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      const inEdit = editInputRef.current?.contains(t);
      const inPicker = colorPickerRef.current?.contains(t);
      const inConfirm = confirmDeleteRef.current?.contains(t);
      if (!inEdit && !inPicker && !inConfirm) {
        setEditingListId(null);
        setPickingColorFor(null);
        setConfirmDelete(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [editingListId, pickingColorFor, confirmDelete]);

  const today = new Date().toISOString().slice(0, 10);

  const counts = useMemo(() => {
    const c: Record<string, number> = { today: 0, tomorrow: 0, planned: 0, all: 0 };
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    for (const t of tasks) {
      if (t.status !== "open") continue;
      if (t.dueDate === today) c.today++;
      if (t.dueDate === tomorrow) c.tomorrow++;
      if (t.dueDate) c.planned++;
      c.all++;
    }
    return c;
  }, [tasks, today]);

  const listCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of tasks) {
      if (t.status !== "open") continue;
      // 无归属(NULL)任务计入「收件箱」
      const id = t.listId ?? "list-default";
      m[id] = (m[id] ?? 0) + 1;
    }
    return m;
  }, [tasks]);

  const item = (key: SmartView, label: string, Icon: typeof Sun, count?: number, active = false) => (
    <button className={`sb-item ${active ? "is-active" : ""}`} onClick={() => onSelectView(key)}>
      <Icon size={16} strokeWidth={1.8} />
      <span className="sb-label">{label}</span>
      {count !== undefined && count > 0 && <span className="sb-count">{count}</span>}
    </button>
  );

  const handleCreateList = async () => {
    if (!newListName.trim()) return;
    await addList(newListName.trim(), newListColor);
    setNewListName("");
    setNewListColor(LIST_COLORS[0]);
    setAddingList(false);
  };

  return (
    <aside className="schedule-context-sidebar">
      <div className="sb-header">
        <div className="sb-logo">
          <span>待办视图</span>
        </div>
      </div>

      <div className="sb-section-title"><span>视图</span></div>
          <nav className="sb-nav">
            {item("today", "今天", Sun, counts.today, view === "today")}
            {item("tomorrow", "明天", CalendarDays, counts.tomorrow, view === "tomorrow")}
            {item("planned", "已计划", CalendarDays, counts.planned, view === "planned")}
            {item("all", "全部", ListTodo, counts.all, view === "all")}
            {item("completed", "已完成", CheckSquare, undefined, view === "completed")}
          </nav>

          <div className="sb-section-title">
            <span>清单</span>
            <button className="sb-add" title="新建清单" onClick={() => setAddingList((v) => !v)}>
              <Plus size={14} />
            </button>
          </div>

          {addingList && (
            <div className="sb-newlist">
              <div className="sb-newlist-row">
                <input
                  autoFocus
                  value={newListName}
                  placeholder="清单名称"
                  onChange={(e) => setNewListName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleCreateList()}
                />
                <button className="sb-confirm" onClick={() => void handleCreateList()}><Check size={13} /></button>
                <button className="sb-cancel" onClick={() => setAddingList(false)}><X size={13} /></button>
              </div>
              <div className="sb-color-row">
                {LIST_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`sb-color-dot ${newListColor === c ? "is-active" : ""}`}
                    style={{ background: c }}
                    onClick={() => setNewListColor(c)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="sb-lists">
            {lists.map((l) => {
              const editing = editingListId === l.id;
              const picking = pickingColorFor === l.id;
              return (
                <div
                  key={l.id}
                  className={`sb-list-item ${dragOverListId === l.id ? "is-drag-over" : ""}`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setListMenu({ x: e.clientX, y: e.clientY, list: l });
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragOverListId !== l.id) setDragOverListId(l.id);
                  }}
                  onDragLeave={(e) => {
                    if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
                    if (dragOverListId === l.id) setDragOverListId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverListId(null);
                    const taskId = e.dataTransfer.getData("text/plain");
                    if (taskId) {
                      const t = tasks.find((x) => x.id === taskId);
                      if (t && t.listId !== l.id) void updateTask(taskId, { listId: l.id });
                    }
                  }}
                >
                  <button
                    className={`sb-item ${activeListId === l.id && view === "list" ? "is-active" : ""}`}
                    onClick={() => onSelectList(l.id)}
                  >
                    <span className="sb-dot" style={{ background: l.color }} />
                    {editing ? (
                      <input
                        ref={editInputRef}
                        className="sb-inline-edit"
                        value={editName}
                        autoFocus
                        onChange={(e) => setEditName(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && editName.trim()) {
                            void renameList(l.id, editName.trim());
                            setEditingListId(null);
                          }
                          if (e.key === "Escape") setEditingListId(null);
                        }}
                      />
                    ) : (
                      <span className="sb-label">{l.name}</span>
                    )}
                    <span className="sb-count">{listCounts[l.id] ?? 0}</span>
                  </button>
                  {!editing && l.id !== "list-default" && (
                    <div className="sb-list-actions">
                      <button
                        className="sb-list-action"
                        title="改色"
                        onClick={() => setPickingColorFor(picking ? null : l.id)}
                      >
                        <Palette size={12} />
                      </button>
                      <button
                        className="sb-list-action"
                        title="重命名"
                        onClick={() => {
                          setEditingListId(l.id);
                          setEditName(l.name);
                        }}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        className="sb-list-action is-danger"
                        title="删除"
                        onClick={() => setConfirmDelete(confirmDelete === l.id ? null : l.id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                  {picking && (
                    <div ref={colorPickerRef} className="sb-color-picker">
                      {LIST_COLORS.map((c) => (
                        <button
                          key={c}
                          className={`sb-color-dot ${l.color === c ? "is-active" : ""}`}
                          style={{ background: c }}
                          onClick={() => {
                            void setListColor(l.id, c);
                            setPickingColorFor(null);
                          }}
                        />
                      ))}
                    </div>
                  )}
                  {confirmDelete === l.id && (
                    <div ref={confirmDeleteRef} className="sb-confirm-del">
                      <span>删除此清单？任务将移回收件箱</span>
                      <button
                        className="sb-confirm-yes"
                        onClick={() => {
                          void deleteList(l.id);
                          setConfirmDelete(null);
                          if (activeListId === l.id) onSelectView("today");
                        }}
                      >
                        删除
                      </button>
                      <button className="sb-confirm-no" onClick={() => setConfirmDelete(null)}>取消</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
      {stats && (stats.overdue > 0 || stats.todayDone > 0) && (
        <div className="sb-footer">
          {stats.overdue > 0 && <div className="sb-warn">逾期 {stats.overdue} 项</div>}
          {stats.todayDone > 0 && <div className="sb-done">今日完成 {stats.todayDone} 项</div>}
        </div>
      )}

      {listMenu && (
        <ContextMenu
          x={listMenu.x}
          y={listMenu.y}
          title={listMenu.list.name}
          items={[
            {
              id: "rename",
              label: "重命名",
              icon: <Pencil size={14} />,
              onClick: () => {
                setEditingListId(listMenu.list.id);
                setEditName(listMenu.list.name);
              },
            },
            {
              id: "color",
              label: "改色",
              icon: <Palette size={14} />,
              onClick: () => setPickingColorFor(listMenu.list.id),
            },
            { id: "sep", separator: true },
            {
              id: "delete",
              label: "删除",
              icon: <Trash2 size={14} />,
              danger: true,
              disabled: listMenu.list.id === "list-default",
              onClick: () => setConfirmDelete(listMenu.list.id),
            },
          ]}
          onClose={() => setListMenu(null)}
        />
      )}
    </aside>
  );
}
