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
  await page.waitForTimeout(700); await shot(page, 'today');
  await page.click('.tabbar [data-tab="library"]'); await page.waitForTimeout(500); await page.click('[data-course="learn"]'); await page.waitForTimeout(600);
  await page.evaluate(() => go('section', { id: 'learn1s1' })); await page.waitForTimeout(600);
  await page.click('#start'); await page.waitForSelector('.post'); await page.waitForTimeout(500); await shot(page, 'learn');
  await page.locator('.post [data-act="detail"]').first().click(); await page.waitForTimeout(500);
  check(await page.locator('.dtl .dtl-md').count() === 1, '点「详解」打开详解页');
  const wr = await page.evaluate(() => $('.dtl .dtl-md').getBoundingClientRect().width / innerWidth); check(wr > .85, `详解页正文占满屏宽（${Math.round(wr * 100)}%）`);
  await shot(page, 'detail');
  // 向右滑关闭
  const cdp = await ctx.newCDPSession(page), swipe = async (x0, x1, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
    for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / 8, y }] }); await page.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(500);
  };
  const W = await page.evaluate(() => innerWidth);
  await swipe(W * .3, W * .9, 400); check(await page.locator('.dtl').count() === 0, '详解页向右滑关闭');
  // 在卡片上向左滑打开
  // 在带「详解」入口的那张卡片上滑（先等滚动停稳，再取位置）
  const row = page.locator('.post [data-act="detail"]').first(); await row.scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
  const pr = await row.boundingBox();
  await swipe(W * .85, W * .2, pr.y + pr.height / 2); check(await page.locator('.dtl').count() === 1, '卡片向左滑打开详解页');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400); check(await page.locator('.dtl').count() === 0, 'Esc 关闭详解页');
  await swipe(W * .6, W * .45, pr.y + pr.height / 2); check(await page.locator('.dtl').count() === 0, '轻微左滑不打开');
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
    const btn = [...document.querySelectorAll('.sheet .menu button')].find(b => /更新/.test(b.textContent)); btn.click(); await new Promise(r => setTimeout(r, 400));
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
  // 长页面能滚到底：最后一块内容不被底部标签栏挡住
  for (const tab of ['review', 'library']) {
    await page.click(`.tabbar [data-tab="${tab}"]`); await page.waitForTimeout(800);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(400);
    const gap = await page.evaluate(() => { const last = [...$$('#view .stack > *')].filter(e => e.offsetHeight).at(-1); return $('.tabbar').getBoundingClientRect().top - last.getBoundingClientRect().bottom; });
    check(gap >= 0, `「${tab}」页滚到底时最后一块完整可见（距标签栏 ${Math.round(gap)}px）`);
  }
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
  await page.click('#smore'); await page.waitForTimeout(300); await page.locator('.sheet .menu button', { hasText: '写本节笔记' }).click();
  await page.waitForSelector('#nd-t', { timeout: 5000 }); await page.waitForTimeout(300);
  check(await page.evaluate(() => !$('.sheet .seg') && !!$('.sheet .cbox [data-c="plus"]') && !!$('.sheet .cbox .cmod')), '帮我写：像对话框一样（不分类，有附件和模型按钮）');
  // 附件：图片 + 链接
  await page.click('.sheet .cbox [data-c="plus"]'); await page.waitForSelector('.attg [data-a="img"]');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.attg [data-a="img"]')]);
  await fc.setFiles({ name: 'board.png', mimeType: 'image/png', buffer: PNG }); await page.waitForSelector('.sheet .catt .at.img img', { timeout: 5000 });
  await page.waitForTimeout(400); await page.click('.sheet .cbox [data-c="plus"]'); await page.waitForSelector('.sheet .menu [data-a="link"]'); await page.click('.sheet .menu [data-a="link"]');
  await page.waitForSelector('#lk'); await page.fill('#lk', new URL('index.html', URL0).href); await page.click('#lk-ok');
  await page.waitForFunction(() => $('.sheet .catt .at.doc') && !$('.sheet .catt .spin'), null, { timeout: 8000 }); await shot(page, 'note-draft-att');
  await page.fill('#nd-t', '间隔重复比我想的有用'); await page.click('#nd-go');
  await page.waitForSelector('.sheet .am [data-a="0"]', { timeout: 10000 }); await shot(page, 'note-draft');
  const pr = reqs.filter(x => x.body?.messages).at(-1)?.body.messages.at(-1).content || '';
  check(/间隔重复比我想的有用/.test(pr) && /小节：/.test(pr) && /第一人称/.test(pr), 'AI 帮我写：提示里带上自己的想法和小节内容');
  check(/\[图片\] board\.png/.test(pr) && /\[链接\]/.test(pr) && /网页正文/.test(pr), '帮我写：图片和链接（网页正文）一起交给 AI');
  check(await page.evaluate(() => $$('.sheet .ug .uatt .at').length === 2), '帮我写：消息里显示附件');
  await page.click('.sheet .am [data-a="0"]'); await page.waitForTimeout(800);
  let n = await page.evaluate(() => { const n = Notes.get(Nav.stack.at(-1).params.id); return n && { body: n.body, title: n.title, sec: n.sec, ta: $('#ne-body').value, imgs: Object.keys(n.imgs || {}).length }; });
  check(n && /共 2 章/.test(n.body) && n.ta === n.body && n.title && n.sec === 'learn1s1', 'AI 草稿放进笔记，自动起标题并关联小节');
  check(n.imgs === 1 && /!\[配图\]\(img:/.test(n.body), '帮我写：附带的图片一起放进笔记');
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
  n = await page.evaluate(async () => { const n = Notes.get(Nav.stack.at(-1).params.id), k = Object.keys(n.imgs).at(-1); const b = k && await Files.get(n.imgs[k]); return { k, marker: new RegExp('\\(img:' + k + '\\)').test(n.body), size: b?.size || 0, thumbs: $$('.nimgs .nth').length }; });
  check(n.k && n.marker && n.size > 0 && n.thumbs === 2, '配图：图片存入本机文件区并插入正文');
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
  // AI 页：输入框带附件，图片发给支持看图的模型
  await page.evaluate(async () => { await Platform.aiConfig.set({ provider: 'claude', kind: 'anthropic', key: 'sk-ant-test', model: 'claude-opus-5-5', vision: true }); await AI.reload(); go('ai', {}, { tab: true }); });
  await page.waitForSelector('#ch-in'); await page.waitForTimeout(400);
  check(await page.evaluate(() => /Opus 5\.5/.test($('#cmp .cmod').textContent)), 'AI 页：输入框显示当前模型');
  await page.click('#cmp [data-c="plus"]'); await page.waitForSelector('.attg');
  check(await page.evaluate(() => /新建课程/.test($('.sheet .menu').textContent)), 'AI 页：「+」里同时有附件和工具');
  const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.click('.attg [data-a="cam"]')]);
  await fc2.setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG }); await page.waitForSelector('#cmp .catt .at.img img', { timeout: 5000 });
  await page.fill('#ch-in', '这张图讲的是什么'); await page.waitForTimeout(100); await page.click('#ch-send');
  await page.waitForFunction(() => !Chat.busy, null, { timeout: 10000 }); await page.waitForTimeout(300); await shot(page, 'ai-attach');
  const ar = reqs.filter(x => x.url.includes('anthropic') && x.body?.messages).flatMap(x => x.body.messages).filter(m => Array.isArray(m.content) && m.content.some(c => c.type === 'image')).at(-1)?.content || [];
  check(Array.isArray(ar) && ar.some(c => c.type === 'image' && c.source?.media_type) && ar.some(c => c.type === 'text' && /这张图讲的是什么/.test(c.text)), 'AI 页：图片和问题一起发给模型');
  check(await page.evaluate(() => !!$('#cm .ug .uatt img') && !!Chat.get().msgs[0].att?.[0]?.thumb), 'AI 页：消息显示图片缩略图，并保存在对话记录里');
  // 选择模型（参考 Claude App）：列表 + 说明 + 思考强度
  await page.click('#cmp .cmod'); await page.waitForSelector('.msel .mrow'); await page.waitForTimeout(500); await shot(page, 'model-picker');
  let ms = await page.evaluate(() => ({ rows: $$('.msel #ms-l .mrow').map(r => r.querySelector('.t').textContent), cur: $('.msel .mrow .mck')?.closest('.mrow').querySelector('.t').textContent, desc: $('.msel .mrow .m')?.textContent, eff: $('#ms-eff .r')?.textContent }));
  check(ms.rows.join() === 'Opus 5.5,Sonnet 5.5,Fable 5.2费用更高,Haiku 5.5' && ms.cur === 'Opus 5.5' && /复杂工作/.test(ms.desc), '选择模型：常用模型、说明和当前选中');
  check(ms.eff === '中', '选择模型：Opus 5.5 默认思考强度为「中」');
  await page.locator('.msel .mrow', { hasText: 'Sonnet 5.5' }).click(); await page.waitForTimeout(600);
  check(await page.evaluate(async () => (await Platform.aiConfig.get()).model === 'claude-sonnet-5-5' && /Sonnet 5\.5/.test($('#cmp .cmod').textContent) && $('#cmp .cmod em').textContent === '高'), '选择模型：切换后保存并更新输入框（Sonnet 5.5 · 高）');
  await page.click('#cmp .cmod'); await page.waitForSelector('#ms-eff'); await page.click('#ms-eff'); await page.waitForSelector('[data-e="xhigh"]'); await shot(page, 'model-effort');
  await page.click('[data-e="xhigh"]'); await page.waitForTimeout(600);
  check(await page.evaluate(() => $('#cmp .cmod em').textContent === '超高' && $('#ms-eff .r').textContent === '超高'), '思考强度：选择后输入框和列表同步');
  await page.evaluate(() => $$('.sheet [data-close]').forEach(b => b.click())); await page.waitForTimeout(400);
  await page.fill('#ch-in', '再讲一遍'); await page.waitForTimeout(100); await page.click('#ch-send'); await page.waitForFunction(() => !Chat.busy, null, { timeout: 10000 });
  const lastA = reqs.filter(x => x.url.includes('anthropic') && x.body?.messages).at(-1)?.body;
  check(lastA?.model === 'claude-sonnet-5-5' && lastA?.output_config?.effort === 'xhigh', '请求使用所选模型和思考强度（output_config.effort）');
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
  check(await page.evaluate(() => /完成/.test($('#feed .endc h3').textContent) && !!$('#feed .endc [data-ck]')), '刷完后：完成卡片 + 打卡');
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
  await page.waitForTimeout(700); await shot(page, 'today-dark');
  check(!errors.length, '没有脚本错误');
  await ctx.close();
});

