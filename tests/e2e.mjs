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
  await page.goto(URL0); await page.waitForSelector('.dayband', { timeout: 20000 });
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
  await page.reload(); await page.waitForSelector('.dayband'); await page.waitForTimeout(300);
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
  // 再次导入同一门课的新版本：更新原课程，保留学习进度和笔记
  const u = await page.evaluate(async () => {
    const c = COURSES.get('learncopy'), it = courseSecs(c)[0].items[0]; setSt(it, schedule(null, 3, Date.now())); saveSrs(c.id); (S().notes ||= {})[it.id] = '我的笔记'; saveState();
    const pack = coursePack(c); pack.course.chapters[0].sections[0].items[0].title = '更新后的标题';
    importPack(pack); await new Promise(r => setTimeout(r, 400));
    const btn = [...document.querySelectorAll('.sheet .menu button')].find(b => /更新这门课/.test(b.textContent)); btn.click(); await new Promise(r => setTimeout(r, 400));
    const n = ITEMS.get(it.id);
    return { copies: [...COURSES.values()].filter(x => /学习的科学/.test(x.title)).length, title: n?.title, st: !!getSt(n), note: S().notes[it.id] };
  });
  check(u.copies === 2 && u.title === '更新后的标题' && u.st && u.note === '我的笔记', '重新导入同一门课：可直接更新，学习进度和笔记保留，不会多出一份');
  check(!errors.length, '没有脚本错误');
  await ctx.close();
});

await run('笔记：阅读进度与书签；课程资料页；复习间隔显示', async () => {
  const { page, ctx, errors } = await newPage();
  await page.evaluate(() => go('notes', { course: 'learn' })); await page.waitForSelector('[data-bm]'); await page.waitForTimeout(400);
  const ids = await page.evaluate(() => $$('#view article[data-it]').map(a => a.dataset.it));
  await page.click(`[data-bm="${ids[3]}"]`); await page.waitForTimeout(300);
  check(await page.evaluate(id => bookmarks('learn').some(b => b.it === id), ids[3]), '添加书签');
  await page.click(`[data-bm="${ids[3]}"]`); await page.waitForTimeout(200);
  check(await page.evaluate(() => bookmarks('learn').length) === 0, '再次点击取消书签（不会重复触发）');
  await page.click(`[data-bm="${ids[5]}"]`);
  await page.evaluate(id => document.getElementById('a-' + id).scrollIntoView(), ids[8]); await page.waitForTimeout(1300);
  const saved = await page.evaluate(() => S().reading?.learn?.it);
  check(!!saved, '滚动时记录阅读位置');
  await page.evaluate(() => back()); await page.waitForTimeout(500);
  await page.evaluate(() => go('notes', { course: 'learn' })); await page.waitForTimeout(800);
  const vis = await page.evaluate(id => { const r = document.getElementById('a-' + id).getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 && scrollY > 200; }, saved);
  check(vis, '重新打开时回到上次读到的位置');
  await page.click('#nt-bms'); await page.waitForSelector('.sheet [data-go-it]'); await shot(page, 'bookmarks');
  check(await page.locator('.sheet [data-go-it]').count() === 2, '书签列表：上次读到 + 1 个书签');
  await page.locator('.sheet [data-go-it]').nth(1).click(); await page.waitForTimeout(800);
  check(await page.evaluate(id => Math.abs(document.getElementById('a-' + id).getBoundingClientRect().top - 76) < 40, ids[5]), '点书签跳到对应位置');
  await page.evaluate(() => go('course', { id: 'learn' })); await page.waitForTimeout(600); await page.click('#cmat'); await page.waitForTimeout(600);
  check(await page.evaluate(() => Nav.stack.at(-1).view) === 'cmats' && await page.locator('#view .empty').count() === 1, '课程资料页：没有资料时为空');
  await page.evaluate(() => go('section', { id: 'learn1s2' })); await page.waitForTimeout(500); await page.click('#start'); await page.waitForSelector('.post .rate');
  const labels = await page.evaluate(() => $$('.post .rate small').slice(0, 3).map(x => x.textContent));
  check(labels.every(t => /分钟|天|周|月|年/.test(t)) && !labels.some(t => /小时/.test(t)), '复习间隔按天显示：' + labels.join(' / '));
  await page.evaluate(() => planSheet()); await page.waitForSelector('.pstep'); await page.waitForTimeout(400); await shot(page, 'plan');
  check(!errors.length, '没有脚本错误' + (errors.length ? '：' + errors.join(' | ') : ''));
  await ctx.close();
});

