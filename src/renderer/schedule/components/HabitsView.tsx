import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Flame, Plus, Check, Trophy, Target, CalendarDays, TrendingUp,
  Pencil, Trash2, ArrowLeft, ChevronLeft, ChevronRight, BarChart3,
  MoreHorizontal, RotateCcw,
} from "lucide-react";
import { useAppStore } from "../store";
import { api } from "../api";
import type { Habit } from "../types";
import { format, startOfMonth, addDays, isSameMonth, getDay, startOfWeek, subDays, addMonths, isSameDay } from "date-fns";
import { zhCN } from "date-fns/locale";
import ContextMenu, { type MenuItem } from "./ContextMenu";
import "./Habits.css";

type StatRange = "day" | "week" | "month" | "year";

const RANGE_OPTIONS: { value: StatRange; label: string }[] = [
  { value: "day", label: "日" },
  { value: "week", label: "周" },
  { value: "month", label: "月" },
  { value: "year", label: "年" },
];

const HABIT_COLORS = ["#7f86ae", "#c77b7f", "#5fa782", "#c69a61", "#9882b8", "#5f9aa7", "#b8789a", "#8fa86b"];
const MIN_TARGET = 1;
const MAX_TARGET = 10;

const dateKey = (d: Date) => format(d, "yyyy-MM-dd");

/** 计算某范围（以今天为基准）的起始日期 */
function rangeStart(r: StatRange, now = new Date()): Date {
  switch (r) {
    case "day":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "week":
      return startOfWeek(now, { weekStartsOn: 1 });
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "year":
      return new Date(now.getFullYear(), 0, 1);
  }
}

/** 当月 42 格（含前后月补位） */
function monthCells(month: Date): Date[] {
  const out: Date[] = [];
  const first = startOfMonth(month);
  const start = addDays(first, -((getDay(first) + 6) % 7));
  for (let i = 0; i < 42; i++) out.push(addDays(start, i));
  return out;
}

interface Props {
  /** 初始页签：供统计板块直接打开「统计」页使用 */
  initialTab?: "checkin" | "stats";
}

