// 端到端测试：在无头 Chromium 中运行 www/（npm test 会先构建）
// 覆盖：学习主流程、自带 Key 的 AI（OpenAI 兼容 + Claude，接口按真实协议模拟）、模拟原生环境下的持久化与返回键、
//       所有卡片在手机宽度下不溢出且公式无错误、深色模式、页面切换不留残影。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WWW = path.join(ROOT, 'www'), SHOTS = path.join(ROOT, 'tests', 'screenshots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
fs.mkdirSync(SHOTS, { recursive: true });

const server = http.createServer((req, res) => {
  const p = path.join(WWW, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  if (!p.startsWith(WWW) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, r));
const URL0 = `http://localhost:${server.address().port}/index.html`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) failed++; };

/* ---------- 模拟 Capacitor：插件状态存 sessionStorage，刷新后仍在 ---------- */
function capMock() {
  const ss = sessionStorage, load = k => JSON.parse(ss.getItem(k) || '{}'), save = (k, v) => ss.setItem(k, JSON.stringify(v));
  const log = (k, v) => { const a = JSON.parse(ss.getItem('log:' + k) || '[]'); a.push(v); ss.setItem('log:' + k, JSON.stringify(a)); };
  const key = (d, p) => d + ':' + p, files = () => load('fs');
  window.Capacitor = {
    isNativePlatform: () => true, getPlatform: () => 'android',
    Plugins: {
      Filesystem: {
        async readdir({ path, directory }) { const pre = key(directory, path) + '/'; const n = Object.keys(files()).filter(k => k.startsWith(pre) && !k.slice(pre.length).includes('/')).map(k => ({ name: k.slice(pre.length) })); if (!n.length && !load('dirs')[key(directory, path)]) throw new Error('no dir'); return { files: n }; },
        async mkdir({ path, directory }) { const d = load('dirs'); d[key(directory, path)] = 1; save('dirs', d); },
        async readFile({ path, directory }) { const f = files()[key(directory, path)]; if (f == null) throw new Error('File does not exist'); return { data: f }; },
        async writeFile({ path, directory, data }) { const f = files(); f[key(directory, path)] = data; save('fs', f); return { uri: 'file:///' + directory + '/' + path }; },
        async rename({ from, to, directory }) { const f = files(); f[key(directory, to)] = f[key(directory, from)]; delete f[key(directory, from)]; save('fs', f); },
        async deleteFile({ path, directory }) { const f = files(); delete f[key(directory, path)]; save('fs', f); }
      },
      Preferences: { async get({ key: k }) { return { value: load('prefs')[k] ?? null }; }, async set({ key: k, value }) { const p = load('prefs'); p[k] = value; save('prefs', p); } },
      Share: { async share(o) { log('share', o.title); return {}; } },
      Haptics: { async impact() { log('haptic', 'impact'); }, async notification(o) { log('haptic', o.type); } },
      LocalNotifications: {
        async checkPermissions() { return { display: 'prompt' }; }, async requestPermissions() { return { display: 'granted' }; },
        async getPending() { return { notifications: load('notif').list || [] }; }, async cancel() { save('notif', { list: [] }); },
        async schedule({ notifications }) { save('notif', { list: notifications.map(n => ({ id: n.id, title: n.title })) }); }
      },
      App: { addListener(ev, fn) { (window.__capL ||= {})[ev] = fn; return { remove() {} }; }, minimizeApp() { log('app', 'minimize'); } },
      StatusBar: { async setStyle(o) { log('statusbar', o.style); } },
      SplashScreen: { async hide() {} }
    }
  };
}

