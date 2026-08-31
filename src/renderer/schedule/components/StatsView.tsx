import { useMemo, useState } from "react";
import { BarChart3, CheckCircle2, CalendarClock, AlertTriangle, Flame } from "lucide-react";
import { useAppStore } from "../store";
import {
  format, startOfWeek, addDays, subWeeks, startOfMonth, subMonths, addMonths,
} from "date-fns";
import { zhCN } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import "./Stats.css";

type Range = "week" | "month";

export default function StatsView() {
  const { tasks, stats, lists } = useAppStore();
  const [range, setRange] = useState<Range>("week");

  const listName = (id: string | null) => lists.find((l) => l.id === id)?.name ?? "未分类";

  const trendData = useMemo(() => {
    if (range === "week") {
      const weeks: { label: string; done: number; total: number }[] = [];
      const now = new Date();
      for (let i = 7; i >= 0; i--) {
        const ws = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
        const we = addDays(ws, 6);
        const done = tasks.filter((t) => {
          if (t.status !== "completed" || !t.completedAt) return false;
          const d = new Date(t.completedAt);
          return d >= ws && d <= we;
        }).length;
        weeks.push({ label: `${format(ws, "M/d")}`, done, total: done });
      }
      return weeks;
    }
    const months: { label: string; done: number; total: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const ms = startOfMonth(subMonths(now, i));
      const me = addMonths(ms, 1);
      const done = tasks.filter((t) => {
        if (t.status !== "completed" || !t.completedAt) return false;
        const d = new Date(t.completedAt);
        return d >= ms && d < me;
      }).length;
      months.push({ label: format(ms, "M月", { locale: zhCN }), done, total: done });
    }
    return months;
  }, [tasks, range]);

  const listData = useMemo(() => {
    const map = new Map<string, { name: string; total: number; done: number }>();
    for (const t of tasks) {
      const name = listName(t.listId);
      const cur = map.get(name) ?? { name, total: 0, done: 0 };
      cur.total += 1;
      if (t.status === "completed") cur.done += 1;
      map.set(name, cur);
    }
    return Array.from(map.values());
  }, [tasks, listName]);

  // 优先级分布
  const priorityData = useMemo(() => {
    const items = [
      { name: "高优先级", total: 0, done: 0 },
      { name: "中优先级", total: 0, done: 0 },
      { name: "低优先级", total: 0, done: 0 },
    ];
    for (const t of tasks) {
      const idx = t.priority === 2 ? 0 : t.priority === 1 ? 1 : 2;
      items[idx].total += 1;
      if (t.status === "completed") items[idx].done += 1;
    }
    return items;
  }, [tasks]);

  // 本周/本月数据
  const periodData = useMemo(() => {
    const now = new Date();
    const start = range === "week" ? startOfWeek(now, { weekStartsOn: 1 }) : startOfMonth(now);
    const done = tasks.filter((t) => {
      if (t.status !== "completed" || !t.completedAt) return false;
      const d = new Date(t.completedAt);
      return d >= start && d <= now;
    }).length;
    const created = tasks.filter((t) => {
      const d = new Date(t.createdAt);
      return d >= start && d <= now;
    }).length;
    return { done, created, rate: created > 0 ? Math.round((done / created) * 100) : 0 };
  }, [tasks, range]);

  const overall = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "completed").length;
    return { total, done, rate: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [tasks]);

  const tooltipStyle = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--text)",
  };

  return (
    <div className="stats-view">
      <div className="stats-head">
        <h1 className="stats-title">统计</h1>
        <div className="settings-seg">
          <button className={`settings-seg-btn ${range === "week" ? "is-active" : ""}`} onClick={() => setRange("week")}>
            周
          </button>
          <button className={`settings-seg-btn ${range === "month" ? "is-active" : ""}`} onClick={() => setRange("month")}>
            月
          </button>
        </div>
      </div>

      <div className="stats-cards">
        <div className="stat-card">
          <CheckCircle2 size={18} className="stat-icon is-ok" />
          <div>
            <div className="stat-num">{periodData.done}</div>
            <div className="stat-label">本{range === "week" ? "周" : "月"}完成</div>
          </div>
        </div>
        <div className="stat-card">
          <BarChart3 size={18} className="stat-icon is-blue" />
          <div>
            <div className="stat-num">{periodData.created}</div>
            <div className="stat-label">本{range === "week" ? "周" : "月"}新增</div>
          </div>
        </div>
        <div className="stat-card">
          <CheckCircle2 size={18} className="stat-icon is-purple" />
          <div>
            <div className="stat-num">{periodData.rate}%</div>
            <div className="stat-label">本{range === "week" ? "周" : "月"}完成率</div>
          </div>
        </div>
        <div className="stat-card">
          <AlertTriangle size={18} className="stat-icon is-danger" />
          <div>
            <div className="stat-num">{stats?.overdue ?? 0}</div>
            <div className="stat-label">当前逾期</div>
          </div>
        </div>
      </div>

      <div className="stats-chart-card">
        <div className="stats-chart-title">
          <CalendarClock size={15} /> {range === "week" ? "近 8 周" : "近 6 月"}完成趋势
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={trendData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-2)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "var(--text-2)" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="done" name="完成" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="stats-chart-card">
        <div className="stats-chart-title">清单分布（完成 / 总数）</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={listData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text-2)" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--text-2)" }} axisLine={false} tickLine={false} width={80} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="done" name="已完成" stackId="a" fill="var(--ok)" maxBarSize={18} />
            <Bar dataKey="total" name="总数" stackId="a" fill="var(--surface-2)" maxBarSize={18} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="stats-chart-card">
        <div className="stats-chart-title">优先级分布</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={priorityData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-2)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "var(--text-2)" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="done" name="已完成" stackId="a" fill="var(--accent)" maxBarSize={30} />
            <Bar dataKey="total" name="总数" stackId="a" fill="var(--surface-2)" maxBarSize={30} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="stats-chart-card">
        <div className="stats-chart-title">
          <Flame size={15} /> 累计
        </div>
        <div className="stats-overall">
          <div className="stats-overall-item">
            <div className="stat-num">{overall.done}</div>
            <div className="stat-label">累计完成</div>
          </div>
          <div className="stats-overall-item">
            <div className="stat-num">{overall.total}</div>
            <div className="stat-label">累计任务</div>
          </div>
          <div className="stats-overall-item">
            <div className="stat-num">{overall.rate}%</div>
            <div className="stat-label">总完成率</div>
          </div>
        </div>
      </div>
    </div>
  );
}
