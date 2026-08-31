import { describe, expect, it } from "vitest";
import type { Task } from "../src/renderer/schedule/types";
import {
  buildReorderPatches,
  buildTaskDatePatch,
  buildTaskEditPatch,
  buildTodoCreateInput,
  executeTodoMutation,
  nextTaskStatus,
} from "../src/renderer/schedule/todo-v2/production";
import { filterTodoTasks } from "../src/renderer/schedule/todo-v2/selectors";

const task = (id: string, sortOrder: number, status: Task["status"] = "open"): Task => ({
  id,
  listId: "list-default",
  title: id,
  notes: "",
  priority: 1,
  dueDate: "2026-08-30",
  dueTime: null,
  isAllDay: false,
  status,
  completedAt: null,
  reminderMinutes: null,
  repeatRule: null,
  sortOrder,
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
});

describe("Todo V2 生产适配", () => {
  it("把快速输入映射为现有 TaskInput 并保留自然语言日期时间", () => {
    const input = buildTodoCreateInput("明天下午3点 提交报告", "list-work", "2026-08-30");
    expect(input).toMatchObject({ title: "提交报告", listId: "list-work", dueTime: "15:00", reminderMinutes: 0 });
    expect(input?.dueDate).not.toBe("2026-08-30");
  });

  it("没有日期时清除时间和提醒，编辑映射保持数据库字段兼容", () => {
    expect(buildTaskDatePatch(null)).toEqual({ dueDate: null, dueTime: null, reminderMinutes: null });
    expect(buildTaskEditPatch({ title: "  新标题 ", listId: null, dueDate: null, dueTime: "09:00", reminderMinutes: 10, priority: 2 }))
      .toEqual({ title: "新标题", listId: null, dueDate: null, dueTime: null, reminderMinutes: null, priority: 2 });
  });

  it("完成切换和排序只生成目标数据补丁", () => {
    expect(nextTaskStatus(task("a", 0))).toBe("completed");
    expect(nextTaskStatus(task("a", 0, "completed"))).toBe("open");
    expect(buildReorderPatches([task("a", 0), task("b", 1000), task("c", 2000)], "c", "a"))
      .toEqual([{ id: "c", sortOrder: 0 }, { id: "a", sortOrder: 1000 }, { id: "b", sortOrder: 2000 }]);
  });

  it("默认收件箱清单继续兼容历史未分类任务", () => {
    const unclassified = { ...task("unclassified", 0), listId: null };
    expect(filterTodoTasks([unclassified, task("inbox", 1000)], "list", "list-default", "2026-08-30", "2026-08-30").map((item) => item.id))
      .toEqual(["unclassified", "inbox"]);
  });

  it("动作失败返回可显示错误，不把失败伪装成成功", async () => {
    const result = await executeTodoMutation(async () => { throw new Error("隔离失败"); }, "保存失败");
    expect(result).toEqual({ ok: false, message: "隔离失败" });
  });
});
