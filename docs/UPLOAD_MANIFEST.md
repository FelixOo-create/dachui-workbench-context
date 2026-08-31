# GitHub 快照清单

生成日期：2026-08-31  
来源：`E:\Vibecoding\大锤的工作台`  
目标：`FelixOo-create/dachui-workbench-context`  
用途：私有 GPT / Codex 项目上下文快照

## 已包含

- Electron/React/TypeScript 源码：`src/`
- 自动化测试：`tests/`
- 构建与启动脚本：`scripts/`、根目录配置和 `启动.bat`
- 内置书签模块源码：`modules/bookmarks/`
- Registry 模板：`data/tools/`
- 图标资源：`resources/`
- 当前状态、GPT背景说明和截图索引
- `docs/CURRENT_UI/` 中的13张当前页面与关键交互截图
- `docs/视觉参考/` 与 `docs/视觉基线/` 中的69张历史参考图片及相邻原型文件

## 已排除

- 正式项目 `.git/` 及旧提交历史
- `node_modules/`、`.vite/`、缓存和覆盖率
- `release/`、安装包、便携包和构建产物
- `logs/`、`*.log`
- `.env*`、证书、密钥和令牌
- `*.db`、`*.sqlite*`
- `modules/bookmarks/data/` 与书签预览缓存
- 第二轮迭代录屏和其他 MP4/ZIP参考包
- Electron `userData`、AppData和其他用户隐私数据
- 与当前 GPT 上下文无关或会覆盖当前事实的过时交接文档

## 状态说明

正式目录的 Git 分支和工作树未被修改、暂存、提交或清理。该快照使用独立 Git 历史，只表达生成时的当前文件状态。

2026-08-31 纠偏后，README 不再展示 8 月 30 日的旧 `final-overview.png`；当前界面统一从 `docs/CURRENT_UI/README.md` 进入。历史图片继续保留，但不能作为当前实现证据。

生成时验证：

- `npm run typecheck`：通过
- `npm test -- --run`：通过，21个测试文件、89项测试
