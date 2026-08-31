import { useEffect, useState } from "react";
import QuickCapture from "./components/QuickCapture";
import TimelogView from "./features/timelog/TimelogView";
import HabitsSceneV2Container from "./habits-v2/HabitsSceneV2Container";
import TodoSceneV2Container from "./todo-v2/TodoSceneV2Container";
import { useAppStore } from "./store";
import "./Workbench.css";
import "./styles/global.css";
import "./features/timelog/timelog.css";

export type ScheduleModule = "todo" | "timelog" | "habits";

export default function App({ module }: { module: ScheduleModule }) {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quickCapture, setQuickCapture] = useState(false);
  const loadAll = useAppStore((state) => state.loadAll);

  useEffect(() => {
    loadAll()
      .then(() => setReady(true))
      .catch((error) => {
        console.error("loadAll failed:", error);
        setLoadError(String(error?.message ?? error));
      });
  }, [loadAll]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setQuickCapture(true);
      }
    };
    const onQuickCapture = () => setQuickCapture(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("workbench:quick-capture", onQuickCapture);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("workbench:quick-capture", onQuickCapture);
    };
  }, []);

  if (loadError) return <div className="app-loading">加载失败：{loadError}</div>;
  if (!ready) return <div className="app-loading">加载中…</div>;

  return (
    <div className="schedule-workspace" data-module={module === "todo" ? "todo-v2" : module}>
      <main className="schedule-main">
        {module === "todo" ? (
          <TodoSceneV2Container />
        ) : module === "timelog" ? (
          <TimelogView />
        ) : (
          <div className="wb-module-scroll"><HabitsSceneV2Container /></div>
        )}
      </main>
      <QuickCapture open={quickCapture} onClose={() => setQuickCapture(false)} />
    </div>
  );
}
