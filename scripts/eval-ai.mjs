// 学情分析的 AI 准确度评测：用标注测试集（tests/eval/dataset.json）在真实模型上跑 App 里的同一套代码，按环节和题型统计。
//
// 用法（API Key 用环境变量传，不要写在命令行里）：
//   EVAL_KEY=sk-... node scripts/eval-ai.mjs --provider deepseek --model deepseek-chat
//   EVAL_KEY=sk-ant-... node scripts/eval-ai.mjs --provider claude --model claude-opus-5-5 --vision
//   node scripts/eval-ai.mjs --provider custom --base https://example.com/v1 --model xxx --vision
//   node scripts/eval-ai.mjs --mock                  不调用真实模型，用模拟回复检查脚本本身
// 选项：--only solve,cause,tag,recog,report   只跑部分环节；--runs 2   报告环节重复次数；--out 目录（默认 tests/eval/results）
// 录题环节需要能看图的模型（--vision）。tests/eval/photos/ 下放真实照片和 labels.json（格式同 dataset.json 的 recog，
// 每页多一个 "file" 字段写照片文件名）时，会和渲染出来的图片一起评测。
// 结果写成 JSON，并在终端打印汇总表。脚本只读写本机文件，请求只发给你指定的服务商。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WWW = path.join(ROOT, 'www'), EVAL = path.join(ROOT, 'tests/eval');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => { if (x.startsWith('--')) a.push([x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]); return a; }, []));
const MOCK = !!args.mock, ONLY = new Set(String(args.only || 'solve,cause,tag,recog,report').split(',')), RUNS = Math.max(1, +args.runs || 2);
const provider = MOCK ? 'deepseek' : String(args.provider || ''), model = MOCK ? 'mock' : String(args.model || ''), key = MOCK ? 'sk-mock' : process.env.EVAL_KEY || '';
if (!MOCK && (!provider || !model || !key)) { console.error('需要 --provider、--model 和环境变量 EVAL_KEY（或用 --mock 自检）'); process.exit(2); }
const DS = JSON.parse(fs.readFileSync(path.join(EVAL, 'dataset.json'), 'utf8'));

if (!fs.existsSync(path.join(WWW, 'app.js'))) execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), 'app'], { stdio: 'inherit' });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.join(WWW, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  if (!p.startsWith(WWW) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, r));
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
// 浏览器直接请求服务商时会被跨域策略拦下，评测时关闭这项检查（只在这个临时浏览器里）
const browser = await chromium.launch({ args: ['--disable-web-security'], ...(proxy && !MOCK ? { proxy: { server: proxy } } : {}) });

/* ---------- 把录题测试页渲染成「照片」：印刷题干 + 蓝色手写作答 + 红笔批改 ---------- */
async function renderPages() {
  const pg = await browser.newPage({ viewport: { width: 820, height: 1100 }, deviceScaleFactor: 1.5 }), out = [];
  for (const p of DS.recog) {
    const qs = p.questions.map(q => {
      const mark = q.mark ? `<span class="mk ${q.mark}">${q.mark === 'right' ? '✓' : '✗'}</span>` : '';
      const opts = q.options.length ? `<div class="op">${q.options.map((o, i) => `<span>${String.fromCharCode(65 + i)}. ${o}</span>`).join('')}</div>` : '';
      const fill = q.type === 'qa' ? '' : `（<span class="hw">${q.mine}</span>）`;
      return `<div class="q">${mark}<b>${q.no}.</b> ${q.stem.replace(/（ ）$/, '')}${fill}${opts}${q.type === 'qa' ? `<div class="hw ans">答：${q.mine}</div>` : ''}${q.answer ? `<div class="key">【答案】${q.answer}</div>` : ''}</div>`;
    }).join('');
    await pg.setContent(`<html><body style="margin:0;background:#d9d4c7"><div id="paper" style="width:760px;margin:20px;padding:36px 40px;background:#fbf8ef;transform:rotate(-.7deg);filter:blur(.35px);font:22px/1.7 'Noto Serif CJK SC','Songti SC',serif;color:#222;box-shadow:0 2px 8px rgba(0,0,0,.25)">
      <style>.q{position:relative;margin:0 0 34px;padding-left:6px}.op{display:flex;flex-wrap:wrap;gap:8px 40px;margin-top:6px}.hw{font-family:'Comic Sans MS','Kaiti SC','KaiTi',cursive;color:#1d3fa8;font-size:26px;font-style:italic}.ans{margin-top:8px}.mk{position:absolute;left:-34px;top:-6px;font-size:40px;color:#d42a2a;transform:rotate(-12deg)}.mk.wrong{font-size:36px}.key{font-size:16px;color:#777;margin-top:4px}</style>
      <div style="font-size:18px;color:#555;margin-bottom:20px">练习 · 第 ${p.id.slice(1)} 页　　姓名：<span class="hw">小明</span></div>${qs}</div></body></html>`);
    out.push({ id: p.id, gt: p.questions, b64: (await (await pg.$('#paper')).screenshot({ type: 'jpeg', quality: 85 })).toString('base64') });
  }
  const dir = path.join(EVAL, 'photos'), lf = path.join(dir, 'labels.json');
  if (fs.existsSync(lf)) for (const p of JSON.parse(fs.readFileSync(lf, 'utf8'))) { const f = path.join(dir, p.file); if (fs.existsSync(f)) out.push({ id: 'photo:' + p.file, gt: p.questions, b64: fs.readFileSync(f).toString('base64'), real: true }); }
  await pg.close(); return out;
}