await run('学习记录：按天查看与学习历史', async () => {
  const { page, ctx, errors } = await newPage();
  await page.evaluate(() => go('section', { id: 'learn1s1' })); await page.waitForTimeout(500); await page.click('#start'); await page.waitForSelector('.post .rate');
  await page.locator('.post .rate[data-g="3"]').first().click(); await page.waitForTimeout(300);
  await page.click('[data-close-s]'); await page.waitForTimeout(500); await page.evaluate(() => go('today', {}, { tab: true })); await page.waitForTimeout(600);
  await page.click('#db-open'); await page.waitForSelector('.sheet .week'); await page.click('.sheet .week [data-wday].today'); await page.waitForSelector('.sheet [data-goto-sec]'); await page.waitForTimeout(400); await shot(page, 'day');
  check(await page.evaluate(() => $('.sheet [data-goto-sec]')?.dataset.gotoSec) === 'learn1s1', '今日页点当天：显示学过的小节');
  await page.click('.sheet [data-goto-sec]'); await page.waitForTimeout(700);
  check(await page.evaluate(() => Nav.stack.at(-1).view === 'section' && Nav.stack.at(-1).params.id === 'learn1s1'), '从记录跳到小节继续学习');
  await page.click('.tabbar [data-tab="review"]'); await page.waitForTimeout(600);
  check(await page.evaluate(() => $('.lt h1').textContent === '学习记录' && !!$('.group.hist [data-day]')), '学习记录页：标题与学习历史');
  await shot(page, 'records');
  check(!errors.length, '没有脚本错误' + (errors.length ? '：' + errors.join(' | ') : ''));
  await ctx.close();
});

