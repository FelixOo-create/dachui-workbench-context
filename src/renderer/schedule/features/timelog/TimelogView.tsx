import { useCallback, useEffect, useState } from "react";
import { format, isSameDay } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Columns3,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import ActivityPanel from "./components/ActivityPanel";
import DayView from "./components/DayView";
import ConflictDialog from "./components/ConflictDialog";
import TimelogStatsPanel from "./TimelogStatsPanel";
import { useTimelogStore } from "./stores";
import { loadCatalog, type Catalog } from "./catalog";
import { keyToDate } from "./utils";
import { Button } from "./ui/button";
import { PaneResizer, usePersistentBoolean, usePersistentPaneSize } from "../../components/PaneLayout";
import FocusReviewView from "./FocusReviewView";
import "./focus-review.css";

/** 时间记录板块：记录页保留活动/网格/编辑，统计页独立展示。 */
export default function TimelogView() {
  const ready = useTimelogStore((s) => s.ready);
  const init = useTimelogStore((s) => s.init);
  const dataVersion = useTimelogStore((s) => s.dataVersion);
  const selectedDate = useTimelogStore((s) => s.selectedDate);
  const shiftDate = useTimelogStore((s) => s.shiftDate);
  const goToToday = useTimelogStore((s) => s.goToToday);

  const [catalog, setCatalog] = useState<Catalog>({ categories: [], activities: [] });
  const [activityWidth, setActivityWidth] = usePersistentPaneSize("workbench.timelog.activityWidth", 232, 184, 360);
  const [activityOpen, setActivityOpen] = usePersistentBoolean("workbench.timelog.activityOpen", true);
  const [statsOpen, setStatsOpen] = usePersistentBoolean("workbench.timelog.statsOpen", false);
  const [manualMode, setManualMode] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("timelog") === "stats") {
      setStatsOpen(true);
    }
  }, [setStatsOpen]);

  useEffect(() => {
    void init();
  }, [init]);

  const reloadCatalog = useCallback(() => {
    loadCatalog()
      .then(setCatalog)
      .catch((e) => console.error("时间记录目录加载失败", e));
  }, []);

  useEffect(() => {
    if (ready) reloadCatalog();
  }, [ready, reloadCatalog, dataVersion]);

  const date = keyToDate(selectedDate);
  const isToday = isSameDay(date, new Date());

  if (!ready) {
    return <div className="app-loading">正在加载时间记录…</div>;
  }

  if (!manualMode) {
    return <div className="timelog-focus-container"><FocusReviewView catalog={catalog} onSupplement={() => setManualMode(true)} /></div>;
  }

  return (
    <div id="timelog-root" className="flex h-full min-h-0 flex-col gap-2">
      <div className="timelog-toolbar">
        <div className="timelog-date-controls">
          <div className="timelog-view-tabs" role="tablist" aria-label="时间块视图">
            <button role="tab" onClick={() => setManualMode(false)}><span>今日专注</span></button>
            <button
              role="tab"
              aria-selected={!statsOpen}
              className={!statsOpen ? "is-active" : ""}
              onClick={() => setStatsOpen(false)}
            >
              <Columns3 size={14} />记录
            </button>
            <button
              role="tab"
              aria-selected={statsOpen}
              className={statsOpen ? "is-active" : ""}
              onClick={() => setStatsOpen(true)}
            >
              <BarChart3 size={14} />统计
            </button>
          </div>
          {!statsOpen && (
            <>
              <Button variant="ghost" size="icon-sm" onClick={() => shiftDate(-1)} aria-label="前一天" data-testid="prev-day">
                <ChevronLeft />
              </Button>
              <span data-testid="date-label" className="timelog-date-label">
                {format(date, "yyyy年M月d日 EEEE", { locale: zhCN })}
              </span>
              <Button variant="ghost" size="icon-sm" onClick={() => shiftDate(1)} aria-label="后一天" data-testid="next-day">
                <ChevronRight />
              </Button>
              {!isToday && (
                <Button variant="outline" size="sm" onClick={goToToday}>今天</Button>
              )}
            </>
          )}
        </div>
        {!statsOpen && <div className="layout-controls">
          <button
            className={activityOpen ? "is-active" : ""}
            title={activityOpen ? "隐藏活动面板" : "显示活动面板"}
            onClick={() => setActivityOpen((open) => !open)}
          >
            {activityOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </button>
        </div>}
      </div>

      {statsOpen ? (
        <TimelogStatsPanel />
      ) : (
      <div className="timelog-layout">
        {activityOpen && (
          <>
            <div className="timelog-activity-pane" style={{ width: activityWidth }}>
              <ActivityPanel catalog={catalog} onCatalogChange={reloadCatalog} />
            </div>
            <PaneResizer
              value={activityWidth}
              min={184}
              max={360}
              defaultValue={232}
              label="调整活动面板宽度"
              onChange={setActivityWidth}
            />
          </>
        )}
        <div className="timelog-grid-pane">
          <DayView catalog={catalog} />
        </div>
      </div>
      )}

      <ConflictDialog catalog={catalog} />
    </div>
  );
}
