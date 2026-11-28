/* ============ AI 诊断：错因、知识点标注、学情报告 ============ */
/* 原则：数字由本机算，模型只判断和表述；模型的每个输出都经过代码校验，不通过就丢弃或标为拿不准。 */
const ansShow = (it, a) => {
  if (a === undefined || a === null) return '';
  if (it.t === 'tf') return a ? '对' : '错';
  if (it.t === 'choice' || it.t === 'multi') return [].concat(a).map(i => `${String.fromCharCode(65 + i)}. ${plain(it.o?.[i] || '')}`).join('；');
  return String(a);
};
/* 规则信号：作为证据交给模型，也用来交叉检查模型的判断 */
function causeSignals(it, r) {
  const L = [], hist = attOf(it.id).filter(x => x !== r && x.t < r.t);
  L.push(`此前作答 ${hist.length} 次，答对 ${hist.filter(x => x.ok).length} 次`);
  if (r.r != null) L.push(`作答前记忆模型预测的回忆概率 ${Math.round(r.r * 100)}%`);
  const med = typeMedianMs(it.t); if (r.ms) L.push(`用时 ${Math.round(r.ms / 1000)} 秒${med ? `，同题型中位数 ${Math.round(med / 1000)} 秒` : ''}`);
  const same = sameWrongCount(r); if (same >= 2) L.push(`第 ${same} 次选同一个错误选项`);
  if (r.hint) L.push(`看了 ${r.hint}/${it.st?.length || r.hint} 步提示`);
  return L;
}
/* 依据必须来自学生的作答：选择题提到所选选项的字母或原文，写下的答案要有原文片段 */
function evidenceOk(it, r, ev, mine) {
  ev = String(ev || ''); if (ev.length < 4) return false;
  if (it.t === 'choice' || it.t === 'multi') return [].concat(r.ans ?? []).some(i => ev.includes(String.fromCharCode(65 + i)) || (it.o?.[i] && plain(it.o[i]).length >= 2 && ev.includes(plain(it.o[i]).slice(0, Math.min(6, plain(it.o[i]).length)))));
  if (it.t === 'tf') return /[对错]|正确|错误|真|假/.test(ev);
  const src = String(mine || r.ans || ''); if (!src) return true; // 自评没有作答原文时不强求
  for (let i = 0; i + 4 <= src.length; i++) if (ev.includes(src.slice(i, i + 4))) return true;
  return false;
}
function causePrompt(it, r, mine) {
  const sec = SECS.get(it.sec), c = COURSES.get(it.course);
  return `你是「${c.title}」的老师，要判断学生这道题错在哪里。只能从下面 6 类中选一个：
concept 概念不清（对概念、定义、原理理解有偏差）
method 方法不会（知道概念但不会用、思路不对、步骤不会）
forget 记忆遗忘（以前会，现在忘了）
read 审题失误（看错题意、漏看条件）
calc 计算失误（思路对，算错了）
slip 粗心（会做但手误、点错）
要求：
- 依据学生的作答判断，evidence 必须引用学生作答里的具体内容（如所选选项的字母和内容）。
- misconception 用不超过 30 字写出具体的错误想法，看不出来就留空。
- 拿不准时 confidence 给低分，不要硬猜。
只输出 JSON：{"cause":"concept|method|forget|read|calc|slip","misconception":"","evidence":"","confidence":0.0}

小节：${sec.title}
题目：
${itemToDSL(it)}

学生作答：${ansShow(it, r.ans) || (mine ? mine : '（没有写下作答，自评为没答出来）')}
作答情况：
${causeSignals(it, r).join('\n')}`;
}
async function askCause(it, r, mine, signal) {
  const j = await AI.A.json(causePrompt(it, r, mine), { signal, cache: false });
  const cause = String(j?.cause || ''), conf = Math.max(0, Math.min(1, +j?.confidence || 0));
  if (!CAUSE[cause]) return null;
  const evOk = evidenceOk(it, r, j.evidence, mine);
  return { cause, conf: evOk ? conf : Math.min(conf, .4), mis: String(j.misconception || '').trim().slice(0, 40), ev: String(j.evidence || '').trim().slice(0, 80), evOk };
}
/* 答错卡片上的 AI 按钮：先问一次；置信度低或与规则推断冲突时再独立问一次，两次一致才采用 */
/* 决定是否采用：先问一次；置信度低或与规则推断冲突时再独立问一次，两次一致才采用；最终置信度不到 0.5 不采用 */
async function decideCause(it, r, mine, signal) {
  let a = await askCause(it, r, mine, signal), asked = 1;
  if (a && (a.conf < .6 || (r.by === 'rule' && r.cause && r.cause !== a.cause))) { const b = await askCause(it, r, mine, signal); asked++; a = b && b.cause === a.cause ? { ...a, conf: Math.max(a.conf, b.conf), mis: a.mis || b.mis } : null; }
  return { res: a && a.conf >= .5 ? a : null, asked };
}
async function diagnoseCause(p) {
  if (!AI.require()) return; const it = p.it, r = p.att; if (!r || p.diag) return;
  p.diag = true; rerender(p);
  try {
    const { res: a } = await decideCause(it, r, p.mine);
    if (!a) toast('AI 拿不准，请自己选');
    else if (r.by === 'me' && r.cause !== a.cause) toast(`AI 认为是「${CAUSE[a.cause].l}」，保留你的选择`);
    else setCause(r, a.cause, 'ai', a.mis || a.ev);
  } catch (e) { toast(AI.err(e)); }
  p.diag = false; rerender(p);
}

