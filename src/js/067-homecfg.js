/* ============ 首页内容：推荐范围、自定义卡片、AI 添加 ============ */
/* 配置存在学习数据 app/state 的 home 字段里（随备份一起保存）：
   { learn 课程新内容, review 到期复习, wrong 每天穿插的错题数（0 = 不穿插）, star 每天穿插的收藏数, note 每天回顾一篇笔记,
     range: { 课程id: [章id…] } 只从这些章推荐（没有 = 全部章节）,
     cards: [{ id, type: text 文字 | count 倒计时 | ai AI 每日, title, body, date, prompt, pos: top 置顶 | feed 穿插在学习流, on, by: 'ai', ai: { day, text } }] }
   课程是否加入首页仍由学习计划里每门课的开关（coursePlan(id).on）决定。 */
const HOME_DEFAULT = { learn: true, review: true, wrong: 0, star: 0, note: false };
const HC_TYPES = { text: ['quote', '文字'], count: ['hourglass', '倒计时'], ai: ['spark', 'AI 每日'] };
const HC_MAX = 30, HW_FIRST = 2, HW_EVERY = 6; // 学习流里第 3 个内容之后放第一张卡片，之后每隔 6 个放一张
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function normHomeCard(c) {
  if (!isPlainObj(c)) return false;
  if (!HC_TYPES[c.type]) c.type = 'text';
  c.id = safeId(c.id) || newId('h');
  c.title = String(c.title ?? '').slice(0, 40); c.body = String(c.body ?? '').slice(0, 4000); c.prompt = String(c.prompt ?? '').slice(0, 500);
  c.date = DATE_RE.test(c.date) ? c.date : '';
  c.pos = c.pos === 'feed' ? 'feed' : 'top'; c.on = c.on !== false;
  if (c.by !== 'ai') delete c.by;
  if (c.ai != null && !(isPlainObj(c.ai) && typeof c.ai.text === 'string' && DATE_RE.test(c.ai.day))) delete c.ai;
  return true;
}
/* 读配置：缺的字段补默认值，来自备份或云端的数据按类型校正 */
function homeCfg() {
  const s = S(); if (!isPlainObj(s.home)) s.home = {};
  const H = s.home;
  for (const k in HOME_DEFAULT) if (typeof H[k] !== typeof HOME_DEFAULT[k]) H[k] = HOME_DEFAULT[k];
  H.wrong = Math.max(0, Math.min(30, Math.round(H.wrong) || 0)); H.star = Math.max(0, Math.min(30, Math.round(H.star) || 0));
  if (!isPlainObj(H.range)) H.range = {};
  for (const k in H.range) if (!Array.isArray(H.range[k]) || !H.range[k].length) delete H.range[k]; else H.range[k] = H.range[k].map(String);
  if (!Array.isArray(H.cards)) H.cards = [];
  if (!H.cards.every(normHomeCard)) H.cards = H.cards.filter(isPlainObj);
  return H;
}
const saveHome = () => { saveState(); if (Nav.stack[Nav.stack.length - 1]?.view === 'today') refresh(); };