/* ---------- 模拟 AI 服务（按真实流式协议返回） ---------- */
const sse = evs => evs.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n';
const oa = delta => ({ choices: [{ index: 0, delta }] });
const aMsg = (id, blocks, stop) => {
  const ev = [['message_start', { message: { id, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 1 } } }]];
  blocks.forEach((b, i) => {
    if (b.text) { ev.push(['content_block_start', { index: i, content_block: { type: 'text', text: '' } }]); ev.push(['content_block_delta', { index: i, delta: { type: 'text_delta', text: b.text } }]); }
    else { ev.push(['content_block_start', { index: i, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } }]); ev.push(['content_block_delta', { index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input) } }]); }
    ev.push(['content_block_stop', { index: i }]);
  });
  ev.push(['message_delta', { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 5 } }], ['message_stop', {}]);
  return ev.map(([t, d]) => `event: ${t}\ndata: ${JSON.stringify({ type: t, ...d })}\n\n`).join('');
};
async function mockAI(page, reqs) {
  await page.route('https://api.deepseek.com/**', async r => {
    const req = r.request(), body = req.postDataJSON?.() || null; reqs.push({ url: req.url(), body, auth: req.headers().authorization });
    if (req.url().endsWith('/models')) return r.fulfill({ json: { data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }] } });
    const h = { 'content-type': 'text/event-stream' };
    if (body.tools && !body.messages.some(m => m.role === 'tool')) return r.fulfill({ headers: h, body: sse([oa({ content: '我先看看目录。' }), oa({ tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'get_course_outline', arguments: '{"course_' } }] }), oa({ tool_calls: [{ index: 0, function: { arguments: 'id":"learn"}' } }] })]) });
    return r.fulfill({ headers: h, body: sse([oa({ content: '这门课' }), oa({ content: '共 2 章。' })]) });
  });
  await page.route('https://api.anthropic.com/**', async r => {
    const req = r.request(), body = req.postDataJSON?.() || null, hd = req.headers(); reqs.push({ url: req.url(), body, browser: hd['anthropic-dangerous-direct-browser-access'], beta: hd['anthropic-beta'] });
    if (req.url().includes('/v1/models')) return r.fulfill({ json: { data: [{ id: 'claude-opus-5-5', type: 'model', display_name: 'Claude Opus 5.5', created_at: '2026-01-01T00:00:00Z' }], has_more: false, first_id: 'claude-opus-5-5', last_id: 'claude-opus-5-5' } });
    const last = body.messages.at(-1), back = Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result');
    const h = { 'content-type': 'text/event-stream' };
    if (body.tools && !back) return r.fulfill({ headers: h, body: aMsg('m1', [{ text: '我来查一下。' }, { id: 'tu1', name: 'get_weak_points', input: {} }], 'tool_use') });
    return r.fulfill({ headers: h, body: aMsg('m2', [{ text: '暂时没有薄弱点。' }], 'end_turn') });
  });
}

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], colorScheme: opts.dark ? 'dark' : 'light' });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push(m.text()); });
  if (opts.native) await page.addInitScript(capMock);
  await page.goto(URL0); await page.waitForSelector('.stat3', { timeout: 20000 });
  return { page, ctx, errors };
}
const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, n + '.png') });
const run = async (name, fn) => { console.log(name); try { await fn(); } catch (e) { check(false, '异常：' + e.message.split('\n')[0]); } };

await run('学习主流程', async () => {
  const { page, ctx, errors } = await newPage();
  check(await page.evaluate(() => Platform.id) === 'web', '普通浏览器使用 web 平台');
  check(await page.evaluate(() => COURSES.has('learn')), '示例课程已加载');
  await shot(page, 'today');
  await page.click('.tabbar [data-tab="library"]'); await page.waitForTimeout(500); await page.click('[data-course="learn"]'); await page.waitForTimeout(600);
  await page.evaluate(() => go('section', { id: 'learn1s1' })); await page.waitForTimeout(600);
  await page.click('#start'); await page.waitForSelector('.post'); await page.waitForTimeout(500); await shot(page, 'learn');
  await page.locator('.post [data-act="tog"]').first().click(); await page.waitForTimeout(500);
  check(await page.locator('.post .panel.open .pb').count() > 0, '展开详解');
  for (let i = 0; i < 8; i++) { const b = page.locator('.post .rate[data-g="3"]:not(.on)').first(); if (!(await b.count())) break; await b.scrollIntoViewIfNeeded(); await b.click(); await page.waitForTimeout(200); }
  const n = await page.evaluate(() => todayStats().n); check(n > 0, `评分后计入今日新学（${n}）`);
  await page.evaluate(() => document.querySelector('[data-step="practice"]').click()); await page.waitForSelector('.post .opt, .post .tf'); await page.waitForTimeout(400);
  await page.locator('.post .opt').first().click(); await page.waitForTimeout(500);
  check(await page.locator('.post .verdict').count() > 0, '答题后显示对错');
  await page.evaluate(() => document.querySelector('[data-step="summary"]').click()); await page.waitForTimeout(600); await shot(page, 'summary');
  check(await page.locator('.endc h3').count() > 0, '小结页');
  await page.click('[data-close-s]'); await page.waitForTimeout(700);
  check(await page.locator('.navghost').count() === 0, '页面切换后没有残留快照层');
  check(!errors.length, '没有脚本错误' + (errors.length ? '：' + errors.join(' | ') : ''));
  await ctx.close();
});

