import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import {
  BookOpen,
  CalendarDays,
  Check,
  CircleDot,
  Clock3,
  Droplets,
  Dumbbell,
  Flame,
  Languages,
  MoreHorizontal,
  Moon,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Sunrise,
  Trash2,
} from "lucide-react";
import type { Habit, HabitRecord } from "../types";
import {
  calculateHabitMetrics,
  getHabitCount,
  type HabitTrendRange,
} from "./metrics";
import "./HabitsSceneV2.css";

export interface HabitDraft {
  name: string;
  icon: string;
  color: string;
  targetCount: number;
}

export interface HabitsSceneV2Props {
  habits: Habit[];
  records: HabitRecord[];
  selectedDate: string;
  onSelectedDateChange?: (date: string) => void;
  onSetRecord?: (habitId: string, date: string, count: number) => void | Promise<void>;
  onCreateHabit?: (draft: HabitDraft) => void | Promise<void>;
  onUpdateHabit?: (habitId: string, draft: HabitDraft) => void | Promise<void>;
  onDeleteHabit?: (habitId: string) => void | Promise<void>;
  onViewHabit?: (habitId: string) => void;
  initialDialog?: "create" | null;
}

type Filter = "all" | "pending" | "done";
type DialogState = { mode: "create"; habit: null } | { mode: "edit"; habit: Habit } | null;

const COLORS = ["#79ad93", "#7697ad", "#d1a85f", "#a78eb8", "#bf7d76"];
const ICONS = [
  { value: "sunrise", label: "早起" },
  { value: "droplets", label: "洗漱或饮水" },
  { value: "dumbbell", label: "锻炼" },
  { value: "shield-check", label: "避免坏习惯" },
  { value: "moon", label: "早睡" },
  { value: "book", label: "阅读或学习" },
  { value: "clock", label: "专注或时间" },
  { value: "languages", label: "语言学习" },
  { value: "sparkles", label: "其他习惯" },
] as const;

const iconMap = {
  book: BookOpen,
  droplets: Droplets,
  clock: Clock3,
  languages: Languages,
  dumbbell: Dumbbell,
  "shield-check": ShieldCheck,
  moon: Moon,
  sunrise: Sunrise,
  check: Check,
  sparkles: Sparkles,
};

function HabitIcon({ name, size = 17 }: { name: string; size?: number }) {
  const Icon = iconMap[name as keyof typeof iconMap] ?? CircleDot;
  return <Icon size={size} aria-hidden="true" />;
}

function formatDisplayDate(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  }).format(value);
}

function clampTarget(value: number): number {
  return Math.min(20, Math.max(1, Math.round(value || 1)));
}

function draftFromHabit(habit?: Habit | null): HabitDraft {
  return {
    name: habit?.name ?? "",
    icon: habit?.icon ?? "sparkles",
    color: habit?.color ?? COLORS[0],
    targetCount: habit?.targetCount ?? 1,
  };
}

