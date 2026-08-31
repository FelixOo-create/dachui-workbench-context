# 书签页工具 Agent 指南

## 项目边界

- 模块目录：`E:\Vibecoding\大锤的工作台\modules\bookmarks`；Git 根目录为 Workbench 根目录。
- 本项目由本地 Node 服务和 Chrome Manifest V3 新标签页扩展组成，服务仅监听回环地址。
- 默认只读取本文件；需要近期能力或限制时读取 `docs/CURRENT_STATE.md`。README、ARCHITECTURE 和历史记录只在问题需要时读取。
- 不读取或修改 `data/*.json`、日志、`public/previews/`、浏览器 Profile 内容、Cookie、凭据或其他用户数据。

## 关键入口

- 服务：`server.js`，默认 `http://127.0.0.1:4173`。
- 扩展清单：`manifest.json`；页面入口：`public/index.html`。
- Workbench 正式启动：由 Workbench Registry 调用 `scripts\start-bookmarks-service.cmd`。
- 启动链：`scripts/manual-start.ps1` → `scripts/start-bookmarks-launcher.ps1` → `node server.js`。
- 停止入口：`scripts/stop-bookmarks.cmd`。

## 工作规则

- 修改前运行 `git status --short`，保留用户已有改动。
- 涉及数据读写的测试必须通过 `BOOKMARK_DATA_DIR` 与 `BOOKMARK_PREVIEW_DIR` 指向临时目录。
- 不扫描浏览器 Profile；工具只可使用已配置的路径和 Profile 目录名。
- 数据结构新增字段必须向后兼容，不要求用户手工迁移现有收藏。
- Workbench 模式下数据位于 Electron `userData\data\bookmarks`；旧目录仅作为迁移来源和回滚备份。
- 启动验证前记录 Node/4173 基线，只结束本轮明确创建的进程。

## 验证

```powershell
npm run check
npm test
```

涉及启动或本地服务时，按需补充：

```powershell
Invoke-WebRequest -Uri 'http://127.0.0.1:4173/api/health' -UseBasicParsing
```

## 按需读取路由

- 当前能力与已知边界：`docs/CURRENT_STATE.md`。
- 用户启动和使用方式：`README.md`。
- 服务、扩展和数据流：`ARCHITECTURE.md`。
- 具体实现问题：先从 `server.js`、`public/`、`scripts/` 或 `tests/` 中与任务直接相关的入口读取，不默认扫描全项目。