await run('自带 Key 的 AI（DeepSeek 与 Claude）', async () => {
  const { page, ctx, errors } = await newPage(); const reqs = []; await mockAI(page, reqs);
  await page.click('.tabbar [data-tab="ai"]'); await page.waitForSelector('#ch-setup');
  await page.click('#ch-setup'); await page.waitForSelector('#ai-key');
  await page.fill('#ai-key', 'sk-test'); await page.click('#ai-list'); await page.waitForFunction(() => /找到 2 个模型/.test(document.querySelector('#ai-msg').textContent));
  await page.click('#ai-test'); await page.waitForFunction(() => /连接成功/.test(document.querySelector('#ai-msg').textContent));
  await page.click('#ai-save'); await page.waitForFunction(() => AI.ok);
  await page.fill('#ch-in', '这门课有几章？'); await page.click('#ch-send'); await page.waitForFunction(() => !Chat.busy, null, { timeout: 15000 });
  let m = await page.evaluate(() => { const a = Chat.get().msgs.at(-1); return { text: a.text, tools: (a.parts || []).map(p => p.st) }; });
  check(/共 2 章/.test(m.text) && m.tools.includes('done'), 'DeepSeek：流式输出 + 工具调用 → ' + JSON.stringify(m.text));
  check(reqs.some(x => x.body?.messages?.some(y => y.role === 'tool' && /学习的科学|learn1s1/.test(y.content))), 'DeepSeek：工具结果回传给模型');
  check(reqs.some(x => x.auth === 'Bearer sk-test'), 'DeepSeek：携带用户的 Key');
  await shot(page, 'ai-chat');
  await page.evaluate(() => aiConfigSheet()); await page.waitForSelector('[data-p="claude"]'); await page.click('[data-p="claude"]');
  await page.fill('#ai-key', 'sk-ant-test'); await page.click('#ai-save'); await page.waitForFunction(() => AI.fn?.cfg?.kind === 'anthropic');
  await page.click('#ch-new'); await page.fill('#ch-in', '我哪里薄弱？'); await page.click('#ch-send'); await page.waitForFunction(() => !Chat.busy, null, { timeout: 20000 });
  m = await page.evaluate(() => { const a = Chat.get().msgs.at(-1); return { text: a.text, tools: (a.parts || []).map(p => p.st) }; });
  check(/没有薄弱点/.test(m.text) && m.tools.includes('done'), 'Claude：官方 SDK 流式输出 + 工具调用 → ' + JSON.stringify(m.text));
  const cr = reqs.filter(x => x.url.includes('/v1/messages'));
  check(cr[0]?.browser === 'true' && cr[0]?.body?.fallbacks === 'default' && cr[0]?.body?.tools?.[0]?.eager_input_streaming === true, 'Claude：浏览器直连头、拒答兜底、工具参数流式');
  check(cr.some(x => x.body.messages.at(-1).content?.[0]?.type === 'tool_result'), 'Claude：tool_result 回传');
  check(!errors.length, '没有脚本错误' + (errors.length ? '：' + errors.join(' | ') : ''));
  await ctx.close();
});

