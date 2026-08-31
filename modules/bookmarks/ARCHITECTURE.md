# 书签页工具架构

## 分层

| 层 | 入口 | 职责 |
|---|---|---|
| Chrome MV3 | manifest.json | 将 public/index.html 注册为新标签页 |
| Web UI | public/index.html、app.js、styles.css | 标签视图、卡片墙、拖入收藏、Profile 配置和打开 |
| 本地服务 | server.js | 静态托管、收藏/标签/Profile API、预览任务和本地启动 |
| 用户数据 | Electron userData\\data\\bookmarks | 收藏、标签、浏览器入口和预览 |

大锤工作台直接管理本模块源码，并通过 Registry 地址 http://127.0.0.1:4173 内嵌同一 Web UI。

## 核心数据

书签保持旧字段兼容，v0.5 新增可选 launchTargets 数组，每项只保存 id、profileId 和可选 label。浏览器入口保存在 data/browser-profiles.json，包含名称、浏览器类型、可执行文件路径、Profile 目录和可选 User Data 目录。

Profile 配置不包含 Cookie、密码或浏览器数据库内容。

## API

- GET /api/health
- GET/POST/PUT/DELETE /api/bookmarks
- POST /api/bookmarks/:id/open-target
- GET/POST/PUT/DELETE /api/tags
- GET/PUT /api/browser-profiles
- GET /api/export
- POST /api/import
- /api/previews/*

## 安全边界

- 服务默认绑定 127.0.0.1，可用 HOST 覆盖。
- API 只接受无 Origin 的同源/本地请求、当前回环 Origin和 Chrome 扩展 Origin。
- 浏览器启动只允许 chrome.exe、msedge.exe、qqbrowser.exe。
- 启动参数通过 spawn 数组传入，shell:false。
- 本地入口仍由 scripts/open-local.ps1 处理。
- Profile 路径失效不会阻止服务启动，实际打开时返回明确错误。
- 写入前按日备份；测试使用独立数据目录。

## 环境变量

| 变量 | 默认值 | 用途 |
|---|---|---|
| PORT | 4173 | HTTP 端口 |
| HOST | 127.0.0.1 | 监听主机 |
| BOOKMARK_DATA_DIR | ./data | 数据目录 |
| BOOKMARK_PREVIEW_DIR | ./public/previews | 预览目录 |
| PREVIEW_TIMEOUT_MS | 25000 | 单次抓图超时 |