/* ---------- 模拟回复（--mock）：按标注答案回复，并有意掺入少量错误，检查统计逻辑 ---------- */
let recogCalls = 0;
function mockReply(txt) {
  const find = list => list.find(x => txt.includes((x.q || x.item?.q || '').slice(0, 12)));
  if (txt.includes('独立解答下面这道题')) {
    const it = find(DS.solve) || find(DS.cause.map(c => ({ ...c.item }))); if (!it) return { answer: '' };
    const wrong = it.id === 's4' || it.id === 's9';
    const a = it.t === 'choice' ? String.fromCharCode(65 + (wrong ? (it.a + 1) % it.o.length : it.a)) : it.t === 'multi' ? it.a.map(i => String.fromCharCode(65 + i)).join('') : it.t === 'tf' ? (it.a !== wrong ? '对' : '错') : wrong ? '999' : it.a;
    return { answer: a, expr: '', x: '略' };
  }
  if (txt.includes('只能从下面 6 类中选一个')) {
    const c = DS.cause.find(c => txt.includes(c.item.q.slice(0, 12))), m = /学生作答：([A-F])\./.exec(txt);
    const cause = c.id === 'c4' ? 'concept' : c.label;
    return { cause, misconception: '', evidence: m ? `选了 ${m[1]}` : `学生写了「${String(c.ans).slice(0, 6)}」`, confidence: c.id === 'c8' ? .3 : .85 };
  }
  if (txt.includes('为每道题选出它考查的知识点')) {
    const sec = DS.tag.find(s => txt.includes(s.kps[0].title)), ids = [...txt.split('题目：')[1].matchAll(/^(\S+) \|/gm)].map(m => m[1]);
    const real = id => sec.kps.find(k => id.endsWith('-' + k.id))?.id;
    const kpIds = [...txt.split('题目：')[0].matchAll(/^(\S+) \|/gm)].map(m => m[1]);
    return { map: Object.fromEntries(ids.map((id, i) => { const q = sec.qs[i]; return [id, (i === 0 ? ['k2'] : q.label).map(l => kpIds.find(k => k.endsWith('-' + l))).filter(Boolean)]; })) };
  }
  if (txt.includes('请逐题识别')) {
    const p = DS.recog[Math.floor(recogCalls++ / 2) % DS.recog.length], second = recogCalls % 2 === 0;
    return { questions: p.questions.map((q, i) => ({ page: 1, box: [0, i * 330, 1000, i * 330 + 320], no: q.no, type: q.type, stem: q.stem, options: q.options, answer: q.answer, mine: i === 1 && second ? 'X' : q.mine, mark: q.mark, sec: '', unsure: [] })) };
  }
  if (txt.includes('学习分析助手')) {
    const sid = /^(s:\S+) \|/m.exec(txt)?.[1] || 's:x';
    return { summary: '共 {n} 次作答', findings: [{ text: `答对 {${sid}.ok}`, refs: [sid], action: { type: 'practice', ref: sid } }, { text: '正确率 42%', refs: [sid] }] };
  }
  return {};
}