/* ============ 题目 → 知识点 ============ */
/* 只能从本小节已有的知识点卡里选；本节只有一个知识点时直接关联，不调用模型；你改过的不覆盖 */
async function tagSection(sec, signal) {
  const kps = secKps(sec), qs = secQs(sec).filter(q => q.kpsBy !== 'me' && !(q.kps?.length && q.kpsBy));
  if (!qs.length || !kps.length) return 0;
  if (kps.length === 1) { for (const q of qs) patchItem(q, { kps: [kps[0].id], kpsBy: 'auto' }); Att.ver++; return qs.length; }
  if (!AI.A) return 0;
  const prompt = `下面是一个小节的知识点和题目。为每道题选出它考查的知识点（1~3 个，只能用下面列出的知识点 id；都不相关就给空数组）。
只输出 JSON：{"map":{"题目id":["知识点id"]}}

知识点：
${kps.map(k => `${k.id} | ${k.title || ''} | ${plain(k.q).replace(/\n/g, ' ').slice(0, 80)}`).join('\n')}

题目：
${qs.map(q => `${q.id} | ${TYPE_LABEL[q.t]} | ${plain(q.title ? q.title + ' ' + q.q : q.q).replace(/\n/g, ' ').slice(0, 160)}`).join('\n')}`;
  const j = await AI.A.json(prompt, { signal, cache: false }), ok = new Set(kps.map(k => k.id)); let n = 0;
  for (const q of qs) {
    const ids = [...new Set([].concat(j?.map?.[q.id] || []).map(String).filter(id => ok.has(id)))].slice(0, 3);
    if (ids.length) { patchItem(q, { kps: ids, kpsBy: 'ai' }); n++; }
  }
  Att.ver++; return n;
}

