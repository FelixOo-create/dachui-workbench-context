import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CirclePause, CirclePlay, RotateCcw, Save, Plus, Target, Check, Timer, TrendingUp, type LucideIcon } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { api } from "../../../api";
import type { FocusTimerState } from "../../../../shared/desktop";
import type { CSSProperties } from "react";
import type { Activity, Category, TimeEntry } from "./types";
import { timelogApi } from "./api";
import { dateToKey } from "./utils";

type Catalog = { categories: Category[]; activities: Activity[] };
type Session = { id: string; activityId: string | null; categoryId: string | null; plannedSeconds: number; startedAt: string; endedAt: string | null; status: "started" | "completed" | "saved" | "cancelled" };

const emptyTimer: FocusTimerState = { phase: "idle", durationSeconds: 25 * 60, remainingSeconds: 25 * 60, endsAt: null, updatedAt: new Date().toISOString(), segments: [], sessionId: null, activityId: null, categoryId: null, plannedSeconds: 25 * 60 };
const dayBounds = (date: string) => ({ start: new Date(`${date}T00:00:00`), end: new Date(new Date(`${date}T00:00:00`).getTime() + 86400000) });
const formatDuration = (seconds: number) => `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
const shortDuration = (seconds: number) => `${Math.floor(seconds / 60)}m`;
const clippedSeconds = (entry: TimeEntry, bounds: { start: Date; end: Date }) => Math.max(0, (Math.min(new Date(entry.endTime).getTime(), bounds.end.getTime()) - Math.max(new Date(entry.startTime).getTime(), bounds.start.getTime())) / 1000);

function normalizeTimer(value: FocusTimerState): FocusTimerState { return { ...emptyTimer, ...value, segments: Array.isArray(value.segments) ? value.segments : [] }; }

export default function FocusReviewView({ catalog, onSupplement }: { catalog: Catalog; onSupplement: () => void }) {
  const [date, setDate] = useState(dateToKey(new Date()));
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [timer, setTimer] = useState<FocusTimerState>(emptyTimer);
  const [tag, setTag] = useState("");
  const [duration, setDuration] = useState(25 * 60);
  const [error, setError] = useState<string | null>(null);
  const handledSession = useRef<string | null>(null);
  const previousPhase = useRef(timer.phase);
  const bounds = useMemo(() => dayBounds(date), [date]);
  const reload = useCallback(async () => {
    const [nextEntries, nextSessions] = await Promise.all([timelogApi.timeEntries.byDate(date), timelogApi.focusSessions.byRange(bounds.start.toISOString(), bounds.end.toISOString())]);
    setEntries(nextEntries); setSessions(nextSessions);
  }, [date, bounds]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { void api.desktop.focusTimerGet().then((next) => setTimer(normalizeTimer(next))).catch(() => undefined); return api.desktop.onFocusTimer((next) => setTimer(normalizeTimer(next))); }, []);
  useEffect(() => {
    if (timer.message) setError(timer.message);
    if (timer.phase === "idle" && (previousPhase.current === "focus" || previousPhase.current === "paused") && timer.sessionId && timer.segments.length && handledSession.current !== timer.sessionId) {
      handledSession.current = timer.sessionId;
      setError(null);
      void reload();
    }
    previousPhase.current = timer.phase;
  }, [timer, reload]);
  useEffect(() => {
    if (timer.phase !== "focus" || !timer.endsAt) return;
    const id = window.setInterval(() => setTimer((current) => ({ ...current, remainingSeconds: Math.max(0, Math.ceil((new Date(current.endsAt ?? 0).getTime() - Date.now()) / 1000)) })), 500);
    return () => window.clearInterval(id);
  }, [timer.phase, timer.endsAt]);

  const activityMap = useMemo(() => new Map(catalog.activities.map((item) => [item.id, item])), [catalog.activities]);
  const categoryMap = useMemo(() => new Map(catalog.categories.map((item) => [item.id, item])), [catalog.categories]);
  const selected = useMemo(() => { const [kind, id] = tag.split(":"); return kind === "activity" ? { activityId: id, categoryId: activityMap.get(id)?.categoryId ?? null } : kind === "category" ? { activityId: null, categoryId: id } : { activityId: null, categoryId: null }; }, [tag, activityMap]);
  const todayEntries = useMemo(() => entries.filter((entry) => entry.endTime > bounds.start.toISOString() && entry.startTime < bounds.end.toISOString()), [entries, bounds]);
  const focusSeconds = todayEntries.reduce((sum, entry) => sum + clippedSeconds(entry, bounds), 0);
  const pomodoroSessions = sessions.filter((session) => session.status === "completed" || session.status === "saved");
  const completed = sessions.filter((session) => session.status === "completed");
  const longestEntry = todayEntries.reduce<TimeEntry | null>((max, entry) => !max || clippedSeconds(entry, bounds) > clippedSeconds(max, bounds) ? entry : max, null);
  const longest = longestEntry ? clippedSeconds(longestEntry, bounds) : 0;
  const completionRate = sessions.length ? Math.round((completed.length / sessions.length) * 100) : 0;
  const distribution = useMemo(() => { const map = new Map<string, number>(); for (const entry of todayEntries) { const key = entry.activityId ? `activity:${entry.activityId}` : `category:${entry.categoryId ?? "unknown"}`; map.set(key, (map.get(key) ?? 0) + clippedSeconds(entry, bounds) / 60); } return [...map.entries()].sort((a, b) => b[1] - a[1]); }, [todayEntries, bounds]);
  const maxDistribution = Math.max(1, ...distribution.map(([, value]) => value));
  const timelineStart = new Date(`${date}T08:00:00`); const timelineEnd = bounds.end;
  const timeline = useMemo(() => todayEntries.map((entry) => { const start = Math.max(new Date(entry.startTime).getTime(), timelineStart.getTime()); const end = Math.min(new Date(entry.endTime).getTime(), timelineEnd.getTime()); return { entry, left: Math.max(0, (start - timelineStart.getTime()) / (timelineEnd.getTime() - timelineStart.getTime())) * 100, width: Math.max(0.6, (end - start) / (timelineEnd.getTime() - timelineStart.getTime()) * 100) }; }).filter(({ width }) => width > 0), [todayEntries, timelineStart, timelineEnd]);
  const clock = `${Math.floor(timer.remainingSeconds / 60).toString().padStart(2, "0")}:${(timer.remainingSeconds % 60).toString().padStart(2, "0")}`;
  const phaseLabel = timer.phase === "focus" ? "正在专注" : timer.phase === "paused" ? "已暂停" : "准备专注";
  const canStart = Boolean(selected.activityId || selected.categoryId);

  async function start() { if (!canStart) { setError("请先选择一个现有标签"); return; } setError(null); try { const next = normalizeTimer(await api.desktop.focusTimerStart(duration, selected)); if (!window.workbench && next.sessionId) await timelogApi.focusSessions.start({ id: next.sessionId, activityId: next.activityId, categoryId: next.categoryId, plannedSeconds: next.plannedSeconds, startedAt: next.segments[0]?.startAt ?? new Date().toISOString() }); setTimer(next); } catch (e) { setError(String((e as Error)?.message ?? e)); } }
  async function finish(status: "completed" | "saved") { setError(null); try { const next = await api.desktop.focusTimerFinish(status); if (!window.workbench && next.sessionId && (next.activityId || next.categoryId)) { await timelogApi.timeEntries.createPomodoro({ activityId: next.activityId ?? undefined, categoryId: next.categoryId ?? undefined, pomodoroSessionId: next.sessionId, pomodoroStatus: status, plannedSeconds: next.plannedSeconds, segments: next.segments.filter((segment): segment is { startAt: string; endAt: string } => Boolean(segment.endAt)) }); await timelogApi.focusSessions.finish(next.sessionId, status); } setTimer(normalizeTimer(next)); await reload(); } catch (e) { setError(String((e as Error)?.message ?? e)); } }
  async function reset() { setError(null); try { if (!window.workbench && timer.sessionId) await timelogApi.focusSessions.cancel(timer.sessionId); const next = await api.desktop.focusTimerReset(); setTimer(normalizeTimer(next)); await reload(); } catch (e) { setError(String((e as Error)?.message ?? e)); } }

  const metrics: Array<{ Icon: LucideIcon; label: string; value: string; hint: string; progress: number }> = [
    { Icon: Target, label: "今日有效专注", value: formatDuration(focusSeconds), hint: `较昨日记录 ${focusSeconds ? "+" + Math.round(focusSeconds / 60) + "m" : "—"}`, progress: focusSeconds ? 70 : 0 },
    { Icon: Check, label: "完成番茄", value: `${completed.length} 轮`, hint: `${pomodoroSessions.length} 轮有效会话`, progress: completed.length ? 70 : 0 },
    { Icon: TrendingUp, label: "最长连续专注", value: formatDuration(longest), hint: longest ? "来自今日时间流" : "等待第一段记录", progress: longest ? 70 : 0 },
    { Icon: Timer, label: "番茄完成率", value: `${completionRate}%`, hint: sessions.length ? `${completed.length} 完成 / ${sessions.length} 启动` : "尚无启动记录", progress: completionRate },
  ];
  return <div className="focus-review-page" data-testid="focus-review-page">
    <header className="focus-review-header"><div className="focus-review-kicker">FOCUS REVIEW</div><h1>今日专注</h1><p>番茄钟自动沉淀时间，用标签看清今天真正投入在哪里</p><div className="focus-review-actions"><button onClick={() => setDate(dateToKey(new Date(bounds.start.getTime() - 86400000)))}><ChevronLeft size={15} /></button><span>{format(bounds.start, "M月d日 EEEE", { locale: zhCN })}</span><button onClick={() => setDate(dateToKey(new Date(bounds.start.getTime() + 86400000)))}><ChevronRight size={15} /></button><button className="secondary" onClick={onSupplement}><Plus size={14} />补记一段</button></div></header>
    {error && <div className="focus-review-error">{error}</div>}
    <div className="focus-review-grid">
      <section className="focus-timer-card"><div className="focus-ring" style={{ "--focus-progress": `${(1 - timer.remainingSeconds / Math.max(1, timer.durationSeconds)) * 360}deg` } as CSSProperties}><strong>{clock}</strong><span>FOCUSING</span></div><div className="focus-timer-main"><div className="focus-review-kicker">{phaseLabel} · {timer.phase === "idle" ? "开始下一段" : `第 ${pomodoroSessions.length + 1} 个番茄`}</div><h2>完成后自动写入今日时间流</h2><p className="muted">暂停时间不会计入有效专注，重置不会生成记录。</p><div className="focus-tags"><select value={tag} onChange={(e) => setTag(e.target.value)} disabled={timer.phase !== "idle" && timer.phase !== "paused"}><option value="">选择活动或分类</option>{catalog.categories.map((category) => <optgroup key={category.id} label={category.name}>{catalog.activities.filter((activity) => activity.categoryId === category.id).map((activity) => <option key={activity.id} value={`activity:${activity.id}`}>{activity.name}</option>)}</optgroup>)}</select><button className={duration === 25 * 60 ? "active" : ""} onClick={() => setDuration(25 * 60)}>25 分</button><button className={duration === 50 * 60 ? "active" : ""} onClick={() => setDuration(50 * 60)}>50 分</button><button className="duration-input"><Timer size={13} /><input aria-label="番茄时长（分钟）" type="number" min={1} max={240} value={Math.round(duration / 60)} onChange={(e) => setDuration(Math.max(60, Math.min(14400, Number(e.target.value || 25) * 60)))} /></button></div><div className="focus-note">本轮事项 <strong>{selected.activityId ? activityMap.get(selected.activityId)?.name : selected.categoryId ? categoryMap.get(selected.categoryId)?.name : "尚未选择标签"}</strong></div><div className="focus-meta">本轮已专注 {shortDuration(timer.durationSeconds - timer.remainingSeconds)}　·　今日完成 {completed.length} 轮</div></div><div className="focus-timer-controls">{timer.phase === "focus" ? <button className="primary" onClick={() => void api.desktop.focusTimerPause()}><CirclePause size={16} />暂停</button> : timer.phase === "paused" ? <button className="primary" onClick={() => void api.desktop.focusTimerStart(timer.remainingSeconds, selected)}><CirclePlay size={16} />恢复</button> : <button className="primary" onClick={() => void start()}><CirclePlay size={16} />开始专注</button>}{timer.phase !== "idle" && <button onClick={() => void finish("saved")}><Save size={16} />结束并保存</button>}<button onClick={() => void reset()}><RotateCcw size={15} />重置</button></div></section>
      <div className="focus-metrics">{metrics.map(({ Icon, label, value, hint, progress }) => <article className="focus-metric" key={label}><Icon size={17} /><span>{label}</span><strong>{value}</strong><small>{hint}</small><i style={{ width: `${Math.min(100, progress)}%` }} /></article>)}</div>
      <section className="focus-flow-card"><div className="focus-section-heading"><div><div className="focus-review-kicker">TODAY FLOW</div><h2>一日专注时间流</h2></div><span><b />番茄自动记录 {pomodoroSessions.length} 段　<em />手工记录 {todayEntries.filter((entry) => entry.source !== "pomodoro").length} 段</span></div><div className="focus-time-axis">{["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00", "24:00"].map((label) => <span key={label}>{label}</span>)}</div><div className="focus-timeline">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ left: `${i * 8.333}%` }} />)}{timeline.map(({ entry, left, width }) => <div key={entry.id} className={`focus-bar ${entry.source === "pomodoro" ? "pomodoro" : "manual"}`} style={{ left: `${left}%`, width: `${width}%` }} title={`${format(new Date(entry.startTime), "HH:mm")} – ${format(new Date(entry.endTime), "HH:mm")}`} />)}</div><div className="focus-flow-list">{todayEntries.slice().sort((a, b) => a.startTime.localeCompare(b.startTime)).slice(-7).map((entry) => <div className="focus-flow-item" key={entry.id}><small>{format(new Date(entry.startTime), "HH:mm")} – {format(new Date(entry.endTime), "HH:mm")}</small><strong>{entry.activityId ? activityMap.get(entry.activityId)?.name : categoryMap.get(entry.categoryId ?? "")?.name ?? "未分类"}</strong><span>{entry.source === "pomodoro" ? "番茄" : "手工"}</span></div>)}<button className="focus-flow-add" onClick={onSupplement}><Plus size={18} /></button></div></section>
      <section className="focus-summary-card"><div className="focus-section-heading"><div><h2>今日总结</h2><p>只使用今日番茄记录与标签，帮助安排下一次专注</p></div><span className="summary-pill">按真实记录计算</span></div><div className="focus-summary-grid"><div className="distribution"><h3>标签投入分布</h3><strong>{formatDuration(focusSeconds)}</strong><small>{pomodoroSessions.length} 轮番茄 · {distribution.length} 个标签</small><div className="distribution-bars">{distribution.slice(0, 5).map(([key, value]) => { const [kind, id] = key.split(":"); const label = kind === "activity" ? activityMap.get(id)?.name : categoryMap.get(id)?.name; return <div key={key}><span>{label ?? "未分类"}</span><b><i style={{ width: `${(value / maxDistribution) * 100}%` }} /></b><em>{shortDuration(value * 60)}</em></div>; })}</div></div><div className="summary-panels"><article><span>当日高效时段</span><strong>{longestEntry ? `${format(new Date(Math.max(new Date(longestEntry.startTime).getTime(), bounds.start.getTime())), "HH:mm")} — ${format(new Date(Math.min(new Date(longestEntry.endTime).getTime(), bounds.end.getTime())), "HH:mm")}` : "等待记录"}</strong><small>最长专注段 {formatDuration(longest)}</small></article><article><span>番茄长度表现</span><strong>{pomodoroSessions.length ? `${Math.round(pomodoroSessions.reduce((sum, session) => sum + session.plannedSeconds, 0) / pomodoroSessions.length / 60)} 分钟更常用` : "尚无偏好"}</strong><small>基于已完成和提前保存的会话</small></article></div></div><div className="next-suggestion"><span>→</span><div><strong>下一次安排建议</strong><p>{selected.activityId ? `明日继续专注「${activityMap.get(selected.activityId)?.name ?? "当前活动"}」` : "选择一个标签，开始下一段可追溯的专注"}</p></div></div></section>
    </div>
  </div>;
}
