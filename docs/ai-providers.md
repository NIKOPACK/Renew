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
- JSON 输出：用于整理资料目录等结构化任务

### Claude

使用 [Anthropic 官方 JS SDK](https://github.com/anthropics/anthropic-sdk-typescript) 的浏览器模式（`dangerouslyAllowBrowser: true`：Key 由用户本人填写、只保存在本机，不存在泄露给第三方的问题）。对支持的模型默认开启服务端拒答兜底（`fallbacks: "default"`），工具参数开启流式（`eager_input_streaming`），并在执行前校验参数。SDK 打包为 `www/vendor/anthropic-sdk.js`，只在选择 Claude 时加载。

### OpenAI 兼容接口

请求 `POST {接口地址}/chat/completions`（`stream: true`），解析 SSE 流中的文字与 `tool_calls`。如果服务商不允许 App 内的跨域请求，App 会自动改用原生 HTTP（CapacitorHttp），此时回答一次性显示、没有逐字效果。

## 隐私

- API Key 保存在设备上：App 中为 Capacitor Preferences（应用私有存储），浏览器中为 localStorage
- 请求只发给你选择的服务商，内容包括你的问题、相关卡片和学习统计摘要
- 温新本身不收集任何数据

计划改进：在 App 中改用系统钥匙串（iOS Keychain / Android Keystore）加密保存 Key。
