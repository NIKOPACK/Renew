# 架构说明

温新是一个不依赖打包器的原生 JavaScript 单页应用，用 [Capacitor](https://capacitorjs.com) 打包成 Android / iOS App。所有逻辑（复习调度、进度规划、内容解析、AI 调用）都在设备上运行，没有服务器。

## 目录

```
content/              课程源文本（示例课程）
scripts/
  build.mjs           构建脚本
  build_content.py    课程编译器：*.txt → build/data/*.json
src/
  body.html           页面骨架
  css/app.css         全部样式（浅色 / 深色 / 护眼主题、动效）
  js/NNN-*.js         核心代码，按文件名顺序拼接成一个脚本
  platform/           平台适配层
  ai/                 自带 Key 的 AI 客户端与设置界面
  sdk-entry.mjs       Anthropic SDK 的浏览器打包入口
tests/e2e.mjs         端到端测试（Playwright）
android/  ios/        Capacitor 原生工程
```

## 构建目标

`scripts/build.mjs` 用同一份源码生成两个目标：

| 目标 | 输出 | 平台文件 | 说明 |
|---|---|---|---|
| `app` | `www/` | `platform/device.js` + `ai/*` | Capacitor App 和普通浏览器；第三方库复制到 `www/vendor/`，完全离线可用 |
| `artifact` | `dist/artifact/` | `platform/claude.js` | 单个 HTML 文件，可发布为 [claude.ai](https://claude.ai) Artifact，使用其提供的云端存储与 Claude |

拼接顺序：`platform/common.js` → 平台文件 → `src/js/*.js`（启动模块 `165-boot.js` 之前插入 `ai/settings.js`）。所有文件在同一个脚本作用域里，函数声明全局可见。

## 核心模块（`src/js/`）

| 模块 | 职责 |
|---|---|
| `000-util` | DOM、图标、日期等工具 |
| `005-store` | 文档存储：内存中的 `Store.docs`，经 `Platform` 持久化，可选云端同步与合并 |
| `010-state` / `015-content` | 用户状态与课程加载（内置课程 + 用户自建课程 + AI 生成内容） |
| `020-fsrs` | FSRS v4.5 调度 |
| `025-derive` | 小节状态、进度、到期与错题等派生数据 |
| `030-markdown` / `035-dsl` | 精简 Markdown 渲染（公式、表格、提示块、示意图）与卡片文本解析 |
| `045-sheets` / `055-motion` | 底部弹层、页面转场、手势与动效 |
| `060-nav` 起 | 各页面：今日、课程、小节、学习会话（信息流）、复习、资料、AI、设置 |
| `112-reminder` | 每日复习提醒（只在支持通知的平台出现） |
| `155-assistant` / `160-chat-ui` | AI 助手：对话界面与工具调用（查看目录、标记进度等，修改数据前需要用户确认） |
| `165-boot` | 启动 |

## 平台适配层

核心代码不直接访问任何平台能力，统一通过全局对象 `Platform`（接口说明见 `src/platform/common.js` 开头）：

| 接口 | App（Capacitor） | 普通浏览器 | claude.ai |
|---|---|---|---|
| `loadDocs` / `writeDoc` / `dropDoc` | Filesystem：`docs/<路径>.json`，先写临时文件再改名 | localStorage | localStorage 缓存 + 云端 db |
| `cloudDb` / `cloudFiles` | — | — | claude.ai 的 db / assets |
| `blobs` | Filesystem：`blobs/` | IndexedDB | IndexedDB |
| `ai()` | 自带 Key 的客户端 | 自带 Key 的客户端 | claude.ai 的 Claude |
| `save(name, blob)` | 写入缓存目录后调起系统分享 | 浏览器下载 | claude.ai 下载 |
| `haptic` / `notify` / `onTheme` | Haptics / LocalNotifications / StatusBar | 网页震动 / — / — | 网页震动 / — / — |

Capacitor 插件通过运行时注入的 `window.Capacitor.Plugins` 访问，因此不需要打包器。Android 返回键、App 切到后台时保存数据、重排提醒等也在 `platform/device.js` 中处理。

如果以后要加入账号和云同步，只需实现一个 `cloudDb()`（提供 `doc(path).get/set/delete` 与 `collection(name).get()`），`Store` 现有的按时间戳合并逻辑可以直接复用。

## 数据

用户数据是一组 JSON 文档，路径相同、跨平台通用（完整备份即这组文档）：

| 路径 | 内容 |
|---|---|
| `app/state` | 学习计划、小节状态、每日统计、打卡、收藏、隐藏、操作日志 |
| `app/prefs` | 排版、主题、动效、触感、提醒 |
| `srs/<课程id>` | 每张卡片的 FSRS 状态 |
| `sec/<小节id>` | AI 生成或导入的卡片，以及对内置卡片的修正 |
| `course/<课程id>` | 用户自建课程的目录 |
| `mat/<资料id>` | 资料库条目（原文件、逐页文字、照片的引用） |
| `job/<任务id>` | AI 整理资料的任务进度 |

AI 对话记录和少量界面状态存在 localStorage；AI 服务配置在 App 中存于 Capacitor Preferences。