export default function HabitsView({ initialTab = "checkin" }: Props) {
  const { habits, addHabit, updateHabit, deleteHabit } = useAppStore();
  // records: habitId -> { 日期: 当天已打卡次数 }
  const [records, setRecords] = useState<Record<string, Record<string, number>>>({});
  const [tab, setTab] = useState<"checkin" | "stats">(() => { try { const value = window.localStorage.getItem("workbench.habits.tab"); return value === "stats" || value === "checkin" ? value : initialTab; } catch { return initialTab; } });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [statRange, setStatRange] = useState<StatRange>(() => { try { const value = window.localStorage.getItem("workbench.habits.range"); return RANGE_OPTIONS.some((option) => option.value === value) ? value as StatRange : "week"; } catch { return "week"; } });
  const [detailHabit, setDetailHabit] = useState<Habit | null>(null);
  const [habitMenu, setHabitMenu] = useState<{ x: number; y: number; habit: Habit } | null>(null);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(HABIT_COLORS[0]);
  const [editTarget, setEditTarget] = useState(1);
  const [confirmDel, setConfirmDel] = useState<Habit | null>(null);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  useEffect(() => { try { window.localStorage.setItem("workbench.habits.tab", tab); window.localStorage.setItem("workbench.habits.range", statRange); } catch { /* 忽略不可用的界面偏好存储。 */ } }, [tab, statRange]);

  // 加载所有习惯的记录（存每天次数）
  useEffect(() => {
    let alive = true;
    (async () => {
      const map: Record<string, Record<string, number>> = {};
      for (const h of habits) {
        const recs = await api.habits.records(h.id);
        const m: Record<string, number> = {};
        for (const r of recs) m[r.date] = r.count;
        map[h.id] = m;
      }
      if (alive) setRecords(map);
    })();
    return () => { alive = false; };
  }, [habits]);

  const today = new Date();
  const todayStr = dateKey(today);
  const daysElapsed = useMemo(() => {
    const start = rangeStart(statRange);
    return Math.max(1, Math.floor((today.getTime() - start.getTime()) / 86400_000) + 1);
  }, [statRange]);

  const fmtRange = useMemo(() => {
    const s = rangeStart(statRange);
    if (statRange === "day") return "今天";
    if (statRange === "week") return `本周（${format(s, "M/d", { locale: zhCN })}起）`;
    if (statRange === "month") return `本月（${format(s, "M月")}）`;
    return `今年（${s.getFullYear()}年）`;
  }, [statRange]);

  const targetOf = (habitId: string) => habits.find((h) => h.id === habitId)?.targetCount ?? 1;
  const countOn = (habitId: string, date: string) => records[habitId]?.[date] ?? 0;
  const doneOn = (habitId: string, date: string) => countOn(habitId, date) >= targetOf(habitId);

  const doneInRange = (habitId: string) => {
    const rec = records[habitId] ?? {};
    const startKey = dateKey(rangeStart(statRange));
    const target = targetOf(habitId);
    let count = 0;
    for (const d of Object.keys(rec)) {
      if (d >= startKey && d <= todayStr && rec[d] >= target) count++;
    }
    return count;
  };

  const calcStreak = (habitId: string) => {
    let streak = 0;
    let d = new Date();
    const target = targetOf(habitId);
    if (countOn(habitId, todayStr) < target) d = subDays(d, 1);
    while (countOn(habitId, dateKey(d)) >= target) {
      streak++;
      d = subDays(d, 1);
    }
    return streak;
  };

  const weekDone = (habitId: string) => {
    const ws = startOfWeek(new Date(), { weekStartsOn: 1 });
    const target = targetOf(habitId);
    let count = 0;
    for (let i = 0; i < 7; i++) {
      const day = addDays(ws, i);
      if (day > new Date()) break;
      if (countOn(habitId, dateKey(day)) >= target) count++;
    }
    return count;
  };

  /** 设置某天次数（绝对值），count<=0 视为清除当天记录 */
  const setCount = async (habitId: string, date: string, count: number) => {
    const c = Math.max(0, count);
    await api.habits.setRecord(habitId, date, c);
    setRecords((prev) => {
      const next = { ...prev };
      const m = { ...(prev[habitId] ?? {}) };
      if (c <= 0) delete m[date];
      else m[date] = c;
      next[habitId] = m;
      return next;
    });
  };

  // 打卡页主按钮：未达成 +1；达成则撤销一次
  const onCheck = (h: Habit, date: string) => {
    const c = countOn(h.id, date);
    if (c >= h.targetCount) setCount(h.id, date, Math.max(0, c - 1));
    else setCount(h.id, date, c + 1);
  };
  // 达成态下方「撤销一次」小按钮
  const onUndo = (h: Habit, date: string) => {
    setCount(h.id, date, Math.max(0, countOn(h.id, date) - 1));
  };
  // 月历点击：达成撤销，未达成 +1
  const onCell = (h: Habit, date: string) => {
    const c = countOn(h.id, date);
    if (c >= h.targetCount) setCount(h.id, date, Math.max(0, c - 1));
    else setCount(h.id, date, c + 1);
  };

  const handleAdd = async () => {
    if (!name.trim()) return;
    await addHabit(name.trim());
    setName("");
    setAdding(false);
  };

  const openEdit = (h: Habit) => {
    setEditing(h);
    setEditName(h.name);
    setEditColor(h.color);
    setEditTarget(h.targetCount ?? 1);
    setHabitMenu(null);
  };

  const buildHabitMenuItems = (h: Habit): MenuItem[] => [
    {
      id: "edit",
      label: "编辑",
      icon: <Pencil size={14} />,
      onClick: () => openEdit(h),
    },
    {
      id: "stats",
      label: "查看统计",
      icon: <BarChart3 size={14} />,
      onClick: () => {
        setDetailHabit(h);
        setTab("stats");
        setMonth(startOfMonth(new Date()));
      },
    },
    { id: "sep", separator: true },
    {
      id: "delete",
      label: "删除",
      icon: <Trash2 size={14} />,
      danger: true,
      onClick: () => setConfirmDel(h),
    },
  ];

  const saveEdit = async () => {
    if (!editing) return;
    if (!editName.trim()) return;
    await updateHabit(editing.id, editName.trim(), editColor, editTarget);
    if (detailHabit?.id === editing.id)
      setDetailHabit({ ...editing, name: editName.trim(), color: editColor, targetCount: editTarget });
    setEditing(null);
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    await deleteHabit(confirmDel.id);
    if (detailHabit?.id === confirmDel.id) setDetailHabit(null);
    setConfirmDel(null);
    setHabitMenu(null);
  };

  // ---------- 汇总统计（整体） ----------
  const summary = useMemo(() => {
    if (habits.length === 0) return null;
    const perHabit = habits.map((h) => doneInRange(h.id));
    const totalDone = perHabit.reduce((a, b) => a + b, 0);
    const avg = totalDone / habits.length;
    const best = Math.max(0, ...perHabit);
    return {
      totalDone,
      avgRate: (avg / daysElapsed) * 100,
      best,
      activeHabits: habits.filter((_, i) => perHabit[i] > 0).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habits, records, statRange, daysElapsed, todayStr]);

  // 打卡页：未达成的习惯排前面（部分完成也视为未完成，排前面）
  const sortedForCheckin = useMemo(() => {
    return [...habits].sort((a, b) => {
      const da = doneOn(a.id, todayStr) ? 1 : 0;
      const db = doneOn(b.id, todayStr) ? 1 : 0;
      return da - db;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habits, records, todayStr]);

  const todayOverview = useMemo(() => {
    const completed = habits.filter((habit) => doneOn(habit.id, todayStr)).length;
    const checkins = habits.reduce((total, habit) => total + countOn(habit.id, todayStr), 0);
    const longestStreak = habits.length ? Math.max(...habits.map((habit) => calcStreak(habit.id))) : 0;
    const weeklyDone = habits.reduce((total, habit) => total + weekDone(habit.id), 0);
    return { completed, checkins, longestStreak, weeklyDone };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habits, records, todayStr]);

  const heatmapDays = useMemo(() => {
    return Array.from({ length: 28 }, (_, index) => {
      const date = subDays(new Date(), 27 - index);
      const key = dateKey(date);
      const completed = habits.filter((habit) => doneOn(habit.id, key)).length;
      const rate = habits.length ? completed / habits.length : 0;
      return { key, date, completed, level: Math.ceil(rate * 4) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habits, records, todayStr]);

  // 统计页：按完成率降序排行
  const rankList = useMemo(() => {
    return habits
      .map((h) => ({ habit: h, done: doneInRange(h.id), rate: doneInRange(h.id) / daysElapsed }))
      .sort((a, b) => b.rate - a.rate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habits, records, statRange, daysElapsed, todayStr]);

  const detailDone = detailHabit ? doneInRange(detailHabit.id) : 0;
  const detailRate = daysElapsed > 0 ? (detailDone / daysElapsed) * 100 : 0;

  return (
    <div className="habits-view">
      <div className="habits-header">
        <h1 className="habits-title">习惯</h1>
        <div className="habits-tabs">
          <button className={`habits-tab ${tab === "checkin" ? "is-active" : ""}`} onClick={() => setTab("checkin")}>
            打卡
          </button>
          <button className={`habits-tab ${tab === "stats" ? "is-active" : ""}`} onClick={() => setTab("stats")}>
            统计
          </button>
        </div>
      </div>

      {/* ==================== 打卡页 ==================== */}
      {tab === "checkin" && (
        <div className="habits-checkin">
          <div className="habits-checkin-head">
            <span className="habits-today">{format(today, "M月d日 EEEE", { locale: zhCN })}</span>
            <button className="habits-add" onClick={() => setAdding((v) => !v)}>
              <Plus size={15} /> 新习惯
            </button>
          </div>

          {adding && (
            <div className="habits-new">
              <input
                autoFocus
                value={name}
                placeholder="习惯名称，如：早起、喝水 8 杯"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleAdd()}
              />
            </div>
          )}

          <div className="habits-overview">
            <div><span>今日完成</span><strong>{todayOverview.completed}<small>/{habits.length}</small></strong></div>
            <div><span>今日打卡</span><strong>{todayOverview.checkins}<small> 次</small></strong></div>
            <div><span>最长连续</span><strong>{todayOverview.longestStreak}<small> 天</small></strong></div>
            <div><span>本周完成</span><strong>{todayOverview.weeklyDone}<small> 天</small></strong></div>
          </div>

          {habits.length === 0 && !adding && (
            <div className="habits-empty">还没有习惯，点击"新习惯"开始打卡 🎯</div>
          )}

          <div className="habits-masonry">
            {sortedForCheckin.map((h) => {
              const c = countOn(h.id, todayStr);
              const target = h.targetCount ?? 1;
              const done = c >= target;
              const partial = c > 0 && c < target;
              const streak = calcStreak(h.id);
              const wk = weekDone(h.id);
              return (
                <div
                  key={h.id}
                  className={`habit-card ${done ? "is-done" : ""}`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setHabitMenu({ x: e.clientX, y: e.clientY, habit: h });
                  }}
                >
                  <div className="habit-card-head">
                    <span className="habit-card-name">
                      <span className="habit-dot" style={{ background: h.color }} />
                      <span className="habit-card-title">{h.name}</span>
                    </span>
                    <button
                      className="habit-card-more"
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                        setHabitMenu({ x: rect.right, y: rect.top, habit: h });
                      }}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </div>

                  <div className="habit-card-progress">
                    {target > 1 ? (
                      <span className="habit-progress-dots">
                        {Array.from({ length: target }).map((_, i) => (
                          <span
                            key={i}
                            className={`habit-progress-dot ${i < c ? "is-on" : ""}`}
                            style={i < c ? { background: h.color } : { borderColor: h.color }}
                          />
                        ))}
                      </span>
                    ) : (
                      <span className="habit-card-progress-text">每天打卡</span>
                    )}
                  </div>

                  <div className="habit-card-actions">
                    <button
                      className={`habit-check-btn ${done ? "is-done" : ""} ${partial ? "is-partial" : ""}`}
                      style={{ "--hc": h.color } as CSSProperties}
                      onClick={() => void onCheck(h, todayStr)}
                    >
                      {done ? (
                        <><Check size={17} strokeWidth={3} /> 已完成</>
                      ) : c === 0 ? (
                        <>今日打卡</>
                      ) : (
                        <>继续打卡 {c}/{target}</>
                      )}
                    </button>

                    {done && (
                      <button className="habit-undo-btn" onClick={() => void onUndo(h, todayStr)} title="撤销一次">
                        <RotateCcw size={14} /><span>撤销</span>
                      </button>
                    )}
                  </div>

                  <div className="habit-card-foot">
                    <span className="habit-card-stat" title="连续完成">
                      <Flame size={13} style={{ color: h.color }} /> {streak} 连
                    </span>
                    <span className="habit-card-stat" title="本周完成">
                      <Target size={13} /> 本周 {wk}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================== 统计页 ==================== */}
      {tab === "stats" && (
        <div className="habits-stats-view">
          {detailHabit ? (
            /* ---- 单个习惯详情 ---- */
            <div className="habit-detail">
              <div className="habit-detail-head">
                <button className="habit-back" onClick={() => setDetailHabit(null)}>
                  <ArrowLeft size={15} /> 全部习惯
                </button>
                <div className="habit-detail-title">
                  <span className="habit-dot" style={{ background: detailHabit.color }} />
                  {detailHabit.name}
                  {detailHabit.targetCount > 1 && (
                    <span className="habit-detail-target">每天 {detailHabit.targetCount} 次</span>
                  )}
                </div>
                <div className="habit-detail-actions">
                  <button className="habit-detail-btn" onClick={() => openEdit(detailHabit)} title="编辑">
                    <Pencil size={14} />
                  </button>
                  <button className="habit-detail-btn is-danger" onClick={() => setConfirmDel(detailHabit)} title="删除">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="habit-detail-stats">
                <div className="habit-detail-stat">
                  <div className="habit-detail-num">{calcStreak(detailHabit.id)}</div>
                  <div className="habit-detail-label">连续天数</div>
                </div>
                <div className="habit-detail-stat">
                  <div className="habit-detail-num">{weekDone(detailHabit.id)}</div>
                  <div className="habit-detail-label">本周完成</div>
                </div>
                <div className="habit-detail-stat">
                  <div className="habit-detail-num">{detailRate.toFixed(0)}%</div>
                  <div className="habit-detail-label">{fmtRange}完成率</div>
                </div>
                <div className="habit-detail-stat">
                  <div className="habit-detail-num">{detailDone}</div>
                  <div className="habit-detail-label">累计完成</div>
                </div>
              </div>

              <div className="habit-detail-cal">
                <div className="habit-cal-head">
                  <button className="habit-cal-nav" onClick={() => setMonth((m) => addMonths(m, -1))}>
                    <ChevronLeft size={14} />
                  </button>
                  <span className="habit-cal-title">{format(month, "yyyy年 M月", { locale: zhCN })}</span>
                  <button className="habit-cal-nav" onClick={() => setMonth((m) => addMonths(m, 1))}>
                    <ChevronRight size={14} />
                  </button>
                </div>
                <div className="habit-grid">
                  {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
                    <div key={w} className="habit-week-label">{w}</div>
                  ))}
                  {monthCells(month).map((d) => {
                    const key = dateKey(d);
                    const cc = countOn(detailHabit.id, key);
                    const target = detailHabit.targetCount ?? 1;
                    const cellDone = cc >= target;
                    const cellPartial = cc > 0 && cc < target;
                    const inMonth = isSameMonth(d, month);
                    const isToday = isSameDay(d, today);
                    return (
                      <button
                        key={key}
                        className={`habit-cell ${cellDone ? "is-done" : ""} ${cellPartial ? "is-partial" : ""} ${!inMonth ? "is-other" : ""} ${isToday ? "is-today" : ""}`}
                        style={
                          cellDone
                            ? { background: detailHabit.color, borderColor: detailHabit.color }
                            : cellPartial
                            ? { background: `color-mix(in srgb, ${detailHabit.color} 16%, var(--surface))`, borderColor: detailHabit.color }
                            : undefined
                        }
                        title={key}
                        onClick={() => void onCell(detailHabit, key)}
                      >
                        {cellDone ? (
                          <Check size={12} strokeWidth={3} />
                        ) : cellPartial ? (
                          <span className="habit-cell-count">{cc}</span>
                        ) : (
                          <span className="habit-cell-num">{format(d, "d")}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="habit-cal-tip">点击日期可补打 / 撤销（每日需 {detailHabit.targetCount} 次）</div>
              </div>
            </div>
          ) : (
            /* ---- 整体统计 ---- */
            <div className="habits-stats-panel">
              <div className="habits-stats-head">
                <span className="habits-stats-range">{fmtRange}</span>
                <div className="habits-range-switch">
                  {RANGE_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      className={`habits-range-btn ${statRange === o.value ? "is-active" : ""}`}
                      onClick={() => setStatRange(o.value)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {summary && (
                <div className="habits-stats-grid">
                  <div className="habits-stat-cell">
                    <CalendarDays size={14} className="habits-stat-icon is-blue" />
                    <div>
                      <div className="habits-stat-num">{summary.totalDone}</div>
                      <div className="habits-stat-label">范围内完成天数</div>
                    </div>
                  </div>
                  <div className="habits-stat-cell">
                    <TrendingUp size={14} className="habits-stat-icon is-green" />
                    <div>
                      <div className="habits-stat-num">{summary.avgRate.toFixed(0)}%</div>
                      <div className="habits-stat-label">平均完成率</div>
                    </div>
                  </div>
                  <div className="habits-stat-cell">
                    <Trophy size={14} className="habits-stat-icon is-orange" />
                    <div>
                      <div className="habits-stat-num">{summary.best}</div>
                      <div className="habits-stat-label">最佳单习惯天数</div>
                    </div>
                  </div>
                  <div className="habits-stat-cell">
                    <Flame size={14} className="habits-stat-icon is-red" />
                    <div>
                      <div className="habits-stat-num">{summary.activeHabits}/{habits.length}</div>
                      <div className="habits-stat-label">活跃习惯</div>
                    </div>
                  </div>
                </div>
              )}

              {habits.length === 0 ? (
                <div className="habits-empty">还没有习惯，先到"打卡"页添加 🎯</div>
              ) : (
                <div className="habits-stats-content">
                  <section className="habit-trend-panel">
                    <div className="habits-rank-title">近 28 天节奏</div>
                    <div className="habit-heatmap">
                      {heatmapDays.map((day) => (
                        <span
                          key={day.key}
                          className={`habit-heat-cell level-${day.level}`}
                          title={`${day.key} · 完成 ${day.completed}/${habits.length}`}
                        >
                          {format(day.date, "d")}
                        </span>
                      ))}
                    </div>
                    <div className="habit-heat-legend"><span>较少</span><i className="level-1" /><i className="level-2" /><i className="level-3" /><i className="level-4" /><span>全部完成</span></div>
                  </section>
                  <section className="habits-rank">
                    <div className="habits-rank-title">完成情况</div>
                    {rankList.map(({ habit: h, done, rate }) => (
                      <button
                        key={h.id}
                        className="habit-rank-row"
                        onClick={() => { setDetailHabit(h); setMonth(startOfMonth(new Date())); }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setHabitMenu({ x: e.clientX, y: e.clientY, habit: h });
                        }}
                      >
                        <span className="habit-dot" style={{ background: h.color }} />
                        <span className="habit-rank-name">{h.name}</span>
                        <span className="habit-rank-bar">
                          <span className="habit-rank-fill" style={{ width: `${Math.min(100, rate * 100)}%`, background: h.color }} />
                        </span>
                        <span className="habit-rank-num">{done}/{daysElapsed} 天</span>
                        <span className="habit-rank-rate">{(rate * 100).toFixed(0)}%</span>
                      </button>
                    ))}
                  </section>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ==================== 编辑弹窗 ==================== */}
      {editing && (
        <div className="dialog-backdrop" onClick={() => setEditing(null)}>
          <div className="habit-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="habit-dialog-title">编辑习惯</div>
            <input
              autoFocus
              className="habit-dialog-input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void saveEdit()}
              placeholder="习惯名称"
            />
            <div className="habit-dialog-field">
              <label className="habit-dialog-label">每日次数（打满才算当天完成）</label>
              <div className="habit-stepper">
                <button
                  type="button"
                  onClick={() => setEditTarget((t) => Math.max(MIN_TARGET, t - 1))}
                  disabled={editTarget <= MIN_TARGET}
                >
                  −
                </button>
                <span className="habit-stepper-val">{editTarget}</span>
                <button
                  type="button"
                  onClick={() => setEditTarget((t) => Math.min(MAX_TARGET, t + 1))}
                  disabled={editTarget >= MAX_TARGET}
                >
                  +
                </button>
              </div>
            </div>
            <div className="habit-dialog-colors">
              {HABIT_COLORS.map((c) => (
                <button
                  key={c}
                  className={`habit-color-swatch ${editColor === c ? "is-active" : ""}`}
                  style={{ background: c }}
                  onClick={() => setEditColor(c)}
                >
                  {editColor === c && <Check size={12} strokeWidth={3} color="#fff" />}
                </button>
              ))}
            </div>
            <div className="habit-dialog-actions">
              <button className="habit-dialog-cancel" onClick={() => setEditing(null)}>取消</button>
              <button className="habit-dialog-save" onClick={() => void saveEdit()}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 删除确认 ==================== */}
      {confirmDel && (
        <div className="dialog-backdrop" onClick={() => setConfirmDel(null)}>
          <div className="habit-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="habit-dialog-title">删除习惯</div>
            <p className="habit-dialog-text">
              删除「{confirmDel.name}」？其全部打卡记录也会一并清除。
            </p>
            <div className="habit-dialog-actions">
              <button className="habit-dialog-cancel" onClick={() => setConfirmDel(null)}>取消</button>
              <button className="habit-dialog-danger" onClick={() => void doDelete()}>
                <Trash2 size={14} /> 删除
              </button>
            </div>
          </div>
        </div>
      )}

      {habitMenu && (
        <ContextMenu
          x={habitMenu.x}
          y={habitMenu.y}
          title={habitMenu.habit.name}
          items={buildHabitMenuItems(habitMenu.habit)}
          onClose={() => setHabitMenu(null)}
        />
      )}
    </div>
  );
}
