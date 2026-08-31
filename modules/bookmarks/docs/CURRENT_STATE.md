# 当前状态

更新日期：2026-08-27

## 基线

- 版本：v0.5.0
- 主入口：Workbench Registry -> scripts\start-bookmarks-service.cmd
- 服务：http://127.0.0.1:4173
- 页面：Chrome 新标签页和大锤工作台内嵌共用 public/；Workbench 用户数据位于 Electron userData\data\bookmarks
- 验证：npm run check、npm test

## 当前能力

- 原有网站、本地入口、标签、预览、排序、导入导出保持兼容。
- 标签改为顶部视图切换，不增加首页/收藏/管理等第二套分类。
- 卡片使用紧凑/预览两档固定密度。
- 外部链接拖入当前页面后创建收藏；重复网址可加入当前标签。
- 网站可绑定多个 Chrome、Edge 或 QQ 浏览器 Profile。
- 浏览器 Profile 保持各自登录状态，工具不保存 Cookie 或凭据。
- 服务只监听回环地址，浏览器启动使用受控参数。
- 每日首次写入前自动备份 JSON 数据。

## 已知边界

- 本地服务必须运行，新标签页才能读取和保存收藏。
- 自动预览依赖本机 Chrome 或 Edge。
- Profile 目录名需要与浏览器现有目录一致。
- 当前不提供浏览器 Profile 内容扫描，也不代管登录状态。
- server.js 仍为单文件，后续仅在维护成本实际上升时拆分。
