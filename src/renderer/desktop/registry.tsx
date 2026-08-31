import { AppWindow, Blocks, CalendarDays, CloudSun, FileText, FolderOpen, History, ListTodo, Power, RefreshCw, Timer, Trash2, X, type LucideIcon } from "lucide-react";
import type { FocusTimerState, WeatherState, WidgetManifest, WidgetViewKind } from "../../shared/desktop";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { Task } from "../schedule/types";
import { useAppStore } from "../schedule/store";
import { api } from "../api";
import { useDesktopStore } from "./store";

export type WidgetRegistry = ReadonlyMap<string, { manifest: WidgetManifest; Icon: LucideIcon; render: (kind: WidgetViewKind) => ReactNode }>;

const WIDGET_ICONS: Readonly<Record<string, LucideIcon>> = {
  "today.tasks": ListTodo, "today.calendar": CalendarDays, "today.focus": Timer, "today.weather": CloudSun,
  "today.history": History, "desktop.shortcuts": FolderOpen, "system.recycle-bin": Trash2, "system.power": Power,
};

function DeferredWidget({ description, moduleId }: { description: string; moduleId?: string }) {
  return <div className="widget-empty-slot"><div className="widget-empty-title">当前提供摘要信息</div><p className="widget-empty-desc">{description}</p><div className="widget-empty-action">{moduleId ? "请从顶部场景导航进入完整页面" : "该组件暂未接入，不提供无效操作"}</div></div>;
}

function TaskWidget({ variant = "today" }: { variant?: "today" | "overview" | "overdue" }) {
  const tasks = useAppStore((state) => state.tasks);
  const loaded = useAppStore((state) => state.loaded);
  const loadAll = useAppStore((state) => state.loadAll);
  const toggleTask = useAppStore((state) => state.toggleTask);
  useEffect(() => { if (!loaded) void loadAll(); }, [loaded, loadAll]);
  const today = new Date().toISOString().slice(0, 10);
  const candidates = tasks.filter((task) => task.status === "open" && (variant === "overdue" ? Boolean(task.dueDate && task.dueDate < today) : variant === "today" ? task.dueDate === today : true)).slice(0, 5);
  return <div className="widget-data-list">{!loaded ? <span className="widget-mute">正在读取任务…</span> : candidates.length === 0 ? <span className="widget-mute">{variant === "overdue" ? "暂无逾期事项" : variant === "today" ? "今天暂无到期任务" : "暂无未完成任务"}</span> : candidates.map((task: Task) => <button className="widget-data-row" key={task.id} onClick={() => void toggleTask(task.id)} title="点击完成任务"><span>{task.title}</span><small>{task.dueTime ?? (task.dueDate ?? "待安排")}</small></button>)}</div>;
}

function CalendarWidget() {
  const events = useAppStore((state) => state.events);
  const loaded = useAppStore((state) => state.loaded);
  const loadAll = useAppStore((state) => state.loadAll);
  useEffect(() => { if (!loaded) void loadAll(); }, [loaded, loadAll]);
  const today = new Date().toISOString().slice(0, 10);
  const todayEvents = events.filter((event) => event.startAt.slice(0, 10) === today).slice(0, 4);
  return <div className="widget-data-list"><strong>{today}</strong>{todayEvents.length ? todayEvents.map((event) => <div className="widget-data-row" key={event.id}><span>{event.title}</span><small>{event.isAllDay ? "全天" : event.startAt.slice(11, 16)}</small></div>) : <span className="widget-mute">今天暂无日程</span>}</div>;
}

