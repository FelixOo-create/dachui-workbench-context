import type { Priority, Task, TaskStatus } from "../types";
import type { TaskInput } from "../api";
import { parseQuickAdd } from "../utils/dateParser";

export interface TodoMutationSuccess<T> {
  ok: true;
  value: T;
}

export interface TodoMutationFailure {
  ok: false;
  message: string;
}

export type TodoMutationResult<T> = TodoMutationSuccess<T> | TodoMutationFailure;

export function buildTodoCreateInput(
  rawTitle: string,
  listId: string | null,
  fallbackDate: string,
): TaskInput | null {
  const parsed = parseQuickAdd(rawTitle);
  if (!parsed.title.trim()) return null;
  const dueDate = parsed.dueDate ?? fallbackDate;
  return {
    title: parsed.title.trim(),
    listId: listId ?? "list-default",
    dueDate,
    dueTime: parsed.dueTime,
    reminderMinutes: parsed.dueTime ? 0 : null,
  };
}

export function nextTaskStatus(task: Task): TaskStatus {
  return task.status === "open" ? "completed" : "open";
}

export function buildTaskDatePatch(date: string | null): Partial<Task> {
  return date
    ? { dueDate: date }
    : { dueDate: null, dueTime: null, reminderMinutes: null };
}

export function buildTaskEditPatch(input: {
  title: string;
  listId: string | null;
  dueDate: string | null;
  dueTime: string | null;
  reminderMinutes: number | null;
  priority: Priority;
}): Partial<Task> {
  const title = input.title.trim();
  const hasDate = Boolean(input.dueDate);
  return {
    title,
    listId: input.listId,
    dueDate: input.dueDate,
    dueTime: hasDate ? input.dueTime : null,
    reminderMinutes: hasDate ? input.reminderMinutes : null,
    priority: input.priority,
  };
}

export function buildReorderPatches(tasks: Task[], sourceId: string, targetId: string): Array<{ id: string; sortOrder: number }> {
  if (sourceId === targetId) return [];
  const sourceIndex = tasks.findIndex((task) => task.id === sourceId);
  const targetIndex = tasks.findIndex((task) => task.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return [];
  const reordered = [...tasks];
  const [source] = reordered.splice(sourceIndex, 1);
  reordered.splice(reordered.findIndex((task) => task.id === targetId), 0, source);
  return reordered
    .map((task, index) => ({ id: task.id, sortOrder: index * 1000 }))
    .filter((patch) => tasks.find((task) => task.id === patch.id)?.sortOrder !== patch.sortOrder);
}

export async function executeTodoMutation<T>(action: () => Promise<T>, fallback: string): Promise<TodoMutationResult<T>> {
  try {
    return { ok: true, value: await action() };
  } catch (error) {
    const detail = error instanceof Error ? error.message.trim() : String(error ?? "").trim();
    return { ok: false, message: detail || fallback };
  }
}
