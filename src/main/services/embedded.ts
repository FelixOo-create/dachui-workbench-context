import { WebContentsView, type BrowserWindow, shell } from "electron";
import type { EmbeddedBounds } from "../../shared/types";
import { isEmbeddedToolId } from "../../shared/toolPolicy";
import { RegistryService } from "./registry";
import { RuntimeManager } from "./runtime";

export class EmbeddedViewManager {
  private view: WebContentsView | null = null;
  private activeToolId: string | null = null;
  private activeUrl: string | null = null;
  private destroyed = false;

  constructor(
    private readonly window: BrowserWindow,
    private readonly registry: RegistryService,
    private readonly runtime: RuntimeManager,
  ) {}

  async show(toolId: string, route: string | undefined, bounds: EmbeddedBounds): Promise<string> {
    if (this.destroyed || this.window.isDestroyed()) throw new Error("工作台窗口已关闭");
    if (!isEmbeddedToolId(toolId)) throw new Error("该工具不在内嵌白名单中");
    const tool = this.registry.getTool(toolId);
    if (tool.display.openMode !== "embedded") throw new Error("该工具未配置为内嵌模式");
    if (!tool.runtime.openUrl) throw new Error("该工具未配置打开地址");
    const status = await this.runtime.ensureRunning(toolId);
    if (status.status !== "running") throw new Error(status.message ?? "工具服务未就绪");

    const base = this.runtime.assertSafeUrl(tool.runtime.openUrl);
    const target = route ? new URL(route, base) : base;
    if (target.origin !== base.origin) throw new Error("内嵌路由不能跳转到其他来源");
    const targetUrl = target.toString();

    if (!this.view || this.activeToolId !== toolId) {
      this.closeCurrentView();
      const view = new WebContentsView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          backgroundThrottling: false,
        },
      });
      view.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
      view.webContents.setWindowOpenHandler(({ url }) => {
        const candidate = new URL(url);
        if (candidate.protocol === "https:" || ["localhost", "127.0.0.1"].includes(candidate.hostname)) void shell.openExternal(url);
        return { action: "deny" };
      });
      view.webContents.on("will-navigate", (event, url) => {
        if (new URL(url).origin !== base.origin) event.preventDefault();
      });
      if (this.destroyed || this.window.isDestroyed()) {
        if (!view.webContents.isDestroyed()) view.webContents.close();
        throw new Error("工作台窗口已关闭");
      }
      this.window.contentView.addChildView(view);
      this.view = view;
      this.activeToolId = toolId;
      this.activeUrl = null;
    }
    this.resize(bounds);
    if (!this.view || this.view.webContents.isDestroyed()) throw new Error("内嵌视图已关闭");
    this.view.setVisible(true);
    if (this.activeUrl !== targetUrl) {
      await this.view.webContents.loadURL(targetUrl);
      this.activeUrl = targetUrl;
    }
    return targetUrl;
  }

  resize(bounds: EmbeddedBounds): void {
    if (this.destroyed || !this.view || this.view.webContents.isDestroyed()) return;
    const safe = {
      x: Math.max(0, Math.round(bounds.x)),
      y: Math.max(0, Math.round(bounds.y)),
      width: Math.max(1, Math.round(bounds.width)),
      height: Math.max(1, Math.round(bounds.height)),
    };
    try {
      this.view.setBounds(safe);
    } catch (error) {
      console.warn("[EmbeddedViewManager] resize skipped", error);
    }
  }

  hide(): void {
    if (this.destroyed || !this.view || this.view.webContents.isDestroyed()) return;
    try {
      this.view.setVisible(false);
    } catch (error) {
      console.warn("[EmbeddedViewManager] hide skipped", error);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.closeCurrentView();
  }

  private closeCurrentView(): void {
    const view = this.view;
    this.view = null;
    this.activeToolId = null;
    this.activeUrl = null;
    if (!view) return;

    try {
      if (!this.window.isDestroyed()) {
        this.window.contentView.removeChildView(view);
      }
    } catch (error) {
      console.warn("[EmbeddedViewManager] failed to remove embedded view", error);
    }

    try {
      if (!view.webContents.isDestroyed()) {
        view.webContents.close();
      }
    } catch (error) {
      console.warn("[EmbeddedViewManager] failed to close embedded webContents", error);
    }
  }
}
