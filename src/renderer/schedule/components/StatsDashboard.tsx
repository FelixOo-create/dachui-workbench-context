import { useState } from "react";
import { ListTodo, Clock3, Flame } from "lucide-react";
import StatsView from "./StatsView";
import HabitsView from "./HabitsView";
import TimelogStatsPanel from "../features/timelog/TimelogStatsPanel";
import "./StatsDashboard.css";

type StatsTab = "todo" | "timelog" | "habits";

const TABS: { id: StatsTab; label: string; Icon: typeof ListTodo }[] = [
  { id: "todo", label: "待办统计", Icon: ListTodo },
  { id: "timelog", label: "时间块统计", Icon: Clock3 },
  { id: "habits", label: "习惯统计", Icon: Flame },
];

/** 统计板块：按「各自板块内容」展示对应统计（待办 / 时间块 / 习惯） */
export default function StatsDashboard() {
  const [tab, setTab] = useState<StatsTab>("todo");

  return (
    <div className="stats-dashboard">
      <div className="stats-dash-tabs">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`stats-dash-tab ${tab === id ? "is-active" : ""}`}
            onClick={() => setTab(id)}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <div className="stats-dash-body">
        {tab === "todo" ? (
          <div className="stats-dash-scroll">
            <StatsView />
          </div>
        ) : tab === "timelog" ? (
          <TimelogStatsPanel />
        ) : (
          <div className="stats-dash-scroll">
            <HabitsView initialTab="stats" />
          </div>
        )}
      </div>
    </div>
  );
}
