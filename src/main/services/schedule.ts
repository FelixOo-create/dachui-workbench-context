// schedule.ts —— 工作台内嵌日程功能的 SQLite 数据层。
// 当前 schema、迁移和命令实现均以本文件及 Workbench 测试为准，不依赖外部项目源码。
// 运行环境：Node 内置 node:sqlite 的 DatabaseSync（同步 API），仅用内置模块。
// 前端传参 camelCase，返回字段一律 camelCase；SQL 全部使用 ?1/?2 索引占位符。

import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { statSync } from "node:fs";

// ============================================================================
// 行类型（与 Rust 的 Serialize 结构一一对应，camelCase）
// ============================================================================

export interface ListRow {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  createdAt: string;
}

export interface TaskRow {
  id: string;
  listId: string | null;
  title: string;
  notes: string;
  priority: number;
  dueDate: string | null;
  dueTime: string | null;
  isAllDay: boolean;
  status: string;
  completedAt: string | null;
  reminderMinutes: number | null;
  repeatRule: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SubtaskRow {
  id: string;
  taskId: string;
  title: string;
  completed: boolean;
  sortOrder: number;
}

export interface EventRow {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  reminderMinutes: number | null;
  color: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface HabitRow {
  id: string;
  name: string;
  color: string;
  icon: string;
  targetCount: number;
  createdAt: string;
}

export interface HabitRecordRow {
  habitId: string;
  date: string;
  count: number;
}

interface HabitInput {
  name: string;
  color?: string;
  icon?: string;
  targetCount?: number;
}

export interface StatsRow {
  todayTotal: number;
  todayDone: number;
  overdue: number;
  planned: number;
}

export interface AttachmentRow {
  id: string;
  ownerType: string;
  ownerId: string;
  name: string;
  path: string;
  mime: string;
  sizeBytes: number;
  createdAt: string;
}

export interface CategoryRow {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityRow {
  id: string;
  categoryId: string;
  name: string;
  sortOrder: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TimeEntryRow {
  id: string;
  activityId: string | null;
  categoryId: string | null;
  startTime: string;
  endTime: string;
  note: string | null;
  source: "manual" | "pomodoro";
  pomodoroSessionId: string | null;
  pomodoroStatus: "completed" | "saved" | null;
  pomodoroPlannedSeconds: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImportResult {
  importedTasks: number;
  importedAnniversaries: number;
}

export interface FocusSessionRow {
  id: string;
  activityId: string | null;
  categoryId: string | null;
  plannedSeconds: number;
  startedAt: string;
  endedAt: string | null;
  status: "started" | "completed" | "saved" | "cancelled";
}

type SqlRow = Record<string, unknown>;
type SqlParam = string | number | null;

// ============================================================================
// 工具函数（对应 commands.rs 的 now / new_id / validate_range）
// ============================================================================

/** 对应 chrono::Utc::now().to_rfc3339() */
function now(): string {
  return new Date().toISOString();
}

/** 对应 uuid::Uuid::new_v4() 的 prefix-uuid 形式 */
function newId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

/** 本地日期 YYYY-MM-DD（对应 chrono::Local::now().format("%Y-%m-%d")） */
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 对应 validate_range：RFC3339 解析 + end 必须晚于 start */
function validateRange(startTime: string, endTime: string): void {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  if (isNaN(start) || isNaN(end)) throw new Error("时间格式非法");
  if (end <= start) throw new Error("非法区间：endTime 必须晚于 startTime");
}

// ---------- 参数提取辅助 ----------

function asObj(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function optStr(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function num(v: unknown, def: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}

const DEFAULT_HABIT_COLOR = "#4f6ef7";
const DEFAULT_HABIT_ICON = "check";
const HABIT_ICONS = new Set(["book", "droplets", "clock", "languages", "dumbbell", "shield-check", "moon", "sunrise", "check", "sparkles"]);

function habitName(value: unknown): string {
  const name = asString(value).trim();
  if (!name) throw new Error("习惯名称不能为空");
  if (name.length > 80) throw new Error("习惯名称不能超过 80 个字符");
  return name;
}

function habitColor(value: unknown, fallback = DEFAULT_HABIT_COLOR): string {
  const color = asString(value).trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

function habitIcon(value: unknown, fallback = DEFAULT_HABIT_ICON): string {
  const icon = asString(value).trim();
  return HABIT_ICONS.has(icon) ? icon : fallback;
}

function habitTarget(value: unknown, fallback = 1): number {
  const target = num(value, fallback);
  return Math.min(20, Math.max(1, Math.round(target)));
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : String(x ?? ""))) : [];
}

/**
 * 兼容备份 JSON 中的 camelCase 与 snake_case 字段名：
 * backup_json 输出 camelCase（如 categoryId / listId / startAt / activityId），
 * 而 Rust 原版 restore_backup 读取 snake_case（category_id / list_id / ...）。
 * 这里 camelCase 优先、snake_case 兜底，保证自产备份与手工 snake_case 备份都能恢复。
 */
function pick(o: Record<string, unknown>, camel: string, snake: string): unknown {
  return o[camel] !== undefined ? o[camel] : o[snake];
}

// ============================================================================
// 行映射（node:sqlite 返回 snake_case 键，映射为 camelCase 行对象）
// ============================================================================

function mapList(r: SqlRow): ListRow {
  return {
    id: r.id as string,
    name: r.name as string,
    color: r.color as string,
    sortOrder: Number(r.sort_order),
    createdAt: r.created_at as string,
  };
}

const TASK_COLS =
  "id, list_id, title, notes, priority, due_date, due_time, is_all_day, status, completed_at, reminder_minutes, repeat_rule, sort_order, created_at, updated_at";

function mapTask(r: SqlRow): TaskRow {
  return {
    id: r.id as string,
    listId: r.list_id as string | null,
    title: r.title as string,
    notes: r.notes as string,
    priority: Number(r.priority),
    dueDate: r.due_date as string | null,
    dueTime: r.due_time as string | null,
    isAllDay: (r.is_all_day as number) !== 0,
    status: r.status as string,
    completedAt: r.completed_at as string | null,
    reminderMinutes: r.reminder_minutes as number | null,
    repeatRule: r.repeat_rule as string | null,
    sortOrder: Number(r.sort_order),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function mapSubtask(r: SqlRow): SubtaskRow {
  return {
    id: r.id as string,
    taskId: r.task_id as string,
    title: r.title as string,
    completed: (r.completed as number) !== 0,
    sortOrder: Number(r.sort_order),
  };
}

function mapEvent(r: SqlRow): EventRow {
  return {
    id: r.id as string,
    title: r.title as string,
    startAt: r.start_at as string,
    endAt: r.end_at as string,
    isAllDay: (r.is_all_day as number) !== 0,
    reminderMinutes: r.reminder_minutes as number | null,
    color: r.color as string,
    notes: r.notes as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function mapHabit(r: SqlRow): HabitRow {
  return {
    id: r.id as string,
    name: r.name as string,
    color: r.color as string,
    icon: r.icon as string,
    targetCount: Number(r.target_count),
    createdAt: r.created_at as string,
  };
}

function mapHabitRecord(r: SqlRow): HabitRecordRow {
  return {
    habitId: r.habit_id as string,
    date: r.date as string,
    count: Number(r.count),
  };
}

function mapAttachment(r: SqlRow): AttachmentRow {
  return {
    id: r.id as string,
    ownerType: r.owner_type as string,
    ownerId: r.owner_id as string,
    name: r.name as string,
    path: r.path as string,
    mime: r.mime as string,
    sizeBytes: Number(r.size_bytes),
    createdAt: r.created_at as string,
  };
}

const CATEGORY_SELECT =
  "SELECT id, name, color, sort_order, archived, created_at, updated_at FROM categories";
const ACTIVITY_SELECT =
  "SELECT id, category_id, name, sort_order, archived, created_at, updated_at FROM activities";
const ENTRY_SELECT =
  "SELECT id, activity_id, category_id, start_time, end_time, note, source, pomodoro_session_id, pomodoro_status, pomodoro_planned_seconds, created_at, updated_at FROM time_entries";

function mapCategory(r: SqlRow): CategoryRow {
  return {
    id: r.id as string,
    name: r.name as string,
    color: r.color as string,
    sortOrder: Number(r.sort_order),
    archived: (r.archived as number) !== 0,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function mapActivity(r: SqlRow): ActivityRow {
  return {
    id: r.id as string,
    categoryId: r.category_id as string,
    name: r.name as string,
    sortOrder: Number(r.sort_order),
    archived: (r.archived as number) !== 0,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function mapTimeEntry(r: SqlRow): TimeEntryRow {
  return {
    id: r.id as string,
    activityId: r.activity_id as string | null,
    categoryId: r.category_id as string | null,
    startTime: r.start_time as string,
    endTime: r.end_time as string,
    note: r.note as string | null,
    source: r.source === "pomodoro" ? "pomodoro" : "manual",
    pomodoroSessionId: typeof r.pomodoro_session_id === "string" ? r.pomodoro_session_id : null,
    pomodoroStatus: r.pomodoro_status === "completed" || r.pomodoro_status === "saved" ? r.pomodoro_status : null,
    pomodoroPlannedSeconds: Number.isFinite(Number(r.pomodoro_planned_seconds)) ? Number(r.pomodoro_planned_seconds) : null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

// ---------- 默认种子（§11，对应 SEED_CATEGORIES） ----------

const SEED_CATEGORIES: { name: string; color: string; activities: string[] }[] = [
  { name: "工作", color: "#5B6EF5", activities: ["深度工作", "沟通", "会议"] },
  { name: "学习", color: "#6F8CFF", activities: ["阅读", "课程"] },
  { name: "日常", color: "#20CDB7", activities: ["三餐", "洗漱", "通勤", "家务"] },
  { name: "运动", color: "#FF7F50", activities: ["健身", "跑步", "散步"] },
  { name: "娱乐", color: "#A788E8", activities: ["视频", "游戏"] },
  { name: "爱好", color: "#F2B936", activities: ["摄影", "吉他"] },
  { name: "社交", color: "#DD62AC", activities: ["聚会", "聊天"] },
  { name: "睡眠", color: "#607089", activities: ["睡眠", "午休"] },
];

// ============================================================================
// ScheduleService
// ============================================================================

export class ScheduleService {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.migrate();
  }

  startFocusSession(input: { id: string; activityId?: string | null; categoryId?: string | null; plannedSeconds: number; startedAt: string }): FocusSessionRow {
    const activityId = input.activityId ?? null;
    const categoryId = input.categoryId ?? null;
    if (activityId === null && categoryId === null) throw new Error("必须关联一个活动或分类");
    this.db.prepare("INSERT INTO focus_sessions (id, activity_id, category_id, planned_seconds, started_at, status) VALUES (?1, ?2, ?3, ?4, ?5, 'started')")
      .run(input.id, activityId, categoryId, Math.max(60, Math.round(input.plannedSeconds)), input.startedAt);
    return { id: input.id, activityId, categoryId, plannedSeconds: Math.max(60, Math.round(input.plannedSeconds)), startedAt: input.startedAt, endedAt: null, status: "started" };
  }

  finishFocusSession(input: { id: string; status: "completed" | "saved"; segments: Array<{ startAt: string; endAt: string }>; endedAt: string }): TimeEntryRow[] {
    const session = this.db.prepare("SELECT id, activity_id, category_id, planned_seconds, status FROM focus_sessions WHERE id = ?1").get(input.id) as SqlRow | undefined;
    if (!session) throw new Error("番茄会话不存在");
    if (session.status !== "started") return [];
    this.db.exec("BEGIN");
    try {
      const rows = this.createPomodoroEntries({ activityId: session.activity_id, categoryId: session.category_id, pomodoroSessionId: input.id, pomodoroStatus: input.status, plannedSeconds: Number(session.planned_seconds), segments: input.segments }, false);
      this.db.prepare("UPDATE focus_sessions SET ended_at = ?1, status = ?2 WHERE id = ?3 AND status = 'started'").run(input.endedAt, input.status, input.id);
      this.db.exec("COMMIT");
      return rows;
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* ignore rollback failure */ }
      throw error;
    }
  }

  cancelFocusSession(id: string, endedAt: string): void {
    this.db.prepare("UPDATE focus_sessions SET ended_at = ?1, status = 'cancelled' WHERE id = ?2 AND status = 'started'").run(endedAt, id);
  }

  listFocusSessionsByRange(startTime: string, endTime: string): FocusSessionRow[] {
    const rows = this.db.prepare("SELECT id, activity_id, category_id, planned_seconds, started_at, ended_at, status FROM focus_sessions WHERE started_at < ?2 AND (ended_at IS NULL OR ended_at > ?1) ORDER BY started_at").all(startTime, endTime) as SqlRow[];
    return rows.map((r) => ({ id: String(r.id), activityId: typeof r.activity_id === "string" ? r.activity_id : null, categoryId: typeof r.category_id === "string" ? r.category_id : null, plannedSeconds: Number(r.planned_seconds), startedAt: String(r.started_at), endedAt: typeof r.ended_at === "string" ? r.ended_at : null, status: r.status === "completed" || r.status === "saved" || r.status === "cancelled" ? r.status : "started" }));
  }

  // ---------- 迁移（照抄 db.rs 的 open + migrate） ----------

  private migrate(): void {
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lists (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          color TEXT NOT NULL DEFAULT '#4f6ef7',
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          list_id TEXT,
          title TEXT NOT NULL,
          notes TEXT NOT NULL DEFAULT '',
          priority INTEGER NOT NULL DEFAULT 1,
          due_date TEXT,
          due_time TEXT,
          is_all_day INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'open',
          completed_at TEXT,
          reminder_minutes INTEGER,
          repeat_rule TEXT,
          sort_order REAL NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date, status);
      CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(list_id);

      CREATE TABLE IF NOT EXISTS subtasks (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          title TEXT NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tags (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          color TEXT NOT NULL DEFAULT '#4f6ef7'
      );

      CREATE TABLE IF NOT EXISTS task_tags (
          task_id TEXT NOT NULL,
          tag_id TEXT NOT NULL,
          PRIMARY KEY (task_id, tag_id),
          FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
          FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          start_at TEXT NOT NULL,
          end_at TEXT NOT NULL,
          is_all_day INTEGER NOT NULL DEFAULT 0,
          reminder_minutes INTEGER,
          color TEXT NOT NULL DEFAULT '#4f6ef7',
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_at);

      CREATE TABLE IF NOT EXISTS habits (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          color TEXT NOT NULL DEFAULT '#4f6ef7',
          icon TEXT NOT NULL DEFAULT 'check',
          target_count INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS habit_records (
          habit_id TEXT NOT NULL,
          date TEXT NOT NULL,
          count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (habit_id, date),
          FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS pomodoro_sessions (
          id TEXT PRIMARY KEY,
          task_id TEXT,
          started_at TEXT NOT NULL,
          minutes INTEGER NOT NULL DEFAULT 25,
          completed_at TEXT,
          FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS attachments (
          id TEXT PRIMARY KEY,
          owner_type TEXT NOT NULL,       -- 'task' | 'event'
          owner_id TEXT NOT NULL,
          name TEXT NOT NULL,
          path TEXT NOT NULL,
          mime TEXT NOT NULL DEFAULT '',
          size_bytes INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_attachments_owner ON attachments(owner_type, owner_id);

      -- 时间记录板块（TimeGrid）：分类 / 活动 / 时间记录（§19）
      CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          color TEXT NOT NULL DEFAULT '#5B6EF5',
          sort_order INTEGER NOT NULL DEFAULT 0,
          archived INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS activities (
          id TEXT PRIMARY KEY,
          category_id TEXT NOT NULL,
          name TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          archived INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_activities_category ON activities(category_id);

      CREATE TABLE IF NOT EXISTS time_entries (
          id TEXT PRIMARY KEY,
          activity_id TEXT,
          category_id TEXT,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          note TEXT,
          source TEXT NOT NULL DEFAULT 'manual',
          pomodoro_session_id TEXT,
          pomodoro_status TEXT,
          pomodoro_planned_seconds INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
          FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_time_entries_start ON time_entries(start_time);
      CREATE INDEX IF NOT EXISTS idx_time_entries_end ON time_entries(end_time);
      CREATE INDEX IF NOT EXISTS idx_time_entries_activity ON time_entries(activity_id);

      CREATE TABLE IF NOT EXISTS focus_sessions (
          id TEXT PRIMARY KEY,
          activity_id TEXT,
          category_id TEXT,
          planned_seconds INTEGER NOT NULL,
          started_at TEXT NOT NULL,
          ended_at TEXT,
          status TEXT NOT NULL DEFAULT 'started',
          FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE SET NULL,
          FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_focus_sessions_started ON focus_sessions(started_at);

      INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1');
      INSERT OR IGNORE INTO lists (id, name, color, sort_order, created_at)
      VALUES ('list-default', '收件箱', '#4f6ef7', 0, datetime('now'));
    `);

    // 迁移：旧版 time_entries 的 activity_id 为 NOT NULL 且无 category_id 列。
    // 需要重建表（SQLite 无法 ALTER 列约束）：activity_id 改为可空，新增 category_id。
    const teCols = this.db.prepare("PRAGMA table_info(time_entries)").all() as SqlRow[];
    const hasCategoryCol = teCols.some((c) => c.name === "category_id");
    const hasSourceCol = teCols.some((c) => c.name === "source");
    const hasPomodoroSessionCol = teCols.some((c) => c.name === "pomodoro_session_id");
    const hasPomodoroStatusCol = teCols.some((c) => c.name === "pomodoro_status");
    const hasPomodoroPlannedCol = teCols.some((c) => c.name === "pomodoro_planned_seconds");
    const activityCol = teCols.find((c) => c.name === "activity_id");
    const activityNotNull =
      activityCol !== undefined &&
      typeof activityCol.type === "string" &&
      activityCol.type.toUpperCase().includes("NOT NULL");
    if (!hasCategoryCol || !hasSourceCol || !hasPomodoroSessionCol || !hasPomodoroStatusCol || !hasPomodoroPlannedCol || activityNotNull) {
      const legacyCategory = hasCategoryCol ? "category_id" : "NULL";
      const legacySource = hasSourceCol ? "COALESCE(source, 'manual')" : "'manual'";
      const legacySession = hasPomodoroSessionCol ? "pomodoro_session_id" : "NULL";
      const legacyStatus = hasPomodoroStatusCol ? "pomodoro_status" : "NULL";
      const legacyPlanned = hasPomodoroPlannedCol ? "pomodoro_planned_seconds" : "NULL";
      this.db.exec(`
        BEGIN;
        CREATE TABLE time_entries_new (
            id TEXT PRIMARY KEY,
            activity_id TEXT,
            category_id TEXT,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            note TEXT,
            source TEXT NOT NULL DEFAULT 'manual',
            pomodoro_session_id TEXT,
            pomodoro_status TEXT,
            pomodoro_planned_seconds INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
        );
        INSERT INTO time_entries_new (id, activity_id, category_id, start_time, end_time, note, source, pomodoro_session_id, pomodoro_status, pomodoro_planned_seconds, created_at, updated_at)
            SELECT id, activity_id, ${legacyCategory}, start_time, end_time, note, ${legacySource}, ${legacySession}, ${legacyStatus}, ${legacyPlanned}, created_at, updated_at FROM time_entries;
        DROP TABLE time_entries;
        ALTER TABLE time_entries_new RENAME TO time_entries;
        CREATE INDEX IF NOT EXISTS idx_time_entries_start ON time_entries(start_time);
        CREATE INDEX IF NOT EXISTS idx_time_entries_end ON time_entries(end_time);
        CREATE INDEX IF NOT EXISTS idx_time_entries_activity ON time_entries(activity_id);
        COMMIT;
      `);
    }
    // 索引幂等创建（新建库与迁移后都执行）
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS idx_time_entries_category ON time_entries(category_id);",
    );

    // 迁移：habits 增加 target_count（每日目标次数），旧库默认 1
    const habitCols = this.db.prepare("PRAGMA table_info(habits)").all() as SqlRow[];
    if (!habitCols.some((c) => c.name === "target_count")) {
      this.db.exec("ALTER TABLE habits ADD COLUMN target_count INTEGER NOT NULL DEFAULT 1");
    }

    // 迁移：habit_records 的 completed(0/1) 迁移为 count；旧库重建表
    const recCols = this.db.prepare("PRAGMA table_info(habit_records)").all() as SqlRow[];
    const hasCompleted = recCols.some((c) => c.name === "completed");
    const hasCount = recCols.some((c) => c.name === "count");
    if (hasCompleted && !hasCount) {
      this.db.exec(`
        BEGIN;
        CREATE TABLE habit_records_new (
            habit_id TEXT NOT NULL,
            date TEXT NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (habit_id, date),
            FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
        );
        INSERT INTO habit_records_new (habit_id, date, count)
            SELECT habit_id, date, completed FROM habit_records;
        DROP TABLE habit_records;
        ALTER TABLE habit_records_new RENAME TO habit_records;
        COMMIT;
      `);
    } else if (!hasCount) {
      // 全新库缺 count 列（极端情况），补一列
      this.db.exec("ALTER TABLE habit_records ADD COLUMN count INTEGER NOT NULL DEFAULT 0");
    }
  }

  // ---------- 分发（命令名 snake_case，与 Tauri 完全一致） ----------

  dispatch(cmd: string, args: Record<string, unknown> = {}): unknown {
    switch (cmd) {
      // Lists
      case "list_lists":
        return this.listLists();
      case "create_list":
        return this.createList(asObj(args.input));
      case "rename_list":
        return this.renameList(asString(args.id), asString(args.name));
      case "set_list_color":
        return this.setListColor(asString(args.id), asString(args.color));
      case "delete_list":
        return this.deleteList(asString(args.id));
      // Tasks
      case "list_tasks":
        return this.listTasks(args.listId == null ? null : asString(args.listId));
      case "create_task":
        return this.createTask(asObj(args.input));
      case "update_task":
        return this.updateTask(asString(args.id), asObj(args.patch));
      case "set_task_status":
        return this.setTaskStatus(asString(args.id), asString(args.status));
      case "delete_task":
        return this.deleteTask(asString(args.id));
      // Subtasks
      case "list_subtasks":
        return this.listSubtasks(asString(args.taskId));
      case "create_subtask":
        return this.createSubtask(asString(args.taskId), asString(args.title));
      case "update_subtask":
        return this.updateSubtask(asString(args.id), asObj(args.patch));
      // Events
      case "list_events":
        return this.listEvents();
      case "create_event":
        return this.createEvent(asObj(args.input));
      case "update_event":
        return this.updateEvent(asString(args.id), asObj(args.patch));
      case "delete_event":
        return this.deleteEvent(asString(args.id));
      // Habits
      case "list_habits":
        return this.listHabits();
      case "create_habit":
        return this.createHabit({
          name: asString(args.name),
          color: asString(args.color),
          icon: asString(args.icon),
          targetCount: num(args.targetCount, 1),
        });
      case "get_habit_records":
        return this.getHabitRecords(asString(args.habitId));
      case "set_habit_record":
        return this.setHabitRecord(asString(args.habitId), asString(args.date), num(args.count, 0));
      case "update_habit":
        return this.updateHabit(asString(args.id), {
          name: asString(args.name),
          color: asString(args.color),
          icon: asString(args.icon),
          targetCount: num(args.targetCount, 1),
        });
      case "delete_habit":
        return this.deleteHabit(asString(args.id));
      // Stats
      case "get_stats":
        return this.getStats();
      // Attachments
      case "list_attachments":
        return this.listAttachments(asString(args.ownerType), asString(args.ownerId));
      case "add_attachment":
        return this.addAttachment(asObj(args.input));
      case "remove_attachment":
        return this.removeAttachment(asString(args.id));
      case "reveal_attachment":
        return this.revealAttachment(asString(args.id));
      // 备份 / 导入导出
      case "backup_json":
        return this.backupJson();
      case "restore_backup":
        return this.restoreBackup(asString(args.fileContent));
      case "export_tasks_csv":
        return this.exportTasksCsv();
      case "export_ical":
        return this.exportIcal();
      case "import_wubian_backup":
        return this.importWubianBackup(asString(args.fileContent));
      // 时间记录：分类
      case "list_categories":
        return this.listCategories(Boolean(args.includeArchived));
      case "create_category":
        return this.createCategory(asObj(args.input));
      case "update_category":
        return this.updateCategory(asString(args.id), asObj(args.patch));
      case "set_category_archived":
        return this.setCategoryArchived(asString(args.id), Boolean(args.archived));
      case "delete_category":
        return this.deleteCategory(asString(args.id));
      case "reorder_categories":
        return this.reorderCategories(strArray(args.ids));
      // 时间记录：活动
      case "list_activities":
        return this.listActivities(Boolean(args.includeArchived));
      case "create_activity":
        return this.createActivity(asObj(args.input));
      case "update_activity":
        return this.updateActivity(asString(args.id), asObj(args.patch));
      case "set_activity_archived":
        return this.setActivityArchived(asString(args.id), Boolean(args.archived));
      case "delete_activity":
        return this.deleteActivity(asString(args.id));
      case "reorder_activities":
        return this.reorderActivities(asString(args.categoryId), strArray(args.ids));
      // 时间记录：时间记录
      case "list_time_entries_by_range":
        return this.listTimeEntriesByRange(asString(args.startTime), asString(args.endTime));
      case "list_focus_sessions_by_range":
        return this.listFocusSessionsByRange(asString(args.startTime), asString(args.endTime));
      case "create_time_entry":
        return this.createTimeEntry(asObj(args.input));
      case "create_pomodoro_entries":
        return this.createPomodoroEntries(asObj(args.input));
      case "update_time_entry":
        return this.updateTimeEntry(asString(args.id), asObj(args.patch));
      case "delete_time_entry":
        return this.deleteTimeEntry(asString(args.id));
      case "find_time_entry_conflicts":
        return this.findTimeEntryConflicts(
          asString(args.startTime),
          asString(args.endTime),
          args.excludeId == null ? null : asString(args.excludeId),
        );
      case "replace_time_entries":
        return this.replaceTimeEntries(strArray(args.conflictIds), asObj(args.input));
      case "count_time_entries_by_activity":
        return this.countTimeEntriesByActivity(asString(args.activityId));
      // 设置
      case "get_timelog_settings":
        return this.getTimelogSettings();
      case "set_timelog_settings":
        return this.setTimelogSettings(asString(args.json));
      case "seed_timelog_defaults":
        return this.seedTimelogDefaults();
      // 提醒（Workbench 暂不实现，静默）
      case "start_reminder_scheduler":
        return null;
      default:
        throw new Error(`未知命令: ${cmd}`);
    }
  }

  close(): void {
    this.db.close();
  }

  // ---------- 内部辅助 ----------

  private scalar(sql: string, ...params: SqlParam[]): number {
    const row = this.db.prepare(sql).get(...params) as SqlRow | undefined;
    if (!row) return 0;
    const key = Object.keys(row)[0];
    const v = key === undefined ? undefined : row[key];
    return typeof v === "number" ? v : Number(v ?? 0);
  }

  // ============================================================================
  // Lists（对应 commands.rs —— Lists）
  // ============================================================================

  private listLists(): ListRow[] {
    const rows = this.db
      .prepare("SELECT id, name, color, sort_order, created_at FROM lists ORDER BY sort_order, created_at")
      .all();
    return rows.map(mapList);
  }

  private createList(input: Record<string, unknown>): ListRow {
    const id = newId("list");
    const ts = now();
    const sortOrder = this.scalar("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM lists");
    const color = typeof input.color === "string" ? input.color : "#4f6ef7";
    const name = asString(input.name).trim();
    this.db
      .prepare(
        "INSERT INTO lists (id, name, color, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
      )
      .run(id, name, color, sortOrder, ts);
    return { id, name, color, sortOrder, createdAt: ts };
  }

  private renameList(id: string, name: string): ListRow {
    this.db.prepare("UPDATE lists SET name = ?1 WHERE id = ?2").run(name.trim(), id);
    return this.getList(id);
  }

  private setListColor(id: string, color: string): ListRow {
    this.db.prepare("UPDATE lists SET color = ?1 WHERE id = ?2").run(color, id);
    return this.getList(id);
  }

  private deleteList(id: string): null {
    if (id === "list-default") {
      throw new Error("默认收件箱清单不可删除");
    }
    // 该清单下的任务移到收件箱
    this.db.prepare("UPDATE tasks SET list_id = 'list-default' WHERE list_id = ?1").run(id);
    this.db.prepare("DELETE FROM lists WHERE id = ?1").run(id);
    return null;
  }

  private getList(id: string): ListRow {
    const row = this.db
      .prepare("SELECT id, name, color, sort_order, created_at FROM lists WHERE id = ?1")
      .get(id) as SqlRow | undefined;
    if (!row) throw new Error("清单不存在");
    return mapList(row);
  }

  // ============================================================================
  // Attachments（对应 commands.rs —— Attachments）
  // ============================================================================

  private listAttachments(ownerType: string, ownerId: string): AttachmentRow[] {
    const rows = this.db
      .prepare(
        "SELECT id, owner_type, owner_id, name, path, mime, size_bytes, created_at FROM attachments WHERE owner_type = ?1 AND owner_id = ?2 ORDER BY created_at",
      )
      .all(ownerType, ownerId);
    return rows.map(mapAttachment);
  }

  private addAttachment(input: Record<string, unknown>): AttachmentRow {
    const id = newId("attach");
    const ts = now();
    const mime = typeof input.mime === "string" ? input.mime : "";
    const path = asString(input.path);
    let size = 0;
    try {
      size = statSync(path).size;
    } catch {
      size = 0;
    }
    const ownerType = asString(input.ownerType);
    const ownerId = asString(input.ownerId);
    const name = asString(input.name);
    this.db
      .prepare(
        "INSERT INTO attachments (id, owner_type, owner_id, name, path, mime, size_bytes, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
      )
      .run(id, ownerType, ownerId, name, path, mime, size, ts);
    return { id, ownerType, ownerId, name, path, mime, sizeBytes: size, createdAt: ts };
  }

  private removeAttachment(id: string): null {
    this.db.prepare("DELETE FROM attachments WHERE id = ?1").run(id);
    return null;
  }

  /** 打开附件所在位置（资源管理器选中）；失败不抛错（照抄 Rust let _ = ...spawn()） */
  private revealAttachment(id: string): null {
    const row = this.db
      .prepare("SELECT path FROM attachments WHERE id = ?1")
      .get(id) as SqlRow | undefined;
    if (!row) throw new Error("附件不存在");
    const path = asString(row.path);
    try {
      const child = spawn("explorer", [`/select,${path}`], { detached: true, stdio: "ignore" });
      child.on("error", () => {
        /* 忽略 */
      });
      child.unref();
    } catch {
      /* 忽略 */
    }
    return null;
  }

  // ============================================================================
  // Tasks（对应 commands.rs —— Tasks）
  // ============================================================================

  private listTasks(listId: string | null): TaskRow[] {
    const order = "ORDER BY status DESC, due_date IS NULL, due_date, due_time, sort_order";
    const rows =
      listId === null
        ? this.db.prepare(`SELECT ${TASK_COLS} FROM tasks ${order}`).all()
        : this.db.prepare(`SELECT ${TASK_COLS} FROM tasks WHERE list_id = ?1 ${order}`).all(listId);
    return rows.map(mapTask);
  }

  private createTask(input: Record<string, unknown>): TaskRow {
    const id = newId("task");
    const ts = now();
    const isAllDay = input.isAllDay == null ? false : Boolean(input.isAllDay);
    const priority = num(input.priority, 1);
    this.db
      .prepare(
        `INSERT INTO tasks (id, list_id, title, notes, priority, due_date, due_time, is_all_day, status, completed_at, reminder_minutes, repeat_rule, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'open', NULL, ?9, ?10, 0, ?11, ?11)`,
      )
      .run(
        id,
        input.listId == null ? null : asString(input.listId),
        asString(input.title).trim(),
        input.notes == null ? "" : asString(input.notes),
        priority,
        input.dueDate == null ? null : asString(input.dueDate),
        input.dueTime == null ? null : asString(input.dueTime),
        isAllDay ? 1 : 0,
        input.reminderMinutes == null ? null : num(input.reminderMinutes, 0),
        input.repeatRule == null ? null : asString(input.repeatRule),
        ts,
      );
    return this.getTask(id);
  }

  /** 动态拼接 UPDATE：只更新提供的字段（null/undefined 视为未提供，与 serde Option 语义一致） */
  private updateTask(id: string, patch: Record<string, unknown>): TaskRow {
    const ts = now();
    const sets: string[] = [];
    const params: SqlParam[] = [];
    const push = (field: string, value: SqlParam): void => {
      sets.push(`${field} = ?${sets.length + 1}`);
      params.push(value);
    };
    if (patch.title != null) push("title", asString(patch.title).trim());
    if (patch.notes != null) push("notes", asString(patch.notes));
    if (patch.priority != null) push("priority", num(patch.priority, 1));
    if (patch.dueDate !== undefined) push("due_date", patch.dueDate === null ? null : asString(patch.dueDate));
    if (patch.dueTime !== undefined) push("due_time", patch.dueTime === null ? null : asString(patch.dueTime));
    if (patch.isAllDay != null) push("is_all_day", Boolean(patch.isAllDay) ? 1 : 0);
    if (patch.reminderMinutes !== undefined) push("reminder_minutes", patch.reminderMinutes === null ? null : num(patch.reminderMinutes, 0));
    if (patch.repeatRule !== undefined) push("repeat_rule", patch.repeatRule === null ? null : asString(patch.repeatRule));
    if (patch.listId !== undefined) push("list_id", patch.listId === null ? null : asString(patch.listId));
    if (patch.sortOrder != null) push("sort_order", num(patch.sortOrder, 0));
    // Rust 无条件追加 updated_at（sets 恒非空）
    push("updated_at", ts);
    const sql = `UPDATE tasks SET ${sets.join(", ")} WHERE id = ?${sets.length + 1}`;
    params.push(id);
    this.db.prepare(sql).run(...params);
    return this.getTask(id);
  }

  private setTaskStatus(id: string, status: string): TaskRow {
    const ts = now();
    const completedAt = status === "completed" ? ts : null;

    this.db
      .prepare("UPDATE tasks SET status = ?1, completed_at = ?2, updated_at = ?3 WHERE id = ?4")
      .run(status, completedAt, ts, id);
    return this.getTask(id);
  }

  private deleteTask(id: string): null {
    this.db.prepare("DELETE FROM tasks WHERE id = ?1").run(id);
    return null;
  }

  private getTask(id: string): TaskRow {
    const row = this.db
      .prepare(`SELECT ${TASK_COLS} FROM tasks WHERE id = ?1`)
      .get(id) as SqlRow | undefined;
    if (!row) throw new Error("任务不存在");
    return mapTask(row);
  }

  // ============================================================================
  // Subtasks（对应 commands.rs —— Subtasks）
  // ============================================================================

  private listSubtasks(taskId: string): SubtaskRow[] {
    const rows = this.db
      .prepare(
        "SELECT id, task_id, title, completed, sort_order FROM subtasks WHERE task_id = ?1 ORDER BY sort_order",
      )
      .all(taskId);
    return rows.map(mapSubtask);
  }

  private createSubtask(taskId: string, title: string): SubtaskRow {
    const id = newId("sub");
    const sortOrder = this.scalar(
      "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM subtasks WHERE task_id = ?1",
      taskId,
    );
    const trimmed = title.trim();
    this.db
      .prepare(
        "INSERT INTO subtasks (id, task_id, title, completed, sort_order) VALUES (?1, ?2, ?3, 0, ?4)",
      )
      .run(id, taskId, trimmed, sortOrder);
    return { id, taskId, title: trimmed, completed: false, sortOrder };
  }

  private updateSubtask(id: string, patch: Record<string, unknown>): SubtaskRow {
    const title = patch.title != null ? asString(patch.title) : null;
    const completed = patch.completed != null ? Boolean(patch.completed) : null;
    if (title !== null) {
      this.db.prepare("UPDATE subtasks SET title = ?1 WHERE id = ?2").run(title, id);
    }
    if (completed !== null) {
      this.db
        .prepare("UPDATE subtasks SET completed = ?1 WHERE id = ?2")
        .run(completed ? 1 : 0, id);
    }
    const row = this.db
      .prepare("SELECT id, task_id, title, completed, sort_order FROM subtasks WHERE id = ?1")
      .get(id) as SqlRow | undefined;
    if (!row) throw new Error("子任务不存在");
    return mapSubtask(row);
  }

  // ============================================================================
  // Events（对应 commands.rs —— Events）
  // ============================================================================

  private listEvents(): EventRow[] {
    const rows = this.db
      .prepare(
        "SELECT id, title, start_at, end_at, is_all_day, reminder_minutes, color, notes, created_at, updated_at FROM events ORDER BY start_at",
      )
      .all();
    return rows.map(mapEvent);
  }

  private createEvent(input: Record<string, unknown>): EventRow {
    const id = newId("event");
    const ts = now();
    const title = asString(input.title).trim();
    const startAt = asString(input.startAt);
    const endAt = asString(input.endAt);
    const isAllDay = input.isAllDay == null ? false : Boolean(input.isAllDay);
    const reminderMinutes = input.reminderMinutes == null ? null : num(input.reminderMinutes, 0);
    const color = typeof input.color === "string" ? input.color : "#4f6ef7";
    const notes = input.notes == null ? "" : asString(input.notes);
    this.db
      .prepare(
        `INSERT INTO events (id, title, start_at, end_at, is_all_day, reminder_minutes, color, notes, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`,
      )
      .run(id, title, startAt, endAt, isAllDay ? 1 : 0, reminderMinutes, color, notes, ts);
    return this.getEvent(id);
  }

  private updateEvent(id: string, patch: Record<string, unknown>): EventRow {
    const sets: string[] = [];
    const params: SqlParam[] = [];
    const push = (field: string, value: SqlParam): void => {
      sets.push(`${field} = ?${sets.length + 1}`);
      params.push(value);
    };
    if (patch.title != null) push("title", asString(patch.title).trim());
    if (patch.startAt != null) push("start_at", asString(patch.startAt));
    if (patch.endAt != null) push("end_at", asString(patch.endAt));
    if (patch.isAllDay != null) push("is_all_day", Boolean(patch.isAllDay) ? 1 : 0);
    if (patch.reminderMinutes != null) push("reminder_minutes", num(patch.reminderMinutes, 0));
    if (patch.color != null) push("color", asString(patch.color));
    if (patch.notes != null) push("notes", asString(patch.notes));
    if (sets.length > 0) {
      push("updated_at", now());
      const sql = `UPDATE events SET ${sets.join(", ")} WHERE id = ?${sets.length + 1}`;
      params.push(id);
      this.db.prepare(sql).run(...params);
    }
    return this.getEvent(id);
  }

  private deleteEvent(id: string): null {
    this.db.prepare("DELETE FROM events WHERE id = ?1").run(id);
    return null;
  }

  private getEvent(id: string): EventRow {
    const row = this.db
      .prepare(
        "SELECT id, title, start_at, end_at, is_all_day, reminder_minutes, color, notes, created_at, updated_at FROM events WHERE id = ?1",
      )
      .get(id) as SqlRow | undefined;
    if (!row) throw new Error("事件不存在");
    return mapEvent(row);
  }

  // ============================================================================
  // Habits（对应 commands.rs —— Habits）
  // ============================================================================

  private listHabits(): HabitRow[] {
    const rows = this.db
      .prepare("SELECT id, name, color, icon, target_count, created_at FROM habits ORDER BY created_at")
      .all();
    return rows.map(mapHabit);
  }

  private createHabit(input: HabitInput): HabitRow {
    const id = newId("habit");
    const ts = now();
    const name = habitName(input.name);
    const color = habitColor(input.color);
    const icon = habitIcon(input.icon);
    const targetCount = habitTarget(input.targetCount);
    this.db
      .prepare(
        "INSERT INTO habits (id, name, color, icon, target_count, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      )
      .run(id, name, color, icon, targetCount, ts);
    return { id, name, color, icon, targetCount, createdAt: ts };
  }

  private getHabitRecords(habitId: string): HabitRecordRow[] {
    const rows = this.db
      .prepare("SELECT habit_id, date, count FROM habit_records WHERE habit_id = ?1")
      .all(habitId);
    return rows.map(mapHabitRecord);
  }

  private setHabitRecord(habitId: string, date: string, count: number): null {
    this.db
      .prepare(
        "INSERT INTO habit_records (habit_id, date, count) VALUES (?1, ?2, ?3) ON CONFLICT(habit_id, date) DO UPDATE SET count = ?3",
      )
      .run(habitId, date, count);
    return null;
  }

  private updateHabit(id: string, input: HabitInput): HabitRow {
    const current = this.db
      .prepare("SELECT id, name, color, icon, target_count, created_at FROM habits WHERE id = ?1")
      .get(id) as SqlRow | undefined;
    if (!current) throw new Error("习惯不存在");
    const currentHabit = mapHabit(current);
    const name = habitName(input.name);
    const color = habitColor(input.color, currentHabit.color);
    const icon = habitIcon(input.icon, currentHabit.icon);
    const targetCount = habitTarget(input.targetCount, currentHabit.targetCount);
    this.db
      .prepare("UPDATE habits SET name = ?1, color = ?2, icon = ?3, target_count = ?4 WHERE id = ?5")
      .run(name, color, icon, targetCount, id);
    const row = this.db
      .prepare("SELECT id, name, color, icon, target_count, created_at FROM habits WHERE id = ?1")
      .get(id) as SqlRow | undefined;
    if (!row) throw new Error("习惯不存在");
    return mapHabit(row);
  }

  private deleteHabit(id: string): null {
    // habit_records 有 ON DELETE CASCADE，删除习惯会级联清空打卡记录
    this.db.prepare("DELETE FROM habits WHERE id = ?1").run(id);
    return null;
  }

  // ============================================================================
  // Stats（对应 commands.rs —— Stats）
  // ============================================================================

  private getStats(): StatsRow {
    const today = localDateStr(new Date());
    const todayTotal = this.scalar(
      "SELECT COUNT(*) FROM tasks WHERE status = 'open' AND due_date = ?1",
      today,
    );
    const todayDone = this.scalar(
      "SELECT COUNT(*) FROM tasks WHERE status = 'completed' AND substr(completed_at, 1, 10) = ?1",
      today,
    );
    const overdue = this.scalar(
      "SELECT COUNT(*) FROM tasks WHERE status = 'open' AND due_date IS NOT NULL AND due_date < ?1",
      today,
    );
    const planned = this.scalar(
      "SELECT COUNT(*) FROM tasks WHERE status = 'open' AND due_date IS NOT NULL",
    );
    return { todayTotal, todayDone, overdue, planned };
  }

  // ============================================================================
  // 备份 / 导入导出（对应 commands.rs —— 备份/恢复）
  // ============================================================================

  /** 从「无边组件库」备份 JSON 一次性导入待办(todo)与纪念日(anniversary) */
  private importWubianBackup(fileContent: string): ImportResult {
    let value: unknown;
    try {
      value = JSON.parse(fileContent);
    } catch (e) {
      throw new Error(`不是有效的 JSON：${e instanceof Error ? e.message : String(e)}`);
    }
    const root = asObj(value);
    const boards = root.boards;
    if (!Array.isArray(boards)) throw new Error("备份缺少 boards 字段");
    const widgets = root.widgets;
    if (!Array.isArray(widgets)) throw new Error("备份缺少 widgets 字段");
    const widgetData = root.widgetData;
    if (!widgetData || typeof widgetData !== "object" || Array.isArray(widgetData)) {
      throw new Error("备份缺少 widgetData 字段");
    }
    const dataMap = widgetData as Record<string, unknown>;

    let importedTasks = 0;
    let importedAnniversaries = 0;
    const ts = now();

    for (const widget of widgets) {
      const w = asObj(widget);
      const wtype = optStr(w.type) ?? "";
      const wid = optStr(w.id) ?? "";
      const data = dataMap[wid];
      const d =
        data && typeof data === "object" && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : undefined;

      if (wtype === "todo" && d) {
        const items = d.items;
        if (Array.isArray(items)) {
          for (const item of items) {
            const o = asObj(item);
            const text = (optStr(o.text) ?? "").trim();
            if (text === "") continue;
            const completed = Boolean(o.completed);
            const id = newId("task");
            const status = completed ? "completed" : "open";
            const completedAt = completed ? ts : null;
            this.db
              .prepare(
                `INSERT INTO tasks (id, list_id, title, notes, priority, due_date, due_time, is_all_day, status, completed_at, reminder_minutes, repeat_rule, sort_order, created_at, updated_at)
                 VALUES (?1, 'list-default', ?2, '', 1, NULL, NULL, 0, ?3, ?4, NULL, NULL, 0, ?5, ?5)`,
              )
              .run(id, text, status, completedAt, ts);
            importedTasks += 1;
          }
        }
      } else if (wtype === "anniversary" && d) {
        const events = d.events;
        if (Array.isArray(events)) {
          for (const ev of events) {
            const o = asObj(ev);
            const name = (optStr(o.name) ?? "纪念日").trim();
            const date = optStr(o.date) ?? "";
            if (date === "") continue;
            // 导入为"全天事件"：纪念日日期转为日程事件
            const id = newId("event");
            const start = `${date}T00:00:00`;
            this.db
              .prepare(
                `INSERT INTO events (id, title, start_at, end_at, is_all_day, reminder_minutes, color, notes, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, 1, NULL, '#e5484d', '', ?5, ?5)`,
              )
              .run(id, name, start, start, ts);
            importedAnniversaries += 1;
          }
        }
      }
    }
    return { importedTasks, importedAnniversaries };
  }

  /** 全量备份为 pretty JSON 字符串（schemaVersion=2） */
  private backupJson(): string {
    const out: Record<string, unknown> = {
      schemaVersion: 2,
      exportedAt: now(),
      lists: this.listLists(),
      tasks: this.listTasks(null),
      events: this.listEvents(),
      focusSessions: this.listFocusSessionsByRange("0000-01-01T00:00:00.000Z", "9999-12-31T23:59:59.999Z"),
      habits: this.listHabits(),
      categories: this.listCategories(true),
      activities: this.listActivities(true),
      timeEntries: this.allTimeEntries(),
      timelogSettings: this.getTimelogSettings(),
    };
    return JSON.stringify(out, null, 2);
  }

  /** 导出全部任务为 CSV */
  private exportTasksCsv(): string {
    const rows = this.db
      .prepare(
        "SELECT title, list_id, priority, due_date, due_time, status, notes FROM tasks ORDER BY created_at",
      )
      .all() as SqlRow[];
    const esc = (s: string): string => `"${s.replace(/"/g, '""')}"`;
    let csv = "标题,清单,优先级,截止日期,截止时间,状态,备注\n";
    for (const r of rows) {
      const title = asString(r.title);
      const listId = r.list_id as string | null;
      let listName = "";
      if (listId !== null) {
        const l = this.db.prepare("SELECT name FROM lists WHERE id = ?1").get(listId) as
          | SqlRow
          | undefined;
        listName = l ? asString(l.name) : listId;
      }
      const priority = num(r.priority, 1);
      const dueDate = r.due_date as string | null;
      const dueTime = r.due_time as string | null;
      const status = asString(r.status);
      const notes = asString(r.notes);
      const prio = priority === 0 ? "低" : priority === 1 ? "中" : "高";
      csv += `${esc(title)},${esc(listName)},${esc(prio)},${esc(dueDate ?? "")},${esc(dueTime ?? "")},${esc(status === "completed" ? "已完成" : "未完成")},${esc(notes)}\n`;
    }
    return csv;
  }

  /** 导出日历为 iCal 格式（任务 + 事件） */
  private exportIcal(): string {
    let out =
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//TodoCalendar//CN\r\nCALSCALE:GREGORIAN\r\n";
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

    // 任务 → VEVENT
    const taskRows = this.db
      .prepare("SELECT id, title, due_date, due_time, status FROM tasks WHERE due_date IS NOT NULL")
      .all() as SqlRow[];
    for (const r of taskRows) {
      const id = asString(r.id);
      const title = asString(r.title);
      const date = asString(r.due_date);
      const time = r.due_time as string | null;
      const status = asString(r.status);
      const dtstart =
        time !== null ? `${date.replace(/-/g, "")}T${time}:00` : date.replace(/-/g, "");
      out += "BEGIN:VEVENT\r\n";
      out += `UID:task-${id.replace(/-/g, "")}-@todo-calendar\r\n`;
      out += `DTSTAMP:${stamp}\r\n`;
      out += time !== null ? `DTSTART:${dtstart}\r\n` : `DTSTART;VALUE=DATE:${dtstart}\r\n`;
      out += `SUMMARY:${title.replace(/[\r\n]/g, " ")}\r\n`;
      if (status === "completed") {
        out += "STATUS:COMPLETED\r\n";
      }
      out += "END:VEVENT\r\n";
    }

    // 事件 → VEVENT
    const fmtDt = (s: string): string => s.replace(/[-:T]/g, "").slice(0, 13) + "00Z";
    const fmtDate = (s: string): string => s.replace(/-/g, "").slice(0, 8);
    const eventRows = this.db
      .prepare("SELECT id, title, start_at, end_at, is_all_day FROM events")
      .all() as SqlRow[];
    for (const r of eventRows) {
      const id = asString(r.id);
      const title = asString(r.title);
      const startAt = asString(r.start_at);
      const endAt = asString(r.end_at);
      const isAllDay = (r.is_all_day as number) !== 0;
      out += "BEGIN:VEVENT\r\n";
      out += `UID:event-${id.replace(/-/g, "")}-@todo-calendar\r\n`;
      out += `DTSTAMP:${stamp}\r\n`;
      if (isAllDay) {
        out += `DTSTART;VALUE=DATE:${fmtDate(startAt)}\r\n`;
        out += `DTEND;VALUE=DATE:${fmtDate(endAt)}\r\n`;
      } else {
        out += `DTSTART:${fmtDt(startAt)}\r\n`;
        out += `DTEND:${fmtDt(endAt)}\r\n`;
      }
      out += `SUMMARY:${title.replace(/[\r\n]/g, " ")}\r\n`;
      out += "END:VEVENT\r\n";
    }

    out += "END:VCALENDAR\r\n";
    return out;
  }

  /** 恢复：从 JSON 备份导入（事务内清空重建）；出错回滚 */
  private restoreBackup(fileContent: string): ImportResult {
    let value: unknown;
    try {
      value = JSON.parse(fileContent);
    } catch (e) {
      throw new Error(`不是有效的 JSON：${e instanceof Error ? e.message : String(e)}`);
    }
    const root = asObj(value);
    const ts = now();
    let importedTasks = 0;
    const importedAnniversaries = 0;

    this.db.exec("BEGIN");
    try {
      this.db.exec(
        "DELETE FROM time_entries; DELETE FROM activities; DELETE FROM categories;" +
          " DELETE FROM habit_records; DELETE FROM habits;" +
          " DELETE FROM task_tags; DELETE FROM tags; DELETE FROM subtasks;" +
          " DELETE FROM events; DELETE FROM focus_sessions; DELETE FROM tasks; DELETE FROM lists;" +
          " DELETE FROM meta;",
      );

      if (Array.isArray(root.lists)) {
        for (const l of root.lists) {
          const o = asObj(l);
          const id = optStr(o.id) ?? "list-default";
          const name = optStr(o.name) ?? "收件箱";
          const color = optStr(o.color) ?? "#4f6ef7";
          this.db
            .prepare(
              "INSERT OR IGNORE INTO lists (id, name, color, sort_order, created_at) VALUES (?1, ?2, ?3, 0, ?4)",
            )
            .run(id, name, color, ts);
        }
      }
      if (Array.isArray(root.tasks)) {
        for (const t of root.tasks) {
          const o = asObj(t);
          const id = optStr(o.id) ?? "";
          const title = (optStr(o.title) ?? "").trim();
          if (title === "") continue;
          const listIdRaw = optStr(pick(o, "listId", "list_id"));
          const listId = listIdRaw ? listIdRaw : null;
          const priority =
            typeof o.priority === "number" && Number.isInteger(o.priority) ? o.priority : 1;
          const dueDateRaw = optStr(pick(o, "dueDate", "due_date"));
          const dueDate = dueDateRaw ? dueDateRaw : null;
          const dueTimeRaw = optStr(pick(o, "dueTime", "due_time"));
          const dueTime = dueTimeRaw ? dueTimeRaw : null;
          const status = optStr(o.status) ?? "open";
          const notes = optStr(o.notes) ?? "";
          const completedAt = status === "completed" ? ts : null;
          this.db
            .prepare(
              `INSERT INTO tasks (id, list_id, title, notes, priority, due_date, due_time, is_all_day, status, completed_at, reminder_minutes, repeat_rule, sort_order, created_at, updated_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?9, NULL, NULL, 0, ?10, ?10)`,
            )
            .run(id, listId, title, notes, priority, dueDate, dueTime, status, completedAt, ts);
          importedTasks += 1;
        }
      }
      if (Array.isArray(root.events)) {
        for (const ev of root.events) {
          const o = asObj(ev);
          const id = optStr(o.id) ?? "";
          const title = optStr(o.title) ?? "";
          const startAt = optStr(pick(o, "startAt", "start_at")) ?? "";
          const endAt = optStr(pick(o, "endAt", "end_at")) ?? "";
          if (startAt === "" || endAt === "") continue;
          const color = optStr(o.color) ?? "#4f6ef7";
          this.db
            .prepare(
              `INSERT INTO events (id, title, start_at, end_at, is_all_day, reminder_minutes, color, notes, created_at, updated_at)
               VALUES (?1, ?2, ?3, ?4, 0, NULL, ?5, '', ?6, ?6)`,
            )
            .run(id, title, startAt, endAt, color, ts);
        }
      }
      if (Array.isArray(root.categories)) {
        for (const c of root.categories) {
          const o = asObj(c);
          const id = optStr(o.id) ?? "";
          const name = (optStr(o.name) ?? "").trim();
          if (name === "") continue;
          const color = optStr(o.color) ?? "#5B6EF5";
          const archived = Boolean(o.archived);
          this.db
            .prepare(
              "INSERT OR IGNORE INTO categories (id, name, color, sort_order, archived, created_at, updated_at) VALUES (?1, ?2, ?3, 0, ?4, ?5, ?5)",
            )
            .run(id, name, color, archived ? 1 : 0, ts);
        }
      }
      if (Array.isArray(root.activities)) {
        for (const a of root.activities) {
          const o = asObj(a);
          const id = optStr(o.id) ?? "";
          const categoryId = optStr(pick(o, "categoryId", "category_id")) ?? "";
          const name = (optStr(o.name) ?? "").trim();
          if (name === "") continue;
          const archived = Boolean(o.archived);
          this.db
            .prepare(
              "INSERT OR IGNORE INTO activities (id, category_id, name, sort_order, archived, created_at, updated_at) VALUES (?1, ?2, ?3, 0, ?4, ?5, ?5)",
            )
            .run(id, categoryId, name, archived ? 1 : 0, ts);
        }
      }
      if (Array.isArray(root.timeEntries)) {
        for (const e of root.timeEntries) {
          const o = asObj(e);
          const id = optStr(o.id) ?? "";
          const activityId = optStr(pick(o, "activityId", "activity_id")) ?? "";
          const startTime = optStr(pick(o, "startTime", "start_time")) ?? "";
          const endTime = optStr(pick(o, "endTime", "end_time")) ?? "";
          if (startTime === "" || endTime === "") continue;
          const note = optStr(o.note);
          const categoryId = optStr(pick(o, "categoryId", "category_id"));
          const source = o.source === "pomodoro" ? "pomodoro" : "manual";
          const pomodoroSessionId = optStr(pick(o, "pomodoroSessionId", "pomodoro_session_id"));
          const pomodoroStatus = o.pomodoroStatus === "completed" || o.pomodoroStatus === "saved" ? o.pomodoroStatus : null;
          const pomodoroPlannedSeconds = o.pomodoroPlannedSeconds == null && o.pomodoro_planned_seconds == null ? null : num(pick(o, "pomodoroPlannedSeconds", "pomodoro_planned_seconds"), 0);
          this.db
            .prepare(
              "INSERT OR IGNORE INTO time_entries (id, activity_id, category_id, start_time, end_time, note, source, pomodoro_session_id, pomodoro_status, pomodoro_planned_seconds, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
            )
            .run(id, activityId || null, categoryId, startTime, endTime, note, source, pomodoroSessionId, pomodoroStatus, pomodoroPlannedSeconds, ts);
        }
      }
      if (Array.isArray(root.focusSessions)) {
        for (const session of root.focusSessions) {
          const o = asObj(session);
          const id = optStr(o.id) ?? "";
          const startedAt = optStr(pick(o, "startedAt", "started_at")) ?? "";
          if (!id || !startedAt) continue;
          const activityId = optStr(pick(o, "activityId", "activity_id"));
          const categoryId = optStr(pick(o, "categoryId", "category_id"));
          const plannedSeconds = Math.max(60, Math.round(num(pick(o, "plannedSeconds", "planned_seconds"), 25 * 60)));
          const endedAt = optStr(pick(o, "endedAt", "ended_at"));
          const status = o.status === "completed" || o.status === "saved" || o.status === "cancelled" ? o.status : "started";
          this.db.prepare("INSERT OR IGNORE INTO focus_sessions (id, activity_id, category_id, planned_seconds, started_at, ended_at, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)").run(id, activityId, categoryId, plannedSeconds, startedAt, endedAt, status);
        }
      }
      if (typeof root.timelogSettings === "string") {
        this.db
          .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('timelog_settings', ?1)")
          .run(root.timelogSettings);
      }
      this.db.exec("COMMIT");
      return { importedTasks, importedAnniversaries };
    } catch (e) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // 忽略回滚失败
      }
      throw e;
    }
  }

  // ============================================================================
  // 时间记录板块（TimeGrid）：分类 / 活动 / 时间记录 / 设置 / 默认种子
  // ============================================================================

  // ---------- 分类 ----------

  private listCategories(includeArchived: boolean): CategoryRow[] {
    const sql = includeArchived
      ? `${CATEGORY_SELECT} ORDER BY sort_order`
      : `${CATEGORY_SELECT} WHERE archived = 0 ORDER BY sort_order`;
    const rows = this.db.prepare(sql).all();
    return rows.map(mapCategory);
  }

  private createCategory(input: Record<string, unknown>): CategoryRow {
    const max = this.scalar("SELECT COALESCE(MAX(sort_order), 0) FROM categories");
    const id = newId("cat");
    const ts = now();
    const color = typeof input.color === "string" ? input.color : "#5B6EF5";
    const name = asString(input.name).trim();
    this.db
      .prepare(
        "INSERT INTO categories (id, name, color, sort_order, archived, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 0, ?5, ?5)",
      )
      .run(id, name, color, max + 1, ts);
    const row = this.getCategory(id);
    if (!row) throw new Error("创建分类失败");
    return row;
  }

  private updateCategory(id: string, patch: Record<string, unknown>): CategoryRow {
    const cur = this.getCategory(id);
    if (!cur) throw new Error("分类不存在");
    const name = patch.name != null ? asString(patch.name) : cur.name;
    const color = patch.color != null ? asString(patch.color) : cur.color;
    this.db
      .prepare("UPDATE categories SET name = ?1, color = ?2, updated_at = ?3 WHERE id = ?4")
      .run(name.trim(), color, now(), id);
    const row = this.getCategory(id);
    if (!row) throw new Error("更新分类失败");
    return row;
  }

  private setCategoryArchived(id: string, archived: boolean): null {
    this.db
      .prepare("UPDATE categories SET archived = ?1, updated_at = ?2 WHERE id = ?3")
      .run(archived ? 1 : 0, now(), id);
    return null;
  }

  private deleteCategory(id: string): null {
    const cnt = this.scalar("SELECT COUNT(*) FROM activities WHERE category_id = ?1", id);
    if (cnt > 0) {
      throw new Error("分类下仍有活动，请先归档或删除活动（§36）");
    }
    this.db.prepare("DELETE FROM categories WHERE id = ?1").run(id);
    return null;
  }

  private reorderCategories(ids: string[]): null {
    const ts = now();
    ids.forEach((id, i) => {
      this.db
        .prepare("UPDATE categories SET sort_order = ?1, updated_at = ?2 WHERE id = ?3")
        .run(i + 1, ts, id);
    });
    return null;
  }

  private getCategory(id: string): CategoryRow | null {
    const row = this.db
      .prepare(`${CATEGORY_SELECT} WHERE id = ?1`)
      .get(id) as SqlRow | undefined;
    return row ? mapCategory(row) : null;
  }

  // ---------- 活动 ----------

  private listActivities(includeArchived: boolean): ActivityRow[] {
    const sql = includeArchived
      ? `${ACTIVITY_SELECT} ORDER BY sort_order`
      : `${ACTIVITY_SELECT} WHERE archived = 0 ORDER BY sort_order`;
    const rows = this.db.prepare(sql).all();
    return rows.map(mapActivity);
  }

  private createActivity(input: Record<string, unknown>): ActivityRow {
    const categoryId = asString(input.categoryId);
    const max = this.scalar(
      "SELECT COALESCE(MAX(sort_order), 0) FROM activities WHERE category_id = ?1",
      categoryId,
    );
    const id = newId("act");
    const ts = now();
    const name = asString(input.name).trim();
    this.db
      .prepare(
        "INSERT INTO activities (id, category_id, name, sort_order, archived, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 0, ?5, ?5)",
      )
      .run(id, categoryId, name, max + 1, ts);
    const row = this.getActivity(id);
    if (!row) throw new Error("创建活动失败");
    return row;
  }

  private updateActivity(id: string, patch: Record<string, unknown>): ActivityRow {
    const cur = this.getActivity(id);
    if (!cur) throw new Error("活动不存在");
    const name = patch.name != null ? asString(patch.name) : cur.name;
    const categoryId = patch.categoryId != null ? asString(patch.categoryId) : cur.categoryId;
    this.db
      .prepare("UPDATE activities SET name = ?1, category_id = ?2, updated_at = ?3 WHERE id = ?4")
      .run(name.trim(), categoryId, now(), id);
    const row = this.getActivity(id);
    if (!row) throw new Error("更新活动失败");
    return row;
  }

  private setActivityArchived(id: string, archived: boolean): null {
    this.db
      .prepare("UPDATE activities SET archived = ?1, updated_at = ?2 WHERE id = ?3")
      .run(archived ? 1 : 0, now(), id);
    return null;
  }

  private deleteActivity(id: string): null {
    const cnt = this.scalar("SELECT COUNT(*) FROM time_entries WHERE activity_id = ?1", id);
    if (cnt > 0) {
      throw new Error("该活动存在历史时间记录，请先归档（§36）");
    }
    this.db.prepare("DELETE FROM activities WHERE id = ?1").run(id);
    return null;
  }

  private reorderActivities(categoryId: string, ids: string[]): null {
    const ts = now();
    ids.forEach((id, i) => {
      this.db
        .prepare(
          "UPDATE activities SET sort_order = ?1, updated_at = ?2 WHERE id = ?3 AND category_id = ?4",
        )
        .run(i + 1, ts, id, categoryId);
    });
    return null;
  }

  private getActivity(id: string): ActivityRow | null {
    const row = this.db
      .prepare(`${ACTIVITY_SELECT} WHERE id = ?1`)
      .get(id) as SqlRow | undefined;
    return row ? mapActivity(row) : null;
  }

  // ---------- 时间记录 ----------

  private listTimeEntriesByRange(startTime: string, endTime: string): TimeEntryRow[] {
    const rows = this.db
      .prepare(`${ENTRY_SELECT} WHERE start_time <= ?2 AND end_time > ?1 ORDER BY start_time`)
      .all(startTime, endTime);
    return rows.map(mapTimeEntry);
  }

  private createTimeEntry(input: Record<string, unknown>): TimeEntryRow {
    const startTime = asString(input.startTime);
    const endTime = asString(input.endTime);
    validateRange(startTime, endTime);
    const activityId = input.activityId == null ? null : asString(input.activityId);
    const categoryId = input.categoryId == null ? null : asString(input.categoryId);
    if (activityId === null && categoryId === null) {
      throw new Error("必须关联一个活动或分类");
    }
    const id = newId("te");
    const ts = now();
    const note = input.note == null ? null : asString(input.note);
    const source = input.source === "pomodoro" ? "pomodoro" : "manual";
    const pomodoroSessionId = input.pomodoroSessionId == null ? null : asString(input.pomodoroSessionId);
    const pomodoroStatus = input.pomodoroStatus === "completed" || input.pomodoroStatus === "saved" ? input.pomodoroStatus : null;
    const pomodoroPlannedSeconds = input.pomodoroPlannedSeconds == null ? null : Math.max(0, Math.round(num(input.pomodoroPlannedSeconds, 0)));
    this.db
      .prepare(
        "INSERT INTO time_entries (id, activity_id, category_id, start_time, end_time, note, source, pomodoro_session_id, pomodoro_status, pomodoro_planned_seconds, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
      )
      .run(id, activityId, categoryId, startTime, endTime, note, source, pomodoroSessionId, pomodoroStatus, pomodoroPlannedSeconds, ts);
    const row = this.getTimeEntry(id);
    if (!row) throw new Error("创建时间记录失败");
    return row;
  }

  /** 原子写入一次番茄会话的多个有效片段；暂停区间不会进入 time_entries。 */
  private createPomodoroEntries(input: Record<string, unknown>, manageTransaction = true): TimeEntryRow[] {
    const activityId = input.activityId == null ? null : asString(input.activityId);
    const categoryId = input.categoryId == null ? null : asString(input.categoryId);
    if (activityId === null && categoryId === null) throw new Error("必须关联一个活动或分类");
    const sessionId = asString(input.pomodoroSessionId);
    const plannedSeconds = Math.max(60, Math.round(num(input.plannedSeconds, 25 * 60)));
    const status = input.pomodoroStatus === "completed" || input.pomodoroStatus === "saved" ? input.pomodoroStatus : "saved";
    const segments = Array.isArray(input.segments) ? input.segments.map(asObj) : [];
    const valid = segments.filter((segment) => {
      const start = asString(segment.startAt);
      const end = asString(segment.endAt);
      return start !== "" && end !== "" && new Date(end).getTime() > new Date(start).getTime();
    });
    if (!sessionId || valid.length === 0) throw new Error("番茄会话缺少有效专注片段");
    const created: TimeEntryRow[] = [];
    if (manageTransaction) this.db.exec("BEGIN");
    try {
      const ts = now();
      const insert = this.db.prepare(
        "INSERT INTO time_entries (id, activity_id, category_id, start_time, end_time, note, source, pomodoro_session_id, pomodoro_status, pomodoro_planned_seconds, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, NULL, 'pomodoro', ?6, ?7, ?8, ?9, ?9)",
      );
      for (const segment of valid) {
        const id = newId("te");
        insert.run(id, activityId, categoryId, asString(segment.startAt), asString(segment.endAt), sessionId, status, plannedSeconds, ts);
        const row = this.getTimeEntry(id);
        if (!row) throw new Error("创建番茄记录失败");
        created.push(row);
      }
      if (manageTransaction) this.db.exec("COMMIT");
      return created;
    } catch (e) {
      if (manageTransaction) { try { this.db.exec("ROLLBACK"); } catch { /* ignore rollback failure */ } }
      throw e;
    }
  }

  private updateTimeEntry(id: string, patch: Record<string, unknown>): TimeEntryRow {
    const cur = this.getTimeEntry(id);
    if (!cur) throw new Error("时间记录不存在");
    // 空字符串视为"清除"该关联（分类级/活动级互转）
    const norm = (v: unknown, fallback: string | null): string | null => {
      if (v === null || v === undefined) return fallback;
      const s = String(v);
      return s === "" ? null : s;
    };
    const activityId = norm(patch.activityId, cur.activityId);
    const categoryId = norm(patch.categoryId, cur.categoryId);
    if (activityId === null && categoryId === null) {
      throw new Error("必须关联一个活动或分类");
    }
    const startTime = patch.startTime == null ? cur.startTime : String(patch.startTime);
    const endTime = patch.endTime == null ? cur.endTime : String(patch.endTime);
    validateRange(startTime, endTime);
    const note = patch.note === null || patch.note === undefined ? cur.note : String(patch.note);
    this.db
      .prepare(
        "UPDATE time_entries SET activity_id = ?1, category_id = ?2, start_time = ?3, end_time = ?4, note = ?5, updated_at = ?6 WHERE id = ?7",
      )
      .run(activityId, categoryId, startTime, endTime, note, now(), id);
    const row = this.getTimeEntry(id);
    if (!row) throw new Error("更新时间记录失败");
    return row;
  }

  private deleteTimeEntry(id: string): null {
    this.db.prepare("DELETE FROM time_entries WHERE id = ?1").run(id);
    return null;
  }

  private findTimeEntryConflicts(
    startTime: string,
    endTime: string,
    excludeId: string | null,
  ): TimeEntryRow[] {
    const rows = this.db
      .prepare(
        `${ENTRY_SELECT} WHERE start_time < ?2 AND end_time > ?1 AND id != ?3 ORDER BY start_time`,
      )
      .all(startTime, endTime, excludeId ?? "");
    return rows.map(mapTimeEntry);
  }

  /** 事务：删冲突 + 新建（出错回滚） */
  private replaceTimeEntries(conflictIds: string[], input: Record<string, unknown>): TimeEntryRow {
    const startTime = asString(input.startTime);
    const endTime = asString(input.endTime);
    validateRange(startTime, endTime);
    const activityId = input.activityId == null ? null : asString(input.activityId);
    const categoryId = input.categoryId == null ? null : asString(input.categoryId);
    if (activityId === null && categoryId === null) {
      throw new Error("必须关联一个活动或分类");
    }
    const note = input.note == null ? null : asString(input.note);
    const source = input.source === "pomodoro" ? "pomodoro" : "manual";
    const pomodoroSessionId = input.pomodoroSessionId == null ? null : asString(input.pomodoroSessionId);
    const pomodoroStatus = input.pomodoroStatus === "completed" || input.pomodoroStatus === "saved" ? input.pomodoroStatus : null;
    const pomodoroPlannedSeconds = input.pomodoroPlannedSeconds == null ? null : Math.max(0, Math.round(num(input.pomodoroPlannedSeconds, 0)));

    this.db.exec("BEGIN");
    try {
      for (const conflictId of conflictIds) {
        this.db.prepare("DELETE FROM time_entries WHERE id = ?1").run(conflictId);
      }
      const id = newId("te");
      const ts = now();
      this.db
        .prepare(
          "INSERT INTO time_entries (id, activity_id, category_id, start_time, end_time, note, source, pomodoro_session_id, pomodoro_status, pomodoro_planned_seconds, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
        )
        .run(id, activityId, categoryId, startTime, endTime, note, source, pomodoroSessionId, pomodoroStatus, pomodoroPlannedSeconds, ts);
      const row = this.getTimeEntry(id);
      if (!row) throw new Error("创建时间记录失败");
      this.db.exec("COMMIT");
      return row;
    } catch (e) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // 忽略回滚失败
      }
      throw e;
    }
  }

  private countTimeEntriesByActivity(activityId: string): number {
    return this.scalar("SELECT COUNT(*) FROM time_entries WHERE activity_id = ?1", activityId);
  }

  private allTimeEntries(): TimeEntryRow[] {
    const rows = this.db.prepare(`${ENTRY_SELECT} ORDER BY start_time`).all();
    return rows.map(mapTimeEntry);
  }

  private getTimeEntry(id: string): TimeEntryRow | null {
    const row = this.db
      .prepare(`${ENTRY_SELECT} WHERE id = ?1`)
      .get(id) as SqlRow | undefined;
    return row ? mapTimeEntry(row) : null;
  }

  // ---------- 设置（meta 表 JSON） ----------

  private getTimelogSettings(): string {
    const row = this.db
      .prepare("SELECT value FROM meta WHERE key = 'timelog_settings'")
      .get() as SqlRow | undefined;
    return row ? asString(row.value) : "{}";
  }

  private setTimelogSettings(json: string): null {
    this.db
      .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('timelog_settings', ?1)")
      .run(json);
    return null;
  }

  // ---------- 默认种子（§11） ----------

  private seedTimelogDefaults(): null {
    const cnt = this.scalar("SELECT COUNT(*) FROM categories");
    if (cnt > 0) {
      return null;
    }
    this.db.exec("BEGIN");
    try {
      const ts = now();
      SEED_CATEGORIES.forEach((cat, ci) => {
        const catId = newId("cat");
        this.db
          .prepare(
            "INSERT INTO categories (id, name, color, sort_order, archived, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 0, ?5, ?5)",
          )
          .run(catId, cat.name, cat.color, ci + 1, ts);
        cat.activities.forEach((actName, ai) => {
          this.db
            .prepare(
              "INSERT INTO activities (id, category_id, name, sort_order, archived, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 0, ?5, ?5)",
            )
            .run(newId("act"), catId, actName, ai + 1, ts);
        });
      });
      this.db.exec("COMMIT");
      return null;
    } catch (e) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // 忽略回滚失败
      }
      throw e;
    }
  }
}
