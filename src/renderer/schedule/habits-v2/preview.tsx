import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Bell, BookOpen, CheckSquare, Clock3, Grid2X2, Home, Search, Settings2, Sparkles, Wrench } from "lucide-react";
import type { Habit, HabitRecord } from "../types";
import HabitsSceneV2, { type HabitDraft } from "./HabitsSceneV2";
import { HABITS_V2_FIXTURE_DATE, habitsV2Fixture, habitsV2FixtureRecords } from "./fixture";
import "../../../../docs/视觉参考/habits-v2-react-preview/preview.css";

const params = new URLSearchParams(window.location.search);
const startsEmpty = params.get("state") === "empty";
const startsWithModal = params.get("modal") === "create";

function PreviewApp() {
  const [habits, setHabits] = useState<Habit[]>(startsEmpty ? [] : habitsV2Fixture);
  const [records, setRecords] = useState<HabitRecord[]>(startsEmpty ? [] : habitsV2FixtureRecords);
  const [selectedDate, setSelectedDate] = useState(HABITS_V2_FIXTURE_DATE);

  const setRecord = (habitId: string, date: string, count: number) => {
    setRecords((current) => {
      const rest = current.filter((record) => !(record.habitId === habitId && record.date === date));
      return count > 0 ? [...rest, { habitId, date, count }] : rest;
    });
  };

  const createHabit = (draft: HabitDraft) => {
    setHabits((current) => [...current, {
      ...draft,
      id: `preview-${current.length + 1}`,
      createdAt: new Date(`${selectedDate}T08:00:00.000Z`).toISOString(),
    }]);
  };

  const updateHabit = (habitId: string, draft: HabitDraft) => {
    setHabits((current) => current.map((habit) => habit.id === habitId ? { ...habit, ...draft } : habit));
  };

  const deleteHabit = (habitId: string) => {
    setHabits((current) => current.filter((habit) => habit.id !== habitId));
    setRecords((current) => current.filter((record) => record.habitId !== habitId));
  };

  return (
    <main className="h2v2-preview-shell">
      <header className="h2v2-preview-topbar">
        <div className="preview-context"><span className="preview-live" />上海 <small>22° 多云</small><span className="preview-divider" /><Clock3 size={15} />8月30日 <small>星期日</small><strong>15:24</strong></div>
        <nav aria-label="场景导航">
          <button><Home size={15} />今日</button><button><CheckSquare size={15} />待办</button><button><Clock3 size={15} />时间块</button><button className="active"><Sparkles size={15} />习惯</button><button><BookOpen size={15} />记录册</button>
        </nav>
        <div className="preview-top-actions"><button aria-label="搜索"><Search size={16} /></button><button aria-label="通知"><Bell size={16} /></button><span>REACT V2</span></div>
      </header>

      <div className="h2v2-preview-stage">
        <HabitsSceneV2
          habits={habits}
          records={records}
          selectedDate={selectedDate}
          onSelectedDateChange={setSelectedDate}
          onSetRecord={setRecord}
          onCreateHabit={createHabit}
          onUpdateHabit={updateHabit}
          onDeleteHabit={deleteHabit}
          initialDialog={startsWithModal ? "create" : null}
        />
      </div>

      <footer className="h2v2-preview-dock">
        <button><Grid2X2 size={16} />全部工具</button><i />
        <button className="active"><span className="dock-mark">B</span>书签</button>
        <button><span className="dock-mark red">R</span>RedNote</button>
        <button><span className="dock-mark amber">T</span>Tooler</button>
        <button><span className="dock-mark green">C</span>Check</button>
        <span className="dock-spacer" />
        <button><Wrench size={15} />工具</button><button><Settings2 size={15} />设置</button>
        <time><strong>15:24</strong><small>8/30 周日</small></time>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<PreviewApp />);