/* ---- 推荐范围 ---- */
const homeRange = cid => homeCfg().range[cid] || null;
const secInRange = sec => { const r = homeRange(sec.course); return !r || r.includes(sec.chap); };
const inHomeRange = it => { const sec = SECS.get(it.sec); return !!sec && secInRange(sec); };
const homeDue = () => dueItems().filter(inHomeRange);
/* 某门课在首页范围内的下一节 */
function homeNextSec(c) {
  const nx = nextSection(c); if (!homeRange(c.id) || nx && secInRange(nx)) return nx;
  return courseSecs(c).find(s => secInRange(s) && ['learning', 'todo', 'empty'].includes(secStatus(s))) || null;
}
function rangeLabel(c) {
  const r = homeRange(c.id); if (!r) return '全部章节';
  const chs = c.chapters.filter(ch => r.includes(ch.id)); if (!chs.length) return '全部章节';
  return chs.length === 1 ? chapShort(chs[0]) : `${chapShort(chs[0])} 等 ${chs.length} 章`;
}
/* 按日期打散：同一天顺序固定，换一天换一批 */
const dayHash = s => { let x = 2166136261; for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619); return x >>> 0; };
const dayShuffle = list => { const d = dayKey(); return list.map(x => [dayHash(d + (x.id || '')), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]); };
/* 错题、收藏：今天还没刷过的，穿插进学习流 */
function homeBonus(seen) {
  const H = homeCfg(), t0 = dayStart(), out = [];
  const ok = it => !seen.has(it.id) && !S().hiddenCourses[it.course] && inHomeRange(it) && (getSt(it)?.last || 0) < t0;
  if (H.wrong) out.push(...wrongItems().filter(ok).slice(0, H.wrong));
  if (H.star) { const have = new Set(out.map(it => it.id)); out.push(...dayShuffle(starItems().filter(it => ok(it) && !have.has(it.id))).slice(0, H.star)); }
  return out;
}
function noteOfDay() {
  const ns = Notes.all().filter(n => !Notes.empty(n) && (!n.course || !S().hiddenCourses[n.course])); if (!ns.length) return null;
  const old = ns.filter(n => n.updated < dayStart()), pool = old.length ? old : ns;
  return dayShuffle(pool)[0];
}

/* ---- 首页上的卡片（置顶区 + 学习流里穿插） ---- */
function homeSlots() {
  const H = homeCfg(), on = H.cards.filter(c => c.on && (c.type !== 'count' || c.date));
  const top = on.filter(c => c.pos === 'top').map(card => ({ key: card.id, card })), feed = on.filter(c => c.pos === 'feed').map(card => ({ key: card.id, card }));
  const n = H.note && noteOfDay(); if (n) feed.unshift({ key: 'note-' + n.id, note: n });
  return { top, feed };
}
function homeWidgetEl(w) { const el = h(`<article class="post hcard" data-hw="${esc(w.key)}"></article>`); el.innerHTML = homeWidgetHTML(w); return el; }
function homeWidgetHTML(w) {
  if (w.note) {
    const n = w.note, c = COURSES.get(n.course), sec = n.sec && SECS.get(n.sec);
    return `<div class="pin"><div class="ph"><span class="ptype hc">${ico('notebook')}笔记回顾</span><span class="src">${c ? `<i class="cdot" style="--c:${c.color}"></i><span>${esc(sec ? sec.title : c.title)}</span>` : ''}</span></div>
      <h3 class="pt">${esc(n.title.trim() || '无标题笔记')}</h3>${noteSnippet(n) ? `<p class="hc-snip">${esc(noteSnippet(n))}</p>` : ''}<button class="btn soft sm hc-gen" data-hw-note="${esc(n.id)}">${ico('edit')}打开</button></div>`;
  }
  const c = w.card, [ic, lb] = HC_TYPES[c.type];
  const head = `<div class="ph"><span class="ptype hc">${ico(ic)}${lb}</span><span class="src">${c.pos === 'top' ? `${ico('pin')}` : ''}</span><button class="more" data-hc-more="${esc(c.id)}" aria-label="卡片操作">${ico('more')}</button></div>`;
  let body = '';
  if (c.type === 'count') {
    const d = daysBetween(dayKey(), c.date);
    body = `<div class="hc-count"><span class="t">${esc(c.title || '倒计时')}</span><b class="num">${Math.abs(d)}</b><span class="u">${d > 0 ? '天' : d < 0 ? '天前' : '就是今天'}</span></div><div class="hc-date">${ico('calendar')}${esc(c.date)}</div>`;
  } else if (c.type === 'ai') {
    const today = c.ai?.day === dayKey(), busy = HomeAI.busy.has(c.id);
    body = (c.title ? `<h3 class="pt">${esc(c.title)}</h3>` : '') + (c.ai ? `<div class="md">${md(c.ai.text)}</div>` : '') +
      (busy ? `<div class="hc-wait"><span class="spin"></span>正在生成…</div>` : !c.ai || !today ? `<button class="btn soft sm hc-gen" data-hc-gen="${esc(c.id)}">${ico(c.ai ? 'sync' : 'wand')}${AI.ok ? (c.ai ? '换今天的' : '生成') : '配置 AI'}</button>` : '');
  } else body = (c.title ? `<h3 class="pt">${esc(c.title)}</h3>` : '') + `<div class="md">${md(c.body)}</div>`;
  return `<div class="pin">${head}${body}</div>`;
}
/* 学习流里第 i 个内容之后要不要放卡片 */
function homeSlotAfter(feed, i) {
  const w = Daily.wfeed, j = (i - HW_FIRST) / HW_EVERY;
  if (w && i >= HW_FIRST && Number.isInteger(j) && w[j] && !$(`[data-hw="${CSS.escape(w[j].key)}"]`, feed)) feed.append(homeWidgetEl(w[j]));
}
/* 学习流到底了：还没放进去的卡片放在结束卡片之前 */
function homeSlotRest(feed) { for (const w of Daily.wfeed || []) if (!$(`[data-hw="${CSS.escape(w.key)}"]`, feed)) feed.append(homeWidgetEl(w)); }
function bindHomeWidgets(root) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-hc-more],[data-hc-gen],[data-hw-note]'); if (!b) return;
    if (b.dataset.hwNote) return go('note', { id: b.dataset.hwNote });
    const c = homeCfg().cards.find(x => x.id === (b.dataset.hcMore || b.dataset.hcGen)); if (!c) return;
    if (b.dataset.hcGen) { if (AI.require()) genHomeCard(c, true); return; }
    homeCardMenu(c);
  });
}
function homeCardMenu(c) {
  menuSheet(c.title || HC_TYPES[c.type][1], [
    { icon: 'edit', label: '编辑', run: () => homeCardSheet(c) },
    c.type === 'ai' && { icon: 'sync', label: '重新生成', run: () => { if (AI.require()) genHomeCard(c, true); } },
    { icon: 'pin', label: c.pos === 'top' ? '放进学习流' : '置顶', run: () => { c.pos = c.pos === 'top' ? 'feed' : 'top'; saveHome(); } },
    { icon: 'eyeoff', label: '先不显示', run: () => { c.on = false; saveHome(); toast('可以在「首页内容」里重新打开'); } },
    { icon: 'trash', label: '删除', cls: 'danger', run: () => removeHomeCard(c) }
  ]);
}
function removeHomeCard(c) { const H = homeCfg(); H.cards = H.cards.filter(x => x.id !== c.id); saveHome(); }

