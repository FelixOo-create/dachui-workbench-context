# 大锤的工作台

大锤的工作台是 Windows 本地个人工作中枢。它以一个普通无边框 Electron 窗口铺满目标显示器的 `workArea`，保留 Windows 任务栏；界面模拟桌面，但不绑定 Explorer 桌面层。

## 当前功能

正式版本为 `0.5.1`，包含七个固定场景：

| 快捷键 | 场景 | 主要内容 |
| --- | --- | --- |
| `Ctrl+Alt+1` | 今日 | 常用入口、今日待办、日历和专注组件 |
| `Ctrl+Alt+2` | 待办 | 清单、任务操作与联动日历 |
| `Ctrl+Alt+3` | 时间块 | 时间记录、活动与统计 |
| `Ctrl+Alt+4` | 习惯 | 打卡、连续记录、趋势与热力图 |
| `Ctrl+Alt+5` | 记录册 | 书籍、电影和剧集纪念记录 |
| `Ctrl+Alt+6` | 画布 | 图片、文字与灵感画布 |
| `Ctrl+Alt+7` | 工具 | 本地工具注册、启动、状态与扫描 |

窗口支持目标显示器选择、显示器断开后回退、托盘隐藏/恢复和全局场景快捷键。顶部用于场景导航，底部 Dock 集中提供工具入口、布局、设置和时钟。

## 正式启动

运行根目录的 `启动.bat`。脚本会结束旧的 `DachuiWorkbench.exe`，优先启动完整便携目录中的：

```text
release\DachuiWorkbench-win32-x64\DachuiWorkbench.exe
```

EXE 依赖同目录 Electron 运行时和 `resources`，不要单独移动。正式产物不存在时，启动脚本才回退到 `npm start`。

最新便携 ZIP：

```text
release\DachuiWorkbench-0.5.1-win32-x64.zip
```

## 开发与验证

环境要求：Windows、Node.js 20+。

```powershell
cd "E:\Vibecoding\大锤的工作台"
npm install
npm start
```

仅预览 Renderer：

```powershell
npm run dev:web
```

常规验证与正式打包：

```powershell
npm run typecheck
npm run test
npm run package
```

`npm run package` 会重新构建 `.vite`、便携目录和当前版本 ZIP。仅运行 Web 预览不能替代正式 EXE 的窗口、托盘、显示器和系统交互验收。

## 数据与外部工具边界

- Registry 默认模板位于 `data\tools\*.json`。正式运行时复制到 Electron `userData\data`，后续用户编辑保留在 userData。
- 待办、时间块和习惯数据库位于 `userData\data\schedule\todo-calendar.db`。
- 纪念册数据库与封面位于 `userData\memories`。
- 书签数据位于 `userData\data\bookmarks`；实现固定在本仓库的 `modules\bookmarks`。
- 桌面布局、镜像入口和 Workbench 设置位于 `userData\data` 下的对应目录。
- 外部项目 Check、RedNote工作台、无限画布和 Tooler 仍由各自目录拥有。Workbench 只保存入口配置并负责启动或打开，不移动、吸收或删除其源码和数据。

不应读取、提交或迁移真实数据库内容、日志、密钥和用户隐私数据。

## 进一步阅读

- 工程规则与验证边界：`AGENTS.md`
- 当前 Electron 分层与数据边界：`ARCHITECTURE.md`
- 当前产品和构建快照：`docs\CURRENT_STATE.md`
- 历史阶段记录：`docs\迭代交接\`
