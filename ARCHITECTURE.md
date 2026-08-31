# 大锤的工作台架构

本文描述当前代码的真实职责边界。它不是历史迭代记录；行为以源码和 `docs/CURRENT_STATE.md` 的最近验证为准。

## 运行链路

用户运行 `启动.bat`。脚本先结束同名 `DachuiWorkbench.exe`，然后打开 `release\DachuiWorkbench-win32-x64\DachuiWorkbench.exe`；没有 release 产物时才回退到 `npm start`。

Electron 生产启动链路为：

```text
src/main/main.ts
  -> src/main/index.ts
  -> app.whenReady()
  -> createWindow()
  -> preload.js + renderer index.html
```

开发模式使用 Vite 开发 URL；打包模式从 `.vite/renderer/main_window/index.html` 加载。主窗口是普通、不透明、无边框 Electron 窗口，由 `DesktopHostController` 设置为目标显示器的 `workArea`，保留任务栏；它不绑定 Explorer 桌面层。显示器消失时回退主屏，非 Windows 环境进入窗口预览模式。

## Main Process

`src/main/main.ts` 只导入 `src/main/index.ts`。后者负责 Electron 生命周期、主窗口和受管子窗口、Tray、全局场景快捷键、窗口安全策略、数据根目录解析和服务组装。`src/main/ipc.ts`、`src/main/desktopIpc.ts` 与 `src/main/memoriesIpc.ts` 注册白名单 IPC，并校验调用者属于当前受管窗口集合。

主进程服务职责：

- `src/main/services/registry.ts`：读取和校验 `data/tools/*.json`，保存工具和 Workbench settings，扫描 Workspace，并约束工具根目录和启动文件不能越界。
- `src/main/services/runtime.ts`：按 Registry 启动、停止、重启、打开工具，执行本地 HTTP 健康检查，维护本次会话的子进程状态和运行日志。
- `src/main/services/embedded.ts`：用 Electron `WebContentsView` 承载已允许的本地 Web 工具，负责显示、调整边界、隐藏和销毁。
- `src/main/services/schedule.ts`：在主进程内提供待办、时间块和习惯的 SQLite schema、迁移与操作；数据库内容不属于本仓库。
- `src/main/services/desktopLayout.ts`：保存版本化场景布局、显示器级布局和最后有效副本。
- `src/main/services/desktopHost.ts`：枚举显示器、选择目标 `workArea`、处理显示器变化和主窗口显示/隐藏。
- `src/main/services/desktopFiles.ts`：镜像用户桌面与公共桌面入口及系统图标，不移动、删除或重命名源文件。
- `src/main/services/focusTimer.ts`：在主进程维护专注计时和结束通知，Renderer 休眠不影响计时。
- `src/main/services/systemActions.ts`：提供只打开回收站入口，以及带短期确认令牌的关机/重启执行边界。
- `src/main/services/memories.ts`：维护纪念册 SQLite 数据库、封面文件与查询写入。
- `src/main/services/weather.ts`：维护当前天气状态；没有可靠配置时不冒充正式数据。

## Preload 与 Renderer

`src/preload/preload.ts` 汇入 `src/preload/index.ts` 与纪念册桥接，通过 `contextBridge` 暴露有限的 `window.workbench` API。Renderer 不直接获得 Node 或 Electron 权限；BrowserWindow 保持 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`，并限制未知窗口打开和页面跳转。

`src/renderer/main.tsx` 挂载 `src/renderer/App.tsx`。默认路由进入 `src/renderer/desktop/DesktopShell.tsx`；带 `workspace` 查询参数的受管子窗口只加载目标模块。`src/renderer/desktop/SceneRenderer.tsx` 将日程、纪念册和工具中心等既有模块直接接入当前主内容区。Renderer 通过 `src/renderer/api.ts` 调用 Preload API；窗口、工具进程和系统动作仍由 Main Process 决定。

## 桌面组件契约

`src/shared/desktop.ts` 定义七场景、首页组件、布局版本、显示器和宿主状态等跨进程契约。`src/shared/desktopManifest.ts` 固定今日、待办、时间块、习惯、记录册、画布、工具七个场景及 `Ctrl+Alt+1～7`，并只为“今日”注册首页卡片。完整业务场景由 `SceneRenderer` 直接渲染，不是每个组件一个 Electron 进程。

布局版本 4 支持显示器级保存、智能填充、二分、三分、四宫格、主次、自由布局和一次撤销。主窗口不透明且不使用点击穿透；桌面文件只生成安全镜像入口。

## Registry 与独立子工具

Registry 默认模板在 `data/tools/*.json`，当前包含书签、Check、RedNote工作台、无限画布和 Tooler 五个入口。每条配置以 Workspace Root 下的相对路径定位独立工具，描述运行类型、启动文件、健康检查、打开方式和显示信息；本地服务和内嵌工具只使用回环地址。

Workbench 不复制、迁移或改写子工具源码，也不把 Taskboard 集成进自身 UI。工具中心的“移除注册”只删除 Workbench Registry 文件；源目录和源工具数据保持不动。

开发模式直接使用仓库 `data`；打包后，主进程把 `resources/data` 的默认模板复制到 Electron `userData/data`，只补齐不存在的文件。用户编辑后的 Registry 属于 userData，不应修改安装目录内的默认数据。

## 数据、路径与安全边界

- Workspace Root 默认是 `E:\Vibecoding`，可在设置中调整为绝对路径。
- Registry 的 `relativePath` 必须留在 Workspace Root 内，启动文件必须留在工具目录内。
- 本地健康检查允许 `127.0.0.1`、`localhost` 和 `[::1]`；外部 URL 需要 HTTPS。
- Embedded 工具只获得页面承载能力，不获得 Node/Electron 权限。
- 日程数据库固定存放在 Electron `userData\data\schedule\todo-calendar.db`，不读取外部项目路径，不迁入源码仓库或发布包。
- 纪念册数据库 `memories.db` 与封面文件位于 Electron `userData\memories`。
- 书签数据与预览位于 Electron `userData\data\bookmarks`，服务实现固定在 `modules\bookmarks`。
- 桌面布局、镜像入口和 Workbench 设置位于 Electron `userData\data` 下的对应目录；灵感画布使用 Chromium userData 内的本地存储。
- `logs`、缓存、`node_modules`、release 构建产物和用户数据不作为源码文档的内容来源；日志只由运行时按需写入。

## 构建与发布

`package.json` 的 `bundle` 分别构建 main、preload 和 renderer 到 `.vite`。`npm run package` 先执行类型检查和测试，再 bundle，最后运行 `scripts/build-portable.ps1`：它复制当前 Electron runtime、`.vite`、默认 `data` 与托盘资源到 `release/DachuiWorkbench-win32-x64`，改名为 `DachuiWorkbench.exe`，并生成当前版本便携 ZIP。

正式验证必须覆盖 `启动.bat` 和 release EXE；仅运行 Vite Web 预览不能替代用户启动链路。