await run('宽屏 Muse 左侧图标 Dock', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(URL0); await page.waitForSelector('.dayband', { timeout: 20000 });
  await page.waitForTimeout(700);
  const dock = await page.evaluate(() => { const r = $('.tabbar').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left) }; });
  check(dock.x === 0 && dock.w === 72 && dock.h >= 750, `宽屏导航自动切换为左侧 72px 图标栏（${dock.w}×${dock.h}）`);
  await shot(page, 'desktop-dock');
  await ctx.close();
});

await run('安全校验、双端 DSL 哈希、IndexedDB 迁移与完整备份恢复', async () => {
  const { page, ctx, errors } = await newPage();
  // 1) 恶意课程包 color / id 清洗
  const sec = await page.evaluate(() => {
    window.__xss = 0;
    importPack({
      format: 'renew-course', v: 1,
      course: {
        id: 'bad"><img src=x onerror=window.__xss=1>',
        title: '测试安全', cat: '安全',
        color: 'red;background:url(javascript:alert(1))',
        chapters: [{ id: 'c1', title: '第1章', sections: [{ id: 's1', title: '1.1', items: [{ id: 'x"><svg onload=window.__xss=2>', t: 'kp', title: '要点', q: '内容' }] }] }]
      }
    });
    const c = [...COURSES.values()].find(x => x.title === '测试安全');
    const it = c && courseSecs(c)[0].items[0];
    return { okId: c && SAFE_ID_RE.test(c.id), okColor: c && HEX_COLOR_RE.test(c.color), okItem: it && SAFE_ID_RE.test(it.id), xss: window.__xss };
  });
  check(sec.okId && sec.okColor && sec.okItem && !sec.xss, '外部课程包：恶意 id 与 color 自动清洗，无注入');

  // 2) 双端 h36 一致性 & .txt 插入新卡后更新保留进度
  const dsl = await page.evaluate(async () => {
    // 校验 JS h36 与 Python build_content.py 编译的内置课程卡片 id 完全一致
    const builtinSec = courseSecs(COURSES.get('learn'))[0];
    const used = new Set();
    const matchBuiltin = builtinSec.items.every(it => stableCardId(builtinSec.id, it, used) === it.id);
    const txt1 = '@course dsltest | DSL测试 | #2f7f9e | 测试\n@chapter c1 | 第1章\n@section 1.1\n::kp 核心概念\n- 要点A\n---\n详解A\n::tf\n1+1=2\n= true\n?? 显然成立';
    importCardText(txt1);
    const c = COURSES.get('dsltest'), kp = courseSecs(c)[0].items.find(x => x.title === '核心概念');
    const oldId = kp.id;
    setSt(kp, schedule(null, 3, Date.now())); saveSrs(c.id);
    // 在原有卡片前面插入一张新卡，重新导入并选择「更新（保留进度）」
    const txt2 = '@course dsltest | DSL测试 | #2f7f9e | 测试\n@chapter c1 | 第1章\n@section 1.1\n::kp 前置概念\n- 新要点\n::kp 核心概念\n- 要点A（已修订）\n---\n详解A2\n::tf\n1+1=2\n= true\n?? 显然成立';
    importCardText(txt2);
    await new Promise(r => setTimeout(r, 400));
    const btn = [...document.querySelectorAll('.sheet .menu button')].find(b => /更新/.test(b.textContent));
    btn.click();
    await new Promise(r => setTimeout(r, 400));
    const updated = ITEMS.get(oldId);
    return { matchBuiltin, sameId: !!updated, updatedBody: /已修订/.test(updated?.q || ''), keptProg: !!getSt(updated), count: courseSecs(COURSES.get('dsltest'))[0].items.length };
  });
  check(dsl.matchBuiltin, 'JS stableCardId 与 Python build_content.py 哈希完全一致');
  check(dsl.sameId && dsl.updatedBody && dsl.keptProg && dsl.count === 3, '.txt 课程前插新卡后更新：原卡 id 不变且保留复习进度');

  // 3) 完整备份导出与恢复（含笔记配图 + 清理多余旧文档 + 拒绝非法备份）
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const bkStr = await page.evaluate(async b64 => {
    const n = Notes.create({ course: 'learn', sec: 'learn1s1', title: '带图笔记', body: '正文' });
    const k = await addNoteImage(n, { blob: b64ToBlob(b64, 'image/png') });
    n.body = `正文\n\n![配图](img:${k})`; Notes.save(n);
    let saved = '';
    const orig = Files.save; Files.save = async (_, data) => { saved = data; return true; };
    await exportData();
    Files.save = orig;
    // 导出后再建一条多余笔记，用来验证恢复时会清理旧数据
    Notes.create({ course: 'learn', title: '多余笔记', body: '应该被清除' });
    await Store.flushAll();
    return saved;
  }, PNG);
  const bkObj = JSON.parse(bkStr);
  check(bkObj.app === 'renew' && bkObj.blobs && Object.keys(bkObj.blobs).length === 1, '完整备份：打包学习文档与本机笔记配图');
  // 校验拒绝无效备份，随后导入有效备份并重载验证
  await page.evaluate(() => importData()); await page.waitForSelector('#ip-t');
  await page.fill('#ip-t', '{"app":"renew","docs":{"app/state":"bad"}}');
  await page.click('#ip-go'); await page.waitForTimeout(200);
  check(await page.evaluate(() => $('.toast')?.textContent.includes('没有找到学习数据')), '非法结构备份被安全拒绝');
  await page.fill('#ip-t', bkStr);
  await page.click('#ip-go'); await page.waitForSelector('.sheet [data-v="1"]');
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('.sheet [data-v="1"]')]);
  await page.waitForSelector('.dayband', { timeout: 20000 });
  const restored = await page.evaluate(async () => {
    const notes = Notes.all();
    const n = notes.find(x => x.title === '带图笔记');
    const extra = notes.find(x => x.title === '多余笔记');
    const ref = n && Object.values(n.imgs || {})[0];
    const blob = ref && await Files.get(ref);
    return { hasN: !!n, noExtra: !extra, imgSize: blob?.size || 0, idb: WebDocs.idb };
  });
  check(restored.hasN && restored.noExtra && restored.imgSize > 0, '导入备份：纯净恢复（清除多余旧笔记）并还原笔记配图');
  check(restored.idb, '网页端文档默认持久化到 IndexedDB');
  check(!errors.length, '没有脚本错误' + (errors.length ? '：' + errors.join(' | ') : ''));
  await ctx.close();

  // 4) 旧 localStorage 文档自动迁移至 IndexedDB
  const ctx2 = await browser.newContext({ ...devices['Pixel 7'] });
  const p2 = await ctx2.newPage();
  await p2.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('xl:keys', JSON.stringify(['note/mig1']));
      localStorage.setItem('xl:d:note/mig1', JSON.stringify({ id: 'mig1', course: 'learn', title: '旧版笔记', body: '来自 localStorage', imgs: {}, created: 1, updated: 1, _t: 1 }));
    }
  });
  await p2.goto(URL0); await p2.waitForSelector('.dayband', { timeout: 20000 });
  const mig1 = await p2.evaluate(() => ({ title: Notes.get('mig1')?.title, lsGone: localStorage.getItem('xl:d:note/mig1') === null && localStorage.getItem('xl:keys') === null, idb: WebDocs.idb }));
  await p2.reload(); await p2.waitForSelector('.dayband', { timeout: 20000 });
  const mig2 = await p2.evaluate(() => Notes.get('mig1')?.title);
  check(mig1.title === '旧版笔记' && mig1.lsGone && mig1.idb && mig2 === '旧版笔记', '旧 localStorage 文档自动迁移至 IndexedDB 并释放 localStorage');
  await ctx2.close();
});