/* ---- AI 每日卡片：每天按用户的要求生成一次今天的内容 ---- */
const HomeAI = { busy: new Set(), tried: new Map() };
function homeCardPrompt(c) {
  const d = new Date(Date.now() - CUT), study = /学|课|复习|错|薄弱|计划|进度|笔记|考/.test(c.prompt + c.title);
  return `你在为学习 App「温新」的首页写一张卡片今天的内容。
卡片标题：${c.title || '（无）'}
用户的要求：${c.prompt || c.title}
今天是 ${dayKey()}（星期${WEEK[d.getDay()]}）。
${study ? '用户的学习概况：\n' + overviewText() : '用户在学的课程：' + (shownCourses().map(x => x.title).join('、') || '暂无')}
${c.ai?.text ? `上一次的内容（不要重复）：${plain(c.ai.text).slice(0, 160)}\n` : ''}只输出卡片正文：Markdown，简短（一般 30~150 字），不要再写标题，不要开场白和客套话。公式用 $…$。`;
}
async function genHomeCard(card, force) {
  if (!AI.ok || HomeAI.busy.has(card.id)) return;
  if (!force && (card.ai?.day === dayKey() || HomeAI.tried.get(card.id) === dayKey())) return;
  HomeAI.busy.add(card.id); HomeAI.tried.set(card.id, dayKey()); redrawHomeCard(card.id);
  try {
    const { text } = await AI.fn(homeCardPrompt(card), { cache: false });
    const t = cleanAI(text).slice(0, 3000), cur = homeCfg().cards.find(x => x.id === card.id);
    if (t && cur) { cur.ai = { day: dayKey(), text: t }; saveState(); }
  } catch (e) { if (force) toast(AI.err(e)); }
  HomeAI.busy.delete(card.id); redrawHomeCard(card.id);
}
function redrawHomeCard(id) { const c = homeCfg().cards.find(x => x.id === id); if (!c) return; $$(`#view [data-hw="${CSS.escape(id)}"]`).forEach(el => { el.innerHTML = homeWidgetHTML({ key: id, card: c }); }); }
/* 打开首页时：今天还没生成的 AI 卡片在后台生成 */
function homeAIKick() { if (!AI.ok) return; for (const c of homeCfg().cards) if (c.on && c.type === 'ai') genHomeCard(c); }

