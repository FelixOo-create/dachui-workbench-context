import { useEffect, useState } from "react";
import { timelogApi } from "./api";
import { useTimelogStore } from "./stores";
import type { TimeEntry } from "./types";

export function useDayEntries(dateKey: string): TimeEntry[] {
  const dataVersion = useTimelogStore((s) => s.dataVersion);
  const [entries, setEntries] = useState<TimeEntry[]>([]);

  useEffect(() => {
    let on = true;
    timelogApi.timeEntries
      .byDate(dateKey)
      .then((list) => {
        if (on) setEntries(list);
      })
      .catch((err) => console.error("加载时间记录失败：", err));
    return () => {
      on = false;
    };
  }, [dateKey, dataVersion]);

  return entries;
}
