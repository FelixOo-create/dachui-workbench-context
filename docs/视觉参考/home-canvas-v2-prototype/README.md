# Home Canvas V2 代码预览

纯 HTML/CSS/JavaScript 原型，所有内容均为演示 fixture；未读取真实数据库、桌面文件、Registry、日志或用户数据。直接打开 `index.html`，或使用 `?mode=edit` 查看编辑/设置态。

| 预览元素 | 正式实现方式 | 可行性 / 新增工作 |
| --- | --- | --- |
| 顶部天气、时间、内部场景 | 复用现有 Weather、场景 Registry 与 DesktopShell | 现有能力 |
| 今日待办、日历、番茄钟 | 复用 ScheduleService、FocusTimer 与现有卡片 | 现有能力 |
| 桌面盒子、底部固定入口 | 复用只读桌面镜像、Registry/Runtime、置顶元数据 | 现有能力，小幅扩展分组 UI |
| 显示器、显隐、布局预设 | 复用 `workArea`、layout v4 与每显示器配置 | 现有能力 |
| 天气城市保存 | Renderer → IPC → WeatherService 持久化 | **新增小接口：天气城市保存 IPC** |
| 自由拖拽、缩放、碰撞压缩 | 推荐引入 Gridstack，并由 layout v4 持久化 | **新增能力：真实网格布局引擎** |

玻璃、点阵、阴影和局部状态光均为 Chromium 可复现 CSS；不依赖系统壁纸模糊、AI 生图或截图拼接。参考图中的节点连线、模型生成、协作头像和发布功能没有纳入产品。
