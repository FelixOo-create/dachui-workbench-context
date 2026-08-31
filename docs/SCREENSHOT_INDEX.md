# 界面与交互截图索引

本快照包含 69 张 PNG/JPG/WebP 图片，合计约 12.74MB。所有图片都保留在 `docs/视觉参考` 和 `docs/视觉基线`，但用途不同。

## 当前真实页面

目录：`docs/视觉参考/全界面统一-审计/`

- `final-overview.png`：当前多场景总览。
- `final-today.png`：今日首页。
- `final-todo.png`：待办页面。
- `final-timelog.png`：时间统计/专注页面的阶段状态。
- `final-habits.png`：习惯页面。
- `final-memories.png`：纪念册页面。
- `final-tools.png`：工具中心。
- `final-settings.png`：设置页面。

同目录下 `before-*.png` 是统一审计前对照，不应被视为目标效果。

目录 `docs/视觉参考/` 中的 `2026-08-30-v0.5.0-*-实际预览.png` 是版本0.5.0阶段的真实页面记录，用于观察结构演进。

## 首页默认态与编辑态

目录：`docs/视觉参考/home-canvas-v2-prototype/`

- `home-canvas-v2-default-1920x1080.png`：首页默认布局代码原型。
- `home-canvas-v2-edit-settings-1920x1080.png`：首页编辑布局和设置侧栏。

这两张是代码原型，不是当前真实运行截图。天气和“接下来”等内容不能自动视为正式功能。

## 待办交互状态

目录：`docs/视觉参考/todo-v2-react-preview/`

- `todo-v2-default-1920x1080.png`：主要数据状态。
- `todo-v2-menu-1920x1080.png`：任务更多菜单。
- `todo-v2-scheduling-1920x1080.png`：日历排期交互。
- `todo-v2-empty-1920x1080.png`：空状态。
- `todo-v2-responsive-1440x900.png`：较小视口。

这些图片用于确认待办V2的信息结构和交互，不代表最新跨页面外壳已经最终验收。

## 习惯交互状态

目录：`docs/视觉参考/habits-v2-react-preview/`

包含数据态、空状态、新建弹窗、编辑态、图标选择、勾选居中检查，以及1920×1080和1440×900响应式状态。文件名中带 `production` 的图片更接近真实业务接入后的结构。

## 纪念册交互状态

目录：`docs/视觉基线/纪念册/`

- `actual-default.png`：真实默认页面。
- `actual-create.png`：真实新建界面。
- `actual-timeline.png`：真实时间线界面。
- `approved-default.png`、`approved-create.png`、`approved-timeline.png`：批准的视觉方向。
- `actual-shell-memory.png`、`actual-shell-habit.png`：页面外壳对齐证据。

`references/` 记录问题截图和对照基准，不是最终页面。

## 今日专注

目录：`docs/视觉基线/今日专注/`

- `approved-default.png`：批准的主要视觉方向。

当前代码已经接入番茄钟与标签统计，但最新跨页面统一任务尚未完成最终截图验收，因此这张图片应作为方向参考，而不是当前真实交付证明。

## 其他场景原型

目录：`docs/视觉参考/workspace-scenes-v2-prototype/`

包含待办、时间统计、习惯、纪念册、工具和设置的统一壳层原型。它们用于讨论整体设计语言，不能覆盖各业务页更晚的真实实现与视觉基线。

## 给 GPT 的使用规则

1. 优先看真实页面，再看批准方向，最后看历史参考。
2. 生成新方案时明确指出参考的是哪张图、哪一部分。
3. 不从概念图推断不存在的业务功能。
4. 不使用截图中的演示数字作为真实数据要求。
5. 最终实施验收以真实运行截图为准。