/* ============ 学情报告 ============ */
/* 证据包：所有数字由代码算好、带 id；模型写数字只能用 {id.指标} 占位，由代码替换 */
function evidencePack(c) {
  const ins = courseInsight(c), M = {}, R = {}, pc = v => v == null ? '—' : Math.round(v * 100) + '%', L = [];
  M['n'] = String(ins.n);
  const put = (id, x, title) => { R[id] = title; M[id + '.state'] = M_LABEL[x.st]; M[id + '.ok'] = `${x.ok}/${x.raw}`; if (x.st !== 'none') M[id + '.p'] = pc(x.p); if (x.mem != null) M[id + '.mem'] = pc(x.mem); };
  L.push(`课程「${c.title}」，共 {n} 次作答。`, '', '小节（id | 标题 | 状态 | 答对/作答 | 掌握度估计 | 记忆强度）：');
  for (const x of ins.rows) { const id = 's:' + x.sec.id; put(id, x, x.sec.title); L.push(`${id} | ${x.sec.title} | {${id}.state} | {${id}.ok} | ${x.st === 'none' ? '数据不足' : `{${id}.p}`} | ${x.mem != null ? `{${id}.mem}` : '—'}`); }
  if (ins.kps.length) { L.push('', '知识点：'); for (const x of ins.kps) { const id = 'k:' + x.it.id; put(id, x, x.it.title || plain(x.it.q).slice(0, 16)); L.push(`${id} | ${R[id]}（${SECS.get(x.it.sec).title}）| {${id}.state} | {${id}.ok} | ${x.st === 'none' ? '数据不足' : `{${id}.p}`}`); } }
  L.push('', '错因（每道错题最近一次）：');
  for (const [k, l] of CAUSES) { M['cause.' + k] = String(ins.causes[k].all); L.push(`${l}：{cause.${k}} 道`); }
  const wk = weeklyAcc(c.id, 5), cur = wk[4], prev = wk.slice(0, 4).reduce((a, w) => ({ ok: a.ok + w.ok, n: a.n + w.n }), { ok: 0, n: 0 });
  if (cur.n) { M['acc.week'] = pc(cur.ok / cur.n); L.push('', '本周正确率 {acc.week}'); }
  if (prev.n) { M['acc.prev'] = pc(prev.ok / prev.n); L.push('此前四周正确率 {acc.prev}'); }
  const wrong = wrongItems().filter(it => it.course === c.id).slice(0, 12);
  if (wrong.length) {
    L.push('', '错题（id | 小节 | 题目 | 学生最近一次作答 | 正确答案 | 错因 | 误概念）：');
    for (const it of wrong) {
      const id = 'q:' + it.id, lw = lastWrong(it.id); R[id] = plain(it.title || it.q).slice(0, 24);
      M[id + '.lapses'] = String(getSt(it)?.lapses || 0); if (lw && sameWrongCount(lw) >= 2) M[id + '.same'] = String(sameWrongCount(lw));
      L.push(`${id} | ${SECS.get(it.sec).title} | ${plain(it.title ? it.title + ' ' + it.q : it.q).replace(/\n/g, ' ').slice(0, 80)} | ${lw ? ansShow(it, lw.ans) || '—' : '—'} | ${plain(ansText(it) || it.a || '').slice(0, 30)} | ${lw?.cause ? CAUSE[lw.cause].l : '未标'} | ${lw?.by === 'ai' || lw?.by === 'me' ? lw.why || '' : ''} | 错 {${id}.lapses} 次${M[id + '.same'] ? '，同一错项 {' + id + '.same} 次' : ''}`);
    }
  }
  return { text: L.join('\n'), M, R, ins };
}
const REPORT_RULES = `你是学习分析助手。下面是学生一门课的学情证据，数字都已由程序算好。请写 2~5 条最重要的发现和对应的改进动作。
硬性规则：
1. 不能自己写任何数字。需要数字时只能用证据里出现过的占位符，原样写成 {s:xxx.p}、{q:xxx.lapses}、{cause.concept} 这样，程序会替换成真实数值。
2. 每条发现必须在 refs 里列出依据的 id（s:小节、k:知识点、q:题目），只能用证据里有的 id。
3. 状态为「数据不足」的小节或知识点，不要下掌握好坏的结论。
4. 发现要具体：指出是哪个知识点、错在哪种想法上，而不是泛泛地说「要加强练习」。
5. action.type 只能是 practice（练这些题）、explain（换个讲法再学一遍）、variant（针对错题出变式题）、review（按计划复习）；action.ref 是一个 id。
只输出 JSON：{"summary":"一句话总评","findings":[{"text":"…","refs":["s:…"],"action":{"type":"practice","ref":"s:…"}}]}`;
/* 校验一条文字：占位符必须存在；去掉占位符和引用对象的标题后不能再有数字 */
function checkText(text, E) {
  const t = String(text || '').trim(); if (!t) return null;
  const phs = [...t.matchAll(/\{([a-z]+(?::[\w.-]+?)?\.\w+|n)\}/gi)].map(m => m[1]);
  if (phs.some(k => !(k in E.M))) return null;
  let rest = t.replace(/\{[^}]*\}/g, '');
  for (const title of Object.values(E.R).sort((a, b) => b.length - a.length)) if (title) rest = rest.split(title).join('');
  for (const it of ITEMS.values()) if (it.course === E.ins.c.id && it.title && rest.includes(it.title)) rest = rest.split(it.title).join('');
  if (/\d/.test(rest.replace(/O\([^)]*\)|[A-Za-z]+\d+[A-Za-z\d]*|\$[^$]*\$/g, ''))) return null;
  if (/[{}]/.test(rest)) return null;
  return t;
}
function validateReport(j, E) {
  const out = { summary: checkText(j?.summary, E) || '', findings: [] };
  for (const f of [].concat(j?.findings || []).slice(0, 6)) {
    const text = checkText(f?.text, E); if (!text) continue;
    const refs = [...new Set([].concat(f.refs || []).map(String).filter(id => id in E.R))]; if (!refs.length) continue;
    const decided = refs.filter(id => !id.startsWith('q:')).map(id => E.M[id + '.state']);
    if (decided.length && decided.every(s => s === M_LABEL.none)) continue;
    const a = f.action || {}, type = ['practice', 'explain', 'variant', 'review'].includes(a.type) ? a.type : 'practice';
    const ref = String(a.ref || '') in E.R ? String(a.ref) : refs[0];
    out.findings.push({ text, refs, action: { type, ref } });
  }
  return out;
}
const fillText = (t, M) => esc(t).replace(/\{([^}]+)\}/g, (_, k) => k in M ? `<b class="num">${esc(M[k])}</b>` : '');
/* 报告核心（评测脚本也调用）：最多请求两次，返回校验后的结果和每次被删去的条数 */
async function makeReport(c) {
  const E = evidencePack(c), tries = []; let rep = null;
  for (let i = 0; i < 2 && !(rep?.findings.length); i++) { const raw = await AI.A.json(`${REPORT_RULES}\n\n证据：\n${E.text}`, { cache: false }); rep = validateReport(raw, E); tries.push({ raw: [].concat(raw?.findings || []).length, kept: rep.findings.length }); }
  return { E, rep, tries };
}
async function runReport(c) {
  if (!AI.require()) return;
  const box = $('#in-report'); if (!box) return;
  box.innerHTML = `<div class="card"><div class="prog"><span class="spin"></span>${ico('bulb')}关联知识点…</div></div>`;
  try {
    for (const s of courseSecs(c)) if (evidence().sec.has(s.id) && secQs(s).some(q => !q.kps?.length && q.kpsBy !== 'me')) await tagSection(s);
    box.innerHTML = `<div class="card"><div class="prog"><span class="spin"></span>${ico('spark')}分析中…</div></div>`;
    const { E, rep } = await makeReport(c);
    if (!rep.findings.length) { box.innerHTML = `<div class="card empty-s">${ico('alert')}这次没有得到可靠的结论，稍后再试</div>`; return; }
    (S().reports ||= {})[c.id] = { at: Date.now(), n: E.ins.n, M: E.M, R: E.R, ...rep }; saveState(); logEvent('学情分析 ' + c.title);
  } catch (e) { box.innerHTML = `<div class="card empty-s">${ico('alert')}${esc(AI.err(e))}</div>`; return; }
  if (Nav.stack[Nav.stack.length - 1]?.view === 'insight') refresh();
}
function reportBlock(c) {
  const r = S().reports?.[c.id];
  if (!r) return `<button class="card rp-new" data-rp-run>${ico('spark', '', 'duo')}<span>${AI.ok ? '生成分析' : 'AI 分析'}</span></button>`;
  const stale = courseInsight(c).n - r.n;
  const act = { practice: ['play', '练这些'], explain: ['bulb', '换个讲法'], variant: ['repeat', '举一反三'], review: ['review', '复习'] };
  return `<div class="card rp">${r.summary ? `<p class="rp-s">${fillText(r.summary, r.M)}</p>` : ''}${r.findings.map((f, i) => `<div class="rp-f"><div class="md">${fillText(f.text, r.M)}</div><div class="rp-refs">${f.refs.map(id => `<span class="pill">${ico(id[0] === 'q' ? 'pen' : id[0] === 'k' ? 'bulb' : 'list')}${esc((r.R[id] || '').slice(0, 14))}</span>`).join('')}<button class="btn soft sm" data-rp="${i}">${ico(act[f.action.type][0])}${act[f.action.type][1]}</button></div></div>`).join('')}<div class="rp-foot">${ico('clock')}${new Date(r.at).toLocaleDateString()} · ${ico('pen')}<span class="num">${r.n}</span>${stale > 0 ? ` · <span class="pill acc">+${stale}</span>` : ''}<button class="link" data-rp-run>${ico('sync')}更新</button></div></div>`;
}
function bindReport(box, c) {
  if (!box) return;
  $$('[data-rp-run]', box).forEach(b => b.onclick = () => runReport(c));
  $$('[data-rp]', box).forEach(b => b.onclick = () => { const f = S().reports[c.id].findings[+b.dataset.rp]; reportAction(f.action, c); });
}
function reportAction({ type, ref }, c) {
  const [k, id] = [ref.slice(0, 1), ref.slice(2)];
  const it = k === 'q' || k === 'k' ? ITEMS.get(id) : null, sec = k === 's' ? SECS.get(id) : it ? SECS.get(it.sec) : null;
  if (type === 'review') return openReview('review', { course: c.id });
  if (type === 'explain' && sec) return genSheet({ sid: sec.id, kpN: 2, qN: 2, weak: true, focus: it ? `重点讲清：${it.title || plain(it.q).slice(0, 30)}` : '' });
  if (type === 'variant') { const ids = k === 'q' ? [id] : wrongItems().filter(w => sec && w.sec === sec.id).map(w => w.id); return variantSheet(ids.slice(0, 5)); }
  if (k === 'q' && it) return go('session', { kind: 'items', ids: [id], lab: '补弱' });
  if (k === 'k' && it) return practiceWeak({ it });
  if (sec) return practiceWeak({ sec });
}
