/* ============ 作答记录（学情分析的数据底座） ============ */
/* 每次评分写一条记录，按月存成文档 att/<YYYY-MM>：{ a: [记录] }。字段：
   id 卡片 id · c 课程 · s 小节 · t 时间 · m 来源（learn/practice/review/wrong/star/items/paper/variant/boost）
   g 评分 1~4 · ok 是否答对（知识点卡没有）· self 自评（问答/填空/思考题，按半权计入掌握度）
   ans 作答（选项下标数组 / 判断真假 / 写下的答案）· ms 用时 · hint 看了几步提示 · r 作答前 FSRS 预测的回忆概率
   first 当天这张卡的第一次作答 · cause 错因 · by 错因来源（me/rule/ai）· why 依据 · k 无内容的批量记录条数（录题时「共 12 题，错 3 题」） */
const ATT_MAX_MS = 600e3, SELF_TYPES = new Set(['qa', 'cloze', 'think']);
const Att = { list: null, byId: null, ver: 0, ev: null };
const attPath = ts => 'att/' + dayKey(ts).slice(0, 7);
function attAll() {
  if (Att.list) return Att.list;
  const list = [];
  for (const k of Store.keys('att/').sort()) for (const r of Store.get(k)?.a || []) if (r && typeof r.t === 'number') list.push(r);
  list.sort((a, b) => a.t - b.t);
  Att.list = list; Att.byId = new Map();
  for (const r of list) if (r.id) { const l = Att.byId.get(r.id); l ? l.push(r) : Att.byId.set(r.id, [r]); }
  return list;
}
/* 按时间插入（补录的纸上作答可能早于已有记录） */
function insSorted(l, rec) { let i = l.length; while (i > 0 && l[i - 1].t > rec.t) i--; l.splice(i, 0, rec); }
const attReset = () => { Att.list = null; Att.byId = null; Att.ev = null; Att.ver++; };
const attOf = id => { attAll(); return Att.byId.get(id) || []; };
function attSave(rec) { Att.ver++; const p = attPath(rec.t), d = Store.get(p); if (d) Store.put(p, d); }
function attAdd(rec) {
  const p = attPath(rec.t), d = Store.get(p) || { a: [] };
  d.a.push(rec); Store.put(p, d); Att.ver++;
  if (Att.list) { insSorted(Att.list, rec); if (rec.id) { const l = Att.byId.get(rec.id); l ? insSorted(l, rec) : Att.byId.set(rec.id, [rec]); } }
  return rec;
}
const attPrior = st => st && st.last && st.s ? retr(Math.max(0, (Date.now() - st.last) / DAY), st.s) : null;
const attMode = (pr, it, snap) => it.src === 'variant' ? 'variant' : pr?.boost?.has?.(it.id) ? 'boost' : ({ daily: snap ? 'review' : 'learn', section: pr.step === 'learn' ? 'learn' : 'practice', review: 'review', wrong: 'wrong', star: 'star', items: 'items', 'section-review': 'review' }[pr?.kind] || 'review');
/* 作答内容：只存能复现选择的最少信息 */
function attAnswer(p) {
  const it = p.it;
  if (it.t === 'choice' || it.t === 'multi') return [...p.picks].sort((a, b) => a - b);
  if (it.t === 'tf') return p.pick;
  if ((it.t === 'qa' || it.t === 'think') && p.mine) return String(p.mine).slice(0, 2000);
  return undefined;
}
/* 在 rate() 中调用：第一次评分新建记录，之后改评分只更新这条记录 */
function attRecord(p, g, now = Date.now()) {
  const it = p.it, objective = p.auto != null, isSelf = !objective && SELF_TYPES.has(it.t);
  if (p.att) { p.att.g = g; if (isSelf) p.att.ok = g >= 3; attSave(p.att); return p.att; }
  const today = dayKey(now), prev = attOf(it.id);
  const rec = { id: it.id, c: it.course, s: it.sec, t: now, m: attMode(Feed.params, it, p.snap), g, first: !prev.some(r => dayKey(r.t) === today) };
  if (objective) rec.ok = !!p.auto; else if (isSelf) { rec.ok = g >= 3; rec.self = 1; }
  const ans = attAnswer(p); if (ans !== undefined) rec.ans = ans;
  const t0 = p.t0 || p.made || now; rec.ms = Math.max(0, Math.min(ATT_MAX_MS, now - t0));
  if (it.t === 'think' && p.step) rec.hint = p.step;
  const r = attPrior(p.snap); if (r != null) rec.r = Math.round(r * 1000) / 1000;
  p.att = attAdd(rec);
  const sug = rec.ok === false ? ruleCause(it, rec) : null;
  if (sug) { rec.cause = sug.cause; rec.by = 'rule'; rec.why = sug.why; attSave(rec); }
  return rec;
}
/* 同一道题此前选过同一个错项的次数（含这次） */
function sameWrongCount(rec) {
  if (rec.ok !== false || rec.ans === undefined || typeof rec.ans === 'string') return 0;
  const key = JSON.stringify(rec.ans);
  return attOf(rec.id).filter(r => r.ok === false && JSON.stringify(r.ans) === key).length;
}
function setCause(rec, cause, by = 'me', why) {
  if (!rec) return;
  if (cause) { rec.cause = cause; rec.by = by; if (why) rec.why = why; else if (by === 'me') delete rec.why; }
  else { delete rec.cause; delete rec.by; delete rec.why; }
  attSave(rec);
}
/* 一道题最近一次答错的记录 */
const lastWrong = id => { const l = attOf(id); for (let i = l.length - 1; i >= 0; i--) if (l[i].ok === false) return l[i]; return null; };
/* 补录纸上作答（录题时用）：有卡片的按卡片记，只有数量的按小节记 */
function attPaper({ it, ok, ans, t = Date.now(), cause }) {
  const rec = { id: it.id, c: it.course, s: it.sec, t, m: 'paper', g: ok ? 3 : 1, ok: !!ok, first: true };
  if (ans !== undefined && ans !== null && ans !== '') rec.ans = ans;
  if (cause) { rec.cause = cause; rec.by = 'me'; }
  return attAdd(rec);
}
function attPaperCount({ sec, right, wrong, t = Date.now() }) {
  const s = SECS.get(sec); if (!s) return;
  if (right > 0) attAdd({ id: null, c: s.course, s: sec, t, m: 'paper', ok: true, k: right, first: true });
  if (wrong > 0) attAdd({ id: null, c: s.course, s: sec, t, m: 'paper', ok: false, k: wrong, first: true });
}

