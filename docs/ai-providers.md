# AI 服务

温新没有自己的服务器，AI 功能使用用户自己的 API Key，从设备直接请求所选的服务商。

## 支持的服务商

| 服务商 | 协议 | 默认接口地址 | 默认模型 |
|---|---|---|---|
| DeepSeek | OpenAI 兼容 | `https://api.deepseek.com` | `deepseek-chat` |
| 通义千问 | OpenAI 兼容 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| Kimi | OpenAI 兼容 | `https://api.moonshot.cn/v1` | `moonshot-v1-32k` |
| 智谱 GLM | OpenAI 兼容 | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| Claude | Anthropic Messages API（官方 JS SDK） | `https://api.anthropic.com` | `claude-opus-5-5` |
| OpenAI | OpenAI 兼容 | `https://api.openai.com/v1` | 需选择 |
| 自定义 | OpenAI 兼容 | 自填 | 自填 |

服务商的模型更新很快，默认模型名可能过时。设置页的「获取列表」会请求服务商的模型列表接口（`/models`）供选择。预置列表在 `src/ai/clients.js` 的 `AI_PRESETS` 中，欢迎提交更新。

## 调用方式

`AIClient.create(cfg)` 返回的函数与 claude.ai Artifact 的 `sample` 接口一致，核心代码不区分服务商：

- 流式输出（`onText` 回调），可随时中止
- 工具调用：AI 助手通过工具读取课程目录、学习统计，并在用户同意后修改进度；一轮对话内自动循环执行工具，最多 16 轮
- 图片输入：模型支持图片时（设置中开启），可以识别书页照片和扫描版 PDF
- 选择模型：点输入框里的模型名，弹出「选择模型」：常用模型带一句话说明（Claude 为 Opus 5.5 / Sonnet 5.5 / Fable 5.2 / Haiku 5.5），服务商返回的其余模型收在「更多模型」里；换模型时按模型名自动判断能否识别图片
- 思考强度：Claude 模型可选 低 / 中 / 高 / 超高 / 最高，请求中写在 `output_config.effort`（Opus 5.5、Haiku 5.5 默认「中」，其它默认「高」）；不支持的模型不发送
- 对话附件：所有 AI 输入框都可以加图片（拍照 / 相册）、视频（均匀截取 6 帧画面）、文件（PDF / Word / 文本，提取文字）和链接（抓取网页正文；App 用原生 HTTP，网页版受跨域限制时只把网址交给模型）。模型不支持图片时，图片和视频画面不会发出，只告诉模型有附件
- JSON 输出：用于整理资料目录等结构化任务

### Claude

使用 [Anthropic 官方 JS SDK](https://github.com/anthropics/anthropic-sdk-typescript) 的浏览器模式（`dangerouslyAllowBrowser: true`：Key 由用户本人填写、只保存在本机，不存在泄露给第三方的问题）。对支持的模型默认开启服务端拒答兜底（`fallbacks: "default"`），工具参数开启流式（`eager_input_streaming`），并在执行前校验参数。SDK 打包为 `www/vendor/anthropic-sdk.js`，只在选择 Claude 时加载。

### OpenAI 兼容接口

请求 `POST {接口地址}/chat/completions`（`stream: true`），解析 SSE 流中的文字与 `tool_calls`。如果服务商不允许 App 内的跨域请求，App 会自动改用原生 HTTP（CapacitorHttp），此时回答一次性显示、没有逐字效果。

## 分析模型（可选）

在「设置 → AI 服务 → 分析模型」中可以给学情分析单独选一个模型：录题识别、盲解答案、判断错因、关联知识点、学情报告和变式题都用它（例如日常对话用便宜的模型，分析用推理更强的模型）。默认「同对话模型」。分析模型不能看图而对话模型能时，录题识别自动用对话模型。

可以用 `scripts/eval-ai.mjs` 在标注测试集上比较不同模型的准确率，见 [tests/eval](../tests/eval/README.md)。

## 图片模型（可选）

在「设置 → AI 服务 → 图片模型」中配置，用于给「我的笔记」生成配图。请求 `POST {接口地址}/images/generations`（OpenAI 兼容），返回 `b64_json` 或图片链接均可；图片会压缩后存进本机文件区。

| 服务商 | 接口地址 | 默认模型 |
| --- | --- | --- |
| OpenAI | https://api.openai.com/v1 | gpt-image-1 |
| 智谱 CogView | https://open.bigmodel.cn/api/paas/v4 | cogview-4 |
| 硅基流动 | https://api.siliconflow.cn/v1 | Kwai-Kolors/Kolors（参数名为 image_size） |
| OpenAI 兼容 | 自填（各类转发服务） | 自填 |

设置里的「试画」会真实生成一张图片，按服务商价格计费。

## 我的笔记中的 AI

课程「笔记」页的「我的笔记」分页可以写自己的感悟和总结（文档 `note/<id>`，随完整备份一起导出）。编辑页的 AI 工具：帮我写（根据小节知识点、错题、卡片笔记和学习记录，以第一人称起草感悟 / 总结 / 疑问）、润色、扩写、提炼要点、AI 配图。选中一段文字时只处理选中部分。

## AI 作图

出题、问 AI、AI 助手和笔记 AI 的提示里都附带了作图说明（`src/js/050-ai.js` 的 `VIZ_SPEC`），要求「能用图表达的先画图」：结构、过程、状态变化、算法步骤、对比，用 `plot` / `graph` / `tree` / `cells` / `seq` 代码块画出来，图后只用一两句点出重点，不用字符拼图。模型写成 Mermaid 的流程图、时序图、饼图时也会自动转换显示；回答还在流式输出时，没写完的图显示为「正在画图」。写法见 [课程格式 · 作图](content-format.md#作图)。

## claude.ai 版本

claude.ai 中默认使用内置的 Claude，也可以填写自己的 Key（不提供 Claude 直连选项）；浏览器安全策略可能拦截对外部服务的请求，连不上时请改用内置 Claude 或 App。

## 隐私

- 对话模型和图片模型的 API Key 保存在设备上（不进入备份）：App 中为 Capacitor Preferences（应用私有存储），浏览器中为 localStorage
- 请求只发给你选择的服务商，内容包括你的问题、相关卡片和学习统计摘要
- 温新本身不收集任何数据

计划改进：在 App 中改用系统钥匙串（iOS Keychain / Android Keystore）加密保存 Key。
