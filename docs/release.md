# 发布

## 版本号

- 版本号写在 `package.json` 的 `version`，显示在设置页底部
- Android 的 `versionName` / `versionCode` 可以用环境变量 `RENEW_VERSION_NAME` / `RENEW_VERSION_CODE` 传入，未设置时使用 `android/app/build.gradle` 中的默认值
- 发布时推送形如 `v0.2.0` 的标签，GitHub Actions 会自动构建并创建 Release

## 自动构建（GitHub Actions）

| 工作流 | 触发 | 内容 |
|---|---|---|
| `ci.yml` | 推送到 `main`、Pull Request | 安装依赖 → 端到端测试 → 构建 Android 调试包（作为构建产物上传） |
| `release.yml` | 推送 `v*` 标签 | 测试 → 构建 Android 安装包 → 创建 GitHub Release 并附上安装包 |

### Android 签名

不配置签名时，Release 附带的是调试签名的安装包（可以安装，但不能上架应用商店，也不能覆盖安装其他签名的版本）。

配置正式签名：

1. 生成上传密钥（只需一次，**务必备份，丢失后无法更新已发布的 App**）：
   ```bash
   keytool -genkeypair -v -keystore renew-release.jks -alias renew -keyalg RSA -keysize 4096 -validity 10000
   ```
2. 在仓库 Settings → Secrets and variables → Actions 中添加：
   - `ANDROID_KEYSTORE_BASE64`：`base64 -w0 renew-release.jks` 的输出
   - `ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`
3. 之后的 Release 会附带正式签名的 APK 和 AAB（用于 Google Play）

本地签名构建：设置 `RENEW_KEYSTORE`（密钥文件路径）、`RENEW_KEYSTORE_PASSWORD`、`RENEW_KEY_ALIAS`、`RENEW_KEY_PASSWORD` 后运行 `cd android && ./gradlew assembleRelease bundleRelease`。

## iOS

需要 macOS、Xcode 和 Apple 开发者账号：

```bash
npm run ios
```

在 Xcode 中选择开发者团队，运行到真机或 Archive 后上传 TestFlight。

## 发布前检查

- [ ] `npm test` 全部通过，真机上走一遍：学习、复习、导入资料、AI 对话、提醒、导出备份
- [ ] 更新 `package.json` 版本号与更新说明
- [ ] 应用图标与启动图（`npx @capacitor/assets generate`，需要 1024×1024 源图）
- [ ] 应用商店：隐私政策（温新不收集数据；AI 请求直接发往用户选择的服务商）、数据安全问卷
- [ ] 国内应用商店：ICP 备案、软件著作权等材料
