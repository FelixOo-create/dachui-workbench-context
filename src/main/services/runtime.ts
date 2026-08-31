import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { shell } from "electron";
import type { HealthCheck, LaunchAction, ToolDefinition, ToolStatus, ToolStatusResult } from "../../shared/types";
import { RegistryService } from "./registry";

const POLL_INTERVAL = 500;

type HealthProbe = "healthy" | "unreachable" | "identity-mismatch";

function result(toolId: string, status: ToolStatus, message?: string): ToolStatusResult {
  return { toolId, status, message, checkedAt: new Date().toISOString() };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class RuntimeManager {
  private readonly processes = new Map<string, ChildProcess>();
  private readonly states = new Map<string, ToolStatusResult>();
  private readonly logFile: string;

  constructor(private readonly registry: RegistryService, logsRoot: string) {
    fs.mkdirSync(logsRoot, { recursive: true });
    this.logFile = path.join(logsRoot, "runtime.log");
  }

  async getStatuses(): Promise<ToolStatusResult[]> {
    return Promise.all(this.registry.listTools().map((tool) => this.getStatus(tool.id)));
  }

  async getStatus(toolId: string): Promise<ToolStatusResult> {
    const tool = this.registry.getTool(toolId);
    const previous = this.states.get(toolId);
    if (previous?.status === "error") {
      // 普通刷新不能抹掉失败原因；只有健康检查确认恢复才清除 error。
      if (tool.runtime.healthCheck && tool.runtime.healthCheck.type !== "none") {
        const probe = await this.probeHealthCheck(tool.runtime.healthCheck);
        if (probe === "healthy") return this.setState(toolId, "running");
        if (probe === "identity-mismatch") return this.setState(toolId, "error", this.identityMismatchMessage(tool.runtime.healthCheck));
        return previous;
      }
      return previous;
    }
    const root = this.registry.resolveToolRoot(tool);
    if (!fs.existsSync(root)) return this.setState(toolId, "missing", "目录不存在");
    if (tool.runtime.launch.type === "none" && tool.runtime.type !== "folder" && tool.runtime.type !== "url" && tool.runtime.type !== "file") {
      return this.setState(toolId, "unconfigured", "尚未配置启动方式");
    }

    const transient = this.states.get(toolId);
    if (transient && ["starting", "stopping"].includes(transient.status)) return transient;
    if (tool.runtime.healthCheck && tool.runtime.healthCheck.type !== "none") {
      const probe = await this.probeHealthCheck(tool.runtime.healthCheck);
      if (probe === "identity-mismatch") return this.setState(toolId, "error", this.identityMismatchMessage(tool.runtime.healthCheck));
      return this.setState(toolId, probe === "healthy" ? "running" : "stopped");
    }
    const child = this.processes.get(toolId);
    if (child && child.exitCode === null && !child.killed) return this.setState(toolId, "running");
    if (["folder", "file", "url", "static-web"].includes(tool.runtime.type)) return this.setState(toolId, "unknown");
    return this.setState(toolId, "stopped");
  }

  async start(toolId: string): Promise<ToolStatusResult> {
    const tool = this.registry.getTool(toolId);
    const current = await this.getStatus(toolId);
    if (current.status === "running") {
      this.log(toolId, "start", "skipped", "健康检查已通过，跳过重复启动");
      return current;
    }
    if (current.status === "missing") return current;
    if (tool.runtime.launch.type === "none") return this.setState(toolId, "unconfigured", "尚未配置启动方式");

    if (tool.runtime.healthCheck?.type === "http" && tool.runtime.healthCheck.expectedServiceId) {
      const probe = await this.probeHealthCheck(tool.runtime.healthCheck);
      if (probe === "identity-mismatch") return this.setState(toolId, "error", this.identityMismatchMessage(tool.runtime.healthCheck));
    }

    this.setState(toolId, "starting", "正在启动");
    try {
      const child = this.spawnAction(tool, tool.runtime.launch);
      this.processes.set(toolId, child);
      this.captureOutput(toolId, child);
      this.log(toolId, "start", "started", `pid=${child.pid ?? "unknown"}`);

      if (!tool.runtime.healthCheck || tool.runtime.healthCheck.type === "none") {
        await delay(350);
        if (child.exitCode && child.exitCode !== 0) throw new Error(`进程退出，代码 ${child.exitCode}`);
        return this.setState(toolId, "running");
      }

      const timeout = tool.runtime.startupTimeout ?? tool.runtime.healthCheck.timeout ?? 15000;
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const probe = await this.probeHealthCheck(tool.runtime.healthCheck);
        if (probe === "healthy") return this.setState(toolId, "running");
        if (probe === "identity-mismatch") throw new Error(this.identityMismatchMessage(tool.runtime.healthCheck));
        if (child.exitCode && child.exitCode !== 0) throw new Error(`启动进程退出，代码 ${child.exitCode}`);
        await delay(POLL_INTERVAL);
      }
      throw new Error(`启动超时（${Math.round(timeout / 1000)} 秒）`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(toolId, "start", "error", message);
      return this.setState(toolId, "error", message);
    }
  }

  async stop(toolId: string): Promise<ToolStatusResult> {
    const tool = this.registry.getTool(toolId);
    this.setState(toolId, "stopping", "正在停止");
    try {
      if (tool.runtime.stop && tool.runtime.stop.type !== "none") {
        const child = this.spawnAction(tool, tool.runtime.stop);
        await new Promise<void>((resolve, reject) => {
          child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`停止命令退出，代码 ${code}`))));
          child.once("error", reject);
        });
      } else {
        const child = this.processes.get(toolId);
        if (!child?.pid) throw new Error("该进程不是由本次 Workbench 会话启动，且未配置停止命令");
        if (process.platform === "win32") {
          await new Promise<void>((resolve, reject) => {
            const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
            killer.once("exit", (code) => (code === 0 || code === 128 ? resolve() : reject(new Error(`taskkill 退出，代码 ${code}`))));
            killer.once("error", reject);
          });
        } else {
          child.kill("SIGTERM");
        }
      }
      this.processes.delete(toolId);
      this.log(toolId, "stop", "success");
      return this.setState(toolId, "stopped");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(toolId, "stop", "error", message);
      return this.setState(toolId, "error", message);
    }
  }

  async restart(toolId: string): Promise<ToolStatusResult> {
    const before = await this.getStatus(toolId);
    if (before.status === "running") {
      const stopped = await this.stop(toolId);
      if (stopped.status === "error") return stopped;
    }
    return this.start(toolId);
  }

  async ensureRunning(toolId: string): Promise<ToolStatusResult> {
    const status = await this.getStatus(toolId);
    return status.status === "running" ? status : this.start(toolId);
  }

  async open(toolId: string): Promise<void> {
    const tool = this.registry.getTool(toolId);
    // 配置了启动方式（exe/bat/cmd/node/python/powershell）时优先启动，而不是打开文件夹
    if (
      tool.runtime.launch.type !== "none" &&
      tool.runtime.type !== "local-service" &&
      tool.runtime.type !== "static-web" &&
      tool.runtime.type !== "url"
    ) {
      const status = await this.start(toolId);
      if (status.status === "error" || status.status === "missing") throw new Error(status.message ?? "工具启动失败");
      return;
    }
    if (tool.runtime.type === "folder" || tool.display.openMode === "folder") return this.openFolder(toolId);
    if (tool.runtime.type === "file") {
      const target = this.registry.resolveToolFile(tool, tool.runtime.launch.path ?? ".");
      const error = await shell.openPath(target);
      if (error) throw new Error(error);
      return;
    }
    if (tool.runtime.type === "desktop-app" || tool.runtime.type === "command") {
      const status = await this.start(toolId);
      if (status.status === "error" || status.status === "missing") throw new Error(status.message ?? "工具启动失败");
      return;
    }
    const url = tool.runtime.openUrl;
    if (!url) throw new Error("未配置打开地址");
    this.assertSafeUrl(url);
    if (tool.runtime.type === "local-service") {
      const status = await this.ensureRunning(toolId);
      if (status.status !== "running") throw new Error(status.message ?? "服务未就绪");
    }
    await shell.openExternal(url);
  }

  async openFolder(toolId: string): Promise<void> {
    const tool = this.registry.getTool(toolId);
    const error = await shell.openPath(this.registry.resolveToolRoot(tool));
    if (error) throw new Error(error);
  }

  getLogs(toolId?: string): string {
    if (!fs.existsSync(this.logFile)) return "暂无运行日志";
    const lines = fs.readFileSync(this.logFile, "utf8").trim().split(/\r?\n/);
    const filtered = toolId ? lines.filter((line) => line.includes(`[${toolId}]`)) : lines;
    return filtered.slice(-300).join("\n") || "暂无运行日志";
  }

  private spawnAction(tool: ToolDefinition, action: LaunchAction): ChildProcess {
    const cwd = this.registry.resolveToolFile(tool, tool.runtime.workingDirectory ?? ".");
    const args = action.args ?? [];
    const environment = { ...process.env, ...(action.environment ?? {}) };
    if (!fs.existsSync(cwd)) throw new Error(`工作目录不存在：${cwd}`);

    if (action.type === "bat" || action.type === "cmd") {
      if (!action.path) throw new Error("未配置脚本路径");
      const script = this.registry.resolveToolFile(tool, action.path);
      if (!fs.existsSync(script)) throw new Error(`启动脚本不存在：${script}`);
      return spawn("cmd.exe", ["/d", "/c", script, ...args], { cwd, env: environment, windowsHide: true });
    }
    if (action.type === "powershell") {
      if (!action.path) throw new Error("未配置 PowerShell 脚本路径");
      const script = this.registry.resolveToolFile(tool, action.path);
      if (!fs.existsSync(script)) throw new Error(`启动脚本不存在：${script}`);
      return spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...args], { cwd, env: environment, windowsHide: true });
    }
    if (action.type === "vbs") {
      if (!action.path) throw new Error("未配置 VBScript 路径");
      const script = this.registry.resolveToolFile(tool, action.path);
      if (!fs.existsSync(script)) throw new Error(`启动脚本不存在：${script}`);
      return spawn("cscript.exe", ["//nologo", script, ...args], { cwd, env: environment, windowsHide: true });
    }
    if (action.type === "exe") {
      if (!action.path) throw new Error("未配置 EXE 路径");
      let executable = path.isAbsolute(action.path) ? action.path : this.registry.resolveToolFile(tool, action.path);
      if (!fs.existsSync(executable)) throw new Error(`可执行文件不存在：${executable}`);
      if (fs.statSync(executable).isDirectory()) executable = this.findExecutableInDir(executable);
      return spawn(executable, args, { cwd, env: environment, windowsHide: false });
    }
    if (action.type === "node" || action.type === "python") {
      if (!action.path) throw new Error(`未配置 ${action.type} 入口`);
      const entry = this.registry.resolveToolFile(tool, action.path);
      if (!fs.existsSync(entry)) throw new Error(`入口文件不存在：${entry}`);
      return spawn(action.type === "node" ? "node.exe" : "python.exe", [entry, ...args], { cwd, env: environment, windowsHide: true });
    }
    throw new Error(`不支持的启动类型：${action.type}`);
  }

  /** 在目录（及常见打包子目录）中查找可执行文件 */
  private findExecutableInDir(directory: string): string {
    const candidates = [directory, ...["win-unpacked", "win-unpack", "dist", "release"].map((sub) => path.join(directory, sub))];
    for (const dir of candidates) {
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
      const exes = fs.readdirSync(dir).filter((name) => name.toLowerCase().endsWith(".exe"));
      if (exes.length === 0) continue;
      if (exes.length === 1) return path.join(dir, exes[0]);
      const base = path.basename(dir).toLowerCase();
      const match = exes.find((name) => name.toLowerCase().replace(/\.exe$/, "") === base);
      return path.join(dir, match ?? exes[0]);
    }
    throw new Error(`目录中未找到可执行文件：${directory}`);
  }

  private captureOutput(toolId: string, child: ChildProcess): void {
    child.stdout?.on("data", (chunk) => this.log(toolId, "output", "stdout", String(chunk).trim()));
    child.stderr?.on("data", (chunk) => this.log(toolId, "output", "stderr", String(chunk).trim()));
    child.once("error", (error) => this.log(toolId, "process", "error", error.message));
    child.once("exit", (code) => {
      this.processes.delete(toolId);
      this.log(toolId, "process", "exit", `code=${code}`);
    });
  }

  private async probeHealthCheck(check: HealthCheck): Promise<HealthProbe> {
    try {
      if (check.type === "http" && check.url) {
        this.assertSafeUrl(check.url);
        const response = await fetch(check.url, { signal: AbortSignal.timeout(Math.min(check.timeout ?? 2500, 5000)) });
        if (!response.ok) return "unreachable";
        if (!check.expectedServiceId) return "healthy";
        try {
          const payload = await response.json() as { serviceId?: unknown };
          return payload?.serviceId === check.expectedServiceId ? "healthy" : "identity-mismatch";
        } catch {
          return "identity-mismatch";
        }
      }
      if (check.type === "tcp" && check.port) {
        return await new Promise<boolean>((resolve) => {
          const socket = net.createConnection({ host: check.host ?? "127.0.0.1", port: check.port! });
          const finish = (healthy: boolean) => { socket.destroy(); resolve(healthy); };
          socket.setTimeout(Math.min(check.timeout ?? 2000, 5000));
          socket.once("connect", () => finish(true));
          socket.once("timeout", () => finish(false));
          socket.once("error", () => finish(false));
        }).then((healthy) => healthy ? "healthy" : "unreachable");
      }
      return "unreachable";
    } catch {
      return "unreachable";
    }
  }

  private identityMismatchMessage(check: HealthCheck): string {
    let endpoint = check.url ?? "健康检查端点";
    try {
      const url = check.url ? new URL(check.url) : undefined;
      if (url?.port) endpoint = `端口 ${url.port}`;
    } catch {
      // Keep the configured endpoint in the user-facing message.
    }
    return `健康检查${endpoint}：服务身份不匹配，可能已被其他服务占用`;
  }

  assertSafeUrl(rawUrl: string): URL {
    const url = new URL(rawUrl);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("仅允许 HTTP/HTTPS 地址");
    if (url.protocol === "http:" && !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
      throw new Error("非本机地址必须使用 HTTPS");
    }
    return url;
  }

  private setState(toolId: string, status: ToolStatus, message?: string): ToolStatusResult {
    const next = result(toolId, status, message);
    this.states.set(toolId, next);
    return next;
  }

  private log(toolId: string, action: string, status: string, message = ""): void {
    const safeMessage = message.replace(/\r?\n/g, " ").slice(0, 4000);
    fs.appendFileSync(this.logFile, `${new Date().toISOString()} [${toolId}] ${action} ${status}${safeMessage ? ` ${safeMessage}` : ""}\n`, "utf8");
  }
}