/* ---- 「首页内容」弹层 ---- */
function homeSheet() {
  const body = h(`<div style="display:flex;flex-direction:column;gap:14px"></div>`);
  const tg = (attr, on, label) => `<button class="toggle" role="switch" aria-checked="${!!on}" ${attr} aria-label="${esc(label)}"></button>`;
  const src = (k, icon, label, on) => `<div class="rowi"><span class="hico">${ico(icon)}</span><span class="grow t">${label}</span>${tg(`data-hk="${k}"`, on, label)}</div>`;
  const draw = () => {
    const H = homeCfg(), cs = shownCourses();
    body.innerHTML = `<div class="gh"><b>推荐范围</b></div>
      <div class="group">${src('learn', 'layers', '课程新内容', H.learn)}
        ${H.learn ? cs.map(c => `<div class="rowi sub"><span class="pdot" style="--c:${c.color}"></span><button class="grow hrng" data-rng="${c.id}"><div class="t">${esc(c.title)}</div><div class="m">${ico('list')}${esc(rangeLabel(c))}</div></button>${tg(`data-hon="${c.id}"`, coursePlan(c.id).on, c.title)}</div>`).join('') : ''}
        ${src('review', 'review', '到期复习', H.review)}${src('wrong', 'alert', '错题', H.wrong)}${src('star', 'star', '收藏', H.star)}${src('note', 'notebook', '笔记回顾', H.note)}</div>
      <div class="gh"><b>我的卡片</b>${H.cards.length ? `<span class="num small">${H.cards.length}</span>` : ''}</div>
      ${H.cards.length ? `<div class="group">${H.cards.map(c => `<div class="rowi"><span class="hico">${ico(HC_TYPES[c.type][0])}</span><button class="grow hrng" data-hedit="${c.id}"><div class="t">${esc(c.title || plain(c.body || c.prompt).slice(0, 20) || HC_TYPES[c.type][1])}</div><div class="m">${HC_TYPES[c.type][1]} · ${c.pos === 'top' ? '置顶' : '学习流'}${c.by === 'ai' ? ` · ${ico('spark')}` : ''}</div></button>${tg(`data-hcon="${c.id}"`, c.on, c.title || '卡片')}</div>`).join('')}</div>` : ''}
      <div class="acts"><button class="btn" data-hadd>${ico('plus')}添加卡片</button><button class="btn pri" data-hai>${ico('spark')}AI 添加</button></div>`;
  };
  body.onclick = e => {
    const b = e.target.closest('button'); if (!b) return; const H = homeCfg();
    if (b.dataset.hk) { const k = b.dataset.hk; H[k] = typeof HOME_DEFAULT[k] === 'number' ? (H[k] ? 0 : k === 'wrong' ? 5 : 3) : !H[k]; }
    else if (b.dataset.hon) { const cp = coursePlan(b.dataset.hon); cp.on = !cp.on; }
    else if (b.dataset.hcon) { const c = H.cards.find(x => x.id === b.dataset.hcon); if (c) c.on = !c.on; }
    else if (b.dataset.rng) return rangeSheet(COURSES.get(b.dataset.rng), draw);
    else if (b.dataset.hedit) { const c = H.cards.find(x => x.id === b.dataset.hedit); if (c) homeCardSheet(c, draw); return; }
    else if (b.hasAttribute('data-hadd')) return homeCardSheet(null, draw);
    else if (b.hasAttribute('data-hai')) { if (AI.require()) homeAISheet(draw); return; }
    else return;
    Motion.haptic?.(); saveState(); draw();
  };
  draw();
  const s = sheet('首页内容', body); s.onclose = () => refresh();
}
/* 某门课从哪些章推荐 */
function rangeSheet(c, after) {
  if (!c) return;
  const body = h(`<div style="display:flex;flex-direction:column;gap:14px"></div>`);
  const draw = () => {
    const r = homeRange(c.id);
    body.innerHTML = `<div class="group"><button class="rowi" data-all><span class="chk ${r ? '' : 'on'}">${ico('check')}</span><span class="grow t">全部章节</span></button></div>
      <div class="group">${c.chapters.map(ch => { const on = !r || r.includes(ch.id), n = ch.sections.length; return `<button class="rowi" data-ch="${ch.id}"><span class="chk ${r && on ? 'on' : ''}">${ico('check')}</span><span class="grow"><div class="t">${esc(ch.title)}</div><div class="m">${n} 节</div></span></button>`; }).join('')}</div>`;
  };
  body.onclick = e => {
    const b = e.target.closest('button'); if (!b) return; const H = homeCfg();
    if (b.hasAttribute('data-all')) delete H.range[c.id];
    else if (b.dataset.ch) {
      const set = new Set(H.range[c.id] || []); set.has(b.dataset.ch) ? set.delete(b.dataset.ch) : set.add(b.dataset.ch);
      const ids = c.chapters.map(ch => ch.id).filter(id => set.has(id));
      if (!ids.length || ids.length === c.chapters.length) delete H.range[c.id]; else H.range[c.id] = ids;
    } else return;
    saveState(); draw();
  };
  draw(); const s = sheet(c.title, body); s.onclose = () => after?.();
}
/* 新建 / 编辑卡片 */
function homeCardSheet(card, after) {
  const c = card ? { ...card } : { type: 'text', title: '', body: '', date: '', prompt: '', pos: 'top', on: true };
  const body = h(`<div style="display:flex;flex-direction:column;gap:14px"></div>`);
  const draw = () => {
    body.innerHTML = `<div class="seg" role="group">${Object.entries(HC_TYPES).map(([k, [i, l]]) => `<button data-ty="${k}" aria-pressed="${c.type === k}">${ico(i)}${l}</button>`).join('')}</div>
      <label class="field"><span>标题</span><input class="inp" id="hc-title" maxlength="40" placeholder="${c.type === 'count' ? '期末考试' : c.type === 'ai' ? '每日一句' : '本周目标'}" value="${esc(c.title)}"></label>
      ${c.type === 'text' ? `<label class="field"><span>内容</span><textarea class="inp" id="hc-body" rows="5" maxlength="4000" placeholder="支持 Markdown 和公式">${esc(c.body)}</textarea></label>` : ''}
      ${c.type === 'count' ? `<label class="field"><span>日期</span><input class="inp" id="hc-date" type="date" value="${esc(c.date)}"></label>` : ''}
      ${c.type === 'ai' ? `<label class="field"><span>每天让 AI 写什么</span><textarea class="inp" id="hc-prompt" rows="3" maxlength="500" placeholder="一句英文名言，附中文翻译">${esc(c.prompt)}</textarea></label>` : ''}
      <div class="field"><span>位置</span><div class="seg" role="group"><button data-pos="top" aria-pressed="${c.pos === 'top'}">${ico('pin')}置顶</button><button data-pos="feed" aria-pressed="${c.pos === 'feed'}">${ico('layers')}穿插在学习流</button></div></div>
      <div class="acts">${card ? `<button class="btn danger" data-del>${ico('trash')}删除</button>` : ''}<button class="btn pri" data-ok>${ico('check')}保存</button></div>`;
  };
  const read = () => { c.title = $('#hc-title', body).value.trim(); if ($('#hc-body', body)) c.body = $('#hc-body', body).value; if ($('#hc-date', body)) c.date = $('#hc-date', body).value; if ($('#hc-prompt', body)) c.prompt = $('#hc-prompt', body).value.trim(); };
  body.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ty) { read(); c.type = b.dataset.ty; draw(); }
    else if (b.dataset.pos) { read(); c.pos = b.dataset.pos; draw(); }
    else if (b.hasAttribute('data-del')) { s.close(); removeHomeCard(card); after?.(); }
    else if (b.hasAttribute('data-ok')) {
      read();
      if (c.type === 'text' && !c.body.trim()) return toast('写点内容');
      if (c.type === 'count' && !DATE_RE.test(c.date)) return toast('选一个日期');
      if (c.type === 'ai' && !c.prompt) return toast('写一下要 AI 写什么');
      const H = homeCfg();
      if (card) { const changed = card.type !== c.type || card.prompt !== c.prompt; Object.assign(card, c); if (changed) delete card.ai; normHomeCard(card); }
      else { if (H.cards.length >= HC_MAX) return toast(`最多 ${HC_MAX} 张卡片`); normHomeCard(c); H.cards.push(c); }
      saveState(); s.close(); after?.(); refresh();
      const cur = H.cards.find(x => x.id === (card || c).id); if (cur?.type === 'ai' && !cur.ai) genHomeCard(cur, true);
    }
  };
  draw();
  const s = sheet(card ? '编辑卡片' : '添加卡片', body);
}
/* AI 添加：用一句话描述想在首页看到什么，AI 给出卡片和范围建议，确认后加入 */
const HOME_AI_SUGG = ['每天一句英文名言', '期末考试倒计时', '只看复习和错题，不推新课', '每天一个学习小技巧', '根据我的错题提醒我该注意什么'];
const HOME_AI_RULES = `首页由两部分组成：
1. 推荐范围（scope，只写要改的项）：learn 是否推荐课程新内容（布尔），review 是否推荐到期复习（布尔），wrong 每天穿插几道错题（0~10，0 为不穿插），star 每天穿插几张收藏（0~10），note 是否每天回顾一篇用户自己的笔记（布尔）。
2. 卡片 cards，每张：type 为 text（固定文字，写在 body，Markdown）、count（倒计时，title 写事件，date 为 YYYY-MM-DD）、ai（每天由 AI 按 prompt 重新生成内容，prompt 写清楚每天要写什么）；title 不超过 12 字；pos 为 top（置顶）或 feed（穿插在学习流里）。
每天会变化的内容（每日一句、小技巧、提醒）用 ai 类型；固定的话（座右铭、目标）用 text；日期相关用 count。`;
function sanitizeHomeProposal(r) {
  const out = { scope: {}, cards: [] }, sc = isPlainObj(r?.scope) ? r.scope : {};
  for (const k of ['learn', 'review', 'note']) if (typeof sc[k] === 'boolean') out.scope[k] = sc[k];
  for (const k of ['wrong', 'star']) if (sc[k] != null && Number.isFinite(+sc[k])) out.scope[k] = Math.max(0, Math.min(10, Math.round(+sc[k])));
  for (const x of (Array.isArray(r?.cards) ? r.cards : []).slice(0, 6)) {
    if (!isPlainObj(x) || !HC_TYPES[x.type]) continue;
    const c = { type: x.type, title: String(x.title || ''), body: String(x.body || ''), date: String(x.date || ''), prompt: String(x.prompt || ''), pos: x.pos === 'feed' ? 'feed' : 'top', on: true, by: 'ai' };
    if (c.type === 'text' && !c.body.trim() || c.type === 'count' && !DATE_RE.test(c.date) || c.type === 'ai' && !c.prompt.trim()) continue;
    normHomeCard(c); delete c.id; out.cards.push(c);
  }
  return out;
}
const SCOPE_TEXT = { learn: v => (v ? '推荐' : '不推荐') + '课程新内容', review: v => (v ? '推荐' : '不推荐') + '到期复习', wrong: v => v ? `每天穿插 ${v} 道错题` : '不穿插错题', star: v => v ? `每天穿插 ${v} 张收藏` : '不穿插收藏', note: v => (v ? '' : '不') + '回顾笔记' };
const describeHomeProposal = p => [...Object.entries(p.scope).map(([k, v]) => SCOPE_TEXT[k](v)), ...p.cards.map(c => `添加${HC_TYPES[c.type][1]}卡片「${c.title || plain(c.body || c.prompt).slice(0, 16)}」`)];
function applyHomeProposal(p) {
  const H = homeCfg(), added = [];
  Object.assign(H, p.scope);
  for (const x of p.cards) { if (H.cards.length >= HC_MAX) break; const c = { ...x }; normHomeCard(c); H.cards.push(c); added.push(c); }
  saveState(); logEvent('调整首页内容'); return added;
}
function homeAISheet(after) {
  const body = h(`<div style="display:flex;flex-direction:column;gap:14px">
    <label class="field"><span>想在首页看到什么</span><textarea class="inp" id="ha-in" rows="3" maxlength="400" placeholder="${HOME_AI_SUGG[0]}"></textarea></label>
    <div class="chips wrapc">${HOME_AI_SUGG.map(t => `<button class="chip" data-sg="${esc(t)}">${esc(t)}</button>`).join('')}</div>
    <button class="btn pri block" id="ha-go">${ico('spark')}生成</button><div id="ha-out"></div></div>`);
  const out = $('#ha-out', body); let prop = null, ctl = null;
  $$('[data-sg]', body).forEach(b => b.onclick = () => { $('#ha-in', body).value = b.dataset.sg; $('#ha-in', body).focus(); });
  $('#ha-go', body).onclick = async () => {
    const want = $('#ha-in', body).value.trim(); if (!want) return toast('说说想看什么'); if (ctl) return;
    ctl = new AbortController(); out.innerHTML = `<div class="hc-wait"><span class="spin"></span>正在想…</div>`;
    const H = homeCfg();
    try {
      const r = await AI.fn.json(`你在帮用户定制学习 App「温新」的首页。\n${HOME_AI_RULES}\n\n当前设置：${JSON.stringify({ learn: H.learn, review: H.review, wrong: H.wrong, star: H.star, note: H.note })}；已有卡片：${H.cards.map(c => c.title || c.type).join('、') || '无'}。\n用户在学的课程：${shownCourses().map(c => c.title).join('、') || '暂无'}。今天是 ${dayKey()}。\n\n用户的要求：${want}\n\n只输出 JSON：{"scope":{…只写要改的项…},"cards":[{"type":"…","title":"…","body":"…","date":"…","prompt":"…","pos":"top"}]}`, { signal: ctl.signal, cache: false });
      prop = sanitizeHomeProposal(r);
      const lines = describeHomeProposal(prop);
      out.innerHTML = lines.length ? `<div class="group">${lines.map(l => `<div class="rowi"><span class="hico">${ico('check')}</span><span class="grow t">${esc(l)}</span></div>`).join('')}</div><button class="btn pri block" id="ha-ok" style="margin-top:12px">${ico('plus')}加到首页</button>` : `<p class="hint">没有可以添加的内容，换个说法试试</p>`;
      $('#ha-ok', out)?.addEventListener('click', () => { const added = applyHomeProposal(prop); s.close(); after?.(); refresh(); added.filter(c => c.type === 'ai').forEach(c => genHomeCard(c, true)); toast('已加到首页'); });
    } catch (e) { out.innerHTML = `<p class="hint">${esc(AI.err(e))}</p>`; }
    ctl = null;
  };
  const s = sheet('AI 添加', body); s.onclose = () => ctl?.abort();
  setTimeout(() => $('#ha-in', body)?.focus(), 300);
}
