// 中文自然语言日期解析：把"明天""周五""下周一""3月5日""后天"等转成 YYYY-MM-DD
import { format, addDays, setMonth, setDate, parseISO, isValid } from "date-fns";

const WEEKDAYS: Record<string, number> = {
  周日: 0, 星期天: 0, 星期日: 0, 礼拜天: 0, 礼拜日: 0,
  周一: 1, 星期一: 1, 礼拜一: 1,
  周二: 2, 星期二: 2, 礼拜二: 2,
  周三: 3, 星期三: 3, 礼拜三: 3,
  周四: 4, 星期四: 4, 礼拜四: 4,
  周五: 5, 星期五: 5, 礼拜五: 5,
  周六: 6, 星期六: 6, 礼拜六: 6,
};

export interface ParsedDate {
  date: string | null; // YYYY-MM-DD
  /** 从标题中剥离后剩余的文字 */
  rest: string;
}

const DATE_RE =
  /(?:(今|明|后|昨|大后天?)(?:天|日)?|(下|这|本|上)(?:个)?(?:周|星期|礼拜)([一二三四五六日天末])|(周|星期|礼拜)([一二三四五六日天末])|(?:本|这|这周|本周末?)?(周末|周未)|(\d{1,2})\s*[月/.]\s*(\d{1,2})\s*(?:日|号)?|(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日)/;

export function parseNaturalDate(text: string): ParsedDate {
  const trimmed = text.trim();
  if (!trimmed) return { date: null, rest: trimmed };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const m = trimmed.match(DATE_RE);
  if (!m) return { date: null, rest: trimmed };

  let dateStr: string | null = null;
  const rest = trimmed.replace(DATE_RE, "").replace(/^\s*[,，:：]?\s*/, "").trim();

  if (m[1]) {
    // 今/明/后/昨/大后天 天/日
    let offset: number;
    if (m[1] === "今") offset = 0;
    else if (m[1] === "明") offset = 1;
    else if (m[1] === "后") offset = 2;
    else if (m[1].startsWith("大后")) offset = 3;
    else offset = -1;
    dateStr = format(addDays(today, offset), "yyyy-MM-dd");
  } else if (m[2] && m[3]) {
    // 下周X / 这周X / 上周X / 下周/这周（无星期=下周开始）
    if (m[3] === "末" || m[3] === "未") {
      // 下周末 = 下周周六；本周末 = 本周周六
      const prefix = m[2];
      const base = today.getDay();
      let diff: number;
      if (prefix === "下") {
        diff = 6 - base + 7; // 下周六
      } else {
        diff = 6 - base; // 本周六（含今天）
        if (diff < 0) diff += 7;
      }
      dateStr = format(addDays(today, diff), "yyyy-MM-dd");
    } else {
      const weekday = WEEKDAYS[m[3]] ?? (m[3] === "天" ? 0 : WEEKDAYS["周" + m[3]]);
      if (weekday === undefined) return { date: null, rest: trimmed };
      const current = today.getDay();
      let diff = weekday - current;
      if (m[2] === "下") diff += 7;
      else if (m[2] === "上") diff -= 7;
      dateStr = format(addDays(today, diff), "yyyy-MM-dd");
    }
  } else if (m[4] && m[5]) {
    // 周X / 星期X
    if (m[5] === "末" || m[5] === "未") {
      const diff = 6 - today.getDay();
      dateStr = format(addDays(today, diff >= 0 ? diff : diff + 7), "yyyy-MM-dd");
    } else {
      const weekday = WEEKDAYS[m[4] + m[5]] ?? WEEKDAYS[m[5] === "天" ? "周日" : "周" + m[5]];
      if (weekday === undefined) return { date: null, rest: trimmed };
      let diff = weekday - today.getDay();
      if (diff <= 0) diff += 7; // 本周内未过的最近一个
      dateStr = format(addDays(today, diff), "yyyy-MM-dd");
    }
  } else if (m[6]) {
    // 周末
    const diff = 6 - today.getDay();
    dateStr = format(addDays(today, diff >= 0 ? diff : diff + 7), "yyyy-MM-dd");
  } else if (m[7] && m[8]) {
    // M月D日
    const month = parseInt(m[7], 10);
    const day = parseInt(m[8], 10);
    const candidate = setDate(setMonth(today, month - 1), day);
    if (!isValid(candidate)) return { date: null, rest: trimmed };
    dateStr = format(candidate, "yyyy-MM-dd");
  } else if (m[9] && m[10] && m[11]) {
    // YYYY年M月D日
    const candidate = parseISO(`${m[9]}-${m[10].padStart(2, "0")}-${m[11].padStart(2, "0")}`);
    if (!isValid(candidate)) return { date: null, rest: trimmed };
    dateStr = format(candidate, "yyyy-MM-dd");
  }

  if (!dateStr) return { date: null, rest: trimmed };
  return { date: dateStr, rest };
}

/** 解析时间：识别 "上午10点/10:30/晚上8点/今晚8点/明早9点" 等 */
const TIME_RE = /(上午|下午|晚上|中午|凌晨|今早|今晚|明早|明晚|半夜|清晨|傍晚|晚|早)?\s*(\d{1,2})\s*[点时:：]\s*(\d{1,2})?\s*(?:分)?/;

export function parseNaturalTime(text: string): { time: string | null; rest: string } {
  const m = text.match(TIME_RE);
  if (!m) return { time: null, rest: text };
  let hour = parseInt(m[2], 10);
  const minute = m[3] ? parseInt(m[3], 10) : 0;
  const period = m[1] ?? "";
  if (period && period !== "凌晨") {
    // 下午/晚上/今晚/明晚/傍晚/半夜/晚 → +12；早/今早/明早/清晨 → 上午
    const pm = period.includes("下") || period.includes("晚") || period.includes("傍") || period.includes("半");
    if (pm && hour < 12) hour += 12;
    if ((period === "中午" || period === "早" || period === "今早" || period === "明早" || period === "清晨") && hour < 6) hour += 12;
  }
  if (hour > 23 || minute > 59) return { time: null, rest: text };
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const rest = text.replace(TIME_RE, "").replace(/^\s*[,，:：]?\s*/, "").trim();
  return { time, rest };
}

/** 把整行输入拆成 { 标题, 日期, 时间 } */
export function parseQuickAdd(raw: string): { title: string; dueDate: string | null; dueTime: string | null } {
  let { date, rest } = parseNaturalDate(raw);
  let { time, rest: rest2 } = parseNaturalTime(rest);
  const title = rest2 || raw.trim();
  return { title, dueDate: date, dueTime: time };
}
