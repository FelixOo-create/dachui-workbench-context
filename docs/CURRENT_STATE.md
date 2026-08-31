# 大锤的工作台当前状态

更新时间：2026-08-31。本文只保留当前产品、边界、最近验证与下一入口；历史过程按需查看 `docs\迭代交接`。

## 当前产品

- Project / Git Root：`E:\Vibecoding\大锤的工作台`；Workspace Root：`E:\Vibecoding`；当前分支：`main`。
- 当前正式版本为 `0.5.1`。用户入口 `启动.bat` 优先启动 `release\DachuiWorkbench-win32-x64\DachuiWorkbench.exe`；最新便携包为 `release\DachuiWorkbench-0.5.1-win32-x64.zip`。
- 主窗口是普通、不透明、无边框 Electron 窗口，铺满目标显示器 `workArea` 并保留 Windows 任务栏；它不绑定 Explorer 桌面层。
- 固定七场景为今日、待办、时间块、习惯、记录册、画布和工具，支持 `Ctrl+Alt+1～7`。顶部负责场景导航，底部 Dock 集中提供工具、布局、设置和时钟。
- 今日首页保留桌面入口镜像、今日待办、日历和专注组件，并支持显示器级布局、六种布局预设与一次撤销。镜像入口不移动、删除或重命名原始桌面文件。
- 待办 V2、习惯 V2 和纪念册 V2 已连接现有业务数据；时间块和工具中心直接在主内容区渲染。时间块、首页和工具中心是否继续按 V2 标准重做，仍由用户逐页决定。
- 当前视觉为近黑、低饱和炭灰体系，使用少量薄荷绿和暖金状态色。习惯页是页面外壳、标题位置和整体边距基准。

## 数据与项目边界

- Registry 模板位于 `data\tools\*.json`；正式运行时用户编辑保留在 Electron `userData\data`，不反写安装目录。
- 日程数据库固定为 `userData\data\schedule\todo-calendar.db`；纪念册位于 `userData\memories`；书签实现固定在 `modules\bookmarks`，用户数据位于 `userData\data\bookmarks`。
- 不读取或提交真实数据库内容、日志、密钥、用户图片和其他隐私数据；测试使用隔离 fixture 或临时目录。
- 外部项目 Check、RedNote工作台、无限画布和 Tooler 继续由各自目录拥有；Workbench 只提供统一入口，不吸收、移动或删除其源码与数据。
- Taskboard 工作流当前暂停；普通工作使用 Codex 原生协作。
- 当前工作树包含大量跨多轮的已修改、删除和未跟踪成果，全部视为用户成果。不得整体 reset、checkout、stash、clean、暂存或批量格式化。

## 最近验证与正式产物

2026-08-31 最近一次正式复核：

- `npm run typecheck`：通过。
- `npm run test`：21 个测试文件、86 项测试全部通过。
- `git diff --check`：通过，仅有行尾转换提示。
- `npm run package`：通过；正式目录与 ZIP 生成于 2026-08-31 07:48。
- `release\DachuiWorkbench-0.5.1-win32-x64.zip`：149,112,406 bytes，生成于 2026-08-31 07:48:52。

隔离 Web 截图只证明 Renderer 结构可渲染。正式 EXE 下的窗口尺寸、DPI、托盘、显示器恢复和系统交互仍属于独立人工验收，不因 Web 预览或自动测试通过而自动视为完成。

## 下一入口

下一项迭代先读取根 `AGENTS.md` 和用户点名页面的视觉基线、目标源码与相关测试；只有需要核对当前产品或构建快照时再读本文件。每次只选择一个页面，在用户确认预览后连接真实业务，不自动启动全界面重构。
