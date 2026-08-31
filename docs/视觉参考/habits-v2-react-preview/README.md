# 习惯页 V2 React 候选预览

这是一个不进入生产路由的真实 React/TypeScript 候选页，用于在正式接入前确认习惯场景的视觉、信息密度和交互方向。

- 核心组件：`src/renderer/schedule/habits-v2/HabitsSceneV2.tsx`
- 正式类型：直接接收现有 `Habit[]` 与 `HabitRecord[]`
- 数据隔离：截图和交互只使用 `fixture.ts`，不调用 IPC、不访问数据库或用户数据
- 预览入口：`/docs/视觉参考/habits-v2-react-preview/index.html`
- 状态参数：默认数据态；`?modal=create` 打开新建弹窗；`?state=empty` 显示空状态

正式接入的最小范围是：由现有习惯 store/API 提供 habits、records 和增删改/打卡回调，再在习惯场景路由中挂载组件。接入前不需要修改数据库结构，也不需要保留两套数据源。本候选页目前没有替换现有 `HabitsView`。