/* ---------- 打开 App，配置模型 ---------- */
const page = await browser.newPage();
const pageErrors = []; page.on('pageerror', e => pageErrors.push(e.message));
if (MOCK) await page.route('https://api.deepseek.com/**', r => {
  const b = r.request().postDataJSON?.() || {}, last = b.messages?.at(-1)?.content, txt = typeof last === 'string' ? last : (last || []).map(p => p.text || '').join('\n');
  return r.fulfill({ headers: { 'content-type': 'text/event-stream' }, body: `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: JSON.stringify(mockReply(txt)) } }] })}\n\ndata: [DONE]\n\n` });
});
await page.goto(`http://localhost:${server.address().port}/index.html`); await page.waitForSelector('.dayband', { timeout: 30000 });
const cfgOk = await page.evaluate(async ({ provider, model, key, base, vision }) => {
  const p = AI_PRESETS[provider]; if (!p) return 'unknown provider';
  await Platform.aiConfig.set({ provider, kind: p.kind, key, model, base: base || p.base, vision: !!vision }); await Platform.anConfig.set(null); await AI.reload();
  addCourse({ id: 'ev', title: '综合测评', cat: '测评', chapters: [{ id: 'evc', title: '测评', sections: [{ id: 'evs', title: '测评题' }] }] }, false);
  return AI.ok ? '' : 'AI 不可用';
}, { provider, model, key, base: args.base || '', vision: MOCK || !!args.vision });
if (cfgOk) { console.error(cfgOk); process.exit(2); }
const started = Date.now(), R = { meta: { provider, model, vision: MOCK || !!args.vision, mock: MOCK, at: new Date().toISOString(), version: JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version } };
const pct = x => x == null || isNaN(x) ? '—' : (x * 100).toFixed(0) + '%';
const step = name => process.stdout.write(`\n${name} `);

/* ---------- 1. 盲解：采用的答案有多少是对的，有多少题能给出答案 ---------- */
if (ONLY.has('solve')) {
  step('盲解');
  const rows = [];
  for (const it of DS.solve) {
    rows.push(await page.evaluate(async it => { try { const r = await solveBlind({ t: it.t, q: it.q, o: it.o }, 3); const gt = itemKey(it); return { id: it.id, t: it.t, domain: it.domain, agree: r.agree, accepted: r.agree >= 2, right: keyEq(r.key, gt), key: r.key, gt }; } catch (e) { return { id: it.id, t: it.t, domain: it.domain, err: String(e.code || e.message) }; } }, it));
    process.stdout.write('.');
  }
  const acc = rows.filter(r => r.accepted), unan = rows.filter(r => r.agree === 3);
  R.solve = { n: rows.length, coverage: acc.length / rows.length, precision: acc.length ? acc.filter(r => r.right).length / acc.length : null, wrongAccepted: acc.filter(r => !r.right).map(r => r.id), unanimousPrecision: unan.length ? unan.filter(r => r.right).length / unan.length : null, rawAccuracy: rows.filter(r => r.right).length / rows.length, errors: rows.filter(r => r.err).length, rows };
}

/* ---------- 2. 错因：AI 采用的判断准不准、规则推荐准不准、最终结果 ---------- */
if (ONLY.has('cause')) {
  step('错因');
  await page.evaluate(meds => { // 给每种题型垫 6 条正常用时的记录，让「用时很短」的规则可以工作
    for (const [t, ms] of Object.entries(meds)) for (let i = 0; i < 6; i++) { const id = `evm-${t}-${i}`; ITEMS.set(id, { id, t, q: '垫底', course: 'ev', sec: 'evs' }); attAdd({ id, c: 'ev', s: 'evs', t: Date.now() - 864e5 * 30 - i, m: 'review', g: 3, ok: true, ms, first: true }); }
  }, { choice: 20000, tf: 12000, qa: 30000 });
  const rows = [];
  for (const c of DS.cause) {
    rows.push(await page.evaluate(async c => {
      const id = 'evc-' + c.id, it = { ...c.item, id, course: 'ev', sec: 'evs' }; ITEMS.set(id, it); SECS.get('evs').items.push(it);
      c.hist.forEach((ok, i) => attAdd({ id, c: 'ev', s: 'evs', t: Date.now() - (c.hist.length - i + 2) * 864e5 * 4, m: 'review', g: ok ? 3 : 1, ok, first: true }));
      const typed = typeof c.ans === 'string' && !['choice', 'multi', 'tf'].includes(it.t);
      const r = attAdd({ id, c: 'ev', s: 'evs', t: Date.now(), m: 'review', g: 1, ok: false, first: true, ms: c.ms, ...(c.r != null ? { r: c.r } : {}), ...(typed ? { ans: c.ans } : { ans: c.ans }) });
      const sug = ruleCause(it, r); if (sug) { r.cause = sug.cause; r.by = 'rule'; }
      try { const { res, asked } = await decideCause(it, r, typed ? c.ans : ''); const final = res?.cause || sug?.cause || null; return { id: c.id, label: c.label, rule: sug?.cause || null, ai: res?.cause || null, conf: res?.conf ?? null, evOk: res?.evOk ?? null, asked, final }; }
      catch (e) { return { id: c.id, label: c.label, err: String(e.code || e.message) }; }
    }, c));
    process.stdout.write('.');
  }
  const ai = rows.filter(r => r.ai), rule = rows.filter(r => r.rule), fin = rows.filter(r => r.final);
  const per = {}; for (const r of rows) { const p = per[r.label] ||= { n: 0, aiRight: 0, finalRight: 0 }; p.n++; if (r.ai === r.label) p.aiRight++; if (r.final === r.label) p.finalRight++; }
  R.cause = { n: rows.length, aiCoverage: ai.length / rows.length, aiPrecision: ai.length ? ai.filter(r => r.ai === r.label).length / ai.length : null, ruleCoverage: rule.length / rows.length, rulePrecision: rule.length ? rule.filter(r => r.rule === r.label).length / rule.length : null, finalCoverage: fin.length / rows.length, finalPrecision: fin.length ? fin.filter(r => r.final === r.label).length / fin.length : null, calls: rows.reduce((s, r) => s + (r.asked || 0), 0), perCause: per, rows };
}

