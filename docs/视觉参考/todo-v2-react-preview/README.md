# 待办页 V2 · React 候选预览

## 核心候选

- `src/renderer/schedule/todo-v2/TodoSceneV2.tsx`
- `src/renderer/schedule/todo-v2/TodoSceneV2.css`
- `src/renderer/schedule/todo-v2/selectors.ts`

核心组件只接收现有 `Task`、`List`、`CalendarEvent`、`Subtask` 类型及回调，不导入 fixture、Store 或 API。`fixture.ts` 与 `preview.tsx` 只服务本目录的隔离预览，所有交互都停留在内存中。

## 现有能力映射

- 快速新增、完成、更新、删除：映射 Store 的 `quickAdd/addTask`、`toggleTask`、`updateTask`、`deleteTask`。
- 智能视图和清单：映射现有 `SmartView`、`List` 与 `filterTasksByView` 等价能力。
- 日期排期：点击任务日历按钮进入受控排期态，点击右侧日期写入 `Task.dueDate` 后退出。
- 优先级、提醒、移动清单：分别写入 `priority`、`reminderMinutes`、`listId`。
- 子任务：候选接受现有 `Subtask[]` 与管理入口回调，不改变子任务表结构。
- 日期摘要：任务使用 `dueDate/dueTime`，日程使用 `CalendarEvent.startAt/endAt`。

## 正式接入缺口

- 正式容器需要批量加载当前可见任务的子任务，或增加轻量计数接口；当前 Store 只提供按任务操作方法。
- 拖拽排序需要把候选的 `onReorderTask` 接到现有排序持久化路径。
- 点击任务主体需要复用现有编辑弹层；候选只暴露 `onEditTask`。
- 周/日视图候选已具备真实日期切换外观，正式接入时继续复用当前 CalendarView 的完整周/日业务能力。

下一阶段最小生产入口仅为 `src/renderer/schedule/App.tsx`：新增一个薄 Container 把现有 Store/API 状态适配到本候选组件，再替换 todo 分支；本轮没有修改正式路由。