await run('模拟原生环境（Capacitor）', async () => {
  const { page, ctx, errors } = await newPage({ native: true });
  check(await page.evaluate(() => Platform.id) === 'app', '识别为 App 平台');
  await page.evaluate(() => go('section', { id: 'learn1s1' })); await page.waitForTimeout(600); await page.click('#start'); await page.waitForSelector('.post .rate');
  await page.locator('.post .rate[data-g="3"]').first().click(); await page.waitForTimeout(300);
  await page.evaluate(() => window.__capL.appStateChange({ isActive: false })); await page.waitForTimeout(800);
  await page.reload(); await page.waitForSelector('.stat3'); await page.waitForTimeout(300);
  check(await page.evaluate(() => todayStats().n) === 1, '学习记录写入文件系统，重启后仍在');
  await page.evaluate(() => go('settings')); await page.waitForSelector('#s-rem'); await page.click('#s-rem'); await page.waitForTimeout(500);
  check((await page.evaluate(() => JSON.parse(sessionStorage.getItem('notif') || '{}').list || [])).length > 0, '开启每日提醒后安排了本地通知');
  await page.evaluate(() => go('library', {}, { tab: true })); await page.waitForTimeout(500); await page.click('[data-course="learn"]'); await page.waitForTimeout(600);
  await page.evaluate(() => window.__capL.backButton()); await page.waitForTimeout(600);
  const v1 = await page.evaluate(() => Nav.stack.map(x => x.view).join('>'));
  await page.evaluate(() => window.__capL.backButton()); await page.waitForTimeout(600);
  await page.evaluate(() => window.__capL.backButton()); await page.waitForTimeout(300);
  check(v1 === 'library' && (await page.evaluate(() => sessionStorage.getItem('log:app')))?.includes('minimize'), 'Android 返回键逐级返回，最后退到后台');
  await page.evaluate(() => exportData()); await page.waitForTimeout(800);
  check((await page.evaluate(() => sessionStorage.getItem('log:share')))?.includes('温新备份'), '导出备份走系统分享');
  check(!errors.length, '没有脚本错误' + (errors.length ? '：' + errors.join(' | ') : ''));
  await ctx.close();
});

await run('所有卡片的排版与公式', async () => {
  const { page, ctx } = await newPage();
  const r = await page.evaluate(() => {
    const bad = [], box = document.createElement('div'); box.style.width = '380px'; box.className = 'feed'; document.body.append(box); let n = 0;
    for (const sec of SECS.values()) {
      const items = secItems(sec); n += items.length;
      box.innerHTML = items.map(it => postHTML({ it, picks: new Set(), rev: new Set(), open: true, sol: true, phase: 'back' })).join('');
      box.querySelectorAll('.post').forEach(p => { if (p.scrollWidth > p.clientWidth + 2) bad.push(sec.id + ' 溢出'); });
      if (box.querySelector('.katex-error')) bad.push(sec.id + ' 公式错误');
    }
    box.remove(); return { n, bad };
  });
  check(r.n > 0 && !r.bad.length, `${r.n} 张卡片在手机宽度下不溢出、公式正常` + (r.bad.length ? '：' + r.bad.join(', ') : ''));
  await ctx.close();
});

await run('课程包导出与导入', async () => {
  const { page, ctx, errors } = await newPage();
  const r = await page.evaluate(() => {
    const prog = id => [...COURSES.get(id).chapters.flatMap(ch => ch.sections)].map(s => { const p = secProg(s); return p.l + '/' + p.p; }).join(',');
    const before = prog('learn'), pack = coursePack(COURSES.get('learn'));
    pack.course.id = 'learncopy'; importPack(pack);
    return { before, after: prog('learncopy'), format: pack.format };
  });
  check(r.format === 'renew-course' && r.before === r.after, `导入后每节的学习/练习划分不变（${r.after}）`);
  check(!errors.length, '没有脚本错误');
  await ctx.close();
});

await run('深色模式', async () => {
  const { page, ctx, errors } = await newPage({ dark: true });
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(/rgb\((\d+), \1, \1\)/.test(bg) && parseInt(bg.slice(4)) < 40, '深色背景 ' + bg);
  await shot(page, 'today-dark');
  check(!errors.length, '没有脚本错误');
  await ctx.close();
});

await browser.close(); server.close();
console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
process.exit(failed ? 1 : 0);