/* ---------- 3. 知识点关联：精确率与召回率 ---------- */
if (ONLY.has('tag')) {
  step('知识点');
  const rows = [];
  for (const [si, sec] of DS.tag.entries()) {
    rows.push(...await page.evaluate(async ({ sec, si }) => {
      const sid = 'evt' + si, pre = sid + '-';
      addCourse({ id: 'evt' + si + 'c', title: sec.title, cat: '测评', chapters: [{ id: sid + 'ch', title: sec.title, sections: [{ id: sid, title: sec.title, items: [...sec.kps.map(k => ({ id: pre + k.id, t: 'kp', title: k.title, q: k.q })), ...sec.qs.map(q => ({ id: pre + q.id, t: q.t, q: q.q, o: q.o, a: q.a, pr: 1 }))] }] }] }, false);
      try { await tagSection(SECS.get(sid)); } catch (e) { return [{ err: String(e.code || e.message) }]; }
      return sec.qs.map(q => { const got = (ITEMS.get(pre + q.id).kps || []).map(id => id.slice(pre.length)); return { id: q.id, label: q.label, got, tp: got.filter(x => q.label.includes(x)).length }; });
    }, { sec, si }));
    process.stdout.write('.');
  }
  const ok = rows.filter(r => !r.err), tp = ok.reduce((s, r) => s + r.tp, 0), got = ok.reduce((s, r) => s + r.got.length, 0), lab = ok.reduce((s, r) => s + r.label.length, 0);
  R.tag = { n: ok.length, precision: got ? tp / got : null, recall: lab ? tp / lab : null, exact: ok.filter(r => r.tp === r.label.length && r.got.length === r.label.length).length / Math.max(1, ok.length), errors: rows.length - ok.length, rows };
}

