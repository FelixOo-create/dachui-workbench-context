import { app, BrowserWindow, globalShortcut, Menu, nativeImage, nativeTheme, Tray, type IpcMainInvokeEvent } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { ToolDefinition } from "../shared/types";
import { registerIpc } from "./ipc";
import { registerMemoriesIpc } from "./memoriesIpc";
import { EmbeddedViewManager } from "./services/embedded";
import { MemoriesService } from "./services/memories";
import { RegistryService } from "./services/registry";
import { RuntimeManager } from "./services/runtime";
import { ScheduleService } from "./services/schedule";
import { StartupPolicyRunner } from "./services/startupPolicy";
import { registerDesktopIpc } from "./desktopIpc";
import { DesktopFilesService } from "./services/desktopFiles";
import { DesktopHostController } from "./services/desktopHost";
import { DesktopLayoutService } from "./services/desktopLayout";
import { FocusTimerService } from "./services/focusTimer";
import { SystemActionService } from "./services/systemActions";
import { WeatherService } from "./services/weather";
import { DESKTOP_SCENES } from "../shared/desktopManifest";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
const startupPolicyRunner = new StartupPolicyRunner();
const managedWindows = new Set<BrowserWindow>();
const workspaceWindows = new Map<string, BrowserWindow>();
let desktopHost: DesktopHostController | null = null;
let desktopLayout: DesktopLayoutService | null = null;
let focusTimer: FocusTimerService | null = null;
let registryService: RegistryService | null = null;
let runtimeManager: RuntimeManager | null = null;

function broadcastLayout(): void {
  if (!desktopLayout) return;
  const next = desktopLayout.load();
  for (const window of managedWindows) if (!window.isDestroyed()) window.webContents.send("desktop:layout-state", next);
}

function resolveResourcePath(fileName: string): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, fileName)
    : path.join(app.getAppPath(), "resources", fileName);
}

function getWorkbenchIcon(): Electron.NativeImage {
  const icon = nativeImage.createFromPath(resolveResourcePath("tray.png"));
  if (icon.isEmpty()) throw new Error("工作台图标资源加载失败");
  return icon;
}

function getTrayIcon(): Electron.NativeImage {
  const icon = nativeImage.createEmpty();
  for (const representation of [
    { scaleFactor: 1, fileName: "tray-16.png" },
    { scaleFactor: 1.25, fileName: "tray-20.png" },
    { scaleFactor: 1.5, fileName: "tray-24.png" },
    { scaleFactor: 2, fileName: "tray-32.png" },
  ]) {
    const png = fs.readFileSync(resolveResourcePath(representation.fileName));
    icon.addRepresentation({
      scaleFactor: representation.scaleFactor,
      dataURL: `data:image/png;base64,${png.toString("base64")}`,
    });
  }
  if (icon.isEmpty()) throw new Error("工作台托盘图标资源加载失败");
  return icon;
}

function showWindow(): void {
  if (!mainWindow) return;
  if (desktopLayout?.load().hidden) {
    desktopLayout.patch({ hidden: false });
    broadcastLayout();
  }
  if (desktopHost?.getState().mode === "simulated") {
    desktopHost.show();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function quitApp(): void {
  isQuitting = true;
  app.quit();
}

function createTray(): void {
  tray = new Tray(getTrayIcon());
  tray.setToolTip("大锤的工作台");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "显示桌面组件", click: showWindow },
      { label: "隐藏桌面组件", click: () => mainWindow?.hide() },
      { label: "打开工具管理", click: () => void openWorkspaceWindow("tools") },
      { label: "工作台设置", click: () => void openWorkspaceWindow("settings") },
      { type: "separator" },
      { label: "退出程序", click: quitApp },
    ])
  );
  tray.on("click", showWindow);
}

