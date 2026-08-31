# 工作台场景规划 V2

纯 HTML/CSS/JavaScript 预览，统一使用 Home Canvas V2 的石墨黑悬浮画布设计。所有内容均为演示 fixture，没有读取真实待办、日程、习惯、记录册、Registry、日志或文件内容。

直接打开 `index.html?scene=todo`，可用场景：

- `todo`：待办三栏与联动日历
- `timelog`：时间块日视图、时间轴和投入统计
- `habits`：习惯打卡、连续记录和趋势
- `memories`：记录册筛选、封面墙和详情
- `tools`：工具中心、状态和配置入口
- `settings`：工作台设置

所有页面都映射到现有 Electron/React/CSS 能力与现有业务服务。画布仍为延期能力，本轮没有虚构；顶部仅保留内部场景，底部工作条仍是外部工具唯一入口。预览不会修改正式源码、数据、版本或发布产物。