/* ---------- 4. 录题识别：逐字段准确率，以及「标出不一致」能抓住多少错误 ---------- */
if (ONLY.has('recog')) {
  step('录题');
  if (!(MOCK || args.vision)) R.recog = { skipped: '模型不能看图（加 --vision）' };
  else {
    const pages = await renderPages(), rows = [];
    fs.mkdirSync(path.join(EVAL, 'rendered'), { recursive: true });
    for (const p of pages) if (!p.real) fs.writeFileSync(path.join(EVAL, 'rendered', p.id + '.jpg'), Buffer.from(p.b64, 'base64'));
    for (const p of pages) {
      rows.push(await page.evaluate(async p => {
        const lev = (a, b) => { const m = a.length, n = b.length, d = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { let pv = d[0]; d[0] = i; for (let j = 1; j <= n; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, pv + (a[i - 1] === b[j - 1] ? 0 : 1)); pv = t; } } return d[n]; };
        const sup = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '−': '-' };
        const norm = s => normAns(String(s || '').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹−]/g, c => sup[c]).replace(/\\(mathrm|text|operatorname)\{([^}]*)\}/g, '$2').replace(/[\\{}^_]/g, '').replace(/（\s*）|\(\s*\)/g, ''));
        const sim = (a, b) => { a = norm(a); b = norm(b); return !a && !b ? 1 : 1 - lev(a, b) / Math.max(a.length, b.length); };
        const blob = await (await fetch('data:image/jpeg;base64,' + p.b64)).blob();
        let qs; try { qs = await capRecognize(COURSES.get('ev'), [blob], '', 'all'); } catch (e) { return { id: p.id, err: String(e.code || e.message) }; }
        const out = [];
        for (const g of p.gt) {
          const q = qs.find(x => x.no === g.no) || null;
          if (!q) { out.push({ no: g.no, missing: true }); continue; }
          const f = {
            type: q.type === g.type || (g.type === 'multi' && q.type === 'choice' && g.mine.length === 1),
            stem: sim(q.stem, g.stem) >= .9, options: g.options.length === q.options.length && g.options.every((o, i) => sim(o, q.options[i]) >= .85),
            mine: keyEq(ansKey(g.type, q.mine), ansKey(g.type, g.mine)) || norm(q.mine) === norm(g.mine) || norm(q.mine).endsWith(norm(g.mine)),
            mark: (q.mark || '') === (g.mark || ''), answer: !g.answer ? !q.answer : keyEq(ansKey(g.type, q.answer), ansKey(g.type, g.answer))
          };
          out.push({ no: g.no, f, stemSim: sim(q.stem, g.stem), flags: q.flags });
        }
        return { id: p.id, real: !!p.real, found: qs.length, expected: p.gt.length, extra: qs.filter(q => !p.gt.some(g => g.no === q.no)).length, qs: out };
      }, p));
      process.stdout.write('.');
    }
    const qs = rows.flatMap(r => r.qs || []), have = qs.filter(q => !q.missing), F = ['type', 'stem', 'options', 'mine', 'mark', 'answer'];
    const fieldAcc = Object.fromEntries(F.map(k => [k, have.length ? have.filter(q => q.f[k]).length / have.length : null]));
    let errs = 0, caught = 0, flagged = 0, falseAlarm = 0;
    for (const q of have) for (const k of F) { const fl = q.flags.includes(k) || q.flags.includes('once'); if (!q.f[k]) { errs++; if (fl) caught++; } else if (q.flags.includes(k)) falseAlarm++; if (q.flags.includes(k)) flagged++; }
    R.recog = { pages: rows.length, questions: qs.length, found: have.length / Math.max(1, qs.length), extra: rows.reduce((s, r) => s + (r.extra || 0), 0), fieldAcc, allFieldsRight: have.length ? have.filter(q => F.every(k => q.f[k])).length / have.length : null, meanStemSim: have.length ? have.reduce((s, q) => s + q.stemSim, 0) / have.length : null, fieldErrors: errs, errorsFlagged: errs ? caught / errs : null, falseAlarms: falseAlarm, errors: rows.filter(r => r.err).length, rows };
  }
}

/* ---------- 5. 学情报告：模型的结论有多少通过校验 ---------- */
if (ONLY.has('report')) {
  step('报告');
  await page.evaluate(() => { // 测评课程里造一段作答历史：一节明显薄弱、一节较好
    addCourse({ id: 'evr', title: '数据结构（测评）', cat: '测评', chapters: [{ id: 'evrc', title: '线性表', sections: [
      { id: 'evr1', title: '栈', items: [{ id: 'evr1k', t: 'kp', title: '栈的特点', q: '后进先出' }, ...[1, 2, 3, 4].map(i => ({ id: 'evr1q' + i, t: 'choice', q: '栈的题 ' + i, o: ['先进先出', '后进先出'], a: 1, pr: 1, kps: ['evr1k'], kpsBy: 'me' }))] },
      { id: 'evr2', title: '队列', items: [{ id: 'evr2k', t: 'kp', title: '队列的特点', q: '先进先出' }, ...[1, 2, 3, 4].map(i => ({ id: 'evr2q' + i, t: 'tf', q: '队列的题 ' + i, a: true, pr: 1, kps: ['evr2k'], kpsBy: 'me' }))] }] }] }, false);
    const now = Date.now();
    for (let d = 0; d < 6; d++) for (let i = 1; i <= 4; i++) {
      const a = ITEMS.get('evr1q' + i), b = ITEMS.get('evr2q' + i), t = now - d * 864e5 - i * 1000;
      const r = attAdd({ id: a.id, c: 'evr', s: 'evr1', t, m: 'review', g: d % 3 ? 1 : 3, ok: !(d % 3), first: true, ans: [0] }); if (!r.ok) { r.cause = 'concept'; r.by = 'me'; r.why = '把栈当成先进先出'; }
      attAdd({ id: b.id, c: 'evr', s: 'evr2', t, m: 'review', g: 3, ok: true, first: true });
      setSt(a, schedule(getSt(a), d % 3 ? 1 : 3, t)); setSt(b, schedule(getSt(b), 3, t));
    }
  });
  const rows = [];
  for (let i = 0; i < RUNS; i++) { rows.push(await page.evaluate(async () => { try { const { rep, tries } = await makeReport(COURSES.get('evr')); return { kept: rep.findings.length, tries, mentionsStack: rep.findings.some(f => f.refs.some(id => id.includes('evr1'))) }; } catch (e) { return { err: String(e.code || e.message) }; } })); process.stdout.write('.'); }
  const ok = rows.filter(r => !r.err), raw = ok.reduce((s, r) => s + r.tries.reduce((a, t) => a + t.raw, 0), 0), kept = ok.reduce((s, r) => s + r.tries.reduce((a, t) => a + t.kept, 0), 0);
  R.report = { runs: rows.length, success: ok.filter(r => r.kept).length / Math.max(1, rows.length), findingPassRate: raw ? kept / raw : null, retries: ok.filter(r => r.tries.length > 1).length, foundWeak: ok.filter(r => r.mentionsStack).length / Math.max(1, ok.length), errors: rows.length - ok.length, rows };
}