await run('悬浮会话栏、首页快捷键、问 AI 沉淀飞轮、交互矢量图与听学朗读', async () => {
  const { page, ctx, errors } = await newPage();
  // 1) 首页学习流键盘快捷键（直接按 3 评分、右方向键打开详解）
  await page.keyboard.press('3'); await page.waitForTimeout(350);
  check(await page.evaluate(() => todayStats().n === 1), '首页今日学习流支持键盘 1-4 直接评分');
  await page.evaluate(() => { const el = $$('#feed > [data-pk]').find(e => $('[data-act="detail"]', e)); el?.scrollIntoView(); });
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(350);
  check(await page.evaluate(() => !!Detail.cur && !!$('.dtl .dtl-bar .fpill')), '首页按 → 打开详解页，详解页右上角使用悬浮胶囊');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  // 2) 学习会话统一为悬浮按钮 + 贴顶进度线（不溢出手机宽度）
  await page.evaluate(() => go('section', { id: 'learn1s1' })); await page.waitForTimeout(400);
  await page.click('#start'); await page.waitForSelector('.sfbar'); await page.waitForTimeout(300);
  const sb = await page.evaluate(() => ({
    noOld: !$('.sbar'),
    hasTopProg: !!$('.readprog #sp'),
    hasSteps: $$('.sfbar .ssteps [data-step]').length === 3,
    fit: $('.sfbar .wrap').scrollWidth <= innerWidth + 2
  }));
  check(sb.noOld && sb.hasTopProg && sb.hasSteps && sb.fit, '学习会话统一为贴顶进度线 + 悬浮胶囊，手机宽度无溢出');
  await shot(page, 'session-float');

  // 3) 交互矢量图：图内挖空、填空卡联动与分步演进
  const vizRes = await page.evaluate(() => {
    const F = '```';
    const box = h(`<div id="vz-test"></div>`); document.body.append(box);
    box.innerHTML = md(`${F}cells\n=== 初始\narr: 5 * | {{2}} | 4\n=== 交换后\narr: 2 | 5 * | {{4}}\n${F}`);
    const fig = $('figure.viz.viz-steps', box);
    const step0 = $('.vz-sn', fig)?.textContent, title0 = $('.vz-st', fig)?.textContent;
    const cz0 = $('.vz-fr:not([hidden]) .vz-cz', fig);
    const beforeOn = cz0?.classList.contains('on');
    cz0?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const afterOn = cz0?.classList.contains('on'), openedViewer = !!VizView.cur;
    $('[data-vs="1"]', fig).click();
    const step1 = $('.vz-sn', fig)?.textContent, title1 = $('.vz-st', fig)?.textContent;
    const visText = $('.vz-fr:not([hidden]) svg', fig)?.textContent || '';
    // 点图本身应打开当前第 2 步的放大查看器
    $('.vz-fr:not([hidden]) svg', fig).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const zoomHas2 = !!$('.vzv svg') && /交换后|4/.test($('.vzv svg').textContent);
    VizView.cur?.();
    box.remove();
    return { step0, title0, beforeOn, afterOn, openedViewer, step1, title1, visText, zoomHas2 };
  });
  check(vizRes.step0 === '1/2' && vizRes.title0 === '初始' && vizRes.step1 === '2/2' && vizRes.title1 === '交换后' && vizRes.zoomHas2, '分步演进图：切换步骤、更新标题与放大当前帧');
  check(!vizRes.beforeOn && vizRes.afterOn && !vizRes.openedViewer, '图内挖空：默认遮罩，点按原地翻开且不误触放大');

  // 纯图示 ::cloze 填空卡联动
  const czCard = await page.evaluate(() => {
    const sec = SECS.get('learn1s1');
    const parsed = parseDSL('::cloze 图示填空\n```tree\n根\n  {{左}}\n  {{右}}\n```\n?? 解析', 'learn1s1', 't');
    saveItems('learn1s1', parsed.items);
    const it = ITEMS.get(parsed.items[0].id);
    go('session', { kind: 'items', ids: [it.id] });
    const post = $('#feed .post[data-pk]');
    const beforeRate = $$('.rate', post).length;
    $('.vz-cz[data-vcz="0"]', post).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const midRate = $$('.rate', $('#feed .post[data-pk]')).length;
    $('.vz-cz[data-vcz="1"]', $('#feed .post[data-pk]')).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const afterRate = $$('.rate', $('#feed .post[data-pk]')).length;
    return { beforeRate, midRate, afterRate };
  });
  check(czCard.beforeRate === 0 && czCard.midRate === 0 && czCard.afterRate === 4, '图示填空卡：逐个点开图内遮罩后自动解锁 FSRS 评分');

  // 4) 卡片「问 AI」持久化、加入详解、转成卡片、全屏升格
  const AI_REPLY = 'A. 顺序查找\nB. 折半查找\n\n答案：B。折半查找每次排除一半。';
  await page.route('https://api.deepseek.com/**', r => r.fulfill({ headers: { 'content-type': 'text/event-stream' }, body: sse([oa({ content: AI_REPLY })]) }));
  await page.evaluate(async () => {
    await Platform.aiConfig.set({ provider: 'deepseek', kind: 'openai', key: 'sk-test', model: 'deepseek-chat', base: 'https://api.deepseek.com' });
    await AI.reload();
    const it = courseSecs(COURSES.get('learn'))[0].items[0];
    askAI(it);
  });
  await page.waitForSelector('#ak-in');
  await page.fill('#ak-in', '出个类似题'); await page.click('#ak-go');
  await page.waitForSelector('.sheet .am [data-a="2"]', { timeout: 10000 });
  check(await page.evaluate(() => { const id = courseSecs(COURSES.get('learn'))[0].items[0].id; return (lsGet('askmem')?.[id] || []).length === 2; }), '卡片问 AI 记录持久化保存');
  // 加入详解
  await page.click('.sheet .am [data-a="1"]'); await page.waitForTimeout(200);
  check(await page.evaluate(() => /折半查找/.test(courseSecs(COURSES.get('learn'))[0].items[0].d || '')), '问 AI 回复一键加入卡片详解');
  // 转成卡片
  const secBefore = await page.evaluate(() => secItems(SECS.get('learn1s1')).length);
  await page.click('.sheet .am [data-a="2"]'); await page.waitForSelector('#g-save');
  await page.click('#g-save'); await page.waitForTimeout(300);
  check(await page.evaluate(n => secItems(SECS.get('learn1s1')).length === n + 1, secBefore), '问 AI 回复一键转成新卡片并保存到当前小节');
  // 升格至全屏 AI 助手
  await page.click('.sheet [data-promote]'); await page.waitForSelector('#ch-in'); await page.waitForTimeout(300);
  check(await page.evaluate(() => Nav.tab === 'ai' && Chat.get()?.msgs.length >= 2 && Chat.get()?.ctx === 'learn'), '卡片问 AI 一键升格至全屏 AI 助手并保留上下文');

  // 5) 碎片听学语音朗读（模拟 speechSynthesis 验证启停与切页自动停止）
  const spk = await page.evaluate(() => {
    const log = [];
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak: u => log.push('speak:' + u.text.slice(0, 12)), cancel: () => log.push('cancel') } });
    go('section', { id: 'learn1s1' });
    startSection('learn1s1');
    const btn = $('[data-speak]'); btn?.click();
    const active = Speech.auto && !!Speech.cur && btn?.classList.contains('speaking');
    go('today', {}, { tab: true });
    const stopped = !Speech.auto && !Speech.cur;
    return { active, stopped, spoke: log.some(x => x.startsWith('speak:')) };
  });
  check(spk.active && spk.spoke && spk.stopped, '碎片听学朗读：会话内启停、状态高亮与切页自动停止');
  check(!errors.length, '没有脚本错误' + (errors.length ? '：' + errors.join(' | ') : ''));
  await ctx.close();
});

