import {
  Activity,
  AlertCircle,
  Blocks,
  Bookmark,
  BookHeart,
  CalendarCheck2,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  Copy,
  ExternalLink,
  Flame,
  FolderOpen,
  Gauge,
  GripVertical,
  Grid2X2,
  Home,
  Images,
  Library,
  ListTodo,
  LoaderCircle,
  Maximize2,
  Monitor,
  MoreHorizontal,
  NotebookPen,
  Palette,
  PanelsTopLeft,
  Pencil,
  Play,
  Plus,
  Power,
  Presentation,
  RefreshCw,
  Repeat2,
  ScanSearch,
  Search,
  Settings,
  Square,
  TerminalSquare,
  TimerReset,
  Trash2,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type {
  EmbeddedBounds,
  ScanCandidate,
  SidebarEntry,
  ToolDefinition,
  ToolStatus,
  ToolStatusResult,
  WorkbenchSettings,
} from "../shared/types";
import { shouldContinueStartupStatusSync, STARTUP_STATUS_SYNC_TIMEOUT_MS } from "../shared/startupStatus";
import { isEmbeddedToolId } from "../shared/toolPolicy";
import { api, isDesktop } from "./api";
import { useAppStore } from "./schedule/store";
import { api as scheduleApi } from "./schedule/api";
import type { HabitRecord } from "./schedule/types";
import { timelogApi } from "./schedule/features/timelog/api";
import type { Activity as TimeBlockActivity, Category, TimeEntry } from "./schedule/features/timelog/types";
import { DesktopShell } from "./desktop/DesktopShell";

const ScheduleApp = lazy(() => import("./schedule/App"));
const MemoryJournal = lazy(() => import("./memories/MemoryJournal"));

type ScheduleModule = "todo" | "timelog" | "habits";

type Route =
  | { kind: "dashboard" }
  | { kind: "tools" }
  | { kind: "settings" }
  | { kind: "memories" }
  | { kind: "schedule"; module: ScheduleModule }
  | { kind: "module"; toolId: string; entry: SidebarEntry }
  | { kind: "embedded"; toolId: string; path?: string };

const icons: Record<string, LucideIcon> = {
  "calendar-check": CalendarCheck2,
  "list-todo": ListTodo,
  "clock-3": Clock3,
  "repeat-2": Repeat2,
  presentation: Presentation,
  bookmark: Bookmark,
  library: Library,
  "notebook-pen": NotebookPen,
  "book-heart": BookHeart,
  home: Home,
  "grid-2x2": Grid2X2,
  images: Images,
  palette: Palette,
  "panels-top-left": PanelsTopLeft,
  gauge: Gauge,
  blocks: Blocks,
  wrench: Wrench,
  "timer-reset": TimerReset,
};

const statusText: Record<ToolStatus, string> = {
  unknown: "可访问",
  stopped: "未启动",
  starting: "启动中",
  running: "运行中",
  stopping: "停止中",
  error: "异常",
  missing: "目录缺失",
  unconfigured: "未配置",
};

function ToolIcon({ name, size = 20 }: { name?: string; size?: number }) {
  const Icon = (name && icons[name]) || Blocks;
  return <Icon size={size} />;
}

function boundsOf(element: HTMLElement): EmbeddedBounds {
  const rect = element.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toolFromCandidate(candidate: ScanCandidate, existing?: ToolDefinition): ToolDefinition {
  const launch = candidate.launch.type === "none" && existing && existing.runtime.launch.type !== "none"
    ? existing.runtime.launch
    : candidate.launch;
  const existingTags = existing?.tags ?? [];
  return {
    id: existing?.id ?? "tool-" + Date.now().toString(36),
    name: existing?.name || candidate.name,
    description: existing?.description && existing.description !== "扫描发现的本地工具" ? existing.description : candidate.description,
    relativePath: candidate.relativePath,
    category: existing?.category && existing.category !== "未分类" ? existing.category : candidate.category,
    tags: Array.from(new Set([...existingTags, ...candidate.tags, ...candidate.markers])),
    icon: existing?.icon ?? (candidate.detectedType === "file" ? "images" : "blocks"),
    runtime: {
      type: candidate.detectedType,
      launch,
      stop: existing?.runtime.stop,
      workingDirectory: candidate.workingDirectory ?? existing?.runtime.workingDirectory ?? ".",
      healthCheck: candidate.healthCheck ?? existing?.runtime.healthCheck ?? { type: "none" },
      openUrl: candidate.openUrl ?? existing?.runtime.openUrl,
      startupTimeout: candidate.startupTimeout ?? existing?.runtime.startupTimeout ?? 15000,
    },
    display: existing?.display ?? { showInToolCenter: true, openMode: candidate.detectedType === "file" ? "external" : "folder", sortOrder: 999 },
    startupPolicy: existing?.startupPolicy ?? "manual",
  };
}

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shortTime(value: string | null | undefined): string {
  if (!value) return "全天";
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function routeTitle(route: Route, tools: ToolDefinition[]): string {
  if (route.kind === "dashboard") return "首页";
  if (route.kind === "tools") return "工具中心";
  if (route.kind === "settings") return "设置";
  if (route.kind === "memories") return "纪念册";
  if (route.kind === "schedule") {
    return { todo: "待办", timelog: "时间块", habits: "习惯" }[route.module];
  }
  if (route.kind === "module") return route.entry.label;
  return tools.find((tool) => tool.id === route.toolId)?.name ?? "工具";
}

function routeDescription(route: Route, tools: ToolDefinition[]): string {
  if (route.kind === "dashboard") return "今日概览与常用入口";
  if (route.kind === "tools") return "查找、启动并管理本地工具";
  if (route.kind === "settings") return "工作区与显示偏好";
  if (route.kind === "memories") return "保存读完与看完之后值得记住的感受";
  if (route.kind === "schedule") {
    return {
      todo: "收集、安排并完成当前任务",
      timelog: "记录时间投入并查看统计",
      habits: "维护日常节奏与连续记录",
    }[route.module];
  }
  if (route.kind === "module") return route.entry.label + " · 本地工具模块";
  const tool = tools.find((item) => item.id === route.toolId);
  return tool ? `${tool.category} · 本地内嵌运行` : "本地内嵌工具";
}

function initialRoute(): Route {
  const params = new URLSearchParams(window.location.search);
  const workspace = params.get("workspace");
  if (workspace === "schedule.todo") return { kind: "schedule", module: "todo" };
  if (workspace === "schedule.timelog") return { kind: "schedule", module: "timelog" };
  if (workspace === "schedule.habits") return { kind: "schedule", module: "habits" };
  if (workspace === "memories") return { kind: "memories" };
  if (workspace === "bookmarks") return { kind: "embedded", toolId: "bookmarks", path: "/?embed=workbench" };
  if (workspace === "tools") return { kind: "tools" };
  if (workspace === "settings") return { kind: "settings" };
  const route = params.get("route");
  if (route === "dashboard") return { kind: "dashboard" };
  if (route === "tools") return { kind: "tools" };
  if (route === "settings") return { kind: "settings" };
  if (route === "memories") return { kind: "memories" };
  const module = params.get("schedule");
  if (module === "todo" || module === "timelog" || module === "habits") {
    return { kind: "schedule", module };
  }
  return { kind: "dashboard" };
}

export default function App() {
  const workspaceMode = new URLSearchParams(window.location.search).get("workspace");
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [settings, setSettings] = useState<WorkbenchSettings>({ workspaceRoot: "E:\\Vibecoding", theme: "dark", compactMode: false, fontSizeMode: "medium" });
  const [statuses, setStatuses] = useState<Record<string, ToolStatusResult>>({});
  const [route, setRoute] = useState<Route>(initialRoute);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [editorTool, setEditorTool] = useState<ToolDefinition | null | undefined>(undefined);
  const [showScanner, setShowScanner] = useState(false);
  const [logToolId, setLogToolId] = useState<string | null | undefined>(undefined);

  const load = async () => {
    const [nextTools, nextSettings, nextStatuses] = await Promise.all([api.listTools(), api.getSettings(), api.getStatuses()]);
    setTools(nextTools);
    setSettings({ ...nextSettings, theme: "dark" });
    setStatuses(Object.fromEntries(nextStatuses.map((status) => [status.toolId, status])));
  };

  useEffect(() => {
    load().catch((error) => setToast(errorMessage(error))).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const startupToolIds = tools.filter((tool) => tool.startupPolicy === "on-workbench-start").map((tool) => tool.id);
    if (startupToolIds.length === 0) return;
    let cancelled = false;
    let timer: number | undefined;
    const deadline = Date.now() + STARTUP_STATUS_SYNC_TIMEOUT_MS;
    const refresh = async () => {
      try {
        const nextStatuses = await api.getStatuses();
        if (cancelled) return;
        setStatuses(Object.fromEntries(nextStatuses.map((status) => [status.toolId, status])));
        if (shouldContinueStartupStatusSync(nextStatuses, startupToolIds, Date.now(), deadline)) {
          timer = window.setTimeout(() => void refresh(), 400);
        }
      } catch {
        if (!cancelled && Date.now() < deadline) timer = window.setTimeout(() => void refresh(), 400);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [tools]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = "dark";
    delete root.dataset.systemTheme;
    root.dataset.compact = String(settings.compactMode);
    root.dataset.fontSize = settings.fontSizeMode ?? "medium";
  }, [settings]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const updateStatus = (status: ToolStatusResult) => setStatuses((current) => ({ ...current, [status.toolId]: status }));

  const runAction = async (tool: ToolDefinition, action: "start" | "stop" | "restart" | "open") => {
    try {
      if (action === "open") {
        if (tool.display.openMode === "embedded" && tool.runtime.openUrl && isEmbeddedToolId(tool.id)) {
          setRoute({ kind: "embedded", toolId: tool.id });
        } else {
          await api.openTool(tool.id);
          updateStatus(await api.getStatus(tool.id));
        }
        return;
      }
      if (action === "start") updateStatus({ toolId: tool.id, status: "starting", checkedAt: new Date().toISOString() });
      const status =
        action === "start"
          ? await api.startTool(tool.id)
          : action === "stop"
            ? await api.stopTool(tool.id)
            : await api.restartTool(tool.id);
      updateStatus(status);
      setToast(status.message ?? (status.status === "running" ? tool.name + " 已就绪" : tool.name + " 状态已更新"));
    } catch (error) {
      setToast(errorMessage(error));
      updateStatus({ toolId: tool.id, status: "error", message: errorMessage(error), checkedAt: new Date().toISOString() });
    }
  };

  const saveTool = async (tool: ToolDefinition) => {
    await api.saveTool(tool);
    await load();
    setEditorTool(undefined);
    setToast("工具配置已保存");
  };

  const removeTool = async (toolId: string) => {
    await api.removeTool(toolId);
    await load();
    setEditorTool(undefined);
    setToast("已从注册表移除，源项目未改动");
  };

  const toggleStartupPolicy = async (tool: ToolDefinition) => {
    if (tool.runtime.launch.type !== "bat") return;
    try {
      await saveTool({ ...tool, startupPolicy: tool.startupPolicy === "on-workbench-start" ? "manual" : "on-workbench-start" });
      setToast("下次打开工作台时生效");
    } catch (error) {
      setToast(errorMessage(error));
    }
  };

  if (loading) return <div className="boot-screen"><LoaderCircle className="spin" size={22} />正在加载工作台</div>;

  if (!workspaceMode) {
    return <DesktopShell />;
  }

  return (
    <div className={"app-shell workspace-window " + (route.kind === "schedule" ? "schedule-active" : "")}>
      {!workspaceMode && <Sidebar
        tools={tools}
        route={route}
        sidebarOrder={settings.sidebarOrder ?? []}
        onNavigate={setRoute}
        onReorder={async (order) => {
          try {
            const saved = await api.saveSettings({ ...settings, sidebarOrder: order, theme: "dark" });
            setSettings(saved);
            setToast("导航顺序已保存");
          } catch (error) {
            setToast(errorMessage(error));
          }
        }}
      />}
      <div className="workspace">
        <header className="topbar">
          <div>
            <h1>{routeTitle(route, tools)}</h1>
            <span className="topbar-context" title={settings.workspaceRoot}>{routeDescription(route, tools)}</span>
          </div>
          <div className="topbar-actions">
            {route.kind === "schedule" && route.module === "todo" ? (
              <button
                className="topbar-command"
                onClick={() => window.dispatchEvent(new CustomEvent("workbench:quick-capture"))}
              >
                <Plus size={16} />快速记录
              </button>
            ) : route.kind !== "schedule" && route.kind !== "memories" && route.kind !== "settings" ? (
              <div className="global-search">
                <Search size={15} />
                <input
                  aria-label="全局搜索"
                  placeholder="搜索工具"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") setRoute({ kind: "tools" });
                  }}
                />
              </div>
            ) : null}
            {route.kind !== "memories" && route.kind !== "settings" && <button className="icon-button" title="刷新状态" onClick={() => void load()}><RefreshCw size={17} /></button>}
          </div>
        </header>

        <main className={"content " + (route.kind === "schedule" ? "schedule-content" : "")}>
          {route.kind === "dashboard" && (
            <Dashboard
              tools={tools}
              statuses={statuses}
              onOpen={(tool) => void runAction(tool, "open")}
              onTools={() => setRoute({ kind: "tools" })}
              onSchedule={(module) => setRoute({ kind: "schedule", module })}
            />
          )}
          {route.kind === "tools" && (
            <ToolCenter
              tools={tools}
              statuses={statuses}
              onAction={(tool, action) => void runAction(tool, action)}
              onEdit={setEditorTool}
              onAdd={() => setEditorTool(null)}
              onScan={() => setShowScanner(true)}
              onLogs={(toolId) => setLogToolId(toolId)}
              onRemove={(toolId) => void removeTool(toolId).catch((error) => setToast(errorMessage(error)))}
              onToggleStartup={(tool) => void toggleStartupPolicy(tool)}
            />
          )}
          {route.kind === "settings" && (
            <SettingsPage
              value={settings}
              onSave={async (value) => {
                const saved = await api.saveSettings({ ...value, theme: "dark" });
                setSettings(saved);
                await load();
                setToast("设置已保存");
                return saved;
              }}
            />
          )}
          {route.kind === "schedule" && (
            <Suspense fallback={<div className="boot-screen"><LoaderCircle className="spin" size={20} />正在加载日程模块</div>}><div className="schedule-root"><ScheduleApp module={route.module} /></div></Suspense>
          )}
          {route.kind === "memories" && <Suspense fallback={<div className="boot-screen"><LoaderCircle className="spin" size={20} />正在加载记录册</div>}><MemoryJournal /></Suspense>}
          {route.kind === "module" && (
            <ModulePage
              tool={tools.find((item) => item.id === route.toolId)}
              entry={route.entry}
              status={statuses[route.toolId]}
              onOpen={(tool) => void runAction(tool, "open")}
              onEmbed={(tool) => setRoute({ kind: "embedded", toolId: tool.id, path: route.entry.path })}
              onLogs={(toolId) => setLogToolId(toolId)}
            />
          )}
          {route.kind === "embedded" && (
            <EmbeddedPage
              tool={tools.find((item) => item.id === route.toolId)}
              route={route.path}
              onLogs={(toolId) => setLogToolId(toolId)}
            />
          )}
        </main>
      </div>

      {editorTool !== undefined && (
        <ToolEditor
          key={editorTool?.id ?? "new"}
          tool={editorTool}
          onClose={() => setEditorTool(undefined)}
          onSave={(tool) => void saveTool(tool).catch((error) => setToast(errorMessage(error)))}
          onRemove={(toolId) => void removeTool(toolId).catch((error) => setToast(errorMessage(error)))}
        />
      )}
      {showScanner && (
        <ScannerModal
          onClose={() => setShowScanner(false)}
          onReview={(candidate) => {
            setShowScanner(false);
            setEditorTool(toolFromCandidate(candidate, tools.find((tool) => tool.id === candidate.existingToolId)));
          }}
        />
      )}
      {logToolId !== undefined && <LogsModal toolId={logToolId ?? undefined} onClose={() => setLogToolId(undefined)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

type SidebarNavItem = {
  id: string;
  label: string;
  icon: string;
  route: Route;
  active: boolean;
  count?: number;
};

function Sidebar({
  tools,
  route,
  sidebarOrder,
  onNavigate,
  onReorder,
}: {
  tools: ToolDefinition[];
  route: Route;
  sidebarOrder: string[];
  onNavigate: (route: Route) => void;
  onReorder: (order: string[]) => Promise<void>;
}) {
  const entries = tools.flatMap((tool) => {
    const declared = tool.display.sidebarEntries ?? [];
    if (declared.length > 0) return declared.map((entry) => ({ tool, entry }));
    if (tool.display.openMode === "embedded" && tool.runtime.openUrl && isEmbeddedToolId(tool.id)) {
      return [{ tool, entry: { id: tool.id, label: tool.name, icon: tool.icon, sortOrder: tool.display.sortOrder ?? 999 } }];
    }
    return [];
  });
  const items: SidebarNavItem[] = [
    { id: "dashboard", label: "首页", icon: "home", route: { kind: "dashboard" }, active: route.kind === "dashboard" },
    { id: "schedule:todo", label: "待办", icon: "list-todo", route: { kind: "schedule", module: "todo" }, active: route.kind === "schedule" && route.module === "todo" },
    { id: "schedule:timelog", label: "时间块", icon: "clock-3", route: { kind: "schedule", module: "timelog" }, active: route.kind === "schedule" && route.module === "timelog" },
    { id: "schedule:habits", label: "习惯", icon: "repeat-2", route: { kind: "schedule", module: "habits" }, active: route.kind === "schedule" && route.module === "habits" },
    { id: "memories", label: "纪念册", icon: "book-heart", route: { kind: "memories" }, active: route.kind === "memories" },
    ...entries.map(({ tool, entry }): SidebarNavItem => ({
      id: `module:${tool.id}:${entry.id}`,
      label: entry.label,
      icon: entry.icon ?? tool.icon ?? "blocks",
      route: tool.display.openMode === "embedded" && isEmbeddedToolId(tool.id)
        ? { kind: "embedded", toolId: tool.id, path: entry.path ?? "/?embed=workbench" }
        : { kind: "module", toolId: tool.id, entry },
      active: tool.display.openMode === "embedded" && isEmbeddedToolId(tool.id)
        ? route.kind === "embedded" && route.toolId === tool.id
        : route.kind === "module" && route.toolId === tool.id && route.entry.id === entry.id,
    })),
    { id: "tools", label: "工具中心", icon: "grid-2x2", route: { kind: "tools" }, active: route.kind === "tools", count: tools.length },
  ];
  const orderedItems = [
    ...sidebarOrder.filter((id) => items.some((item) => item.id === id)),
    ...items.filter((item) => !sidebarOrder.includes(item.id)).map((item) => item.id),
  ].map((id) => items.find((item) => item.id === id)).filter((item): item is SidebarNavItem => Boolean(item));
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const dropItem = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    const next = orderedItems.map((item) => item.id);
    const from = next.indexOf(draggingId);
    const to = next.indexOf(targetId);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, draggingId);
    setDraggingId(null);
    void onReorder(next);
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><Blocks size={19} /></div>
        <div><strong>大锤的工作台</strong><span>PERSONAL WORKBENCH</span></div>
      </div>
      <nav>
        {orderedItems.map((item) => (
          <button
            key={item.id}
            title={`${item.label}（可拖拽调整顺序）`}
            draggable
            className={"nav-item " + (item.active ? "active " : "") + (draggingId === item.id ? "dragging" : "")}
            onClick={() => onNavigate(item.route)}
            onDragStart={(event) => {
              setDraggingId(item.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", item.id);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              dropItem(item.id);
            }}
            onDragEnd={() => setDraggingId(null)}
          >
            <GripVertical className="nav-drag-handle" size={11} aria-hidden="true" />
            <ToolIcon name={item.icon} size={17} /><span>{item.label}</span>
            {item.count !== undefined && <span className="nav-count">{item.count}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <button title="设置" className={"nav-item " + (route.kind === "settings" ? "active" : "")} onClick={() => onNavigate({ kind: "settings" })}>
          <Settings size={17} /><span>设置</span>
        </button>
        <div className="workspace-state"><span className="live-dot" />本地工作区已连接</div>
      </div>
    </aside>
  );
}

function Dashboard({
  tools,
  statuses,
  onOpen,
  onTools,
  onSchedule,
}: {
  tools: ToolDefinition[];
  statuses: Record<string, ToolStatusResult>;
  onOpen: (tool: ToolDefinition) => void;
  onTools: () => void;
  onSchedule: (module: ScheduleModule) => void;
}) {
  const running = tools.filter((tool) => statuses[tool.id]?.status === "running");
  const needsAttention = tools.filter((tool) => ["error", "missing", "unconfigured"].includes(statuses[tool.id]?.status));
  const serviceCount = tools.filter((tool) => tool.runtime.type === "local-service").length;
  const recent = tools.slice(0, 4);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "上午好" : hour < 18 ? "下午好" : "晚上好";
  const today = localDateKey();
  const { tasks, habits, loaded } = useAppStore();
  const loadAll = useAppStore((state) => state.loadAll);
  const toggleTask = useAppStore((state) => state.toggleTask);
  const todayTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.dueDate === today)
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === "open" ? -1 : 1;
          return (a.dueTime ?? "99:99").localeCompare(b.dueTime ?? "99:99") || a.sortOrder - b.sortOrder;
        })
        .slice(0, 5),
    [tasks, today],
  );
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activities, setActivities] = useState<TimeBlockActivity[]>([]);
  const [habitRecords, setHabitRecords] = useState<Record<string, HabitRecord[]>>({});
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const categoryMap = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories]);
  const activityMap = useMemo(() => new Map(activities.map((item) => [item.id, item])), [activities]);
  const todayEntries = useMemo(
    () => [...timeEntries].sort((a, b) => a.startTime.localeCompare(b.startTime)).slice(0, 5),
    [timeEntries],
  );
  const visibleHabits = useMemo(() => habits.slice(0, 4), [habits]);

  useEffect(() => {
    let cancelled = false;
    loadAll().catch((error) => {
      if (!cancelled) setScheduleError(errorMessage(error));
    });
    return () => {
      cancelled = true;
    };
  }, [loadAll]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      timelogApi.timeEntries.byDate(today),
      timelogApi.categories.all(false),
      timelogApi.activities.all(false),
    ])
      .then(([entries, nextCategories, nextActivities]) => {
        if (cancelled) return;
        setTimeEntries(entries);
        setCategories(nextCategories);
        setActivities(nextActivities);
      })
      .catch((error) => {
        if (!cancelled) setScheduleError(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [today]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(visibleHabits.map((habit) => scheduleApi.habits.records(habit.id)))
      .then((records) => {
        if (cancelled) return;
        setHabitRecords(Object.fromEntries(visibleHabits.map((habit, index) => [habit.id, records[index]])));
      })
      .catch((error) => {
        if (!cancelled) setScheduleError(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [visibleHabits]);

  const entryTitle = (entry: TimeEntry): string => {
    if (entry.activityId) {
      const activity = activityMap.get(entry.activityId);
      if (activity) return activity.name;
    }
    if (entry.categoryId) return categoryMap.get(entry.categoryId)?.name ?? "分类时间块";
    return "时间块";
  };

  const entrySubtitle = (entry: TimeEntry): string => {
    if (entry.activityId) {
      const activity = activityMap.get(entry.activityId);
      const category = activity ? categoryMap.get(activity.categoryId) : null;
      return category?.name ?? "活动";
    }
    return entry.note || "分类记录";
  };

  return (
    <div className="page dashboard-page">
      <section className="welcome-band">
        <div><span className="eyebrow">{new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}</span><h2>{greeting}，大锤。今天从这里开始。</h2></div>
        <button className="primary-button" onClick={onTools}><Grid2X2 size={16} />打开工具中心</button>
      </section>
      <section className="metric-strip">
        <div><Activity size={17} /><strong>{running.length}</strong><span>正在运行</span></div>
        <div><Blocks size={17} /><strong>{tools.length}</strong><span>已注册工具</span></div>
        <div><Monitor size={17} /><strong>{serviceCount}</strong><span>本地服务</span></div>
        <div className={needsAttention.length ? "warn" : ""}><AlertCircle size={17} /><strong>{needsAttention.length}</strong><span>需要处理</span></div>
      </section>
      <div className="dashboard-grid dashboard-grid-v2">
        <section className="section-block home-panel todo-preview">
          <div className="section-heading">
            <div><h3>今日待办</h3><span>{scheduleError ? "数据读取异常" : loaded ? `${todayTasks.length} 项` : "正在读取"}</span></div>
            <button className="text-button" onClick={() => onSchedule("todo")}>进入<ChevronRight size={15} /></button>
          </div>
          <div className="agenda-list">
            {todayTasks.map((task) => (
              <button key={task.id} onClick={() => void toggleTask(task.id)}>
                {task.status === "completed" ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                <strong className={task.status === "completed" ? "is-done-text" : ""}>{task.title}</strong>
                <small>{shortTime(task.dueTime)}</small>
              </button>
            ))}
            {loaded && todayTasks.length === 0 && (
              <div className="dashboard-empty"><CheckCircle2 size={18} /><strong>今天没有待办</strong><span>在待办模块添加后会同步到这里</span></div>
            )}
            {!loaded && <div className="dashboard-empty"><LoaderCircle className="spin" size={18} /><strong>正在读取待办</strong></div>}
          </div>
          <button className="panel-link" onClick={() => onSchedule("todo")}><Plus size={15} />添加待办</button>
        </section>
        <section className="section-block home-panel time-preview">
          <div className="section-heading">
            <div><h3>时间块</h3><span>{todayEntries.length ? `${todayEntries.length} 条记录` : "今日节奏"}</span></div>
            <button className="text-button" onClick={() => onSchedule("timelog")}>查看<ChevronRight size={15} /></button>
          </div>
          <div className="time-stack">
            {todayEntries.map((entry, index) => (
              <button key={entry.id} className={"time-slot " + (index === 0 ? "active" : "")} onClick={() => onSchedule("timelog")}>
                <span>{shortTime(entry.startTime)}</span>
                <div><strong>{entryTitle(entry)}</strong><small>{entrySubtitle(entry)}</small></div>
                <em>{shortTime(entry.endTime)}</em>
              </button>
            ))}
            {todayEntries.length === 0 && (
              <div className="dashboard-empty"><Clock3 size={18} /><strong>今天还没有时间块</strong><span>在时间块模块创建后会同步到这里</span></div>
            )}
          </div>
          <button className="panel-link" onClick={() => onSchedule("timelog")}><Clock3 size={15} />打开记录</button>
        </section>
        <section className="section-block home-panel side-preview">
          <div className="section-heading"><div><h3>常用工具</h3><span>{recent.length} 个入口</span></div><button className="text-button" onClick={onTools}>全部<ChevronRight size={15} /></button></div>
          <div className="mini-tool-grid">
            {recent.map((tool) => {
              const toolStatus = statuses[tool.id]?.status ?? "unknown";
              return (
                <button key={tool.id} className="mini-tool" onClick={() => onOpen(tool)}>
                  <span className="tool-icon"><ToolIcon name={tool.icon} size={18} /></span>
                  <span className="mini-tool-copy">
                    <strong>{tool.name}</strong>
                    <small><span className={"status-dot " + toolStatus} />{statusText[toolStatus]}</small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              );
            })}
          </div>
          <div className="habit-strip">
            <div className="section-heading compact"><div><h3>习惯追踪</h3><span>{visibleHabits.length ? "今日完成" : "暂无习惯"}</span></div><button className="text-button" onClick={() => onSchedule("habits")}>打开<ChevronRight size={15} /></button></div>
            {visibleHabits.map((habit) => {
              const count = habitRecords[habit.id]?.find((record) => record.date === today)?.count ?? 0;
              const done = count >= habit.targetCount;
              return (
                <button key={habit.id} className="habit-row" onClick={() => onSchedule("habits")}>
                  {done ? <CheckCircle2 size={16} /> : <Flame size={16} />}
                  <strong>{habit.name}</strong>
                  <span>{count}/{habit.targetCount}</span>
                </button>
              );
            })}
            {visibleHabits.length === 0 && (
              <div className="dashboard-empty compact"><Flame size={18} /><strong>暂无习惯</strong><span>创建习惯后会显示今日进度</span></div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function ToolCenter({
  tools,
  statuses,
  onAction,
  onEdit,
  onAdd,
  onScan,
  onLogs,
  onRemove,
  onToggleStartup,
}: {
  tools: ToolDefinition[];
  statuses: Record<string, ToolStatusResult>;
  onAction: (tool: ToolDefinition, action: "start" | "stop" | "restart" | "open") => void;
  onEdit: (tool: ToolDefinition) => void;
  onAdd: () => void;
  onScan: () => void;
  onLogs: (toolId: string) => void;
  onRemove: (toolId: string) => void;
  onToggleStartup: (tool: ToolDefinition) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "running" | "stopped" | "attention">("all");
  const [category, setCategory] = useState("全部分类");
  const [menuId, setMenuId] = useState<string | null>(null);
  const centerTools = tools.filter((tool) => tool.display.showInToolCenter);
  const categories = ["全部分类", ...Array.from(new Set(centerTools.map((tool) => tool.category)))];
  const visible = centerTools.filter((tool) => {
    const status = statuses[tool.id]?.status ?? "unknown";
    const matchesQuery = [tool.name, tool.description, tool.category, ...tool.tags].join(" ").toLocaleLowerCase().includes(query.toLocaleLowerCase());
    const matchesFilter =
      filter === "all" ||
      (filter === "running" && status === "running") ||
      (filter === "stopped" && ["stopped", "unknown"].includes(status)) ||
      (filter === "attention" && ["error", "missing", "unconfigured"].includes(status));
    return matchesQuery && matchesFilter && (category === "全部分类" || tool.category === category);
  });

  return (
    <div className="page tool-center">
      <div className="page-actions">
        <div className="search-control"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按名称、标签或分类搜索" /></div>
        <button className="secondary-button" onClick={onScan}><ScanSearch size={16} />扫描工作区</button>
        <button className="primary-button" onClick={onAdd}><Plus size={16} />添加工具</button>
      </div>
      <div className="filter-row">
        <div className="segmented">
          {([["all", "全部"], ["running", "运行中"], ["stopped", "未启动"], ["attention", "异常"]] as const).map(([value, label]) => (
            <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select>
        <span className="result-count">{visible.length} 个工具</span>
      </div>
      <div className="tool-grid">
        {visible.map((tool) => {
          const status = statuses[tool.id]?.status ?? "unknown";
          const canStart = tool.runtime.launch.type !== "none";
          const isTransitioning = status === "starting" || status === "stopping";
          const isMissing = status === "missing";
          const embedded = tool.display.openMode === "embedded" && Boolean(tool.runtime.openUrl) && isEmbeddedToolId(tool.id);
          return (
            <article className="tool-card" key={tool.id}>
              <div className="tool-card-header">
                <span className="tool-icon large"><ToolIcon name={tool.icon} size={22} /></span>
                <div className="tool-card-heading">
                  <h3>{tool.name}</h3>
                  <span>{tool.category}{tool.runtime.launch.type === "bat" && tool.startupPolicy === "on-workbench-start" && <em className="startup-badge">自动启动</em>}</span>
                </div>
                <span className={"status-chip " + status}><span className={"status-dot " + status} />{statusText[status]}</span>
                <div className="tool-menu-wrap">
                  <button className="icon-button compact" title="更多操作" onClick={() => setMenuId(menuId === tool.id ? null : tool.id)}><MoreHorizontal size={18} /></button>
                  {menuId === tool.id && (
                    <div className="context-menu">
                      {tool.runtime.launch.type === "bat" && <button role="switch" aria-checked={tool.startupPolicy === "on-workbench-start"} onClick={() => { onToggleStartup(tool); setMenuId(null); }}><Power size={14} />随工作台启动：{tool.startupPolicy === "on-workbench-start" ? "开" : "关"}</button>}
                      <button onClick={() => { onAction(tool, "restart"); setMenuId(null); }}><RefreshCw size={14} />重新启动</button>
                      <button onClick={() => { onAction(tool, "stop"); setMenuId(null); }}><Square size={14} />停止</button>
                      {!embedded && <button onClick={() => void api.openToolFolder(tool.id)}><FolderOpen size={14} />打开目录</button>}
                      <button onClick={() => { onLogs(tool.id); setMenuId(null); }}><TerminalSquare size={14} />查看日志</button>
                      {tool.runtime.openUrl && <button onClick={() => void navigator.clipboard.writeText(tool.runtime.openUrl!)}><Copy size={14} />复制地址</button>}
                      <button onClick={() => { onEdit(tool); setMenuId(null); }}><Pencil size={14} />编辑配置</button>
                      <button
                        className="danger-menu-item"
                        onClick={() => {
                          setMenuId(null);
                          if (window.confirm(`从工作台移除「${tool.name}」入口？源项目文件夹不会被删除。`)) onRemove(tool.id);
                        }}
                      >
                        <Trash2 size={14} />移除入口
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <p className="tool-card-description">{tool.description}</p>
              <div className="tool-address" title={tool.runtime.openUrl ?? tool.relativePath}>{tool.runtime.openUrl ?? tool.relativePath}</div>
              <div className="tool-card-actions">
                <button
                  className="card-primary"
                  onClick={() => onAction(tool, status === "running" || !canStart ? "open" : "start")}
                  disabled={isTransitioning || isMissing}
                >
                  {isTransitioning ? <LoaderCircle className="spin" size={15} /> : isMissing ? <AlertCircle size={15} /> : status === "running" || !canStart ? <ExternalLink size={15} /> : <Play size={15} />}
                  {status === "starting" ? "启动中" : status === "stopping" ? "停止中" : isMissing ? "目录缺失" : status === "running" || !canStart ? "打开" : status === "error" ? "重新启动" : "启动"}
                </button>
                {!embedded && <button className="icon-button" title="打开目录" onClick={() => void api.openToolFolder(tool.id)}><FolderOpen size={16} /></button>}
              </div>
            </article>
          );
        })}
      </div>
      {visible.length === 0 && <div className="empty-state"><Search size={22} /><strong>没有匹配的工具</strong><span>调整搜索词或筛选条件</span></div>}
    </div>
  );
}

function ModulePage({
  tool,
  entry,
  status,
  onOpen,
  onEmbed,
  onLogs,
}: {
  tool?: ToolDefinition;
  entry: SidebarEntry;
  status?: ToolStatusResult;
  onOpen: (tool: ToolDefinition) => void;
  onEmbed: (tool: ToolDefinition) => void;
  onLogs: (toolId: string) => void;
}) {
  if (!tool) return <div className="empty-state"><AlertCircle size={24} /><strong>模块配置已失效</strong></div>;
  const embedded = tool.display.openMode === "embedded" && Boolean(tool.runtime.openUrl) && isEmbeddedToolId(tool.id);
  return (
    <div className="page module-page">
      <div className="module-hero">
        <span className="tool-icon module"><ToolIcon name={entry.icon} size={26} /></span>
        <div><span className="eyebrow">{tool.name}</span><h2>{entry.label}</h2><p>{tool.description}</p></div>
        <span className={"status-chip " + (status?.status ?? "unknown")}><span className={"status-dot " + (status?.status ?? "unknown")} />{statusText[status?.status ?? "unknown"]}</span>
      </div>
      <div className="integration-panel">
        <div className="integration-copy">
          <h3>{embedded ? "在工作台中打开" : "桌面工具入口"}</h3>
          <p>
            {embedded
              ? "Workbench 会检查服务状态，必要时启动后载入对应页面。"
              : "当前工具是原生 Tauri 桌面程序，尚未提供可嵌入 URL 或模块深链。Workbench 将保持数据与运行环境独立并启动正式桌面版本。"}
          </p>
          {!embedded && <div className="notice-row"><AlertCircle size={16} /><span>已保留模块意图：{entry.path ?? entry.id}。子工具支持深链后无需迁移业务代码即可升级接入。</span></div>}
        </div>
        <div className="integration-actions">
          <button className="primary-button" onClick={() => embedded ? onEmbed(tool) : onOpen(tool)}>
            {embedded ? <Maximize2 size={16} /> : <ExternalLink size={16} />}{embedded ? "嵌入打开" : "打开桌面工具"}
          </button>
          <button className="secondary-button" onClick={() => onLogs(tool.id)}><TerminalSquare size={16} />查看日志</button>
          {!embedded && <button className="secondary-button" onClick={() => void api.openToolFolder(tool.id)}><FolderOpen size={16} />打开目录</button>}
        </div>
      </div>
    </div>
  );
}

function EmbeddedPage({ tool, route, onLogs }: { tool?: ToolDefinition; route?: string; onLogs: (toolId: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"checking" | "starting" | "ready" | "error">("checking");
  const [message, setMessage] = useState("正在检查服务");
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !tool) return;
    let cancelled = false;
    let resizeFrame = 0;
    const syncBounds = () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => void api.resizeEmbedded(boundsOf(host)));
    };
    const open = async () => {
      try {
        setPhase("starting");
        setMessage("正在启动并连接 " + tool.name);
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        if (cancelled) return;
        await api.showEmbedded(tool.id, route, boundsOf(host));
        if (!cancelled) {
          setPhase("ready");
          setMessage("已连接");
        }
      } catch (error) {
        if (!cancelled) {
          setPhase("error");
          setMessage(errorMessage(error));
        }
      }
    };
    const observer = new ResizeObserver(syncBounds);
    observer.observe(host);
    void open();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(resizeFrame);
      observer.disconnect();
      void api.hideEmbedded();
    };
  }, [tool?.id, route, retryVersion]);

  if (!tool) return <div className="empty-state"><AlertCircle size={22} /><strong>工具配置不存在</strong></div>;
  return (
    <div className="embedded-page">
      <div className="embedded-toolbar">
        <div><span className={"status-dot " + (phase === "ready" ? "running" : phase === "error" ? "error" : "starting")} /><strong>{tool.name}</strong><small>{message}</small></div>
        <div><button className="icon-button" title="查看日志" onClick={() => onLogs(tool.id)}><TerminalSquare size={16} /></button></div>
      </div>
      <div className="embedded-host" ref={hostRef}>
        {!isDesktop && <div className="embedded-browser-state"><Monitor size={24} /><strong>嵌入视图将在 Electron 中显示</strong><span>{tool.runtime.openUrl}</span></div>}
        {phase === "error" && <div className="embedded-error"><AlertCircle size={24} /><strong>网页收藏加载失败</strong><span>{message}</span><button className="secondary-button" onClick={() => setRetryVersion((value) => value + 1)}><RefreshCw size={16} />重新尝试</button></div>}
      </div>
    </div>
  );
}

function SettingsPage({ value, onSave }: { value: WorkbenchSettings; onSave: (value: WorkbenchSettings) => Promise<WorkbenchSettings> }) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(value);

  useEffect(() => {
    setDraft(value);
    setMessage(null);
  }, [value]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await onSave(draft);
      setDraft(saved);
      setMessage({ type: "success", text: "设置已保存" });
    } catch (error) {
      setMessage({ type: "error", text: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page settings-page">
      <section className="settings-section">
        <div className="settings-heading"><h2>工作区</h2><p>工具相对路径都基于这个目录解析。</p></div>
        <div className="settings-fields">
          <div className="field-row"><label>Workspace Root</label><input value={draft.workspaceRoot} onChange={(event) => setDraft({ ...draft, workspaceRoot: event.target.value })} /></div>
          <div className="field-row"><label>扫描忽略目录</label><textarea rows={4} value={(draft.ignoredWorkspaceDirectories ?? []).join("\n")} onChange={(event) => setDraft({ ...draft, ignoredWorkspaceDirectories: event.target.value.split(/[,，、\n]+/) })} /><small>仅影响“扫描工作区”的第一层目录；显式选择 Workspace 内文件夹进行扫描时仍会允许扫描。</small></div>
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-heading"><h2>外观</h2><p>工作台固定使用深色界面，可调整字号与信息密度。</p></div>
        <div className="settings-fields">
          <div className="field-row"><label>界面字号</label><div className="choice-grid font-choice-grid">
            {([["small", "小"], ["medium", "中"], ["large", "大"]] as const).map(([mode, label]) => (
              <button type="button" key={mode} className={"choice-button " + ((draft.fontSizeMode ?? "medium") === mode ? "active" : "")} onClick={() => setDraft({ ...draft, fontSizeMode: mode })}><span>{label}</span></button>
            ))}
          </div></div>
          <div className="font-credit"><strong>界面字体</strong><span>优先使用本机 MiSans；未安装时回退至 Microsoft YaHei UI。</span></div>
          <div className="field-row inline-field"><label>紧凑布局</label><button type="button" role="switch" aria-checked={draft.compactMode} className={"switch " + (draft.compactMode ? "on" : "")} onClick={() => setDraft({ ...draft, compactMode: !draft.compactMode })}><span /></button></div>
        </div>
      </section>
      <div className="settings-save">
        {message && <span className={"settings-feedback " + message.type}>{message.text}</span>}
        <button className="primary-button" onClick={() => void save()} disabled={saving || !isDirty}>{saving ? "保存中" : "保存设置"}</button>
      </div>
    </div>
  );
}

function ToolEditor({
  tool,
  onClose,
  onSave,
  onRemove,
}: {
  tool: ToolDefinition | null;
  onClose: () => void;
  onSave: (tool: ToolDefinition) => void;
  onRemove: (toolId: string) => void;
}) {
  const empty: ToolDefinition = {
    id: "tool-" + Date.now().toString(36),
    name: "",
    description: "",
    relativePath: "",
    category: "其他",
    tags: [],
    runtime: { type: "folder", launch: { type: "none" }, healthCheck: { type: "none" }, startupTimeout: 15000 },
    display: { showInToolCenter: true, openMode: "folder", sortOrder: 999 },
    startupPolicy: "manual",
  };
  const [draft, setDraft] = useState<ToolDefinition>(tool ?? empty);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal editor-modal" onSubmit={(event) => { event.preventDefault(); onSave(draft); }} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header"><div><h2>{tool ? "编辑工具" : "添加工具"}</h2><p>配置只写入 Workbench Registry</p></div><button type="button" className="icon-button" title="关闭" onClick={onClose}><X size={18} /></button></div>
        <div className="form-grid">
          <label><span>工具名称</span><input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label><span>工具 ID</span><input required disabled={Boolean(tool)} value={draft.id} onChange={(event) => setDraft({ ...draft, id: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} /></label>
          <label className="wide"><span>一句简介</span><input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          <label><span>相对路径</span><input required value={draft.relativePath} onChange={(event) => setDraft({ ...draft, relativePath: event.target.value })} /></label>
          <label><span>分类</span><input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} /></label>
          <label><span>运行类型</span><select value={draft.runtime.type} onChange={(event) => setDraft({ ...draft, runtime: { ...draft.runtime, type: event.target.value as ToolDefinition["runtime"]["type"] } })}>
            <option value="folder">目录</option><option value="local-service">本地服务</option><option value="desktop-app">桌面程序</option><option value="command">命令</option><option value="url">网址</option>
          </select></label>
          <label><span>启动类型</span><select value={draft.runtime.launch.type} onChange={(event) => setDraft({ ...draft, runtime: { ...draft.runtime, launch: { ...draft.runtime.launch, type: event.target.value as ToolDefinition["runtime"]["launch"]["type"] } } })}>
            <option value="none">无</option><option value="bat">BAT</option><option value="cmd">CMD</option><option value="exe">EXE</option><option value="node">Node</option><option value="python">Python</option><option value="powershell">PowerShell</option><option value="vbs">VBS</option>
          </select></label>
          <label><span>启动文件</span><div className="path-field"><input placeholder="可填 exe 文件或所在目录" value={draft.runtime.launch.path ?? ""} onChange={(event) => setDraft({ ...draft, runtime: { ...draft.runtime, launch: { ...draft.runtime.launch, path: event.target.value } } })} /><button type="button" className="secondary-button compact" title="选择文件" onClick={() => void api.pickFile().then((file) => { if (file) setDraft({ ...draft, runtime: { ...draft.runtime, launch: { ...draft.runtime.launch, path: file } } }); })}><FolderOpen size={14} />选择</button></div></label>
          <label><span>打开方式</span><select value={draft.display.openMode} onChange={(event) => setDraft({ ...draft, display: { ...draft.display, openMode: event.target.value as ToolDefinition["display"]["openMode"] } })}>
            <option value="folder">打开目录</option><option value="external">外部打开</option><option value="embedded">工作台内嵌</option>
          </select></label>
          <label className="wide"><span>本地网址</span><input placeholder="http://127.0.0.1:0000" value={draft.runtime.openUrl ?? ""} onChange={(event) => setDraft({ ...draft, runtime: { ...draft.runtime, openUrl: event.target.value, healthCheck: event.target.value ? { type: "http", url: event.target.value, timeout: 2500 } : { type: "none" } } })} /></label>
        </div>
        <div className="modal-footer">
          {tool ? <button type="button" className="danger-button" onClick={() => onRemove(tool.id)}><Trash2 size={15} />移除注册</button> : <span />}
          <div><button type="button" className="secondary-button" onClick={onClose}>取消</button><button type="submit" className="primary-button">保存配置</button></div>
        </div>
      </form>
    </div>
  );
}

function ScannerModal({ onClose, onReview }: { onClose: () => void; onReview: (candidate: ScanCandidate) => void }) {
  const [items, setItems] = useState<ScanCandidate[] | null>(null);
  const [scope, setScope] = useState("Workspace Root 一级目录");
  const [error, setError] = useState<string | null>(null);
  const scanWorkspace = () => {
    setItems(null);
    setError(null);
    setScope("Workspace Root 一级目录");
    void api.scanWorkspace().then(setItems).catch((reason) => { setItems([]); setError(errorMessage(reason)); });
  };
  useEffect(() => { scanWorkspace(); }, []);
  const chooseFolder = async () => {
    try {
      const folder = await api.pickFolder();
      if (!folder) return;
      setItems(null);
      setError(null);
      setScope(folder);
      setItems(await api.scanFolder(folder));
    } catch (reason) {
      setItems([]);
      setError(errorMessage(reason));
    }
  };
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal scanner-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header scanner-header">
          <div><h2>扫描并添加工具</h2><p>读取启动文件和项目配置，不执行脚本，不复制项目文件</p></div>
          <div className="scanner-header-actions"><button className="secondary-button compact" onClick={() => void chooseFolder()}><FolderOpen size={14} />选择文件夹</button><button className="icon-button" title="重新扫描工作区" onClick={scanWorkspace}><RefreshCw size={16} /></button><button className="icon-button" title="关闭" onClick={onClose}><X size={18} /></button></div>
        </div>
        <div className="scanner-scope"><FolderOpen size={14} /><span title={scope}>{scope}</span></div>
        <div className="scan-list">
          {items === null && <div className="empty-state"><LoaderCircle className="spin" size={22} /><span>正在扫描</span></div>}
          {error && <div className="scan-error"><AlertCircle size={16} /><span>{error}</span></div>}
          {items?.map((item) => <div className="scan-row" key={item.relativePath}>
            <FolderOpen size={19} />
            <div className="scan-row-copy"><strong>{item.name}</strong><span>{item.relativePath}</span><small>{item.markers.join(" · ") || "未识别入口"}{item.launch.type !== "none" ? ` · 启动：${item.launch.path}` : ""}</small>{item.warnings.length > 0 && <em>{item.warnings[0]}</em>}</div>
            <div className="scan-row-actions"><span className={`scan-confidence ${item.confidence}`}>{item.existingToolId ? "可补全" : item.confidence === "high" ? "高置信" : item.confidence === "medium" ? "可识别" : "需确认"}</span><button className="secondary-button" onClick={() => onReview(item)}><Pencil size={14} />{item.existingToolId ? "补全并确认" : "预览并确认"}</button></div>
          </div>)}
          {items?.length === 0 && <div className="empty-state"><CheckCircle2 size={22} /><strong>没有未注册目录</strong></div>}
        </div>
      </div>
    </div>
  );
}

function LogsModal({ toolId, onClose }: { toolId?: string; onClose: () => void }) {
  const [logs, setLogs] = useState("正在读取日志...");
  useEffect(() => { api.getLogs(toolId).then(setLogs).catch((error) => setLogs(errorMessage(error))); }, [toolId]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal logs-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header"><div><h2>运行日志</h2><p>{toolId ?? "全部工具"}</p></div><button className="icon-button" title="关闭" onClick={onClose}><X size={18} /></button></div>
        <pre>{logs}</pre>
      </div>
    </div>
  );
}