await run('模型配置（对话 + 图片）与我的笔记', async () => {
  const { page, ctx, errors } = await newPage(); const reqs = [], imgReqs = []; await mockAI(page, reqs);
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.route('https://open.bigmodel.cn/**', r => { const req = r.request(); imgReqs.push({ url: req.url(), body: req.postDataJSON?.(), auth: req.headers().authorization }); return r.fulfill({ json: { data: [{ url: 'https://img.example.com/a.png' }] }, headers: { 'access-control-allow-origin': '*' } }); });
  await page.route('https://img.example.com/**', r => r.fulfill({ body: PNG, headers: { 'content-type': 'image/png', 'access-control-allow-origin': '*' } }));
  await page.evaluate(() => go('settings')); await page.waitForSelector('#s-img');
  check(await page.evaluate(() => !!$('#s-ai') && /对话模型/.test($('#s-ai').textContent) && /图片模型/.test($('#s-img').textContent)), '设置页：对话模型、图片模型两项');
  await page.click('#s-img'); await page.waitForSelector('#im-key');
  await page.click('.imp [data-p="glm"]'); await page.fill('#im-key', 'img-key'); await shot(page, 'img-config');
  await page.click('#im-test'); await page.waitForFunction(() => /生成成功/.test($('#im-msg').textContent), null, { timeout: 10000 });
  check(await page.evaluate(() => $('#im-prev img')?.src.startsWith('blob:')), '图片模型：测试生成并显示预览');
  check(imgReqs[0]?.url.endsWith('/images/generations') && imgReqs[0].body.model === 'cogview-4' && imgReqs[0].auth === 'Bearer img-key', '图片模型：OpenAI 兼容接口 + 用户的 Key');
  await page.click('#im-save'); await page.waitForTimeout(500);
  check(await page.evaluate(() => /智谱 CogView · cogview-4/.test($('#s-img').textContent)), '保存后设置页显示图片模型');
  await page.evaluate(async () => { await Platform.aiConfig.set({ provider: 'deepseek', kind: 'openai', key: 'sk-test', model: 'deepseek-chat', base: 'https://api.deepseek.com' }); await AI.reload(); });

  // 从小节菜单写感悟：AI 帮我写
  await page.evaluate(() => go('section', { id: 'learn1s1' })); await page.waitForTimeout(500);
  await page.click('#smore'); await page.waitForTimeout(300); await page.locator('.sheet .menu button', { hasText: '写本节感悟' }).click();
  await page.waitForSelector('#nd-t', { timeout: 5000 }); await page.waitForTimeout(300);
  await page.fill('#nd-t', '间隔重复比我想的有用'); await page.click('.aiacts [data-a="go"]');
  await page.waitForSelector('.aiacts [data-a="0"]', { timeout: 10000 }); await shot(page, 'note-draft');
  const pr = reqs.filter(x => x.body?.messages).at(-1)?.body.messages.at(-1).content || '';
  check(/间隔重复比我想的有用/.test(pr) && /小节：/.test(pr) && /第一人称/.test(pr), 'AI 帮我写：提示里带上自己的想法和小节内容');
  await page.click('.aiacts [data-a="0"]'); await page.waitForTimeout(500);
  let n = await page.evaluate(() => { const n = Notes.get(Nav.stack.at(-1).params.id); return n && { body: n.body, title: n.title, sec: n.sec, ta: $('#ne-body').value }; });
  check(n && /共 2 章/.test(n.body) && n.ta === n.body && n.title && n.sec === 'learn1s1', 'AI 草稿放进笔记，自动起标题并关联小节');
  await page.click('#ne-body'); await page.keyboard.press('End'); await page.keyboard.type('\n自己补一句。'); await page.waitForTimeout(900);
  check(await page.evaluate(() => /自己补一句/.test(Store.get('note/' + Nav.stack.at(-1).params.id).body)), '输入后自动保存');
  // 润色
  await page.click('[data-tool="polish"]'); await page.waitForSelector('.aiacts [data-a="0"]', { timeout: 10000 });
  await page.click('.aiacts [data-a="0"]'); await page.waitForTimeout(400);
  check(await page.evaluate(() => $('#ne-body').value.trim() === '这门课共 2 章。'), '润色：替换原文');
  // AI 配图
  await page.click('[data-tool="art"]'); await page.waitForSelector('#na-p'); await page.fill('#na-p', '一张卡片在时间轴上反复出现');
  await page.click('#na-acts [data-a="gen"]'); await page.waitForSelector('#na-acts [data-a="ins"]', { timeout: 10000 }); await shot(page, 'note-art');
  check(/卡片在时间轴上/.test(imgReqs.at(-1).body.prompt) && /不要出现任何文字/.test(imgReqs.at(-1).body.prompt), '配图：画面描述 + 风格要求');
  await page.click('#na-acts [data-a="ins"]'); await page.waitForTimeout(900);
  n = await page.evaluate(async () => { const n = Notes.get(Nav.stack.at(-1).params.id), k = Object.keys(n.imgs)[0]; const b = k && await Files.get(n.imgs[k]); return { k, marker: new RegExp('\\(img:' + k + '\\)').test(n.body), size: b?.size || 0, thumbs: $$('.nimgs .nth').length }; });
  check(n.k && n.marker && n.size > 0 && n.thumbs === 1, '配图：图片存入本机文件区并插入正文');
  await page.click('#ne-mode'); await page.waitForTimeout(700); await shot(page, 'note-read');
  check(await page.evaluate(() => !!$('.nread .nfig img')?.src.startsWith('blob:') && /这门课共 2 章/.test($('.nread .md').textContent)), '预览：渲染正文和配图');
  // 我的笔记列表
  await page.click('[data-back]'); await page.waitForTimeout(500);
  await page.evaluate(() => go('notes', { course: 'learn', tab: 'mine' })); await page.waitForTimeout(700); await shot(page, 'my-notes');
  check(await page.evaluate(() => $$('.ncard').length === 1 && $('.ntab [data-ntab="mine"]').getAttribute('aria-pressed') === 'true' && !!$('.ncard .nth img')), '课程笔记「我的笔记」：列表、缩略图');
  await page.click('[data-ntab="read"]'); await page.waitForTimeout(400);
  check(await page.evaluate(() => !!$('.doc-kp')), '切回讲义');
  // 新建后不写内容就返回：自动删除
  const before = await page.evaluate(() => Notes.all().length);
  await page.evaluate(() => newNote({ course: 'learn' })); await page.waitForTimeout(500); await page.click('[data-back]'); await page.waitForTimeout(400);
  check(await page.evaluate(() => Notes.all().length) === before, '空笔记返回后自动删除');
  check(await page.evaluate(() => DOC_RE.test('note/x')), '笔记随备份导入导出（note/ 文档）');
  check(!errors.length, '没有脚本错误' + (errors.length ? '：' + errors.join(' | ') : ''));
  await ctx.close();
});