function rendererTarget(query = ""): { url?: string; file?: string } {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) return { url: `${MAIN_WINDOW_VITE_DEV_SERVER_URL}${query}` };
  return { file: path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`) };
}

async function loadRenderer(window: BrowserWindow, query = ""): Promise<void> {
  const target = rendererTarget(query);
  if (target.url) await window.loadURL(target.url);
  else await window.loadFile(target.file!, query ? { search: query.replace(/^\?/, "") } : undefined);
}

function workspaceQuery(moduleId: string): string {
  return `?workspace=${encodeURIComponent(moduleId)}`;
}

async function openWorkspaceWindow(moduleId: string): Promise<void> {
  const existing = workspaceWindows.get(moduleId);
  if (existing) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return;
  }
  const loadsLocalWebContent = moduleId === "bookmarks";
  const window = new BrowserWindow({
    title: `大锤工作台 · ${moduleId}`,
    icon: getWorkbenchIcon(),
    width: 1320,
    height: 860,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: "#101216",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: loadsLocalWebContent ? undefined : path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  managedWindows.add(window);
  workspaceWindows.set(moduleId, window);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    managedWindows.delete(window);
    if (workspaceWindows.get(moduleId) === window) workspaceWindows.delete(moduleId);
  });
  if (moduleId === "bookmarks" && runtimeManager && registryService) {
    await runtimeManager.start("bookmarks");
    const url = registryService.getTool("bookmarks").runtime.openUrl;
    if (!url) throw new Error("书签工作区地址未配置");
    await window.loadURL(`${url}/?embed=workbench`);
  } else {
    await loadRenderer(window, workspaceQuery(moduleId));
  }
}

function copyDirectory(source: string, target: string): void {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to);
    else if (!fs.existsSync(to)) fs.copyFileSync(from, to);
  }
}

function ensureBookmarksRegistry(registry: RegistryService): void {
  const bookmarkDataDir = path.join(app.getPath("userData"), "data", "bookmarks");
  const bookmarkPreviewDir = path.join(bookmarkDataDir, "previews");
  let existing: ToolDefinition | undefined;
  try {
    existing = registry.getTool("bookmarks");
  } catch {
    existing = undefined;
  }
  const currentEnvironment = existing?.runtime.launch.environment ?? {};
  registry.saveTool({
    id: "bookmarks",
    name: "网页收藏",
    description: "保存、分类和快速打开常用网页",
    category: "效率",
    tags: Array.from(new Set([...(existing?.tags ?? []).filter((tag) => tag !== "书签"), "网页收藏", "Node", "本地服务"])),
    icon: existing?.icon ?? "bookmark",
    relativePath: "大锤的工作台\\modules\\bookmarks",
    runtime: {
      type: "local-service",
      launch: {
        type: "cmd",
        path: "scripts\\start-bookmarks-service.cmd",
        environment: {
          ...currentEnvironment,
          DACHUI_WORKBENCH: "1",
          PORT: "4175",
          BOOKMARK_DATA_DIR: bookmarkDataDir,
          BOOKMARK_PREVIEW_DIR: bookmarkPreviewDir,
        },
      },
      workingDirectory: ".",
      healthCheck: { type: "http", url: "http://127.0.0.1:4175/api/health", timeout: 1800, expectedServiceId: "dachui-workbench-bookmarks" },
      openUrl: "http://127.0.0.1:4175",
      startupTimeout: 12000,
    },
    display: {
      showInToolCenter: false,
      openMode: "embedded",
      sidebarEntries: [{ id: "web-collections", label: "网页收藏", icon: "bookmark", path: "/?embed=workbench", sortOrder: 30 }],
      sortOrder: 30,
    },
    startupPolicy: "on-workbench-start",
  });
}

function resolveDataRoot(): string {
  if (!app.isPackaged) return path.join(app.getAppPath(), "data");
  const target = path.join(app.getPath("userData"), "data");
  const seed = path.join(process.resourcesPath, "data");
  if (fs.existsSync(seed)) copyDirectory(seed, target);
  return target;
}

function resolveScheduleDbPath(): string {
  const targetDirectory = path.join(app.getPath("userData"), "data", "schedule");
  const target = path.join(targetDirectory, "todo-calendar.db");
  fs.mkdirSync(targetDirectory, { recursive: true });
  return target;
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    title: "大锤的工作台",
    icon: getWorkbenchIcon(),
    width: 1480,
    height: 920,
    minWidth: 1024,
    minHeight: 640,
    frame: false,
    transparent: false,
    backgroundColor: "#0a0b10",
    autoHideMenuBar: true,
    skipTaskbar: false,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  managedWindows.add(mainWindow);

  const dataRoot = resolveDataRoot();
  const registry = new RegistryService(dataRoot);
  registryService = registry;
  ensureBookmarksRegistry(registry);
  registry.removeTool("todo-calendar");
  registry.removeTool("prompt-library");
  const runtime = new RuntimeManager(registry, path.join(dataRoot, "..", "logs"));
  runtimeManager = runtime;
  const embedded = new EmbeddedViewManager(mainWindow, registry, runtime);
  const schedule = new ScheduleService(resolveScheduleDbPath());
  const memories = new MemoriesService(path.join(app.getPath("userData"), "memories"));
  desktopLayout = new DesktopLayoutService(dataRoot);
  const desktopFiles = new DesktopFilesService(dataRoot);
  if (desktopFiles.getState().autoSync) void desktopFiles.sync().catch(() => undefined);
  focusTimer = new FocusTimerService(schedule);
  const systemActions = new SystemActionService();
  const weather = new WeatherService();
  desktopHost = new DesktopHostController(mainWindow, desktopLayout);
  const isTrustedWindow = (event: IpcMainInvokeEvent) => {
    const source = BrowserWindow.fromWebContents(event.sender);
    return source !== null && managedWindows.has(source);
  };
  registerIpc(mainWindow, registry, runtime, embedded, schedule, isTrustedWindow);
  registerMemoriesIpc(mainWindow, memories, isTrustedWindow);
  const stopDesktopIpcEvents = registerDesktopIpc(
    isTrustedWindow,
    () => [...managedWindows],
    desktopLayout,
    desktopHost,
    desktopFiles,
    focusTimer,
    systemActions,
    weather,
    (moduleId) => void openWorkspaceWindow(moduleId),
  );

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.on("closed", () => {
    stopDesktopIpcEvents();
    desktopHost?.dispose();
    focusTimer?.dispose();
    weather.stop();
    embedded.destroy();
    schedule.close();
    memories.close();
    managedWindows.delete(mainWindow!);
    mainWindow = null;
  });

  await loadRenderer(mainWindow);
  desktopHost.initialize();
  weather.start(10);

  const settings = registry.getSettings();
  nativeTheme.themeSource = settings.theme;
  // 启动策略只在本次应用进程首次创建窗口时应用；单个工具失败不影响其他工具和工作台。
  void startupPolicyRunner.apply(registry.listTools(), (toolId) => runtime.start(toolId));
}

app.whenReady().then(async () => {
  await createWindow();
  createTray();
  for (const [index, scene] of DESKTOP_SCENES.entries()) {
    globalShortcut.register(`Control+Alt+${index + 1}`, () => {
      if (!desktopLayout) return;
      const next = desktopLayout.patch({ activeScene: scene.id, hidden: false });
      for (const window of managedWindows) if (!window.isDestroyed()) window.webContents.send("desktop:layout-state", next);
      showWindow();
    });
  }
  app.on("activate", () => {
    if (mainWindow) showWindow();
    else void createWindow();
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