await run('首页内容：课程分支范围、课程里的卡片、AI 添加与 AI 每日卡片', async () => {
  const { page, ctx, errors } = await newPage(); const reqs = [];
  const txt = m => typeof m.content === 'string' ? m.content : (m.content || []).map(c => c.text || '').join('');
  await page.route('https://api.deepseek.com/**', async r => {
    const req = r.request(), body = req.postDataJSON?.() || null; reqs.push(body);
    if (req.url().endsWith('/models')) return r.fulfill({ json: { data: [{ id: 'deepseek-chat' }] } });
    const h = { 'content-type': 'text/event-stream' }, all = body.messages.map(txt).join('\n');
    if (body.tools && !body.messages.some(m => m.role === 'tool')) return r.fulfill({ headers: h, body: sse([oa({ tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'update_home', arguments: JSON.stringify({ cards: [{ course: 'learn', type: 'count', title: '考研', date: '2026-12-26', pos: 'top' }] }) } }] })]) });
    if (body.tools) return r.fulfill({ headers: h, body: sse([oa({ content: '已加上考研倒计时。' })]) });
    if (/定制学习 App「温新」的首页/.test(all)) return r.fulfill({ headers: h, body: sse([oa({ content: JSON.stringify({ scope: { learn: false, wrong: 3 }, cards: [{ course: 'learn', type: 'ai', title: '每日一句', prompt: '一句英文名言，附中文翻译', pos: 'top' }, { type: 'count', title: '坏日期', date: 'x' }, { course: 'nope', type: 'text', title: '<img src=x onerror=alert(1)>', body: '<script>alert(1)</script>坚持' }] }) })]) });
    if (/首页写一张卡片/.test(all)) return r.fulfill({ headers: h, body: sse([oa({ content: '**Stay hungry, stay foolish.** 求知若饥，虚心若愚。' })]) });
    return r.fulfill({ headers: h, body: sse([oa({ content: '好的' })]) });
  });
  // 1) 卡片属于课程：从首页添加文字卡片（置顶）与倒计时（穿插在学习流）
  await page.click('#td-home'); await page.waitForSelector('[data-hadd]');
  await page.click('[data-hadd]'); await page.waitForSelector('#hc-title');
  check(await page.evaluate(() => $('#hc-course').value === 'learn'), '新卡片默认放进在学的课程');
  await page.fill('#hc-title', '本周目标'); await page.fill('#hc-body', '学完 **第 1 章**'); await page.click('.sheet-wrap:last-child [data-ok]'); await page.waitForTimeout(400);
  await page.click('[data-hadd]'); await page.waitForSelector('#hc-title'); await page.click('[data-ty="count"]');
  await page.fill('#hc-title', '期末'); await page.fill('#hc-date', '2026-12-20'); await page.click('[data-pos="feed"]'); await page.click('.sheet-wrap:last-child [data-ok]'); await page.waitForTimeout(400);
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  let st = await page.evaluate(() => ({ top: $$('#hws .hcard').map(e => e.textContent).join(), src: $('#hws .hcard .src')?.textContent }));
  check(/本周目标/.test(st.top) && /第 1 章/.test(st.top) && /学习的科学/.test(st.src), '课程里的卡片置顶显示在首页，并标出所属课程');
  await page.evaluate(() => { for (let i = 0; i < 30 && Feed.rendered < Feed.queue.length; i++) moreFeed(); });
  st = await page.evaluate(() => $$('#feed > *').map(e => e.dataset.pk ? 'p' : e.dataset.hw ? 'w' : 'e').join(''));
  check(/^pppw/.test(st) && (st.match(/w/g) || []).length === 1, `倒计时卡片穿插在第 3 个内容之后且只出现一次（${st}）`);
  // 课程页的「卡片」分支
  await page.evaluate(() => go('course', { id: 'learn' })); await page.waitForSelector('#ccards');
  check(await page.evaluate(() => $$('#ccl [data-hedit]').length === 2), '课程页有「卡片」分支，列出这门课的卡片');
  // 2) 推荐范围：只推第 2 章 + 卡片分支
  await page.evaluate(() => go('today', {}, { tab: true })); await page.waitForTimeout(300);
  const ch2 = await page.evaluate(() => COURSES.get('learn').chapters[1].id);
  await page.click('#td-home'); await page.waitForSelector('[data-rng="learn"]'); await page.click('[data-rng="learn"]'); await page.waitForSelector(`[data-br="${ch2}"]`);
  check(await page.evaluate(() => !!$('[data-br="@cards"]')), '分支列表里有各章和「卡片」');
  await page.click(`[data-br="${ch2}"]`); await page.waitForTimeout(150); await page.click('[data-br="@cards"]'); await page.waitForTimeout(150);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  check(await page.evaluate(ch => (homeRange('learn') || []).join() === ch + ',@cards' && /等 2 个分支/.test($('[data-rng="learn"] .m').textContent), ch2), '课程范围可以只选部分分支');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.evaluate(() => { Daily.pr = null; refresh(); }); await page.waitForTimeout(300);
  st = await page.evaluate(() => ({ chaps: [...new Set(Feed.queue.filter(it => !getSt(it)).map(it => SECS.get(it.sec).chap))], next: todayModel().courses[0]?.sec?.chap, cards: $$('.hcard').length }));
  check(st.chaps.length === 1 && st.chaps[0] === ch2 && st.next === ch2 && st.cards >= 1, `新内容只来自选定的章，卡片分支仍显示（${st.chaps}）`);
  await page.evaluate(ch => { homeCfg().range.learn = [ch]; saveState(); Daily.pr = null; refresh(); }, ch2); await page.waitForTimeout(300);
  check(await page.evaluate(() => !$$('.hcard').length), '没选「卡片」分支时，这门课的卡片不上首页');
  await page.evaluate(() => { delete homeCfg().range.learn; saveState(); });
  // 3) 关掉新内容和复习：首页只剩课程里的卡片
  await page.evaluate(() => { const H = homeCfg(); H.learn = false; H.review = false; saveState(); Daily.pr = null; refresh(); }); await page.waitForTimeout(300);
  st = await page.evaluate(() => ({ posts: $$('#feed .post[data-pk]').length, cards: $$('.hcard').length, k: $$('.dayband .db-k').length }));
  check(st.posts === 0 && st.cards === 2 && st.k === 1, `可以不推知识和题：首页只有卡片（${JSON.stringify(st)}）`);
  // 4) 只有卡片的课程：目录为空也能创建
  await page.evaluate(() => newCourseSheet()); await page.waitForSelector('#nc-man'); await page.fill('#nc-t', '日常'); await page.click('#nc-man'); await page.waitForSelector('#o-x');
  await page.fill('#o-x', ''); await page.click('#o-ok'); await page.waitForSelector('#ccards');
  const cid = await page.evaluate(() => Nav.stack.at(-1).params.id);
  check(await page.evaluate(id => COURSES.get(id)?.chapters.length === 0, cid), '可以新建只放卡片、没有章节的课程');
  await page.click('#ccadd'); await page.waitForSelector('#hc-title');
  check(await page.evaluate(id => $('#hc-course').value === id, cid), '在课程页添加卡片默认放进这门课');
  await page.fill('#hc-title', '座右铭'); await page.fill('#hc-body', '日日精进'); await page.click('.sheet-wrap:last-child [data-ok]'); await page.waitForTimeout(400);
  check(await page.evaluate(() => $$('#ccl [data-hedit]').length === 1), '卡片出现在课程的「卡片」分支里');
  await page.evaluate(() => go('today', {}, { tab: true })); await page.waitForTimeout(400);
  check(await page.evaluate(() => /日日精进/.test($('#hws')?.textContent || '')), '只有卡片的课程，卡片也会上首页');
  // 5) AI 添加：AI 给出放进哪门课的卡片与推荐内容调整，校验后加入；AI 每日卡片自动生成今天的内容
  await page.evaluate(async () => { await Platform.aiConfig.set({ provider: 'deepseek', kind: 'openai', key: 'sk-test', model: 'deepseek-chat', base: 'https://api.deepseek.com' }); await AI.reload(); homeCfg().learn = true; saveState(); });
  await page.evaluate(() => homeAISheet()); await page.waitForSelector('#ha-in');
  await page.click('[data-sg]'); await page.click('#ha-go'); await page.waitForSelector('#ha-ok', { timeout: 10000 });
  const prev = await page.evaluate(() => $('#ha-out').textContent);
  check(/不推荐新内容/.test(prev) && /3 道错题/.test(prev) && /学习的科学」添加AI 每日卡片「每日一句/.test(prev) && !/坏日期/.test(prev), 'AI 添加：先预览改动（含放进哪门课），无效卡片被丢弃');
  await page.click('#ha-ok'); await page.waitForFunction(() => /Stay hungry/.test($('#hws')?.textContent || ''), null, { timeout: 10000 });
  st = await page.evaluate(() => ({ H: homeCfg(), today: dayKey(), valid: homeCfg().cards.every(c => COURSES.has(c.course)), xss: !!$('#view script, #view img[src="x"]') }));
  check(!st.H.learn && st.H.wrong === 3 && st.H.cards.some(c => c.type === 'ai' && c.course === 'learn' && c.by === 'ai' && c.ai?.day === st.today), 'AI 添加的范围生效，AI 每日卡片已生成今天的内容');
  check(!st.xss && st.H.cards.some(c => c.body.includes('坚持')) && st.valid, 'AI 给的卡片内容经过转义，不存在的课程改放进默认课程');
  // 6) AI 助手：update_home 工具确认后添加卡片
  await page.evaluate(() => { aiSend('加一个考研倒计时'); }); // 不等待：工具在等用户确认
  await page.waitForSelector('[data-allow]', { timeout: 10000 }); await page.click('[data-allow]'); await page.waitForFunction(() => !Chat.busy, null, { timeout: 10000 });
  check(await page.evaluate(() => homeCfg().cards.some(c => c.type === 'count' && c.date === '2026-12-26' && c.course === 'learn')), 'AI 助手可以往课程里加首页卡片（修改前征得同意）');
  // 7) 删除课程时一起删掉它的卡片；备份里的异常配置被校正
  check(await page.evaluate(async id => { const p = deleteCourse(COURSES.get(id)); await new Promise(r => setTimeout(r, 400)); $('.sheet [data-v="1"]').click(); await p; return !homeCfg().cards.some(c => c.course === id); }, cid), '删除课程时一起删除它的卡片');
  check(await page.evaluate(() => { S().home = { learn: 'x', wrong: 999, range: { a: 'b' }, cards: [null, { type: 'evil', id: '../x', title: 1, on: 0, course: 'nope' }] }; const H = homeCfg(); return H.learn === true && H.wrong === 30 && !H.range.a && H.cards.length === 1 && H.cards[0].type === 'text' && /^h/.test(H.cards[0].id) && H.cards[0].course === 'learn'; }), '异常的首页配置自动校正');
  await page.evaluate(() => go('today', {}, { tab: true })); await page.waitForTimeout(300);
  check(!errors.length, '没有脚本错误' + (errors.length ? '：' + errors.join(' | ') : ''));
  await ctx.close();
});

