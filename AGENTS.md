# 大锤的工作台项目规则

## 身份与边界

- Project / Git Root：`E:\Vibecoding\大锤的工作台`；Workspace Root：`E:\Vibecoding`。
- Workbench Core 负责 Windows 桌面宿主、七场景、版本化布局、统一视觉、托盘/快捷键、显示器恢复、工具 Registry/Runtime，以及日程、纪念册和书签等自身业务模块。
- 子工具源码仍由各自目录拥有；不移动、重命名、删除或吸收其他项目，也不把外部项目的业务数据迁入 Workbench。
- Taskboard 工作流当前暂停；普通咨询、规划、实施和验收使用 Codex 原生协作，除非用户以后明确恢复 Taskboard。

## 默认上下文路由

- 默认只读本文件、当前任务范围内入口和相关测试。
- 需要当前产品或构建快照时再读 `docs/CURRENT_STATE.md`。
- README、ARCHITECTURE、历史交接和全 Workspace 扫描均按明确证据缺口读取，不是默认上下文。
- 修改前核对 Git 状态并保留既有用户改动；不要整体暂存、回滚、清理未跟踪文件或批量格式化。

## 数据与安全

- 不读取或提交 `.env`、密钥、数据库内容、日志和用户隐私数据。
- Registry 模板位于 `data\tools\*.json`；打包后复制到 Electron `userData\data`，后续用户编辑不得反写安装目录。
- “移除注册”只删除 Workbench 的 Registry 配置，不删除源项目。
- 待办、时间块和习惯使用 Electron `userData\data\schedule\todo-calendar.db`；真实用户数据不读取内容、不迁入 Git，也不得回退为外部项目路径依赖。
- 修改工具启动方式、数据库路径或外部工具路径前先做引用分析；本地 HTTP 健康检查只允许回环地址。
- 不启用 Codex UI 注入，不运行会触发 injector 的脚本。

## 关键入口

- 用户入口：`启动.bat`；正式产物：`release\DachuiWorkbench-win32-x64\DachuiWorkbench.exe`。
- 开发：`npm start`；Web 预览：`npm run dev:web`。
- 主进程入口：`src\main\main.ts`、`src\main\index.ts`；IPC：`src\main\ipc.ts`、`src\main\desktopIpc.ts`、`src\main\memoriesIpc.ts`。
- Registry / Runtime：`src\main\services\registry.ts`、`src\main\services\runtime.ts`。
- Preload：`src\preload\preload.ts`、`src\preload\index.ts`；Renderer：`src\renderer\main.tsx`、`src\renderer\App.tsx`。
- 桌面契约：`src\shared\desktop.ts`、`src\shared\desktopManifest.ts`；宿主：`src\main\services\desktopHost.ts`；壳层：`src\renderer\desktop\DesktopShell.tsx`。

## 验证与交付

- 常规：`npm run typecheck`、`npm run test`。
- 涉及主进程、Registry、Runtime 或发布产物：`npm run package`。
- 涉及桌面层、系统动作或显示器恢复时，先用隔离测试和产物结构验证；未经用户明确授权不启动正式桌面宿主做前台视觉验收。
- Package 后先以 EXE / ZIP 时间戳、启动脚本退出结果、进程基线和项目 smoke 验证真实产物；Renderer 交互优先使用 `npm run dev:web` 与内置浏览器。原生 Electron 独有行为需要 Computer Use 时必须先获得用户明确授权。
- Standard / Milestone 最多写一份高价值结果或交接，不把对话、历史和可搜索代码重复写进多个文档。

## 停止条件

- 操作会影响其他项目源码、真实用户数据、外部路径或签名产物，但边界和回滚条件未确认。
- Registry 删除目标、运行时进程所有权或现有用户改动归属无法验证。
