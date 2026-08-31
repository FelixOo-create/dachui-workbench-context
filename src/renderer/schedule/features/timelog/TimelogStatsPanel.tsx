import { useCallback, useEffect, useState } from "react";
import { format, isSameDay } from "date-fns";
import { zhCN } from "date-fns/locale";
import { BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import DayOverview from "./components/DayOverview";
import CategoryBreakdown from "./components/CategoryBreakdown";
import { useTimelogStore } from "./stores";
import { loadCatalog, type Catalog } from "./catalog";
import { keyToDate } from "./utils";
import { Button } from "./ui/button";
import { rangeBounds, shiftDateKeyByRange } from "./useRangeEntries";
import StatsRangeSwitch from "./components/StatsRangeSwitch";

/**
 * 时间块统计面板（供「统计」板块使用）：
 * 记录率概览 / 分类环形图，日周月年可切换。
 */
export default function TimelogStatsPanel() {
  const ready = useTimelogStore((s) => s.ready);
  const init = useTimelogStore((s) => s.init);
  const dataVersion = useTimelogStore((s) => s.dataVersion);
  const selectedDate = useTimelogStore((s) => s.selectedDate);
  const setSelectedDate = useTimelogStore((s) => s.setSelectedDate);
  const goToToday = useTimelogStore((s) => s.goToToday);
  const statRange = useTimelogStore((s) => s.statRange);

  const [catalog, setCatalog] = useState<Catalog>({ categories: [], activities: [] });

  useEffect(() => {
    void init();
  }, [init]);

  const reloadCatalog = useCallback(() => {
    loadCatalog()
      .then(setCatalog)
      .catch((e) => console.error("时间记录统计目录加载失败", e));
  }, []);

  useEffect(() => {
    if (ready) reloadCatalog();
  }, [ready, reloadCatalog, dataVersion]);

  const date = keyToDate(selectedDate);
  const isToday = isSameDay(date, new Date());
  const { startKey, endKey } = rangeBounds(statRange, selectedDate);
  const periodLabel =
    statRange === "day"
      ? format(date, "yyyy年M月d日 EEEE", { locale: zhCN })
      : statRange === "week"
        ? `${format(keyToDate(startKey), "yyyy年M月d日", { locale: zhCN })} - ${format(keyToDate(endKey), "M月d日", { locale: zhCN })}`
        : statRange === "month"
          ? format(date, "yyyy年M月", { locale: zhCN })
          : format(date, "yyyy年", { locale: zhCN });

  const shiftPeriod = (step: number) => setSelectedDate(shiftDateKeyByRange(selectedDate, statRange, step));

  if (!ready) {
    return <div className="app-loading">正在加载时间记录统计…</div>;
  }

  return (
    <div className="timelog-stats-view">
      <div className="timelog-stats-header">
        <div className="timelog-stats-title">
          <BarChart3 size={18} />
          <div>
            <h2>时间统计</h2>
            <span>{periodLabel}</span>
          </div>
        </div>
        <div className="timelog-stats-actions">
          <StatsRangeSwitch className="timelog-stats-range-switch" />
          <Button variant="outline" size="icon-sm" onClick={() => shiftPeriod(-1)} aria-label="上一周期">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => shiftPeriod(1)} aria-label="下一周期">
            <ChevronRight />
          </Button>
          {!isToday && (
            <Button variant="outline" size="sm" onClick={goToToday}>
              今天
            </Button>
          )}
        </div>
      </div>
      <div className="timelog-stats-grid">
        <DayOverview catalog={catalog} showRangeSwitch={false} />
        <CategoryBreakdown catalog={catalog} showRangeSwitch={false} />
      </div>
    </div>
  );
}
