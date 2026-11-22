// 构建脚本：同一份源码生成两个目标
//   app       Capacitor App / 普通浏览器使用的 www/ 目录（依赖全部本地化，可离线）
//   artifact  可发布到 claude.ai Artifact 的单文件网页（dist/artifact/，使用 claude.ai 提供的存储与 AI）
// 用法：node scripts/build.mjs [app|artifact|all]
// 课程内容：编译 content/ 下的课程；环境变量 RENEW_CONTENT 可以追加其他目录（用系统路径分隔符分隔），
//          例如把私有课程放在仓库外：RENEW_CONTENT=../my-courses npm run build
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build as esbuild } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'build', 'data');
const target = process.argv[2] || 'all';
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const r = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const w = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const cp = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
const copyData = to => { for (const f of fs.readdirSync(DATA)) cp(path.join(DATA, f), path.join(to, f)); };

function buildContent() {
  const dirs = [path.join(ROOT, 'content'), ...(process.env.RENEW_CONTENT || '').split(path.delimiter).filter(Boolean).map(d => path.resolve(d))];
  const py = process.platform === 'win32' ? 'python' : 'python3';
  process.stdout.write(execFileSync(py, [path.join(ROOT, 'scripts/build_content.py'), DATA, ...dirs], { encoding: 'utf8' }));
}

const coreFiles = fs.readdirSync(path.join(ROOT, 'src/js')).filter(f => f.endsWith('.js')).sort();
const css = r('src/css/app.css'), body = r('src/body.html').trim();
// 平台文件在核心之前；late 文件（依赖核心定义的界面函数）插在启动模块之前
function script(platformFiles, lateFiles = []) {
  const parts = ['"use strict";', ...platformFiles.map(r)];
  for (const f of coreFiles) { if (f.endsWith('-boot.js')) parts.push(...lateFiles.map(r)); parts.push(r('src/js/' + f)); }
  const b64 = f => 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'resources', f)).toString('base64');
  const brand = b64('brand-mark.png'), brandDark = b64('brand-mark-dark.png');
  return parts.join('\n').replaceAll('__VERSION__', pkg.version).replaceAll('__BRAND_MARK_DARK__', brandDark).replaceAll('__BRAND_MARK__', brand);
}

function buildArtifact() {
  const js = script(['src/platform/common.js', 'src/platform/claude.js', 'src/ai/clients.js', 'src/ai/image.js'], ['src/ai/settings.js']);
  const html = `<title>温新</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap">
<style>
${css}</style>

${body}

<script src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js"></script>
<script>
${js}</script>
`;
  const OUT = path.join(ROOT, 'dist/artifact');
  fs.rmSync(OUT, { recursive: true, force: true });
  w(path.join(OUT, 'index.html'), html); copyData(path.join(OUT, 'data'));
  console.log(`artifact: ${(html.length / 1024).toFixed(0)} KB -> dist/artifact/`);
}

async function buildApp() {
  const WWW = path.join(ROOT, 'www');
  fs.rmSync(WWW, { recursive: true, force: true });
  const js = script(['src/platform/common.js', 'src/ai/clients.js', 'src/ai/image.js', 'src/platform/device.js'], ['src/ai/settings.js']);
  w(path.join(WWW, 'app.js'), js);
  w(path.join(WWW, 'app.css'), css);
  w(path.join(WWW, 'index.html'), `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="format-detection" content="telephone=no">
<meta name="theme-color" content="#f2f2f7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<title>温新</title>
<link rel="icon" type="image/png" href="favicon-64.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="stylesheet" href="app.css">
</head>
<body>
${body}
<script src="vendor/katex.min.js"></script>
<script src="app.js"></script>
</body>
</html>
`);
  const NM = path.join(ROOT, 'node_modules');
  cp(path.join(NM, 'katex/dist/katex.min.js'), path.join(WWW, 'vendor/katex.min.js'));
  cp(path.join(NM, 'pdfjs-dist/build/pdf.min.js'), path.join(WWW, 'vendor/pdf.min.js'));
  cp(path.join(NM, 'pdfjs-dist/build/pdf.worker.min.js'), path.join(WWW, 'vendor/pdf.worker.min.js'));
  cp(path.join(NM, 'mammoth/mammoth.browser.min.js'), path.join(WWW, 'vendor/mammoth.browser.min.js'));
  await esbuild({ entryPoints: [path.join(ROOT, 'src/sdk-entry.mjs')], bundle: true, minify: true, format: 'iife', platform: 'browser', target: ['es2020', 'safari15'], outfile: path.join(WWW, 'vendor/anthropic-sdk.js'), logLevel: 'warning' });
  copyData(path.join(WWW, 'data'));
  for (const f of fs.readdirSync(path.join(ROOT, 'resources/web'))) cp(path.join(ROOT, 'resources/web', f), path.join(WWW, f)); // 图标由 scripts/make_icons.py 生成
  const size = d => fs.readdirSync(d, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
  console.log(`app: www/ ${(size(WWW) / 1048576).toFixed(1)} MB (app.js ${(js.length / 1024).toFixed(0)} KB)`);
}

buildContent();
if (target === 'artifact' || target === 'all') buildArtifact();
if (target === 'app' || target === 'all') await buildApp();