/* ---------- 汇总 ---------- */
R.meta.seconds = Math.round((Date.now() - started) / 1000); R.meta.pageErrors = pageErrors;
const L = [`\n\n评测：${provider} · ${model}${MOCK ? '（模拟）' : ''}　用时 ${R.meta.seconds} 秒`];
if (R.solve) L.push(`盲解（${R.solve.n} 题）  采用率 ${pct(R.solve.coverage)}  采用的答案正确率 ${pct(R.solve.precision)}  3/3 一致时正确率 ${pct(R.solve.unanimousPrecision)}  单看多数答案 ${pct(R.solve.rawAccuracy)}${R.solve.wrongAccepted.length ? `  错采：${R.solve.wrongAccepted.join(',')}` : ''}`);
if (R.cause) L.push(`错因（${R.cause.n} 题）  AI 采用率 ${pct(R.cause.aiCoverage)}  AI 准确率 ${pct(R.cause.aiPrecision)}  规则覆盖 ${pct(R.cause.ruleCoverage)}  规则准确率 ${pct(R.cause.rulePrecision)}  最终 ${pct(R.cause.finalCoverage)} / ${pct(R.cause.finalPrecision)}`,
  '  按错因（AI 判对 / 最终判对）：' + Object.entries(R.cause.perCause).map(([k, v]) => `${k} ${v.aiRight}/${v.finalRight}/${v.n}`).join('  '));
if (R.tag) L.push(`知识点（${R.tag.n} 题）  精确率 ${pct(R.tag.precision)}  召回率 ${pct(R.tag.recall)}  完全一致 ${pct(R.tag.exact)}`);
if (R.recog) L.push(R.recog.skipped ? `录题  跳过：${R.recog.skipped}` : `录题（${R.recog.pages} 页 ${R.recog.questions} 题）  找到 ${pct(R.recog.found)}  多出 ${R.recog.extra}  全对 ${pct(R.recog.allFieldsRight)}  ` + Object.entries(R.recog.fieldAcc).map(([k, v]) => `${k} ${pct(v)}`).join('  ') + `\n  字段错误 ${R.recog.fieldErrors} 处，其中被标出 ${pct(R.recog.errorsFlagged)}；误标 ${R.recog.falseAlarms} 处`);
if (R.report) L.push(`报告（${R.report.runs} 次）  成功 ${pct(R.report.success)}  结论通过校验 ${pct(R.report.findingPassRate)}  需要重试 ${R.report.retries} 次  点出薄弱的「栈」 ${pct(R.report.foundWeak)}`);
if (pageErrors.length) L.push('页面错误：' + pageErrors.slice(0, 3).join(' | '));
console.log(L.join('\n'));
const outDir = path.resolve(ROOT, String(args.out || 'tests/eval/results')); fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, `${provider}-${model.replace(/[^\w.-]/g, '_')}-${R.meta.at.slice(0, 16).replace(/[:T]/g, '')}.json`);
fs.writeFileSync(file, JSON.stringify(R, null, 1)); console.log(`\n结果：${path.relative(ROOT, file)}`);
await browser.close(); server.close();