await run('首页学习流、笔记标签页、资料归入课程', async () => {
  const { page, ctx, errors } = await newPage();
  let st = await page.evaluate(() => ({ kind: Feed.params?.kind, q: Feed.queue.length, posts: $$('#feed .post[data-pk]').length, tabs: $$('.tabbar [data-tab]').map(b => b.dataset.tab).join() }));
  check(st.kind === 'daily' && st.q > 0 && st.posts > 0, `首页直接是学习流（${st.q} 个内容）`);
  check(st.tabs === 'today,library,notebook,review,ai', '标签栏：今日 课程 笔记 记录 AI（资料不再单独占一栏）');
  await page.locator('#feed .post .rate[data-g="3"]').first().click(); await page.waitForTimeout(400);
  check(await page.evaluate(() => /^1/.test($('.dayband .db-k b').textContent)), '在首页评分后今日进度立即更新');
  check(await page.evaluate(() => { const it = [...ITEMS.values()].find(i => i.t === 'kp' && getSt(i)), keep = Feed.params; Feed.params = { kind: 'review' }; const el = makePost(it); Feed.params = keep; return !!$('.keypts', el) && !$('[data-act="reveal"]', el) && $$('.rate', el).length === 4; }), '复习知识点：直接显示内容，不需要「回忆后展开」');
  await page.evaluate(() => scrollTo(0, 900)); await page.waitForTimeout(300); const y0 = await page.evaluate(() => scrollY);
  await page.click('.tabbar [data-tab="library"]'); await page.waitForTimeout(500); await page.click('.tabbar [data-tab="today"]'); await page.waitForTimeout(600);
  st = await page.evaluate(() => ({ kind: Feed.params === Daily.pr, rated: $$('#feed .rate.on').length, y: scrollY }));
  check(st.kind && st.rated === 1 && Math.abs(st.y - y0) < 80, `切换标签后回到首页：保留已刷内容和位置（${y0}→${st.y}）`);
  // 刷完今天的内容
  for (let i = 0; i < 40; i++) {
    const done = await page.evaluate(() => !!$('#feed .endc')); if (done) break;
    await page.evaluate(() => { const p = [...Feed.posts.values()].find(p => p.g == null); if (p) rate(p, 3); else moreFeed(); });
    await page.waitForTimeout(60);
  }
  await page.evaluate(() => $('#feed .endc')?.scrollIntoView()); await page.waitForTimeout(500); await shot(page, 'home-end');
  check(await page.evaluate(() => /刷完了/.test($('#feed .endc h3').textContent) && !!$('#feed .endc [data-ck]')), '刷完后：完成卡片 + 打卡');
  const more = await page.evaluate(() => !!$('#feed .endc [data-more]'));
  if (more) { const q0 = await page.evaluate(() => Feed.queue.length); await page.click('#feed .endc [data-more]'); await page.waitForTimeout(400); check(await page.evaluate(q => Feed.queue.length > q && !!$('#feed .post .rate:not(.on)'), q0), '「再学一些」接着往下刷'); }
  await page.evaluate(() => scrollTo(0, 0)); await page.click('#db-open'); await page.waitForSelector('.sheet .stat3');
  check(await page.evaluate(() => $$('.sheet .group .rowi').length >= 2 && !!$('.sheet .week')), '今日条：点开是任务清单、打卡和本周');
  await page.click('.sheet [data-close]'); await page.waitForTimeout(400);
  // 笔记标签页
  await page.evaluate(() => { const n = Notes.create({ course: 'learn', sec: 'learn1s1', title: '遗忘曲线的启发', body: '复习要趁早。' }); });
  await page.click('.tabbar [data-tab="notebook"]'); await page.waitForTimeout(600); await shot(page, 'notebook');
  check(await page.evaluate(() => $('.lt h1').textContent === '笔记' && $$('.nb3 button').length === 3 && /遗忘曲线的启发/.test($('.ncard').textContent) && /学习的科学/.test($('.ncard .m').textContent)), '笔记页：快捷入口 + 所有课程的笔记（标出课程）');
  await page.click('.ncard'); await page.waitForTimeout(500);
  check(await page.evaluate(() => Nav.stack.at(-1).view === 'note' && Nav.tab === 'notebook'), '从笔记页打开笔记');
  // 资料归入课程
  await page.evaluate(() => go('cmats', { id: 'learn' })); await page.waitForTimeout(500);
  await page.setInputFiles('#view [data-f]', { name: '第一章讲义.txt', mimeType: 'text/plain', buffer: Buffer.from('遗忘曲线讲义。'.repeat(40)) });
  await page.waitForFunction(() => Nav.stack.at(-1).view === 'material', null, { timeout: 8000 }); await page.waitForTimeout(400); await shot(page, 'material-in-course');
  const m = await page.evaluate(() => { const m = MATS.get(Nav.stack.at(-1).params.id); return { course: m.course, btn: $('#mm-in')?.textContent }; });
  check(m.course === 'learn' && /整理进「学习的科学」/.test(m.btn), '在课程资料页导入：资料直接归到这门课，下一步「整理进本课程」');
  await page.evaluate(() => go('materials')); await page.waitForTimeout(500);
  check(await page.evaluate(() => $('.gh b')?.textContent === '学习的科学' && !!$('[data-back]')), '全部资料按课程分组');
  check(!errors.length, '没有脚本错误' + (errors.length ? '：' + errors.join(' | ') : ''));
  await ctx.close();
});