await run('手动新建、编辑、移动知识点和题目', async () => {
  const { page, ctx, errors } = await newPage();
  await page.evaluate(() => go('section', { id: 'learn1s1' })); await page.waitForSelector('[data-new="choice"]');
  // 新建单选题
  await page.click('[data-new="choice"]'); await page.waitForSelector('#ie-q');
  await page.fill('#ie-q', '间隔复习的依据是？'); await page.fill('[data-o="0"]', '遗忘曲线'); await page.fill('[data-o="1"]', '学习金字塔'); await page.fill('[data-o="2"]', '');
  await page.click('[data-ok="0"]'); await page.click('.sheet-wrap:last-child [data-save]'); await page.waitForTimeout(400);
  let it = await page.evaluate(() => { const x = secItems(SECS.get('learn1s1')).find(i => i.q === '间隔复习的依据是？'); return x && { id: x.id, t: x.t, o: x.o, a: x.a, pr: x.pr }; });
  check(it && it.t === 'choice' && it.o.length === 2 && it.a === 0 && it.pr === 1, '手动新建单选题（空选项自动去掉）');
  check(await page.evaluate(id => !!$(`[data-q="${id}"]`), it?.id), '新题目出现在小节的练习里');
  // 缺答案时提示
  await page.click('[data-new="kp"]'); await page.waitForSelector('#ie-q'); await page.click('.sheet-wrap:last-child [data-save]'); await page.waitForTimeout(200);
  check(await page.evaluate(() => /要点/.test($('.toast')?.textContent || '')), '必填项为空时提示，不保存');
  await page.fill('#ie-title', '我的知识点'); await page.fill('#ie-q', '- 先回忆再看答案'); await page.fill('#ie-d', '主动回忆比重读有效'); await page.click('.sheet-wrap:last-child [data-save]'); await page.waitForTimeout(400);
  check(await page.evaluate(() => secItems(SECS.get('learn1s1')).some(i => i.t === 'kp' && i.title === '我的知识点' && i.d === '主动回忆比重读有效' && !i.pr)), '手动新建知识点（要点 + 详解）');
  // 编辑：改成多选，并移到另一个小节，保留复习进度
  await page.evaluate(id => { const x = ITEMS.get(id); setSt(x, { s: 3, d: 5, reps: 2, lapses: 1, last: Date.now(), lr: 3, ivl: 3, due: Date.now() + 864e5 }); saveSrs('learn'); }, it.id);
  await page.click(`[data-edit="${it.id}"]`); await page.waitForSelector('#ie-q');
  await page.click('[data-ty="multi"]'); await page.click('[data-addo]'); await page.fill('[data-o="2"]', '记忆规律'); await page.click('[data-ok="2"]');
  await page.selectOption('#ie-sec', 'learn1s2'); await page.click('.sheet-wrap:last-child [data-save]'); await page.waitForTimeout(400);
  it = await page.evaluate(id => { const x = ITEMS.get(id); return x && { sec: x.sec, t: x.t, a: x.a, o: x.o, reps: getSt(x)?.reps, old: SECS.get('learn1s1').items.some(i => i.id === id) }; }, it.id);
  check(it && it.sec === 'learn1s2' && it.t === 'multi' && it.a.join() === '0,2' && it.o.length === 3 && it.reps === 2 && !it.old, `编辑题目：改成多选并移到其他小节，保留复习进度（${JSON.stringify(it)}）`);
  // 内置知识点：改内容以修正保存
  const kp = await page.evaluate(() => secKps(SECS.get('learn1s1')).find(i => i.builtin).id);
  await page.evaluate(() => refresh()); await page.waitForTimeout(300);
  await page.click(`[data-kp="${kp}"]`); await page.waitForSelector(`.kopen [data-edit="${kp}"]`); await page.click(`.kopen [data-edit="${kp}"]`); await page.waitForSelector('#ie-title');
  check(await page.evaluate(() => $('#ie-sec').disabled), '内置卡片不能移动');
  await page.fill('#ie-title', '改过的标题'); await page.click('.sheet-wrap:last-child [data-save]'); await page.waitForTimeout(400);
  check(await page.evaluate(id => ITEMS.get(id).title === '改过的标题' && Store.get('sec/learn1s1').items.some(x => x.id === id && x._p), kp), '内置知识点可以编辑（以修正保存）');
  // 学习时卡片菜单里也能编辑
  await page.evaluate(() => startSection('learn1s1')); await page.waitForSelector('.post [data-act="more"]');
  await page.click('.post [data-act="more"]'); await page.waitForTimeout(300);
  check(await page.evaluate(() => $$('.sheet .menu button').some(b => b.textContent.includes('编辑'))), '学习时卡片的「更多」菜单里有编辑');
  check(!errors.length, '没有脚本错误' + (errors.length ? '：' + errors.join(' | ') : ''));
  await ctx.close();
});

