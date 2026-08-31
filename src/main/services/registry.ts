import fs from "node:fs";
import path from "node:path";
import type { ScanCandidate, ToolDefinition, WorkbenchSettings } from "../../shared/types";
import { isBuiltinToolId } from "../../shared/toolPolicy";

const DEFAULT_SETTINGS: WorkbenchSettings = {
  workspaceRoot: "E:\\Vibecoding",
  theme: "dark",
  compactMode: false,
  fontSizeMode: "medium",
  sidebarOrder: [],
  ignoredWorkspaceDirectories: ["_归档", "_管理", "node_modules", "release", "dist", "build", "out", ".cache"],
};

const MAX_IGNORED_DIRECTORIES = 64;
const MAX_IGNORED_DIRECTORY_LENGTH = 80;

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
const KNOWN_MARKERS = [
  "package.json",
  "start.bat",
  "run.bat",
  "serve.bat",
  "start.cmd",
  "run.cmd",
  "serve.cmd",
  "requirements.txt",
  "pyproject.toml",
  "Cargo.toml",
  "index.html",
  "README.md",
];
const STARTUP_FILE_NAMES = [
  "启动工作台.bat",
  "启动工具.bat",
  "启动.bat",
  "start.bat",
  "run.bat",
  "serve.bat",
  "启动工作台.cmd",
  "启动工具.cmd",
  "启动.cmd",
  "start.cmd",
  "run.cmd",
  "serve.cmd",
  "start.ps1",
  "run.ps1",
  "serve.ps1",
  "启动.ps1",
  "start.vbs",
  "启动.vbs",
];
const PYTHON_ENTRY_NAMES = ["app.py", "main.py", "server.py", "run.py"];
const PATH_WRAPPER_PATTERN = /^[\s"'“”‘’]+|[\s"'“”‘’]+$/g;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanWorkspaceRoot(value: string): string {
  return value.replace(PATH_WRAPPER_PATTERN, "");
}

function normalizeIgnoredWorkspaceDirectories(value: unknown): string[] {
  if (!Array.isArray(value)) return [...(DEFAULT_SETTINGS.ignoredWorkspaceDirectories ?? [])];
  const seen = new Set<string>();
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, MAX_IGNORED_DIRECTORY_LENGTH))
    .filter((item) => {
      if (!item) return false;
      const key = item.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_IGNORED_DIRECTORIES);
}

export function validateTool(input: unknown): ToolDefinition {
  if (!isPlainObject(input)) throw new Error("工具配置必须是对象");
  const tool = input as unknown as ToolDefinition;
  if (!ID_PATTERN.test(tool.id ?? "")) throw new Error("工具 ID 仅允许小写字母、数字和连字符");
  if (!tool.name?.trim()) throw new Error("工具名称不能为空");
  if (typeof tool.relativePath !== "string" || path.isAbsolute(tool.relativePath)) {
    throw new Error("relativePath 必须是 Workspace Root 下的相对路径");
  }
  if (!tool.runtime || !tool.runtime.launch || !tool.display) throw new Error("工具缺少 runtime 或 display 配置");
  if (tool.runtime.launch.args && !Array.isArray(tool.runtime.launch.args)) throw new Error("启动参数必须是数组");
  return {
    ...tool,
    description: tool.description ?? "",
    category: tool.category || "其他",
    tags: Array.isArray(tool.tags) ? tool.tags : [],
    startupPolicy: tool.startupPolicy ?? "manual",
    display: {
      ...tool.display,
      showInToolCenter: tool.display.showInToolCenter ?? true,
      openMode: tool.display.openMode ?? "folder",
    },
  };
}

export class RegistryService {
  private readonly toolsDir: string;
  private readonly settingsFile: string;

  constructor(private readonly dataRoot: string) {
    this.toolsDir = path.join(dataRoot, "tools");
    this.settingsFile = path.join(dataRoot, "settings", "workbench.json");
    fs.mkdirSync(this.toolsDir, { recursive: true });
    fs.mkdirSync(path.dirname(this.settingsFile), { recursive: true });
    if (!fs.existsSync(this.settingsFile)) this.writeJson(this.settingsFile, DEFAULT_SETTINGS);
  }

  listTools(): ToolDefinition[] {
    return fs
      .readdirSync(this.toolsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => {
        try {
          return validateTool(JSON.parse(fs.readFileSync(path.join(this.toolsDir, entry.name), "utf8")));
        } catch (error) {
          console.error(`Invalid registry file: ${entry.name}`, error);
          return null;
        }
      })
      .filter((tool): tool is ToolDefinition => Boolean(tool))
      .sort((a, b) => (a.display.sortOrder ?? 999) - (b.display.sortOrder ?? 999) || a.name.localeCompare(b.name, "zh-CN"));
  }

