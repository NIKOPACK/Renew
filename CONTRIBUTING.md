# 参与贡献

感谢你愿意改进温新！

## 报告问题

提交 Issue 时请写明：设备与系统版本（或浏览器）、App 版本（设置页底部）、复现步骤、期望结果和实际结果。涉及 AI 的问题请注明服务商和模型名，**不要贴出你的 API Key**。

## 提交代码

1. Fork 本仓库，从 `main` 新建分支
2. `npm install`，然后 `npm run build && npm run serve` 在浏览器里调试
3. 修改后运行 `npm test`，确保全部通过；新功能请尽量补充测试（`tests/e2e.mjs`）
4. 提交 Pull Request，说明改了什么、为什么改；界面改动请附截图

## 代码约定

- 源码是不经编译的原生 JavaScript，`src/js/` 下的文件按文件名顺序拼接成一个脚本，新模块按编号插入合适的位置
- 核心代码不要直接调用 `window.Capacitor`、`window.claude` 或其他平台接口，统一通过 `Platform`（见 `src/platform/common.js` 开头的接口说明）
- 界面文字使用简体中文，简洁直接；能用图标、数字、进度、颜色表达的不写说明文字（见 [界面原则](docs/architecture.md#界面原则能用图表达的不写字)）
- 课程内容和 AI 提示同样「图优先」：结构、过程、状态变化用内置作图画出来（见 [作图](docs/content-format.md#作图)）
- 动效要尊重系统的「减弱动态效果」设置和设置页里的「界面动效」开关（使用 `Motion.anim` 等封装）
- 不引入需要打包器的依赖；第三方库放在 `www/vendor/`，由 `scripts/build.mjs` 从 `node_modules` 复制

## 贡献课程内容

示例课程之外的课程内容欢迎以单独仓库或课程包的形式发布。如果要向本仓库提交课程，请确保内容为原创或有明确的开源授权，并在 Pull Request 中说明来源与授权。

## 许可

提交到本仓库的代码按 [MIT 许可证](LICENSE) 授权。