/* ============ 错因 ============ */
const CAUSES = [
  ['concept', '概念', 'brain'], ['method', '方法', 'compass'], ['forget', '遗忘', 'hourglass'],
  ['read', '审题', 'eye'], ['calc', '计算', 'calc'], ['slip', '粗心', 'bolt']
];
const CAUSE = Object.fromEntries(CAUSES.map(([k, l, i]) => [k, { k, l, i }]));
/* 同一题型用时的中位数（至少 5 条记录才算） */
function typeMedianMs(t) {
  const xs = attAll().filter(r => r.ms > 0 && ITEMS.get(r.id)?.t === t).map(r => r.ms).sort((a, b) => a - b);
  return xs.length >= 5 ? xs[xs.length >> 1] : 0;
}
/* 规则推断错因：只在信号明确时给出，拿不准就不推荐 */
function ruleCause(it, rec) {
  const hist = attOf(it.id).filter(r => r !== rec && r.t < rec.t), okBefore = hist.some(r => r.ok);
  if (rec.r != null && rec.r < .7 && okBefore) return { cause: 'forget', why: `之前答对过，这次作答前回忆概率约 ${Math.round(rec.r * 100)}%` };
  if (sameWrongCount(rec) >= 2) return { cause: 'concept', why: `第 ${sameWrongCount(rec)} 次选同一个错项` };
  const med = typeMedianMs(it.t);
  if (med && rec.ms > 0 && rec.ms < med * .3) return { cause: 'slip', why: `用时 ${Math.round(rec.ms / 1000)} 秒，远少于平时` };
  if (it.t === 'think' && rec.hint && it.st && rec.hint >= it.st.length) return { cause: 'method', why: '看完全部提示仍未做出' };
  return null;
}