function DesktopShortcutsWidget() {
  const files = useDesktopStore((state) => state.desktopFiles);
  const refresh = useDesktopStore((state) => state.refreshDesktopFiles);
  const [message, setMessage] = useState("");
  const entries = files?.files.slice().sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order).slice(0, 12) ?? [];
  const sync = async () => { try { setMessage("正在同步桌面…"); await refresh(); setMessage("同步完成，只更新了镜像记录。"); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } };
  const toggleAutoSync = async () => { if (!files) return; const next = await api.desktop.setDesktopAutoSync(!files.autoSync); useDesktopStore.setState({ desktopFiles: next }); setMessage(next.autoSync ? "已开启启动时自动同步。" : "已关闭启动时自动同步。"); };
  const open = async (id: string) => { try { await api.desktop.openDesktopFile(id); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } };
  const remove = async (id: string) => { const next = await api.desktop.removeDesktopMirror(id); useDesktopStore.setState({ desktopFiles: next }); setMessage("已从工作台移除镜像，源文件未改动。"); };
  return <div className="widget-shortcuts"><div className="widget-shortcuts-summary"><span>{files?.lastSyncedAt ? `${files.files.length} 个桌面镜像` : "尚未同步桌面"}</span><div><button className={`widget-mini-btn${files?.autoSync ? " is-active" : ""}`} title="切换启动时自动同步" onClick={() => void toggleAutoSync()}>自动</button><button className="widget-mini-btn" title="只读取桌面入口元信息，不读取文件内容" onClick={() => void sync()}><RefreshCw size={13} />同步桌面</button></div></div>{entries.length ? <div className="shortcut-grid">{entries.map((file) => { const Fallback = file.kind === "folder" ? FolderOpen : file.kind === "app" ? AppWindow : FileText; return <div className={`shortcut-tile${file.exists ? "" : " is-missing"}`} key={file.id}><button className="shortcut-open" title={file.exists ? `打开 ${file.displayName}` : `${file.displayName} · 来源失效`} onClick={() => void open(file.id)} disabled={!file.exists}>{file.iconDataUrl ? <img src={file.iconDataUrl} alt="" /> : <Fallback size={24} />}<span>{file.displayName}</span></button><button className="shortcut-remove" title="仅从工作台移除镜像" aria-label={`移除 ${file.displayName} 的镜像`} onClick={() => void remove(file.id)}><X size={12} /></button>{!file.exists ? <small>来源失效</small> : null}</div>; })}</div> : <div className="shortcut-empty"><FolderOpen size={28} /><strong>把常用桌面入口带进工作台</strong><span>仅保存路径、名称、图标和分组，不移动或读取文件内容。</span><button className="widget-btn" onClick={() => void sync()}>同步桌面</button></div>}{message ? <div className="widget-shortcuts-message" aria-live="polite">{message}</div> : null}</div>;
}

function FocusWidget() {
  const [state, setState] = useState<FocusTimerState>({ phase: "idle", durationSeconds: 25 * 60, remainingSeconds: 25 * 60, endsAt: null, updatedAt: new Date().toISOString(), segments: [], sessionId: null, activityId: null, categoryId: null, plannedSeconds: 25 * 60 });
  useEffect(() => { void api.desktop.focusTimerGet().then(setState); return api.desktop.onFocusTimer(setState); }, []);
  const minutes = Math.floor(state.remainingSeconds / 60).toString().padStart(2, "0");
  const seconds = (state.remainingSeconds % 60).toString().padStart(2, "0");
  const phaseLabel = state.phase === "focus" ? "专注中" : state.phase === "paused" ? "已暂停" : state.phase === "break" ? "休息中" : "准备专注";
  const toggle = () => void (state.phase === "focus" ? api.desktop.focusTimerPause() : api.desktop.focusTimerStart(state.phase === "paused" ? state.remainingSeconds : 25 * 60));
  const progress = state.durationSeconds ? Math.max(0, Math.min(1, 1 - state.remainingSeconds / state.durationSeconds)) : 0;
  return <div className="widget-focus"><div className="widget-focus-phase">{phaseLabel}</div><div className="widget-focus-ring" style={{ "--focus-progress": `${progress * 360}deg` } as CSSProperties}><div className="widget-focus-clock">{minutes}:{seconds}</div></div><div className="widget-focus-actions"><button className="widget-focus-btn primary" onClick={toggle}>{state.phase === "focus" ? "暂停" : "开始"}</button><button className="widget-focus-btn" onClick={() => void api.desktop.focusTimerReset()}>重置</button></div></div>;
}