export default function HabitsSceneV2({
  habits,
  records,
  selectedDate,
  onSelectedDateChange,
  onSetRecord,
  onCreateHabit,
  onUpdateHabit,
  onDeleteHabit,
  onViewHabit,
  initialDialog = null,
}: HabitsSceneV2Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [trendRange, setTrendRange] = useState<HabitTrendRange>(30);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(initialDialog === "create" ? { mode: "create", habit: null } : null);
  const [draft, setDraft] = useState<HabitDraft>(() => draftFromHabit());
  const [notice, setNotice] = useState("");
  const metrics = useMemo(
    () => calculateHabitMetrics(habits, records, selectedDate, trendRange),
    [habits, records, selectedDate, trendRange],
  );

  useEffect(() => {
    const closeMenu = () => setOpenMenuId(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenuId(null);
        setDialog(null);
      }
    };
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const isDone = (habit: Habit) => getHabitCount(records, habit.id, selectedDate) >= Math.max(1, habit.targetCount);
  const filteredHabits = habits.filter((habit) => {
    if (filter === "done") return isDone(habit);
    if (filter === "pending") return !isDone(habit);
    return true;
  });

  const openCreate = () => {
    setDraft(draftFromHabit());
    setDialog({ mode: "create", habit: null });
  };

  const openEdit = (habit: Habit) => {
    setDraft(draftFromHabit(habit));
    setDialog({ mode: "edit", habit });
    setOpenMenuId(null);
  };

  const setCount = (habit: Habit, next: number) => {
    void onSetRecord?.(habit.id, selectedDate, Math.max(0, next));
  };

  const toggleHabit = (habit: Habit) => {
    const current = getHabitCount(records, habit.id, selectedDate);
    setCount(habit, current >= habit.targetCount ? current - 1 : current + 1);
  };

  const submitDialog = (event: FormEvent) => {
    event.preventDefault();
    const nextDraft = { ...draft, name: draft.name.trim(), targetCount: clampTarget(draft.targetCount) };
    if (!nextDraft.name) return;
    if (dialog?.mode === "edit") void onUpdateHabit?.(dialog.habit.id, nextDraft);
    else void onCreateHabit?.(nextDraft);
    setDialog(null);
  };

  const viewHabit = (habit: Habit) => {
    setOpenMenuId(null);
    if (onViewHabit) onViewHabit(habit.id);
    else setNotice(`已选择「${habit.name}」的详情入口（候选预览不读取真实记录）`);
  };

  return (
    <section className="habits-v2-root" aria-label="习惯候选场景">
      <header className="h2v2-scene-heading">
        <div>
          <span className="h2v2-eyebrow">HABIT SYSTEM</span>
          <h1>习惯</h1>
          <p>今日打卡、连续记录与近期趋势集中呈现</p>
        </div>
        <div className="h2v2-heading-actions">
          <label className="h2v2-ghost-button h2v2-date-control">
            <CalendarDays size={16} aria-hidden="true" />
            <span>{formatDisplayDate(selectedDate)}</span>
            <input
              type="date"
              aria-label="选择习惯日期"
              value={selectedDate}
              onChange={(event) => onSelectedDateChange?.(event.target.value)}
            />
          </label>
          <button className="h2v2-primary-button" type="button" onClick={openCreate}>
            <Plus size={16} aria-hidden="true" /> 新建习惯
          </button>
        </div>
      </header>

      <section className="h2v2-metrics" aria-label="习惯摘要">
        <MetricCard label="今日完成" value={metrics.todayCompleted} suffix={`/ ${metrics.todayTotal}`} tone="green" progress={metrics.todayTotal ? metrics.todayCompleted / metrics.todayTotal : 0} />
        <MetricCard label="最长连续" value={metrics.longestStreak} suffix="天" tone="amber" progress={Math.min(1, metrics.longestStreak / 30)} />
        <MetricCard label="本周完成率" value={metrics.weekCompletionRate} suffix="%" tone="steel" progress={metrics.weekCompletionRate / 100} />
        <MetricCard label="本月打卡" value={metrics.monthCheckins} suffix="次" tone="green" progress={Math.min(1, metrics.monthCheckins / Math.max(1, habits.length * 20))} />
      </section>

      <section className="h2v2-workspace">
        <section className="h2v2-panel h2v2-list-panel">
          <header className="h2v2-panel-header">
            <div>
              <span className="h2v2-eyebrow">TODAY</span>
              <h2>今日习惯</h2>
            </div>
            <div className="h2v2-segmented" role="group" aria-label="筛选习惯">
              {(["all", "pending", "done"] as Filter[]).map((value) => (
                <button
                  className={filter === value ? "active" : ""}
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                >
                  {{ all: "全部", pending: "未完成", done: "已完成" }[value]}
                </button>
              ))}
            </div>
          </header>

          {filteredHabits.length ? (
            <div className="h2v2-habit-list">
              {filteredHabits.map((habit) => {
                const count = getHabitCount(records, habit.id, selectedDate);
                const done = count >= habit.targetCount;
                const streak = metrics.ranking.find((item) => item.habit.id === habit.id)?.streak ?? 0;
                return (
                  <article
                    className={`h2v2-habit-row${done ? " is-done" : ""}`}
                    key={habit.id}
                    style={{ "--habit-accent": habit.color } as CSSProperties}
                  >
                    <button
                      className="h2v2-check"
                      type="button"
                      aria-label={done ? `撤销一次 ${habit.name}` : `打卡 ${habit.name}`}
                      onClick={() => toggleHabit(habit)}
                    >
                      {done ? <Check size={14} aria-hidden="true" /> : count > 0 ? <span>{Math.min(count, habit.targetCount)}</span> : null}
                    </button>
                    <span className="h2v2-habit-symbol"><HabitIcon name={habit.icon} /></span>
                    <div className="h2v2-habit-copy">
                      <strong>{habit.name}</strong>
                      <small>每天 · {habit.targetCount} 次{count > 0 && !done ? ` · 今日 ${count}/${habit.targetCount}` : ""}</small>
                    </div>
                    <span className="h2v2-streak"><Sparkles size={13} aria-hidden="true" /> {streak} 天</span>
                    <div className="h2v2-row-menu-wrap" onPointerDown={(event) => event.stopPropagation()}>
                      <button
                        className="h2v2-row-action"
                        type="button"
                        aria-label={`${habit.name} 更多操作`}
                        title="更多操作"
                        onClick={() => setOpenMenuId((current) => current === habit.id ? null : habit.id)}
                      >
                        <MoreHorizontal size={17} aria-hidden="true" />
                      </button>
                      {openMenuId === habit.id && (
                        <div className="h2v2-menu" role="menu">
                          <button type="button" role="menuitem" onClick={() => openEdit(habit)}><Pencil size={14} />编辑</button>
                          <button type="button" role="menuitem" onClick={() => viewHabit(habit)}><Flame size={14} />查看详情</button>
                          <button className="danger" type="button" role="menuitem" onClick={() => void onDeleteHabit?.(habit.id)}><Trash2 size={14} />删除</button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="h2v2-empty">
              <span className="h2v2-empty-icon"><Sparkles size={24} aria-hidden="true" /></span>
              <h3>{habits.length ? "这个筛选下没有习惯" : "从一个轻量习惯开始"}</h3>
              <p>{habits.length ? "切换筛选即可查看其他习惯。" : "例如每天阅读一次，目标和颜色之后都可以调整。"}</p>
              {!habits.length && <button className="h2v2-primary-button" type="button" onClick={openCreate}><Plus size={16} />新建第一个习惯</button>}
            </div>
          )}
        </section>

        <aside className="h2v2-panel h2v2-insights">
          <header className="h2v2-panel-header">
            <div><span className="h2v2-eyebrow">TREND</span><h2>近期趋势</h2></div>
            <div className="h2v2-segmented h2v2-range" role="group" aria-label="趋势范围">
              {([7, 30, 90] as HabitTrendRange[]).map((range) => (
                <button className={trendRange === range ? "active" : ""} key={range} type="button" onClick={() => setTrendRange(range)}>{range} 天</button>
              ))}
            </div>
          </header>
          <div className="h2v2-completion-ring" style={{ "--completion-rate": `${metrics.rangeCompletionRate * 3.6}deg` } as CSSProperties}>
            <div><strong>{metrics.rangeCompletionRate}%</strong><span>综合完成率</span></div>
          </div>
          <section className="h2v2-heatmap">
            <header><span>打卡热力</span><small>过去 8 周</small></header>
            <div>
              {metrics.heatmap.map((day) => <i className={`level-${day.level}`} key={day.date} title={`${day.date} · ${day.completed}/${day.total}`} />)}
            </div>
            <footer><span>少</span><i className="level-1" /><i className="level-2" /><i className="level-3" /><i className="level-4" /><span>多</span></footer>
          </section>
          <section className="h2v2-ranking">
            <header>连续记录</header>
            {metrics.ranking.slice(0, 3).map(({ habit, streak }) => (
              <article key={habit.id} style={{ "--habit-accent": habit.color } as CSSProperties}>
                <span className="h2v2-habit-symbol"><HabitIcon name={habit.icon} size={14} /></span>
                <span><strong>{habit.name}</strong><small>当前连续 {streak} 天</small></span>
                <b>{streak}</b>
              </article>
            ))}
            {!metrics.ranking.length && <p className="h2v2-ranking-empty">完成第一次打卡后，这里会出现连续记录。</p>}
          </section>
        </aside>
      </section>

      {notice && <button className="h2v2-toast" type="button" onClick={() => setNotice("")}>{notice}</button>}

      {dialog && (
        <div className="h2v2-dialog-backdrop" role="presentation" onPointerDown={() => setDialog(null)}>
          <form className="h2v2-dialog" aria-label={dialog.mode === "create" ? "新建习惯" : "编辑习惯"} onSubmit={submitDialog} onPointerDown={(event) => event.stopPropagation()}>
            <header><div><span className="h2v2-eyebrow">HABIT EDITOR</span><h2>{dialog.mode === "create" ? "新建习惯" : "编辑习惯"}</h2></div><button type="button" aria-label="关闭" onClick={() => setDialog(null)}>×</button></header>
            <label><span>习惯名称</span><input autoFocus value={draft.name} placeholder="例如：晨间阅读" onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <fieldset><legend>图标</legend><div className="h2v2-icon-grid">{ICONS.map(({ value, label }) => <button className={draft.icon === value ? "active" : ""} type="button" key={value} aria-label={`选择${label}图标`} title={label} onClick={() => setDraft({ ...draft, icon: value })}><HabitIcon name={value} /></button>)}</div></fieldset>
            <fieldset><legend>颜色</legend><div className="h2v2-color-grid">{COLORS.map((color) => <button className={draft.color === color ? "active" : ""} style={{ backgroundColor: color }} type="button" key={color} aria-label={`选择颜色 ${color}`} onClick={() => setDraft({ ...draft, color })} />)}</div></fieldset>
            <label><span>每日目标次数</span><input type="number" min="1" max="20" value={draft.targetCount} onChange={(event) => setDraft({ ...draft, targetCount: clampTarget(Number(event.target.value)) })} /></label>
            <footer><button className="h2v2-ghost-button" type="button" onClick={() => setDialog(null)}>取消</button><button className="h2v2-primary-button" type="submit">保存习惯</button></footer>
          </form>
        </div>
      )}
    </section>
  );
}

function MetricCard({ label, value, suffix, progress, tone }: { label: string; value: number; suffix: string; progress: number; tone: "green" | "amber" | "steel" }) {
  return (
    <article className="h2v2-panel h2v2-metric-card">
      <span>{label}</span><strong>{value} <small>{suffix}</small></strong>
      <i className={`h2v2-metric-line ${tone}`} style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
    </article>
  );
}
