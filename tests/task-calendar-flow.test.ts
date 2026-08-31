import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("task and calendar interaction surface", () => {
  it("keeps task rows compact and shares one complete task menu", () => {
    const source = read("src/renderer/schedule/todo-v2/TodoSceneV2.tsx");
    expect(source).not.toContain("tl-detail");
    expect(source).toContain("移动到清单");
    expect(source).not.toContain("添加附件");
    expect(source).not.toContain("添加备注");
    expect(source).not.toContain("重复");
    expect(source).not.toContain("附件");
    expect(source).not.toContain("备注");
    expect(source).toContain("t2-task-check");
    expect(source).toContain("t2-row-action");
    expect(source).toContain('title="安排日期"');
    expect(source).toContain("更多操作");
    expect(source).toContain("task.priority > 0");
    expect(source).toContain("taskSubtasks.length > 0");
    expect(source).toContain("onEditTask?.(task.id)");
    for (const item of ["设置优先级", "设置提醒", "添加子任务", "移动到清单", "删除任务"]) expect(source).toContain(item);
    expect(source).toContain("onManageSubtasks?.(task.id)");
    expect(source).not.toContain("CheckCircle2");
    expect(source).not.toContain("添加附件");
    expect(source).not.toContain("添加备注");
  });

  it("uses the shared calendar as the controlled task planning surface", () => {
    const scene = read("src/renderer/schedule/todo-v2/TodoSceneV2.tsx");
    const container = read("src/renderer/schedule/todo-v2/TodoSceneV2Container.tsx");
    const app = read("src/renderer/schedule/App.tsx");
    expect(app).toContain("<TodoSceneV2Container />");
    expect(container).toContain("schedulingTaskId");
    expect(container).toContain('setCalendarMode("month")');
    expect(scene).toContain("正在安排：");
    expect(scene).toContain("onAssignTaskDate?.(schedulingTaskId, date)");
    expect(scene).toContain("onSelectedDateChange?.(date)");
    expect(container).toContain("workbench.todo.v2.date");
    expect(container).toContain("buildTaskDatePatch(date)");
    expect(container).toContain("disabled={!dueDate}");
    expect(scene).toContain("disabled={!task.dueDate}");
    expect(scene).toContain("onSchedulingTaskChange?.(null)");
  });

  it("keeps the existing drag-to-calendar bridge", () => {
    const scene = read("src/renderer/schedule/todo-v2/TodoSceneV2.tsx");
    expect(scene).toContain("setDraggingTaskId(task.id)");
    expect(scene).toContain("onDragOver={(event) => { if (draggingTaskId) event.preventDefault(); }}");
    expect(scene).toContain("onAssignTaskDate?.(draggingTaskId, day.date)");
  });
});
