import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import { api } from "../api";
import { useAppStore } from "../store";
import type { Habit, HabitRecord } from "../types";
import { habitActionError, loadAllHabitRecords, replaceHabitRecord, type HabitRecordReader } from "./adapter";
import HabitsSceneV2, { type HabitDraft } from "./HabitsSceneV2";
import "./HabitsSceneV2Container.css";

export interface HabitsSceneV2ContainerProps {
  initialDialog?: "create" | null;
  recordReader?: HabitRecordReader;
  recordWriter?: (habitId: string, date: string, count: number) => Promise<unknown>;
}

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function HabitsSceneV2Container({
  initialDialog = null,
  recordReader = api.habits.records,
  recordWriter = api.habits.setRecord,
}: HabitsSceneV2ContainerProps) {
  const habits = useAppStore((state) => state.habits);
  const addHabit = useAppStore((state) => state.addHabit);
  const updateHabit = useAppStore((state) => state.updateHabit);
  const deleteHabit = useAppStore((state) => state.deleteHabit);
  const [records, setRecords] = useState<HabitRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState(localDateKey);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Habit | null>(null);
  const loadSequence = useRef(0);
  const habitIds = useMemo(() => habits.map((habit) => habit.id).join("\u0000"), [habits]);

  const refreshRecords = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setRecordsLoading(true);
    setError(null);
    try {
      const next = await loadAllHabitRecords(habits, recordReader);
      if (sequence === loadSequence.current) setRecords(next);
    } catch (cause) {
      if (sequence === loadSequence.current) setError(`打卡记录加载失败：${habitActionError(cause)}`);
    } finally {
      if (sequence === loadSequence.current) setRecordsLoading(false);
    }
  }, [habits, recordReader]);

  useEffect(() => {
    void refreshRecords();
    return () => { loadSequence.current += 1; };
  }, [habitIds, refreshRecords]);

  const runAction = async (action: () => Promise<void>, success?: string): Promise<boolean> => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (success) setNotice(success);
      return true;
    } catch (cause) {
      setError(habitActionError(cause));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const setRecord = async (habitId: string, date: string, count: number) => {
    const previous = records;
    setRecords((current) => replaceHabitRecord(current, habitId, date, count));
    const saved = await runAction(async () => { await recordWriter(habitId, date, count); });
    if (!saved) setRecords(previous);
  };

  const createHabit = async (draft: HabitDraft) => {
    await runAction(async () => { await addHabit(draft); }, "习惯已创建");
  };

  const editHabit = async (habitId: string, draft: HabitDraft) => {
    await runAction(async () => { await updateHabit(habitId, draft); }, "习惯已更新");
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    await runAction(async () => {
      await deleteHabit(target.id);
      setRecords((current) => current.filter((record) => record.habitId !== target.id));
    }, "习惯已删除");
  };

  if (recordsLoading) {
    return (
      <section className="h2v2-container h2v2-container-loading" aria-label="习惯加载中">
        <LoaderCircle size={20} className="h2v2-spin" aria-hidden="true" />
        <strong>正在载入习惯与历史记录</strong>
        <span>数据仍保存在现有日程数据库中</span>
      </section>
    );
  }

  return (
    <div className={`h2v2-container${saving ? " is-saving" : ""}`}>
      <HabitsSceneV2
        habits={habits}
        records={records}
        selectedDate={selectedDate}
        onSelectedDateChange={setSelectedDate}
        onSetRecord={setRecord}
        onCreateHabit={createHabit}
        onUpdateHabit={editHabit}
        onDeleteHabit={(habitId) => setDeleteTarget(habits.find((habit) => habit.id === habitId) ?? null)}
        onViewHabit={(habitId) => {
          const habit = habits.find((item) => item.id === habitId);
          setNotice(habit ? `「${habit.name}」的统计已显示在右侧趋势面板` : "习惯统计已显示在右侧");
        }}
        initialDialog={initialDialog}
      />

      {saving && <div className="h2v2-saving-indicator"><LoaderCircle size={14} className="h2v2-spin" />正在保存</div>}
      {error && (
        <div className="h2v2-container-message is-error" role="alert">
          <AlertTriangle size={15} /><span>{error}</span>
          <button type="button" onClick={() => void refreshRecords()}><RefreshCw size={13} />重新载入</button>
        </div>
      )}
      {!error && notice && <button className="h2v2-container-message" type="button" onClick={() => setNotice(null)}>{notice}</button>}

      {deleteTarget && (
        <div className="h2v2-confirm-backdrop" role="presentation" onPointerDown={() => setDeleteTarget(null)}>
          <section className="h2v2-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="h2v2-delete-title" onPointerDown={(event) => event.stopPropagation()}>
            <span className="h2v2-confirm-icon"><Trash2 size={19} /></span>
            <div><span className="h2v2-eyebrow">DELETE HABIT</span><h2 id="h2v2-delete-title">删除「{deleteTarget.name}」？</h2><p>该习惯的历史打卡记录也会一并删除，此操作不可撤销。</p></div>
            <footer><button className="h2v2-ghost-button" type="button" onClick={() => setDeleteTarget(null)}>取消</button><button className="h2v2-danger-button" type="button" onClick={() => void confirmDelete()}>确认删除</button></footer>
          </section>
        </div>
      )}
    </div>
  );
}