await run('内置作图：函数图像、流程图、树、格子、时序图', async () => {
  const { page, ctx, errors } = await newPage();
  const r = await page.evaluate(() => {
    const F = '```', one = (lang, src) => { const el = h(`<div>${md(F + lang + '\n' + src + '\n' + F)}</div>`); return { svg: !!$('figure.viz svg.vz', el), err: $('p.small', el)?.textContent || '', html: el.innerHTML }; };
    return {
      plot: one('plot', 'x 0..10 天\ny 0..100 记住\nf 100*exp(-x/2) | 不复习\nf 100*exp(-(x-3)/6) @3..10\np (1,10) (2,20) 数据\nh 50 阈值\nv 3 复习'),
      bar: one('plot', 'bar O(1):1 | O(n):8 | O(n²):64'),
      graph: one('graph', 'A(开始) -> B{判断?}\nB -> C[是] : 是\nB -> D[否] : 否\nD -> A'),
      ugraph: one('graph', 'A -- B : 4\nB -- C : 1\nC -- A : 2'),
      tree: one('tree', 'A\n  B\n    -\n    D *\n  <1> C'),
      cells: one('cells', 'list: 1 | 2 | NULL\nptr: 0=p\narr[位]: OP@4 | A@12 >> 16 位\nidx: auto\ncol: 返回地址 => [ebp+4] | 旧 ebp\narr: ~ | a'),
      seq: one('seq', '甲 -> 乙 : SYN\n--- 建立 ---\n乙 --> 甲 : ACK\nnote 甲 : 完成'),
      bad: one('plot', 'f exp(\nx 0..1'),
      safe: one('plot', 'f alert(1)\nx 0..1'),
      learn: (() => { const it = [...ITEMS.values()].find(i => /遗忘曲线/.test(i.title || '') && i.d); return !!it && /```plot/.test(it.d) && !!$('figure.viz svg.vz', h(`<div>${md(it.d)}</div>`)); })()
    };
  });
  check(r.plot.svg && /<path d="M/.test(r.plot.html) && /不复习/.test(r.plot.html), '函数图像：曲线、分段函数、数据点、参考线');
  check(r.bar.svg && (r.bar.html.match(/<rect/g) || []).length >= 3, '柱状图');
  check(r.graph.svg && /<path d="M[^"]*L/.test(r.graph.html) && /marker-end/.test(r.graph.html), '流程图：菱形判断、带箭头的边、回边');
  check(r.ugraph.svg && /4/.test(r.ugraph.html), '无向带权图');
  check(r.tree.svg && !/>-</.test(r.tree.html) && /class="vz-node hl"/.test(r.tree.html), '二叉树：空孩子占位不画出、高亮结点');
  check(r.cells.svg && /16 位/.test(r.cells.html) && /\[ebp\+4\]/.test(r.cells.html), '数组、链表、指针、位宽格子、竖排格子');
  check(r.seq.svg && /SYN/.test(r.seq.html) && /建立/.test(r.seq.html), '时序图');
  check(!r.bad.svg && /图示无法绘制/.test(r.bad.err), '写错时显示源文本和错误原因');
  check(!r.safe.svg && /不认识的符号/.test(r.safe.err), '函数表达式不会执行任意代码');
  check(r.learn, '示例课程的遗忘曲线用 plot 画出');
  check(!errors.length, '没有脚本错误' + (errors.length ? '：' + errors.join(' | ') : ''));
  await ctx.close();
});

await run('AI 回复里的图：助手、问 AI、笔记；Mermaid 兼容；放大查看', async () => {
  const { page, ctx, errors } = await newPage(); const reqs = [];
  const F = '```';
  const REPLY = `先看图：\n\n${F}plot\nx 0..10 天\ny 0..100 记住(%)\nf 100*exp(-x/2) | 不复习\n${F}\n\n流程如下：\n\n${F}mermaid\nflowchart LR\n  A[开始] -->|读入| B{x > 0?}\n  B -- 是 --> C[输出正数]\n  B -->|否| D[输出非正数]\n${F}\n\n${F}mermaid\nsequenceDiagram\n  participant C as 客户端\n  participant S as 服务器\n  C->>S: SYN\n  S-->>C: SYN+ACK\n${F}\n\n${F}tree\n45\n  24\n  53\n${F}`;
  const chunks = REPLY.match(/[\s\S]{1,23}/g);
  await page.route('https://api.deepseek.com/**', async r => {
    const req = r.request(), body = req.postDataJSON?.() || null; reqs.push(body);
    return r.fulfill({ headers: { 'content-type': 'text/event-stream' }, body: sse(chunks.map(c => oa({ content: c }))) });
  });
  await page.evaluate(async () => { await Platform.aiConfig.set({ provider: 'deepseek', kind: 'openai', key: 'sk-test', model: 'deepseek-chat', base: 'https://api.deepseek.com' }); await AI.reload(); });
  // AI 助手
  await page.click('.tabbar [data-tab="ai"]'); await page.waitForSelector('#ch-in');
  await page.fill('#ch-in', '画一下遗忘曲线'); await page.click('#ch-send'); await page.waitForFunction(() => !Chat.busy, null, { timeout: 15000 }); await page.waitForTimeout(300);
  let n = await page.evaluate(() => ({ figs: $$('.am figure.viz svg.vz').length, kinds: $$('.am figure.viz svg.vz').map(s => s.getAttribute('class')).join(','), raw: /```|-->|->>/.test($$('.am .md').map(x => x.textContent).join('')) }));
  check(n.figs === 4 && /vz-plot/.test(n.kinds) && /vz-graph/.test(n.kinds) && /vz-seq/.test(n.kinds) && /vz-tree/.test(n.kinds) && !n.raw, `AI 助手的回复画出 4 张图（含 Mermaid 流程图、时序图）：${n.kinds}`);
  const sys = JSON.stringify(reqs.at(-1)?.messages || []);
  check(/```plot/.test(sys) && /```graph/.test(sys) && /```seq/.test(sys), 'AI 助手的提示里有作图说明');
  await shot(page, 'ai-viz');
  // 放大查看
  await page.locator('.am figure.viz').nth(1).click(); await page.waitForSelector('.vzv svg'); await page.waitForTimeout(200);
  const w0 = await page.evaluate(() => +$('.vzv svg').getAttribute('width'));
  await page.click('.vzv [data-z="in"]'); await page.click('.vzv [data-z="in"]'); await page.waitForTimeout(100);
  const z = await page.evaluate(() => ({ w: +$('.vzv svg').getAttribute('width'), tag: $('.vzv-in').firstElementChild.tagName.toLowerCase(), pct: $('.vzv-pct').textContent }));
  check(z.tag === 'svg' && z.w > w0 * 1.9 && /196%/.test(z.pct), `点开图可以放大：矢量 SVG 宽度 ${Math.round(w0)} → ${Math.round(z.w)}（${z.pct}）`);
  await shot(page, 'viz-zoom');
  await page.mouse.move(200, 400); await page.mouse.down(); await page.mouse.move(120, 330, { steps: 4 }); await page.mouse.up();
  check(await page.evaluate(() => $('.vzv-sc').scrollLeft > 0 || $('.vzv-sc').scrollTop > 0), '放大后可以拖动查看');
  await page.click('.vzv [data-z="close"]'); await page.waitForTimeout(150);
  check(await page.evaluate(() => !$('.vzv') && !document.body.classList.contains('vzv-on')), '关闭查看器');
  // 流式输出：没写完的图先显示占位
  check(await page.evaluate(() => { const el = h(`<div>${md('讲解\n\n```plot\nx 0..1\nf x')}</div>`); return !!$('.viz-wait', el) && !/```plot/.test(el.textContent); }), '图还没写完时显示「正在画图」，不露出代码');
  // 问 AI（卡片）
  await page.evaluate(() => go('section', { id: 'learn1s1' })); await page.waitForTimeout(400); await page.click('#start'); await page.waitForSelector('.post');
  await page.evaluate(() => askAI([...Feed.posts.values()][0].it, [...Feed.posts.values()][0])); await page.waitForSelector('#ak-in', { timeout: 5000 });
  await page.fill('#ak-in', '画个图'); await page.click('#ak-go');
  await page.waitForFunction(() => $$('.sheet .am figure.viz svg.vz').length >= 4, null, { timeout: 15000 }).catch(() => {});
  check(await page.evaluate(() => $$('.sheet .am figure.viz svg.vz').length) === 4, '问 AI 的回复画出图');
  check(/```plot/.test(JSON.stringify(reqs.at(-1)?.messages || [])), '问 AI 的提示里有作图说明');
  await page.evaluate(() => $$('.sheet [data-close]').forEach(b => b.click())); await page.waitForTimeout(400);
  // 笔记里的 AI
  await page.evaluate(() => newNote({ course: 'learn', sec: 'learn1s1' })); await page.waitForSelector('#ne-body');
  await page.fill('#ne-body', '遗忘曲线先快后慢'); await page.click('[data-tool="expand"]'); await page.waitForSelector('.aiacts [data-a="1"]', { timeout: 15000 });
  check(await page.evaluate(() => $$('.aout figure.viz svg.vz').length) === 4 && /```plot/.test(JSON.stringify(reqs.at(-1)?.messages || [])), '笔记 AI 扩写的结果画出图，提示里有作图说明');
  await page.click('.aiacts [data-a="1"]'); await page.waitForTimeout(300); await page.click('#ne-mode'); await page.waitForTimeout(500);
  check(await page.evaluate(() => $$('.nread figure.viz svg.vz').length) === 4, '图保存在笔记里，预览时显示');
  check(!errors.length, '没有脚本错误' + (errors.length ? '：' + errors.join(' | ') : ''));
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
