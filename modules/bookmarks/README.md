# 大锤书签工作台

本地个人书签工作台。页面按现有标签直接切换视图，使用紧凑卡片墙展示网站和本地入口，并支持把浏览器地址栏、网页链接或 URL 文本拖入当前标签后创建收藏。

## 主要能力

- 标签视图：全部、未分类和用户已有标签直接切换。
- 双密度卡片：默认紧凑模式，可切换为预览模式。
- 拖入收藏：识别 URI、HTML 链接和 URL 文本；重复网址可补入当前标签。
- 多浏览器账号：一个网站可绑定多个 Chrome、Edge 或 QQ 浏览器 Profile 入口。
- 原有能力：网站/本地入口、元数据和预览抓取、手动排序、标签、新增/编辑/删除、导入/导出。
- 双入口：Chrome 新标签页，以及 http://127.0.0.1:4173 在大锤工作台中的内嵌页面。

浏览器登录状态由浏览器 Profile 自己保存。本工具只保存浏览器可执行文件路径、Profile 目录名称和可选 User Data 路径，不保存 Cookie、密码或站点凭据。

## 启动

双击 启动书签页工具.cmd，或在项目目录运行：

~~~powershell
npm start
~~~

服务只监听回环地址 http://127.0.0.1:4173。

## Chrome 新标签页

1. 打开 chrome://extensions/ 并启用开发者模式。
2. 选择“加载已解压的扩展程序”。
3. 选择 E:\Vibecoding\大锤的工作台\modules\bookmarks。
4. 已经加载过时，在扩展卡片上点击刷新即可使用当前代码。

## 浏览器账号入口

在页面右上角打开“浏览器账号”，选择自动检测到的浏览器并填写入口名称和 Profile 目录。Chrome/Edge 常见目录名为 Default、Profile 1、Profile 2。User Data 路径通常留空，仅自定义浏览器数据目录时填写。

随后编辑网站收藏，勾选需要显示的账号入口。卡片会为每个入口显示独立按钮。

## 数据

Workbench 模式下用户数据统一保存在 Electron 用户数据目录，不进入 Git：

~~~text
%APPDATA%\大锤的工作台\data\bookmarks\bookmarks.json
%APPDATA%\大锤的工作台\data\bookmarks\tags.json
%APPDATA%\大锤的工作台\data\bookmarks\browser-profiles.json
%APPDATA%\大锤的工作台\data\bookmarks\previews/
~~~

服务进程每天首次写入前，会把当时的三个 JSON 文件复制到当天备份目录。旧版收藏没有 launchTargets 字段时按空数组兼容，不需要手动迁移。

旧版 E:\Vibecoding\书签页工具\data 和 public\previews 会在首次启动时按文件缺失迁移，原文件保留不删除。
测试可通过 BOOKMARK_DATA_DIR 和 BOOKMARK_PREVIEW_DIR 指向隔离目录，不触碰正式数据。

## 开发验证

~~~powershell
npm run check
npm test
~~~

npm test 会启动回环测试服务并使用临时数据目录，结束后关闭测试进程。
