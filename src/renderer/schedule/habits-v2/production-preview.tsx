import { createRoot } from "react-dom/client";
import { Bell, BookOpen, CheckSquare, Clock3, Grid2X2, Home, Search, Settings2, Sparkles, Wrench } from "lucide-react";
import type { HabitInput } from "../api";
import { useAppStore } from "../store";
import type { Habit, HabitRecord } from "../types";
import HabitsSceneV2Container from "./HabitsSceneV2Container";
import { HABITS_V2_FIXTURE_DATE, habitsV2Fixture, habitsV2FixtureRecords } from "./fixture";
import "../../../../docs/视觉参考/habits-v2-react-preview/preview.css";

const params = new URLSearchParams(window.location.search);
let previewRecords: HabitRecord[] = params.get("state") === "empty" ? [] : habitsV2FixtureRecords.map((record) => ({ ...record }));
const initialHabits = params.get("state") === "empty" ? [] : habitsV2Fixture.map((habit) => ({ ...habit }));
if (params.get("state") === "centering") {
  previewRecords = previewRecords.filter((record) => !(record.habitId === "habit-water" && record.date === HABITS_V2_FIXTURE_DATE));
  previewRecords.push({ habitId: "habit-water", date: HABITS_V2_FIXTURE_DATE, count: 1 });
}

function normalizeInput(input: string | HabitInput): Required<HabitInput> {
  if (typeof input === "string") return { name: input, color: "#4f6ef7", icon: "check", targetCount: 1 };
  return { name: input.name, color: input.color ?? "#4f6ef7", icon: input.icon ?? "check", targetCount: input.targetCount ?? 1 };
}

useAppStore.setState({
  habits: initialHabits,
  loaded: true,
  addHabit: async (input) => {
    const normalized = normalizeInput(input);
    const habit: Habit = { ...normalized, id: `production-preview-${Date.now()}`, createdAt: `${HABITS_V2_FIXTURE_DATE}T08:00:00.000Z` };
    useAppStore.setState((state) => ({ habits: [...state.habits, habit] }));
    return habit;
  },
  updateHabit: async (id, inputOrName, color, targetCount) => {
    const existing = useAppStore.getState().habits.find((habit) => habit.id === id)!;
    const input = typeof inputOrName === "string" ? { name: inputOrName, color, icon: existing.icon, targetCount } : inputOrName;
    const updated = { ...existing, ...normalizeInput(input) };
    useAppStore.setState((state) => ({ habits: state.habits.map((habit) => habit.id === id ? updated : habit) }));
    return updated;
  },
  deleteHabit: async (id) => {
    useAppStore.setState((state) => ({ habits: state.habits.filter((habit) => habit.id !== id) }));
    previewRecords = previewRecords.filter((record) => record.habitId !== id);
  },
});

const readRecords = async (habitId: string) => previewRecords.filter((record) => record.habitId === habitId);
const writeRecord = async (habitId: string, date: string, count: number) => {
  previewRecords = previewRecords.filter((record) => !(record.habitId === habitId && record.date === date));
  if (count > 0) previewRecords.push({ habitId, date, count });
};

function ProductionPreviewApp() {
  return (
    <main className="h2v2-preview-shell">
      <header className="h2v2-preview-topbar">
        <div className="preview-context"><span className="preview-live" />上海 <small>22° 多云</small><span className="preview-divider" /><Clock3 size={15} />8月30日 <small>星期日</small><strong>15:24</strong></div>
        <nav aria-label="场景导航"><button><Home size={15} />今日</button><button><CheckSquare size={15} />待办</button><button><Clock3 size={15} />时间块</button><button className="active"><Sparkles size={15} />习惯</button><button><BookOpen size={15} />记录册</button></nav>
        <div className="preview-top-actions"><button aria-label="搜索"><Search size={16} /></button><button aria-label="通知"><Bell size={16} /></button><span>PRODUCTION</span></div>
      </header>
      <div className="h2v2-preview-stage">
        <HabitsSceneV2Container
          initialDialog={params.get("modal") === "create" ? "create" : null}
          recordReader={readRecords}
          recordWriter={writeRecord}
        />
      </div>
      <footer className="h2v2-preview-dock"><button><Grid2X2 size={16} />全部工具</button><i /><button className="active"><span className="dock-mark">B</span>书签</button><button><span className="dock-mark red">R</span>RedNote</button><button><span className="dock-mark amber">T</span>Tooler</button><button><span className="dock-mark green">C</span>Check</button><span className="dock-spacer" /><button><Wrench size={15} />工具</button><button><Settings2 size={15} />设置</button><time><strong>15:24</strong><small>8/30 周日</small></time></footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<ProductionPreviewApp />);
