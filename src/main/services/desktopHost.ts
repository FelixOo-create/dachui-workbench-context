import { BrowserWindow, screen } from "electron";
import type { DesktopDisplayInfo, DesktopHostState } from "../../shared/desktop";
import { DesktopLayoutService } from "./desktopLayout";

type StateListener = (state: DesktopHostState) => void;

/**
 * 模拟桌面宿主：不透明全屏窗口铺满目标显示器，作为工作台的虚拟桌面。
 * 不做透明穿透，不依附 Explorer 桌面层。
 */
export class DesktopHostController {
  private state: DesktopHostState = {
    mode: "simulated",
    message: "模拟桌面已就绪",
    boundDisplayId: null,
    editMode: false,
    displays: [],
  };
  private readonly listeners = new Set<StateListener>();
  private readonly platform: typeof process.platform;
  private disposed = false;

  constructor(
    private readonly window: BrowserWindow,
    private readonly layout: DesktopLayoutService,
    options: { platform?: typeof process.platform } = {},
  ) {
    this.platform = options.platform ?? process.platform;
  }

  getState(): DesktopHostState {
    return { ...this.state, displays: this.state.displays.map((display) => ({ ...display, bounds: { ...display.bounds }, workArea: { ...display.workArea } })) };
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  initialize(): DesktopHostState {
    this.state = { ...this.state, editMode: this.layout.load().editMode };
    if (this.platform !== "win32") {
      this.state = { ...this.state, mode: "windowed-preview", message: "当前系统不支持全屏模拟桌面，已进入窗口预览模式" };
      return this.getState();
    }
    screen.on("display-added", this.handleDisplayChange);
    screen.on("display-removed", this.handleDisplayChange);
    screen.on("display-metrics-changed", this.handleDisplayChange);
    this.refreshDisplays();
    this.applyDisplayBounds();
    this.window.setSkipTaskbar(false);
    this.window.setResizable(false);
    this.window.show();
    this.emit();
    return this.getState();
  }

  setEditMode(enabled: boolean): DesktopHostState {
    this.layout.patch({ editMode: enabled });
    this.state = { ...this.state, editMode: enabled };
    this.emit();
    return this.getState();
  }

  setTargetDisplay(displayId: string | null): DesktopHostState {
    this.layout.patch({ targetDisplayId: displayId });
    this.refreshDisplays();
    this.applyDisplayBounds();
    this.emit();
    return this.getState();
  }

  show(): void {
    if (this.platform === "win32") {
      this.refreshDisplays();
      this.applyDisplayBounds();
      this.emit();
    }
    this.window.show();
  }

  dispose(): void {
    this.disposed = true;
    screen.removeListener("display-added", this.handleDisplayChange);
    screen.removeListener("display-removed", this.handleDisplayChange);
    screen.removeListener("display-metrics-changed", this.handleDisplayChange);
    this.listeners.clear();
  }

  private readonly handleDisplayChange = (): void => {
    if (this.disposed || this.window.isDestroyed()) return;
    this.refreshDisplays();
    this.applyDisplayBounds();
    this.emit();
  };

  private refreshDisplays(): void {
    const primaryId = String(screen.getPrimaryDisplay().id);
    const displays: DesktopDisplayInfo[] = screen.getAllDisplays().map((display, index) => ({
      id: String(display.id),
      label: display.label || `显示器 ${index + 1}`,
      primary: String(display.id) === primaryId,
      bounds: { ...display.bounds },
      workArea: { ...display.workArea },
      scaleFactor: display.scaleFactor,
    }));
    this.state = { ...this.state, displays };
  }

  private applyDisplayBounds(): void {
    const layout = this.layout.load();
    const all = screen.getAllDisplays();
    const desired = layout.targetDisplayId ?? layout.rememberedDisplayId;
    const selected = all.find((display) => String(display.id) === desired);
    const target = selected ?? screen.getPrimaryDisplay();
    if (layout.targetDisplayId && !selected) this.layout.patch({ targetDisplayId: null });
    this.layout.selectDisplay(String(target.id));
    this.window.setBounds(target.workArea);
    this.state = { ...this.state, boundDisplayId: String(target.id) };
  }

  private emit(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot);
  }
}
