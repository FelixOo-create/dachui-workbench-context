// 时间记录板块（TimeGrid）数据类型 —— 与《TimeGrid_Agent_开发交接文档》§19 一致

export interface Category {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  categoryId: string;
  name: string;
  icon?: string;
  sortOrder: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TimeEntry {
  id: string;
  /** 关联的活动（子标签）；分类级记录为 null */
  activityId: string | null;
  /** 关联的分类（总标签）；活动级记录可同时携带，用于快速筛选 */
  categoryId: string | null;
  /** ISO 8601 完整时间戳，允许跨午夜（endTime 属于次日） */
  startTime: string;
  endTime: string;
  note?: string;
  /** 来源：旧记录缺失时按手工记录兼容。 */
  source?: "manual" | "pomodoro";
  pomodoroSessionId?: string | null;
  pomodoroStatus?: "completed" | "saved" | null;
  pomodoroPlannedSeconds?: number | null;
  createdAt: string;
  updatedAt: string;
}

/** 时间记录板块设置（主题跟随主应用，不在此处） */
export interface TimelogSettings {
  blockSize: 15 | 30;
  dayStart: string; // 'HH:mm'
  dayEnd: string; // 'HH:mm'
  weekStartsOn: 0 | 1;
}
