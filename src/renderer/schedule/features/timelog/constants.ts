import type { TimelogSettings } from "./types";

export const DEFAULT_SETTINGS: TimelogSettings = {
  blockSize: 15,
  dayStart: "00:00",
  dayEnd: "24:00",
  weekStartsOn: 1,
};

/** 默认分类与预设活动（§11、§12） */
export const CATEGORY_PRESETS: {
  name: string;
  color: string;
  activities: string[];
}[] = [
  { name: "工作", color: "#737ba5", activities: ["深度工作", "沟通", "会议"] },
  { name: "学习", color: "#6f89a8", activities: ["阅读", "课程"] },
  { name: "日常", color: "#5f9a90", activities: ["三餐", "洗漱", "通勤", "家务"] },
  { name: "运动", color: "#bd7c62", activities: ["健身", "跑步", "散步"] },
  { name: "娱乐", color: "#8d78a8", activities: ["视频", "游戏"] },
  { name: "爱好", color: "#b59457", activities: ["摄影", "吉他"] },
  { name: "社交", color: "#ae6f90", activities: ["聚会", "聊天"] },
  { name: "睡眠", color: "#6f7d8e", activities: ["睡眠", "午休"] },
];

export const COLOR_PALETTE = [
  "#737ba5",
  "#6f89a8",
  "#5f9a90",
  "#bd7c62",
  "#8d78a8",
  "#b59457",
  "#ae6f90",
  "#6f7d8e",
  "#5f9aa7",
  "#b8789a",
  "#8fa86b",
  "#c69a61",
  "#7f8796",
  "#c29a9d",
];