function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherState>({ status: "idle", city: "未配置", temperature: null, weatherText: "待加载", humidity: null, uvIndex: null, updatedAt: null });
  useEffect(() => { void api.desktop.getWeather().then(setWeather); return api.desktop.onWeather(setWeather); }, []);
  if (weather.city === "未配置") return <div className="widget-weather widget-weather-unconfigured"><CloudSun size={30} /><strong>天气尚未配置</strong><span className="widget-mute">当前版本未开放城市设置，不提供无效入口。</span></div>;
  return <div className="widget-weather"><div className="widget-weather-row"><CloudSun size={18} /><strong>{weather.city}</strong><span className="widget-weather-tag">{weather.status === "loading" ? "加载中" : weather.status === "error" ? "暂不可用" : weather.weatherText}</span></div><div className="widget-weather-main"><span className="widget-weather-temp">{weather.temperature ?? "—"}°</span><div className="widget-weather-meta"><div>湿度 {weather.humidity ?? "—"}%</div><div>紫外线 {weather.uvIndex ?? "—"}</div></div></div>{weather.status === "error" ? <button className="widget-mini-btn" onClick={() => void api.desktop.getWeather().then(setWeather)}>重新加载</button> : null}</div>;
}

function RecycleWidget() { return <div className="widget-soft"><strong>Windows 回收站</strong><p className="widget-mute">这里只提供打开入口，不直接清空。</p><div className="widget-action-row"><button className="widget-btn" onClick={() => void api.desktop.openRecycleBin()}>打开回收站</button></div></div>; }

function PowerWidget() {
  const [pending, setPending] = useState<{ action: "shutdown" | "restart"; token: string } | null>(null);
  const [message, setMessage] = useState("");
  const request = async (action: "shutdown" | "restart") => { const ticket = await api.desktop.requestPowerAction(action); setPending({ action, token: ticket.token }); setMessage(`请再次确认${action === "shutdown" ? "关机" : "重启"}。`); };
  const confirm = async () => { if (!pending) return; await api.desktop.confirmPowerAction(pending.token); setPending(null); setMessage("操作已提交。"); };
  return <div className="widget-soft"><strong>电源操作</strong>{pending ? <div className="widget-confirm"><span>{message}</span><button className="widget-btn danger" onClick={() => void confirm()}>确认{pending.action === "shutdown" ? "关机" : "重启"}</button><button className="widget-btn" onClick={() => setPending(null)}>取消</button></div> : <div className="widget-action-row"><button className="widget-btn danger" onClick={() => void request("shutdown")}>关机</button><button className="widget-btn warning" onClick={() => void request("restart")}>重启</button></div>}{message && !pending ? <div className="widget-mute">{message}</div> : null}</div>;
}

export function buildWidgetRegistry(manifests: WidgetManifest[]): WidgetRegistry {
  const registry = new Map<string, { manifest: WidgetManifest; Icon: LucideIcon; render: (kind: WidgetViewKind) => ReactNode }>();
  for (const manifest of manifests) {
    const Icon = WIDGET_ICONS[manifest.id] ?? Blocks;
    const render = (kind: WidgetViewKind): ReactNode => {
      switch (manifest.id) {
        case "today.tasks": return <TaskWidget />;
        case "today.calendar": return <CalendarWidget />;
        case "today.focus": return <FocusWidget />;
        case "today.weather": return <WeatherWidget />;
        case "system.recycle-bin": return <RecycleWidget />;
        case "system.power": return <PowerWidget />;
        case "desktop.shortcuts": return <DesktopShortcutsWidget />;
        case "today.history": return <DeferredWidget description={manifest.description} />;
        default: return <DeferredWidget description={kind === "card" ? manifest.description : `展开视图：${manifest.description}`} />;
      }
    };
    registry.set(manifest.id, { manifest, Icon, render });
  }
  return registry;
}
