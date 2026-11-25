# 架构说明

温新是一个不依赖打包器的原生 JavaScript 单页应用，用 [Capacitor](https://capacitorjs.com) 打包成 Android / iOS App。所有逻辑（复习调度、进度规划、内容解析、AI 调用）都在设备上运行，没有服务器。

## 目录

```
content/              课程源文本（示例课程）
resources/            图标源图（icon-symbol.png）、界面内品牌标志（brand-mark*.png）与生成的网页图标
scripts/
  build.mjs           构建脚本
  build_content.py    课程编译器：*.txt → build/data/*.json
  make_icons.py       由图标源图生成 Android / iOS / 网页的全部图标、启动图和界面内品牌标志
  make_icon_set.mjs   从 Phosphor Icons 生成界面图标集 src/js/001-icons.js
src/
  body.html           页面骨架
  css/app.css         全部样式（浅色 / 深色 / 护眼主题、动效）
  js/NNN-*.js         核心代码，按文件名顺序拼接成一个脚本
  platform/           平台适配层
  ai/                 自带 Key 的 AI：对话模型客户端（clients.js）、图片模型客户端（image.js）、设置界面（settings.js）
  sdk-entry.mjs       Anthropic SDK 的浏览器打包入口
tests/e2e.mjs         端到端测试（Playwright）
android/  ios/        Capacitor 原生工程
```

## 构建目标

`scripts/build.mjs` 用同一份源码生成两个目标：

| 目标 | 输出 | 平台文件 | 说明 |
|---|---|---|---|
| `app` | `www/` | `platform/device.js` + `ai/*` | Capacitor App 和普通浏览器；第三方库复制到 `www/vendor/`，完全离线可用 |
| `artifact` | `dist/artifact/` | `platform/claude.js` + `ai/*` | 单个 HTML 文件，可发布为 [claude.ai](https://claude.ai) Artifact，使用其提供的云端存储；AI 默认用内置的 Claude，也可以填自己的 Key |

公式由 KaTeX 用 HTML 加自带的数学字体排版（另附隐藏的 MathML 供读屏软件使用），不依赖各浏览器对 MathML 的支持，所以 iOS、Android、桌面显示一致。KaTeX 的样式和 woff2 字体在 App 中打包到 `www/vendor/katex/`，在 claude.ai 单文件版中直接内嵌进页面。

拼接顺序：`platform/common.js` → `ai/clients.js`、`ai/image.js` 与平台文件 → `src/js/*.js`（启动模块 `165-boot.js` 之前插入 `ai/settings.js`）。所有文件在同一个脚本作用域里，函数声明全局可见。

## 核心模块（`src/js/`）

| 模块 | 职责 |
|---|---|
| `000-util` / `001-icons` | DOM、日期等工具；界面图标集（生成文件，勿手改） |
| `005-store` | 文档存储：内存中的 `Store.docs`，经 `Platform` 持久化，可选云端同步与合并 |
| `010-state` / `015-content` | 用户状态与课程加载（内置课程 + 用户自建课程 + AI 生成内容） |
| `020-fsrs` | FSRS v4.5 调度 |
| `025-derive` | 小节状态、进度、到期与错题等派生数据 |
| `030-markdown` / `035-dsl` | 精简 Markdown 渲染（公式、表格、提示块）与卡片文本解析 |
| `032-viz` / `033-vizview` | 内置作图（plot / graph / tree / cells / seq，兼容 Mermaid 流程图与时序图，输出 SVG）与全屏缩放查看器 |
| `045-sheets` / `055-motion` | 底部弹层、页面转场、手势与动效 |
| `050-ai` | AI 调用入口、出题格式与作图说明（`VIZ_SPEC`） |
| `060-nav` | 导航、标签栏（今日 · 课程 · 笔记 · 记录 · AI）、页面渲染 |
| `066-home` | 首页学习流：按计划把新内容和到期复习排成信息流，今日条与「今日」弹层 |
| `087-records` | 学习记录：按天汇总、学习历史 |
| `090-session` | 学习会话（信息流）：出卡、作答、评分、FSRS 调度 |
| `src/ai/models.js` | 选择模型面板：常用模型说明、更多模型、思考强度（effort）、服务与图片模型入口 |
| `058-composer` | 所有 AI 对话共用的输入框：附件（拍照、图片、视频截帧、文件取文字、链接取正文）、模型、语音、发送 |
| `092-detail` | 详解页：点「详解」或在卡片上左滑，从右侧滑入的独立整屏页面；右滑 / 返回键关闭 |
| `112-reminder` | 每日复习提醒（只在支持通知的平台出现） |
| `120-materials` | 资料（按课程存放）：导入、识别文字、AI 整理成课程 |
| `135-notes` / `137-mynotes` | 讲义阅读（进度、书签）；我的笔记与「笔记」标签页，笔记里的 AI 写作和配图 |
| `145-views` | 课程、小节、学习记录、资料、设置等页面 |
| `155-assistant` / `160-chat-ui` | AI 助手：对话界面与工具调用（查看目录、标记进度等，修改数据前需要用户确认） |
| `165-boot` | 启动 |

## 平台适配层

核心代码不直接访问任何平台能力，统一通过全局对象 `Platform`（接口说明见 `src/platform/common.js` 开头）：

| 接口 | App（Capacitor） | 普通浏览器 | claude.ai |
|---|---|---|---|
| `loadDocs` / `writeDoc` / `dropDoc` | Filesystem：`docs/<路径>.json`，先写临时文件再改名 | IndexedDB（自动迁移旧 localStorage 数据，不支持时回退 localStorage） | IndexedDB 缓存 + 云端 db |
| `cloudDb` / `cloudFiles` | — | — | claude.ai 的 db / assets |
| `blobs` | Filesystem：`blobs/` | IndexedDB | IndexedDB |
| `ai()` | 自带 Key 的客户端 | 自带 Key 的客户端 | claude.ai 的 Claude，或自带 Key 的客户端 |
| `aiConfig` / `imgConfig` | 对话模型、图片模型配置（Preferences） | localStorage | localStorage |
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
| `note/<笔记id>` | 我的笔记（标题、Markdown 正文、配图引用、所属课程和小节） |

AI 对话记录和少量界面状态存在 localStorage；对话模型和图片模型的配置在 App 中存于 Capacitor Preferences，不进入备份。笔记配图存在文件区（`blobs`），文档里保存引用，导出完整备份时会一并打包本机笔记配图。

## 界面原则：能用图表达的不写字

- 状态、数量、进度用图标、数字、进度条/环、颜色表达，不写成句子（例：今日条是「图标 + 数字」，小节页用 💡2 ✎5 表示知识点和练习数）。
- 空状态只放图标和一个短标题，不写使用说明。
- 菜单项只写动作名，不加解释性的副标题；按钮是「图标 + 两三个字」。
- 表单标签不重复「（可选）」这类可以从控件看出的信息；输入框提示只写几个字的示例。
- 必要的提醒压缩成图标 + 几个字（例：🔒 仅存本机）。
- 内容同理：结构、过程、状态变化先画图（见 docs/content-format.md「作图」），AI 的提示也按这个要求生成。
- 页面没有顶部导航栏：左上角是悬浮的圆形返回按钮，右上角是悬浮的操作按钮组（参考 Claude App），页面标题写在正文里（`appbar()` 生成悬浮按钮）。