await run('调整顺序；课程包带上卡片分支', async () => {
  const { page, ctx, errors } = await newPage();
  // 1) 小节里的知识点、题目调整顺序（内置课程也可以，刷新后保留）
  await page.evaluate(() => go('section', { id: 'learn1s1' })); await page.waitForSelector('#smore');
  const before = await page.evaluate(() => ({ k: learnItems(SECS.get('learn1s1')).map(i => i.id), q: practiceItems(SECS.get('learn1s1')).map(i => i.id) }));
  await page.click('#smore'); await page.waitForTimeout(300); await page.locator('.sheet .menu button', { hasText: '调整顺序' }).click(); await page.waitForSelector('[data-osave]');
  check(await page.evaluate(() => $('[data-mv="0:0:-1"]').disabled && $$('.ordrow').length >= 3), '排序弹层：分「学习」「练习」两组，第一项不能再上移');
  await page.click('[data-mv="0:0:1"]'); await page.click('[data-mv="1:0:1"]'); await page.click('[data-osave]'); await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({ k: learnItems(SECS.get('learn1s1')).map(i => i.id), q: practiceItems(SECS.get('learn1s1')).map(i => i.id), first: $('[data-kp]')?.dataset.kp === secKps(SECS.get('learn1s1'))[0].id }));
  check(after.k[0] === before.k[1] && after.k[1] === before.k[0] && after.q[0] === before.q[1] && after.first, '知识点和题目的顺序已调整，小节页立即更新');
  await page.evaluate(() => Store.flushAll?.()); await page.reload(); await page.waitForSelector('.dayband');
  const kept = await page.evaluate(() => ({ k: learnItems(SECS.get('learn1s1')).map(i => i.id), q: practiceItems(SECS.get('learn1s1')).map(i => i.id) }));
  check(kept.k.join() === after.k.join() && kept.q.join() === after.q.join(), '重新打开 App 后顺序保留');
  await page.evaluate(() => startSection('learn1s1')); await page.waitForSelector('.post[data-pk]');
  check(await page.evaluate(k => Feed.queue[0]?.id === k, after.k[0]), '学习时按调整后的顺序出卡');
  // 2) 课程「卡片」分支排序
  await page.evaluate(() => { const H = homeCfg(); for (const t of ['甲', '乙', '丙']) H.cards.push(normHomeCard({ course: 'learn', type: 'text', title: t, body: t })); saveState(); go('course', { id: 'learn' }); });
  await page.waitForSelector('#ccord'); await page.click('#ccord'); await page.waitForSelector('[data-osave]');
  await page.click('[data-mv="0:2:-1"]'); await page.click('[data-osave]'); await page.waitForTimeout(400);
  check(await page.evaluate(() => courseCards('learn').map(c => c.title).join() === '甲,丙,乙' && $$('#ccl [data-hedit] .t').map(e => e.textContent).join() === '甲,丙,乙'), '卡片分支可以调整顺序');
  // 3) 课程包：导出带卡片（不带 AI 当天内容），另存导入后卡片跟着课程走
  const pack = await page.evaluate(() => { homeCfg().cards.push(normHomeCard({ course: 'learn', type: 'ai', title: '每日一句', prompt: '名言', ai: { day: dayKey(), text: '旧内容' } })); saveState(); return coursePack(COURSES.get('learn'), false); });
  check(pack.course.cards?.length === 4 && pack.course.cards.every(c => !c.ai && !c.id && !c.course), `课程包带上卡片分支（${pack.course.cards?.length} 张，不含当天 AI 内容）`);
  pack.course.cards.push({ type: 'count', title: '坏', date: 'x' }, { type: 'text', title: '<b>x</b>', body: '<script>alert(1)</script>ok' });
  const nid = await page.evaluate(p => { importPack(p, 'x'); return Nav.stack.at(-1).params.id; }, pack); await page.waitForSelector('#ccards');
  const st = await page.evaluate(id => ({ n: courseCards(id).length, titles: courseCards(id).map(c => c.title).join(), xss: !!$('#view script') }), nid);
  check(nid !== 'learn' && st.n === 5 && /甲,丙,乙/.test(st.titles) && !st.xss, `导入课程包：卡片放进新课程的卡片分支，无效卡片被丢弃（${st.n} 张）`);
  // 4) 用课程包更新自建课程：同名卡片就地更新，自己加的卡片保留
  const upd = await page.evaluate(id => { homeCfg().cards.push(normHomeCard({ course: id, type: 'text', title: '我自己的', body: '保留' })); const p = coursePack(COURSES.get(id), false); p.course.cards = [{ type: 'text', title: '甲', body: '甲·新' }, { type: 'text', title: '丁', body: '丁' }]; updateFromPack(COURSES.get(id), p.course); const cs = courseCards(id); return { 甲: cs.find(c => c.title === '甲')?.body, 丁: !!cs.find(c => c.title === '丁'), mine: !!cs.find(c => c.title === '我自己的'), n: cs.filter(c => c.title === '甲').length }; }, nid);
  check(upd.甲 === '甲·新' && upd.丁 && upd.mine && upd.n === 1, '更新课程：同名卡片就地更新，新卡片加入，自己加的保留');
  check(!errors.length, '没有脚本错误' + (errors.length ? '：' + errors.join(' | ') : ''));
  await ctx.close();
});

await browser.close(); server.close();
console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
process.exit(failed ? 1 : 0);