  getTool(toolId: string): ToolDefinition {
    const tool = this.listTools().find((item) => item.id === toolId);
    if (!tool) throw new Error(`未找到工具：${toolId}`);
    return tool;
  }

  saveTool(input: unknown): ToolDefinition {
    const tool = validateTool(input);
    this.writeJson(path.join(this.toolsDir, `${tool.id}.json`), tool);
    return tool;
  }

  removeTool(toolId: string): void {
    if (!ID_PATTERN.test(toolId)) throw new Error("无效工具 ID");
    if (isBuiltinToolId(toolId)) throw new Error("内置功能不能从工具中心移除");
    const file = path.join(this.toolsDir, `${toolId}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  getSettings(): WorkbenchSettings {
    try {
      const value = JSON.parse(fs.readFileSync(this.settingsFile, "utf8")) as Partial<WorkbenchSettings>;
      return {
        ...DEFAULT_SETTINGS,
        ...value,
        theme: "dark",
        ignoredWorkspaceDirectories: normalizeIgnoredWorkspaceDirectories(value.ignoredWorkspaceDirectories),
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings(input: WorkbenchSettings): WorkbenchSettings {
    const workspaceRoot = typeof input.workspaceRoot === "string" ? cleanWorkspaceRoot(input.workspaceRoot) : "";
    if (!workspaceRoot || !path.isAbsolute(workspaceRoot)) throw new Error("Workspace Root 必须是绝对路径");
    const next: WorkbenchSettings = {
      workspaceRoot: path.resolve(workspaceRoot),
      theme: "dark",
      compactMode: Boolean(input.compactMode),
      fontSizeMode: ["small", "medium", "large"].includes(input.fontSizeMode) ? input.fontSizeMode : "medium",
      sidebarOrder: Array.isArray(input.sidebarOrder)
        ? input.sidebarOrder.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 160).slice(0, 64)
        : [],
      ignoredWorkspaceDirectories: normalizeIgnoredWorkspaceDirectories(input.ignoredWorkspaceDirectories),
    };
    this.writeJson(this.settingsFile, next);
    return next;
  }

  resolveToolRoot(tool: ToolDefinition): string {
    const workspaceRoot = path.resolve(this.getSettings().workspaceRoot);
    const resolved = path.resolve(workspaceRoot, tool.relativePath);
    const relative = path.relative(workspaceRoot, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("工具路径越过 Workspace Root");
    return resolved;
  }

  resolveToolFile(tool: ToolDefinition, relativeFile: string): string {
    const root = this.resolveToolRoot(tool);
    const resolved = path.resolve(root, relativeFile);
    const relative = path.relative(root, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("启动文件越过工具目录");
    return resolved;
  }

  scanWorkspace(): ScanCandidate[] {
    const root = this.getSettings().workspaceRoot;
    if (!fs.existsSync(root)) return [];
    const registeredRoots = new Set(this.listTools().map((tool) => tool.relativePath.split(/[\\/]/)[0].toLocaleLowerCase()));
    const ignoredDirectories = new Set((this.getSettings().ignoredWorkspaceDirectories ?? []).map((name) => name.toLocaleLowerCase()));
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !ignoredDirectories.has(entry.name.toLocaleLowerCase()) && !registeredRoots.has(entry.name.toLocaleLowerCase()))
      .map((entry) => this.scanFolderCandidate(path.join(root, entry.name), entry.name));
  }

  scanFolder(folderPath: string): ScanCandidate[] {
    const root = path.resolve(this.getSettings().workspaceRoot);
    const folder = path.resolve(folderPath);
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw new Error("选择的路径不是有效文件夹");
    const relative = path.relative(root, folder);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("工具文件夹必须位于 Workspace Root 内");
    if (!relative) {
      return this.scanWorkspace();
    }
    return [this.scanFolderCandidate(folder, relative)];
  }

  private scanFolderCandidate(folder: string, relativePath: string): ScanCandidate {
    const entries = fs.readdirSync(folder, { withFileTypes: true });
    const names = new Set(entries.map((item) => item.name));
    const files = new Map(entries.filter((item) => item.isFile()).map((item) => [item.name.toLocaleLowerCase(), item.name]));
    const markers = KNOWN_MARKERS.filter((marker) => names.has(marker));
    const warnings: string[] = [];
    const tags = new Set<string>();
    let description = "扫描发现的本地工具";
    let category = "未分类";
    let launch = { type: "none" } as ScanCandidate["launch"];
    let detectedType: ScanCandidate["detectedType"] = "folder";
    let healthCheck: ScanCandidate["healthCheck"];
    let openUrl: string | undefined;
    let confidence: ScanCandidate["confidence"] = "low";

    const readText = (fileName: string, maxBytes = 64 * 1024): string => {
      const actual = files.get(fileName.toLocaleLowerCase());
      if (!actual) return "";
      try {
        return fs.readFileSync(path.join(folder, actual), "utf8").slice(0, maxBytes);
      } catch {
        warnings.push(`无法读取 ${actual}`);
        return "";
      }
    };

    const startupName = STARTUP_FILE_NAMES.find((name) => files.has(name.toLocaleLowerCase()));
    if (startupName) {
      const lower = startupName.toLocaleLowerCase();
      const type = lower.endsWith(".ps1") ? "powershell" : lower.endsWith(".vbs") ? "vbs" : lower.endsWith(".cmd") ? "cmd" : "bat";
      launch = { type, path: startupName };
      markers.push(...(markers.includes(startupName) ? [] : [startupName]));
      detectedType = "command";
      confidence = "high";
      tags.add("启动脚本");
      const script = readText(startupName);
      const port = this.detectPort(script);
      const url = this.detectLocalUrl(script, port);
      if (url) {
        openUrl = url;
        healthCheck = { type: "http", url, timeout: 2500 };
        detectedType = "local-service";
        tags.add("本地服务");
      }
    } else {
      const packageJson = readText("package.json");
      if (packageJson) {
        detectedType = "command";
        confidence = "medium";
        tags.add("Node");
        try {
          const value = JSON.parse(packageJson) as { description?: string; main?: string; scripts?: Record<string, string> };
          if (typeof value.description === "string" && value.description.trim()) description = value.description.trim();
          const entry = typeof value.main === "string" ? value.main : ["server.js", "app.js", "main.js", "index.js"].find((name) => names.has(name));
          if (entry && names.has(entry)) {
            launch = { type: "node", path: entry };
            detectedType = "command";
            confidence = "medium";
            const script = Object.values(value.scripts ?? {}).join(" ");
            const port = this.detectPort(script);
            const url = this.detectLocalUrl(script, port);
            if (url) {
              openUrl = url;
              healthCheck = { type: "http", url, timeout: 2500 };
              detectedType = "local-service";
            }
          } else if (Object.keys(value.scripts ?? {}).length > 0) {
            warnings.push("检测到 package.json 脚本，但没有安全可推断的 Node 入口文件");
            confidence = "medium";
          }
        } catch {
          warnings.push("package.json 无法解析");
        }
      }
      if (launch.type === "none") {
        const pythonEntry = PYTHON_ENTRY_NAMES.find((name) => names.has(name));
        if (pythonEntry) {
          launch = { type: "python", path: pythonEntry };
          detectedType = "command";
          confidence = "medium";
          tags.add("Python");
        }
      }
      if (launch.type === "none" && names.has("index.html")) {
        launch = { type: "none", path: "index.html" };
        detectedType = "file";
        confidence = "medium";
        tags.add("网页");
      }
    }

    const readme = readText("README.md", 16 * 1024);
    const heading = readme.match(/^\s*#\s+(.+)$/m)?.[1]?.trim();
    if (heading) description = heading === path.basename(folder) ? description : heading;
    if (names.has("package.json")) tags.add("package.json");
    if (names.has("requirements.txt") || names.has("pyproject.toml")) tags.add("Python");
    if (names.has("Cargo.toml")) tags.add("Rust");
    if (tags.has("网页") || names.has("index.html")) category = "网页";
    else if (tags.has("Node") || tags.has("Python") || tags.has("Rust")) category = "开发";
    const existing = this.listTools().find((tool) => tool.relativePath.toLocaleLowerCase() === relativePath.toLocaleLowerCase());
    if (existing) {
      warnings.push(`将补全已有工具「${existing.name}」`);
    }
    const knownMarkers = Array.from(new Set(markers));
    if (knownMarkers.length === 0) warnings.push("没有发现常见项目入口文件");
    return {
      name: path.basename(folder),
      relativePath,
      detectedType,
      markers: knownMarkers,
      description,
      category,
      tags: Array.from(tags),
      launch,
      workingDirectory: ".",
      healthCheck,
      openUrl,
      startupTimeout: healthCheck ? 15000 : undefined,
      existingToolId: existing?.id,
      warnings,
      confidence,
    };
  }

  private detectPort(text: string): number | undefined {
    const match = text.match(/(?:--port|port(?:\s*[:=]|\s+)|localhost:|127\.0\.0\.1:)(\d{2,5})/i);
    const port = match ? Number(match[1]) : undefined;
    return port && port >= 1 && port <= 65535 ? port : undefined;
  }

  private detectLocalUrl(text: string, port?: number): string | undefined {
    const match = text.match(/https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{2,5})?/i)?.[0];
    if (match) return match;
    return port ? `http://127.0.0.1:${port}` : undefined;
  }

  private writeJson(file: string, value: unknown): void {
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.renameSync(temp, file);
  }
}
