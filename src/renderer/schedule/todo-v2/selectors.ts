import type { CalendarEvent, List, Priority, SmartView, Task } from "../types";

export type TodoView = SmartView | "list";
export type TodoSort = "list" | "priority" | "time";
export type TodoTaskGroupId = "morning" | "afternoon" | "unscheduled";

export interface TodoTaskGroup {
  id: TodoTaskGroupId;
  label: string;
  tasks: Task[];
}

export interface MonthDay {
  date: string;
  day: number;
  outside: boolean;
}

export function addDateDays(date: string, amount: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function filterTodoTasks(
  tasks: Task[],
  view: TodoView,
  listId: string | null,
  selectedDate: string,
  todayDate: string,
): Task[] {
  switch (view) {
    case "today":
      return tasks.filter((task) => task.status === "open" && task.dueDate === selectedDate);
    case "tomorrow":
      return tasks.filter((task) => task.status === "open" && task.dueDate === addDateDays(todayDate, 1));
    case "planned":
      return tasks.filter((task) => task.status === "open" && task.dueDate !== null);
    case "inbox":
      return tasks.filter((task) => task.status === "open" && (task.listId === null || task.listId === "list-default"));
    case "all":
      return tasks.filter((task) => task.status === "open");
    case "completed":
      return tasks.filter((task) => task.status === "completed");
    case "list":
      return tasks.filter((task) => task.status === "open" && (
        listId === "list-default"
          ? task.listId === "list-default" || task.listId === null
          : task.listId === listId
      ));
  }
}

function priorityWeight(priority: Priority): number {
  return priority === 2 ? 0 : priority === 1 ? 1 : 2;
}

export function sortTodoTasks(tasks: Task[], sort: TodoSort, lists: List[]): Task[] {
  const listOrder = new Map(lists.map((list, index) => [list.id, index]));
  return [...tasks].sort((a, b) => {
    if (sort === "priority") {
      const priorityDifference = priorityWeight(a.priority) - priorityWeight(b.priority);
      if (priorityDifference !== 0) return priorityDifference;
    }
    if (sort === "list") {
      const listDifference = (listOrder.get(a.listId ?? "") ?? 999) - (listOrder.get(b.listId ?? "") ?? 999);
      if (listDifference !== 0) return listDifference;
      return a.sortOrder - b.sortOrder;
    }
    const dateDifference = (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99");
    if (dateDifference !== 0) return dateDifference;
    const timeDifference = (a.dueTime ?? "99:99").localeCompare(b.dueTime ?? "99:99");
    if (timeDifference !== 0) return timeDifference;
    return a.sortOrder - b.sortOrder;
  });
}

export function groupTodoTasks(tasks: Task[]): TodoTaskGroup[] {
  const groups: TodoTaskGroup[] = [
    { id: "morning", label: "上午", tasks: [] },
    { id: "afternoon", label: "下午", tasks: [] },
    { id: "unscheduled", label: "待安排", tasks: [] },
  ];
  for (const task of tasks) {
    if (!task.dueTime) groups[2].tasks.push(task);
    else if (Number(task.dueTime.slice(0, 2)) < 12) groups[0].tasks.push(task);
    else groups[1].tasks.push(task);
  }
  return groups.filter((group) => group.tasks.length > 0);
}

export function scheduleTaskForDate(tasks: Task[], taskId: string, date: string): Task[] {
  return tasks.map((task) => task.id === taskId ? { ...task, dueDate: date, updatedAt: new Date().toISOString() } : task);
}

export function buildMonthDays(cursorDate: string): MonthDay[] {
  const cursor = new Date(`${cursorDate.slice(0, 7)}-01T00:00:00.000Z`);
  const mondayOffset = (cursor.getUTCDay() + 6) % 7;
  const start = new Date(cursor);
  start.setUTCDate(start.getUTCDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const value = new Date(start);
    value.setUTCDate(value.getUTCDate() + index);
    const date = value.toISOString().slice(0, 10);
    return { date, day: value.getUTCDate(), outside: value.getUTCMonth() !== cursor.getUTCMonth() };
  });
}

export function tasksAndEventsForDate(tasks: Task[], events: CalendarEvent[], date: string) {
  return {
    tasks: tasks.filter((task) => task.dueDate === date),
    events: events.filter((event) => event.startAt.slice(0, 10) === date),
  };
}

export function smartViewCounts(tasks: Task[], todayDate: string): Record<SmartView, number> {
  return {
    today: tasks.filter((task) => task.status === "open" && task.dueDate === todayDate).length,
    tomorrow: tasks.filter((task) => task.status === "open" && task.dueDate === addDateDays(todayDate, 1)).length,
    planned: tasks.filter((task) => task.status === "open" && task.dueDate !== null).length,
    inbox: tasks.filter((task) => task.status === "open" && (task.listId === null || task.listId === "list-default")).length,
    all: tasks.filter((task) => task.status === "open").length,
    completed: tasks.filter((task) => task.status === "completed").length,
  };
}
