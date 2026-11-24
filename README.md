<p align="center"><img src="docs/images/icon.png" width="112" alt="温新"></p>

<h1 align="center">温新 Renew</h1>

> 温故而知新——像刷帖子一样学习的开源记忆卡片 App。

温新把知识拆成一张张卡片，按信息流的方式一张接一张地刷：知识点卡讲清楚原理，随堂小测马上检验，学完的内容按记忆规律（FSRS 算法）自动安排复习。AI 用你自己的 API Key，帮你出题、讲解、答疑，把教材整理成课程。

**数据只存在你的设备上，没有服务器，没有账号。**

<p>
<img src="docs/images/today.png" width="200" alt="首页学习流">
<img src="docs/images/learn.png" width="200" alt="讲义里的图">
<img src="docs/images/ai-chat.png" width="200" alt="AI 回复带图">
<img src="docs/images/today-dark.png" width="200" alt="笔记（深色）">
</p>

## 功能

- **打开就学**：首页就是今天的学习流，按计划把新内容和到期复习排好，往下刷着学；刷完可以打卡、再学一些
- **刷卡学习**：知识点卡（要点 + 详解；点击或左滑卡片进入整屏详解页，右滑返回）、单选、多选、判断、问答、填空、分步思考题；支持公式（KaTeX）、表格、代码和「打个比方 / 易错 / 怎么考」等提示块
- **内置作图**：函数图像、流程图、状态图、树、数组与链表、协议时序图，都画成跟随主题配色的矢量图，点开可以双指缩放；能用图说明的内容先画图（[写法](docs/content-format.md#作图)）
- **学习流程**：每一节分为「学习 → 练习 → 小结」，答错的题自动进入错题本
- **间隔复习**：FSRS 算法为每张卡片单独安排复习时间，可设置目标记忆保持率和每日上限
- **进度规划**：设置每天新学多少、计划完成日期；在别处学过的章节可以标记为「别处已学」
- **我的笔记**：「笔记」页汇总所有课程的笔记、收藏和书签；讲义有阅读进度和书签
- **AI（自带 Key）**：对话模型支持 DeepSeek、通义千问、Kimi、智谱、Claude、OpenAI 或任意 OpenAI 兼容接口；图片模型支持 OpenAI、智谱 CogView、硅基流动或兼容接口（可选）
  - 就某张卡片提问、生成详解、补充练习题、修正内容；回答里直接画图
  - 输入框和 Claude App 一样：可以加图片、视频、文件、链接，显示当前模型和思考强度，点开即可换模型（参考 Claude App 的「选择模型」），支持语音输入（浏览器支持时）
  - 在课程的「资料」页导入 PDF / Word / 照片 / 文字，整理成带讲解和练习的卡片
  - 对话式助手，可以查看和调整你的学习计划（修改前会征得你同意）
  - 写笔记：根据学习记录起草感悟，润色、扩写、提炼要点，给笔记配图
- **阅读排版**：字号、行距、公式、代码、表格大小都可以调整，适配手机屏幕
- **学习记录**：按天查看学了哪些小节、未来 7 天的复习量、近 30 天趋势和学习日历
- **本机数据**：学习记录、笔记、资料都在设备上；可导出完整备份、课程包、Markdown 笔记、Anki 卡片；重新导入同一门课的课程包时可以直接更新并保留进度
- **App 体验**：每日复习提醒、触感反馈、页面转场与手势（边缘右滑返回、下拉关闭）、深色 / 护眼主题

## 下载

在 [Releases](https://github.com/NIKOPACK/Renew/releases) 下载 Android 安装包。iOS 版需要自行用 Xcode 编译（见下文）。

## 课程内容

仓库自带一门示例课程「学习的科学」（`content/learn.txt`），介绍记忆规律、高效学习方法和温新的用法。

你可以：

- 在课程的「资料」页导入教材，让 AI 整理成卡片（资料按课程存放）；
- 按 [课程格式](docs/content-format.md) 用纯文本自己写课程，导入或编译进 App；
- 导入别人分享的课程包（`.renew.json`）。

## 开发

需要 Node.js 20+ 和 Python 3。

```bash
npm install
npm run build        # 编译课程内容，构建 App（www/）与网页单文件版（dist/artifact/）
npm run serve        # 在浏览器预览 App：http://localhost:8780
npm test             # 端到端测试（首次需要 npx playwright install chromium）
```

打包手机 App（[Capacitor](https://capacitorjs.com)）：

```bash
npm run android      # 构建并用 Android Studio 打开（或 cd android && ./gradlew assembleDebug）
npm run ios          # 构建并用 Xcode 打开（需要 macOS）
```

把私有课程放在仓库外并一起编译：`RENEW_CONTENT=../my-courses npm run build`。

更多文档：

- [架构说明](docs/architecture.md)：源码结构、平台适配层、数据存储、界面原则
- [课程格式](docs/content-format.md)：卡片文本格式、作图写法与课程包格式
- [AI 服务](docs/ai-providers.md)：对话模型与图片模型、AI 作图、接口协议与隐私
- [发布](docs/release.md)：版本号、签名与自动发布

## 参与贡献

欢迎提交 Issue 和 Pull Request，详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[MIT](LICENSE)

使用的开源组件：[Capacitor](https://capacitorjs.com)（MIT）、[KaTeX](https://katex.org)（MIT）、[pdf.js](https://mozilla.github.io/pdf.js/)（Apache-2.0）、[mammoth.js](https://github.com/mwilliamson/mammoth.js)（BSD-2-Clause）、[Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript)（MIT）、[Phosphor Icons](https://phosphoricons.com)（MIT）。

---

## English

**Renew** is an open-source, feed-style flashcard app: scroll through knowledge cards and quizzes like a social feed, with FSRS spaced repetition, built-in vector diagrams (function plots, flowcharts, trees, arrays and linked lists, sequence diagrams) that both course content and the AI can draw, personal notes, bring-your-own-key AI (DeepSeek, Qwen, Kimi, GLM, Claude, OpenAI or any OpenAI-compatible endpoint, plus optional image models), and all data stored locally on your device. Built with plain JavaScript and [Capacitor](https://capacitorjs.com) for Android and iOS. The UI is currently in Chinese. Licensed under MIT.
