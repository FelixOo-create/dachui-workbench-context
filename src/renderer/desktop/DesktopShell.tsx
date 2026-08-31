import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { Blocks, CalendarDays, CloudSun, EyeOff, Grip, GripVertical, Hash, Home, LayoutGrid, ListTodo, Menu, Plus, RotateCcw, Settings, Sparkles, Wrench, X, type LucideIcon } from "lucide-react";
import type { DesktopLayout, DesktopLayoutPreset, DesktopSceneDefinition, WidgetManifest, WidgetPlacement, WidgetViewKind } from "../../shared/desktop";
import packageMetadata from "../../../package.json";
import { api } from "../api";
import { applyLayoutPreset, placementsForScene, reorderPlacement, resizePlacement, sceneHasPlacements, undoLayoutPreset, updatePlacement } from "./panels";
import { buildWidgetRegistry, type WidgetRegistry } from "./registry";
import { SceneRenderer } from "./SceneRenderer";
import SettingsWorkspaceScene from "./SettingsWorkspaceScene";
import { useDesktopStore } from "./store";
import "./DesktopShell.css";

const WEEK_LABELS = ["日", "一", "二", "三", "四", "五", "六"];
const SCENE_ICONS: Record<string, LucideIcon> = { today: Home, todo: ListTodo, timelog: CalendarDays, habits: Sparkles, memories: CalendarDays, canvas: Grip, tools: Wrench };
const APP_VERSION = `v${packageMetadata.version}`;
const PRESETS: Array<{ id: DesktopLayoutPreset; label: string; hint: string }> = [
  { id: "smart", label: "智能填充", hint: "按优先级与推荐尺寸紧凑排列" },
  { id: "split", label: "左右二分", hint: "两张主卡并列" },
  { id: "triple", label: "横向三分", hint: "三张等宽主卡" },
  { id: "quad", label: "四宫格", hint: "2×2 均衡布局" },
  { id: "hero", label: "主次布局", hint: "一张主卡搭配副卡" },
  { id: "free", label: "自由布局", hint: "手动拖动和缩放" },
];

function useShellTheme(): void { useEffect(() => { document.documentElement.setAttribute("data-desktop-theme", "dark"); }, []); }
function formatClock(date: Date): string { return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`; }

function TopBar({ settingsActive, onSelectScene }: { settingsActive: boolean; onSelectScene: (sceneId: DesktopSceneDefinition["id"]) => void }) {
  const [now, setNow] = useState(() => new Date());
  const scenes = useDesktopStore((state) => state.scenes).filter((scene) => scene.id !== "tools");
  const activeScene = useDesktopStore((state) => state.layout.activeScene);
  const weather = useDesktopStore((state) => state.weather);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(timer); }, []);
  const dateLabel = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} 周${WEEK_LABELS[now.getDay()]}`;
  return <header className="shell-topbar"><div className="shell-topbar-left"><div className="shell-pill shell-weather" title={`${weather.city} ${weather.weatherText}`}><CloudSun size={14} /><strong>{weather.city}</strong><span className="shell-pill-text">{weather.temperature !== null ? `${weather.temperature}°` : "—"} {weather.weatherText}</span></div><div className="shell-pill shell-calendar"><CalendarDays size={14} /><strong>{dateLabel}</strong><span className="shell-clock">{formatClock(now)}</span></div></div><nav className="shell-pager" aria-label="工作台场景">{scenes.map((scene) => { const Icon = SCENE_ICONS[scene.id] ?? Hash; const deferred = scene.id === "canvas"; return <button key={scene.id} className={`shell-pager-dot${!settingsActive && scene.id === activeScene ? " is-active" : ""}${deferred ? " is-deferred" : ""}`} title={deferred ? `${scene.label} · 后续开放` : `${scene.label} · ${scene.shortcut}`} aria-label={scene.label} disabled={deferred} onClick={() => onSelectScene(scene.id)}><Icon size={13} /><span>{scene.label}</span></button>; })}</nav><div className="shell-topbar-right"><span className="shell-version" title={`大锤的工作台 ${APP_VERSION}`} aria-label={`当前版本 ${APP_VERSION}`}>{APP_VERSION}</span></div></header>;
}

class WidgetErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: unknown, _info: ErrorInfo) { /* 单卡隔离。 */ }
  render() { return this.state.failed ? <div className="widget-empty-slot"><div className="widget-empty-title">组件暂时不可用</div><div className="widget-empty-action">其他场景不受影响</div></div> : this.props.children; }
}

