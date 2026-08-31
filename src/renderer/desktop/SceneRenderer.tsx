import { lazy, Suspense } from "react";
import type { DesktopSceneId } from "../../shared/desktop";

const ScheduleScene = lazy(() => import("../schedule/App"));
const MemoriesScene = lazy(() => import("../memories/MemoryJournal"));
const ToolsScene = lazy(() => import("../tools/ToolsWorkspaceScene"));

function SceneLoading({ label }: { label: string }) {
  return <div className="desktop-scene-loading">正在加载{label}…</div>;
}

function CanvasScene() {
  return <section className="desktop-deferred-scene"><strong>灵感画布</strong><p>完整画布仍在实现中，本版不提供无效编辑入口。</p></section>;
}

export function SceneRenderer({ sceneId }: { sceneId: Exclude<DesktopSceneId, "today"> }) {
  if (sceneId === "canvas") return <CanvasScene />;
  if (sceneId === "memories") return <Suspense fallback={<SceneLoading label="记录册" />}><div className="desktop-full-scene desktop-scene-page memories-scene"><MemoriesScene /></div></Suspense>;
  if (sceneId === "tools") return <Suspense fallback={<SceneLoading label="工具中心" />}><div className="desktop-full-scene tools-scene"><ToolsScene /></div></Suspense>;
  const module = sceneId === "todo" ? "todo" : sceneId === "timelog" ? "timelog" : "habits";
  return <Suspense fallback={<SceneLoading label={sceneId === "todo" ? "待办" : sceneId === "timelog" ? "时间块" : "习惯"} />}><div className="desktop-full-scene schedule-root"><ScheduleScene module={module} /></div></Suspense>;
}
