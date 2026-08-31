import type { DesktopApi } from "./desktop";

export type ToolStatus =
  | "unknown"
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "error"
  | "missing"
  | "unconfigured";

export type RuntimeType = "local-service" | "desktop-app" | "command" | "static-web" | "file" | "folder" | "url";
export type LaunchType = "bat" | "cmd" | "exe" | "node" | "python" | "powershell" | "vbs" | "none";
export type OpenMode = "embedded" | "external" | "folder";

export interface LaunchAction {
  type: LaunchType;
  path?: string;
  args?: string[];
  environment?: Record<string, string>;
}

export interface HealthCheck {
  type: "http" | "tcp" | "process" | "none";
  url?: string;
  host?: string;
  port?: number;
  processName?: string;
  timeout?: number;
  expectedServiceId?: string;
}

export interface SidebarEntry {
  id: string;
  label: string;
  group?: string;
  icon?: string;
  path?: string;
  sortOrder?: number;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  icon?: string;
  relativePath: string;
  runtime: {
    type: RuntimeType;
    launch: LaunchAction;
    stop?: LaunchAction;
    workingDirectory?: string;
    healthCheck?: HealthCheck;
    openUrl?: string;
    startupTimeout?: number;
  };
  display: {
    showInToolCenter: boolean;
    openMode: OpenMode;
    sidebarEntries?: SidebarEntry[];
    sortOrder?: number;
  };
  startupPolicy?: "manual" | "on-workbench-start";
}

export interface WorkbenchSettings {
  workspaceRoot: string;
  theme: "dark" | "light" | "system";
  compactMode: boolean;
  fontSizeMode: "small" | "medium" | "large";
  sidebarOrder?: string[];
  ignoredWorkspaceDirectories?: string[];
}

export interface ToolStatusResult {
  toolId: string;
  status: ToolStatus;
  message?: string;
  checkedAt: string;
}

export interface ScanCandidate {
  name: string;
  relativePath: string;
  detectedType: RuntimeType;
  markers: string[];
  description: string;
  category: string;
  tags: string[];
  launch: LaunchAction;
  workingDirectory?: string;
  healthCheck?: HealthCheck;
  openUrl?: string;
  startupTimeout?: number;
  existingToolId?: string;
  warnings: string[];
  confidence: "high" | "medium" | "low";
}

export interface EmbeddedBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScheduleApi {
  invoke(cmd: string, args: Record<string, unknown>): Promise<unknown>;
  pickFile(): Promise<string | null>;
}

export interface WorkbenchApi {
  desktop: DesktopApi;
  schedule: ScheduleApi;
  pickFile(): Promise<string | null>;
  pickFolder(): Promise<string | null>;
  listTools(): Promise<ToolDefinition[]>;
  saveTool(tool: ToolDefinition): Promise<ToolDefinition>;
  removeTool(toolId: string): Promise<void>;
  scanWorkspace(): Promise<ScanCandidate[]>;
  scanFolder(folderPath: string): Promise<ScanCandidate[]>;
  getSettings(): Promise<WorkbenchSettings>;
  saveSettings(settings: WorkbenchSettings): Promise<WorkbenchSettings>;
  getStatuses(): Promise<ToolStatusResult[]>;
  getStatus(toolId: string): Promise<ToolStatusResult>;
  startTool(toolId: string): Promise<ToolStatusResult>;
  stopTool(toolId: string): Promise<ToolStatusResult>;
  restartTool(toolId: string): Promise<ToolStatusResult>;
  openTool(toolId: string): Promise<void>;
  openToolFolder(toolId: string): Promise<void>;
  getLogs(toolId?: string): Promise<string>;
  showEmbedded(toolId: string, route: string | undefined, bounds: EmbeddedBounds): Promise<string>;
  resizeEmbedded(bounds: EmbeddedBounds): Promise<void>;
  hideEmbedded(): Promise<void>;
}