function DesktopWidget({ placement, manifest, render, editMode, onHide, onMove, onResize }: { placement: WidgetPlacement; manifest: WidgetManifest; render: (kind: WidgetViewKind) => ReactNode; editMode: boolean; onHide: () => void; onMove: (direction: -1 | 1) => void; onResize: (colDelta: number, rowDelta: number) => void }) {
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const resizeStart = useRef<{ x: number; y: number } | null>(null);
  const area = placement.colSpan * placement.rowSpan;
  const density = area <= 9 ? "small" : area >= 25 ? "large" : "medium";
  return <section className={`shell-widget${editMode ? " is-editing" : ""}`} data-widget-id={placement.widgetId} data-density={density} style={{ gridColumn: `span ${placement.colSpan}`, gridRow: `span ${placement.rowSpan}` }}><header className="shell-widget-header"><button className="shell-widget-drag" title="拖动调整顺序" aria-label="拖动调整顺序" disabled={!editMode} onPointerDown={(event) => { if (!editMode) return; dragStart.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerUp={(event) => { const start = dragStart.current; dragStart.current = null; if (start && Math.abs(event.clientY - start.y) > 24) onMove(event.clientY > start.y ? 1 : -1); }}><GripVertical size={14} /></button><div className="shell-widget-title"><h2>{manifest.title}</h2><div className="shell-widget-meta">{manifest.description}</div></div>{editMode ? <button className="shell-widget-control" title="隐藏组件" aria-label="隐藏组件" onClick={onHide}><EyeOff size={14} /></button> : null}</header><div className="shell-widget-body"><WidgetErrorBoundary>{render("card")}</WidgetErrorBoundary></div>{editMode ? <button className="shell-widget-resize" title="拖动调整大小" aria-label="拖动调整大小" onPointerDown={(event) => { resizeStart.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerUp={(event) => { const start = resizeStart.current; resizeStart.current = null; if (start) onResize(Math.round((event.clientX - start.x) / 100), Math.round((event.clientY - start.y) / 100)); }}><Grip size={13} /></button> : null}</section>;
}

function ComponentLibrary({ scene, widgets, layout, onClose, onAdd }: { scene: DesktopSceneDefinition; widgets: WidgetManifest[]; layout: DesktopLayout; onClose: () => void; onAdd: (manifest: WidgetManifest) => void }) {
  const placements = layout.placements.filter((item) => item.sceneId === scene.id);
  return <div className="shell-library-backdrop" onMouseDown={onClose}><aside className="shell-library" onMouseDown={(event) => event.stopPropagation()}><header><div><strong>首页组件库</strong><span>添加和恢复日常总览组件</span></div><button className="shell-widget-control" title="关闭" aria-label="关闭组件库" onClick={onClose}><X size={16} /></button></header><div className="shell-library-list">{widgets.filter((widget) => widget.scenes.includes(scene.id)).map((widget) => { const placement = placements.find((item) => item.widgetId === widget.id); const deferred = widget.id === "today.history"; return <div className={`shell-library-item${deferred ? " is-deferred" : ""}`} key={widget.id}><div><strong>{widget.title}</strong><span>{deferred ? "后续开放，暂不加入首页" : widget.description}</span></div><button className="widget-btn" disabled={deferred || Boolean(placement && !placement.hidden)} onClick={() => onAdd(widget)}>{deferred ? "后续开放" : placement?.hidden ? "恢复" : placement ? "已添加" : "添加"}</button></div>; })}</div></aside></div>;
}

function LayoutPanel({ onClose }: { onClose: () => void }) {
  const layout = useDesktopStore((state) => state.layout);
  const manifests = useDesktopStore((state) => state.manifests);
  const saveLayout = useDesktopStore((state) => state.saveLayout);
  return <div className="shell-popover shell-layout-panel"><header><strong>首页布局</strong><button onClick={onClose} aria-label="关闭布局"><X size={14} /></button></header><div className="layout-preset-grid">{PRESETS.map((preset) => <button key={preset.id} className={layout.preset === preset.id ? "is-active" : ""} onClick={() => void saveLayout(applyLayoutPreset(layout, manifests, preset.id))}><span className={`layout-thumbnail ${preset.id}`} aria-hidden /><strong>{preset.label}</strong><small>{preset.hint}</small></button>)}</div><button className="shell-popover-action" disabled={!layout.previousPlacements} onClick={() => void saveLayout(undoLayoutPreset(layout))}><RotateCcw size={14} />撤销上次整理</button></div>;
}

function Dock({ settingsActive, onTools, onLayout, onSettings }: { settingsActive: boolean; onTools: () => void; onLayout: () => void; onSettings: () => void }) {
  const dockTools = useDesktopStore((state) => state.dockTools);
  const mirrors = useDesktopStore((state) => state.desktopFiles)?.files.filter((file) => file.pinned).slice(0, 4) ?? [];
  const [now, setNow] = useState(() => new Date());
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(timer); }, []);
  const report = (error: unknown, name: string) => setMessage(`“${name}”不可用：${error instanceof Error ? error.message : String(error)}。请检查工具或来源配置。`);
  const openTool = async (tool: (typeof dockTools)[number]) => { try { setMessage(null); if (tool.display.openMode === "folder") await api.openToolFolder(tool.id); else { await api.startTool(tool.id); await api.openTool(tool.id); } } catch (error) { report(error, tool.name); } };
  const openMirror = async (id: string, name: string) => { try { setMessage(null); await api.desktop.openDesktopFile(id); } catch (error) { report(error, name); } };
  return <><footer className="shell-dock"><button className="shell-dock-btn start" title="全部工具" onClick={onTools}><Menu size={16} /><span>全部工具</span></button><div className="shell-dock-items">{dockTools.slice(0, 5).map((tool) => <button key={tool.id} className="shell-dock-item" title={`${tool.name}\n${tool.description}`} onClick={() => void openTool(tool)}><Blocks size={17} /><span>{tool.name}</span></button>)}{mirrors.map((file) => <button key={file.id} className="shell-dock-item mirror" title={file.exists ? file.displayName : `${file.displayName} · 来源失效`} disabled={!file.exists} onClick={() => void openMirror(file.id, file.displayName)}>{file.iconDataUrl ? <img src={file.iconDataUrl} alt="" /> : <Blocks size={17} />}<span>{file.displayName}</span></button>)}</div><div className="shell-dock-controls"><button className="shell-dock-btn" title="布局预设" onClick={onLayout}><LayoutGrid size={15} /><span>布局</span></button><button className={`shell-dock-btn${settingsActive ? " is-active" : ""}`} title="工作台设置" onClick={onSettings}><Settings size={15} /><span>设置</span></button><div className="shell-dock-clock"><strong>{formatClock(now)}</strong><span>{now.getMonth() + 1}/{now.getDate()}</span></div></div></footer>{message ? <button className="shell-dock-message" aria-live="polite" title="关闭提示" onClick={() => setMessage(null)}>{message}</button> : null}</>;
}

function ScenePanel({ scene, widgets, layout, registry, editMode, onAdd, onHide, onMove, onResize }: { scene: DesktopSceneDefinition; widgets: WidgetManifest[]; layout: DesktopLayout; registry: WidgetRegistry; editMode: boolean; onAdd: (manifest: WidgetManifest) => void; onHide: (widgetId: string) => void; onMove: (widgetId: string, direction: -1 | 1) => void; onResize: (widgetId: string, colDelta: number, rowDelta: number) => void }) {
  const widgetById = useMemo(() => new Map(widgets.map((item) => [item.id, item])), [widgets]);
  const visible = useMemo(() => placementsForScene(layout, scene.id), [layout, scene.id]);
  if (!sceneHasPlacements(layout, scene.id)) return <section className="shell-empty"><div className="shell-empty-card"><div className="shell-empty-title">首页还是空的</div><div className="shell-empty-desc">从组件库选择要显示的日常信息。</div><button className="shell-primary-btn" onClick={() => onAdd(widgets[0])}><Plus size={14} />添加组件</button></div></section>;
  return <section className="shell-grid">{visible.map((placement) => { const manifest = widgetById.get(placement.widgetId); const entry = registry.get(placement.widgetId); return !manifest || !entry ? null : <DesktopWidget key={placement.widgetId} placement={placement} manifest={manifest} render={entry.render} editMode={editMode} onHide={() => onHide(placement.widgetId)} onMove={(direction) => onMove(placement.widgetId, direction)} onResize={(col, row) => onResize(placement.widgetId, col, row)} />; })}</section>;
}

export function DesktopShell() {
  useShellTheme();
  const loading = useDesktopStore((state) => state.loading); const hidden = useDesktopStore((state) => state.layout.hidden); const persistedSceneId = useDesktopStore((state) => state.layout.activeScene); const activeSceneId = persistedSceneId === "canvas" ? "today" : persistedSceneId; const scenes = useDesktopStore((state) => state.scenes); const manifests = useDesktopStore((state) => state.manifests); const layout = useDesktopStore((state) => state.layout); const editMode = useDesktopStore((state) => state.host.editMode); const hydrate = useDesktopStore((state) => state.hydrate); const setActiveScene = useDesktopStore((state) => state.setActiveScene); const saveLayout = useDesktopStore((state) => state.saveLayout); const activeScene = scenes.find((item) => item.id === activeSceneId) ?? scenes[0]; const registry = useMemo(() => buildWidgetRegistry(manifests), [manifests]);
  const [overlay, setOverlay] = useState<"library" | "layout" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => { if (!loading && persistedSceneId === "canvas") void setActiveScene("today"); }, [loading, persistedSceneId, setActiveScene]);
  const addWidget = (manifest: WidgetManifest) => { const existing = layout.placements.find((item) => item.sceneId === "today" && item.widgetId === manifest.id); const next = existing ? updatePlacement(layout, manifest.id, { hidden: false }) : { ...layout, placements: [...layout.placements, { widgetId: manifest.id, sceneId: "today" as const, order: layout.placements.length, colSpan: manifest.preferredSpan.col, rowSpan: manifest.preferredSpan.row, hidden: false }] }; void saveLayout(next); setOverlay(null); };
  const hideWidget = (widgetId: string) => void saveLayout(updatePlacement(layout, widgetId, { hidden: true }));
  const moveWidget = (widgetId: string, direction: -1 | 1) => void saveLayout(reorderPlacement(layout, "today", widgetId, direction));
  const resizeWidget = (widgetId: string, colDelta: number, rowDelta: number) => { const manifest = manifests.find((item) => item.id === widgetId); if (!manifest || (!colDelta && !rowDelta)) return; const resized = resizePlacement(layout, widgetId, colDelta, rowDelta); const placement = resized.placements.find((item) => item.widgetId === widgetId)!; void saveLayout(updatePlacement(resized, widgetId, { colSpan: Math.max(manifest.minSpan.col, Math.min(manifest.maxSpan.col, placement.colSpan)), rowSpan: Math.max(manifest.minSpan.row, Math.min(manifest.maxSpan.row, placement.rowSpan)) })); };
  const selectScene = (sceneId: DesktopSceneDefinition["id"]) => { setSettingsOpen(false); setOverlay(null); void setActiveScene(sceneId); };
  if (loading) return <div className="shell-boot"><Sparkles size={20} /><span>正在加载模拟桌面…</span></div>;
  const today = !settingsOpen && activeSceneId === "today";
  return <div className="shell-root"><div className="shell-wallpaper" aria-hidden /><TopBar settingsActive={settingsOpen} onSelectScene={selectScene} /><main className={`shell-stage${today ? "" : " is-full-scene"}`} data-scene={settingsOpen ? "settings" : activeSceneId}>{settingsOpen ? <SettingsWorkspaceScene onOpenLibrary={() => { setSettingsOpen(false); void setActiveScene("today"); setOverlay("library"); }} onOpenLayout={() => setOverlay(overlay === "layout" ? null : "layout")} onOpenTools={() => selectScene("tools")} /> : today ? hidden ? <div className="shell-hidden-hint">首页组件已隐藏，可从底部“设置”恢复。</div> : <ScenePanel scene={activeScene} widgets={manifests} layout={layout} registry={registry} editMode={editMode} onAdd={addWidget} onHide={hideWidget} onMove={moveWidget} onResize={resizeWidget} /> : activeSceneId === "today" ? null : <SceneRenderer sceneId={activeSceneId} />}</main><Dock settingsActive={settingsOpen} onTools={() => selectScene("tools")} onLayout={() => setOverlay(overlay === "layout" ? null : "layout")} onSettings={() => { setSettingsOpen((value) => !value); setOverlay(null); }} />{overlay === "layout" ? <LayoutPanel onClose={() => setOverlay(null)} /> : null}{today && overlay === "library" ? <ComponentLibrary scene={activeScene} widgets={manifests} layout={layout} onClose={() => setOverlay(null)} onAdd={addWidget} /> : null}</div>;
}
