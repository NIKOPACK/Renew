/* ============ 学习时问 AI、个人笔记、翻页与快捷键（v6） ============ */
/* 持久化卡片问答记录（按卡片 id 保留最近 30 张，刷新不丢失） */
const AskMem = {
  data: lsGet('askmem') || {},
  get(id) { return this.data[id] ||= []; },
  save() {
    const ks = Object.keys(this.data).filter(k => this.data[k]?.length);
    while (ks.length > 30) delete this.data[ks.shift()];
    const out = {};
    for (const k of ks) out[k] = this.data[k].slice(-20).map(({ blobs, ...t }) => t);
    lsSet('askmem', out);
  }
};
/* 把 AI 回复转为可保存的卡片：已是 DSL 直接解析；含「答案：」拆成练习题；否则转为知识点卡 */
function replyToCards(text, it, sid) {
  const src = String(text || '').trim();
  if (/^::\s*(kp|choice|multi|tf|qa|cloze|think|note)\b/m.test(src)) return parseDSL(src, sid, 'a');
  const m = src.match(/^([\s\S]+?)\n+(?:\*\*|###?\s*)?答案[：:]\s*([\s\S]+)$/);
  if (m) {
    const q = m[1].replace(/^\s*(?:\*\*)?(?:类似题|练习题|题目)[：:\s]*(\*\*)?\s*/i, '').trim();
    const rest = m[2].trim(), lines = rest.split('\n');
    const optM = q.match(/^[A-F][.．、]\s*.+$/gm);
    const ansL = lines[0].replace(/[*`。\s]/g, '').match(/^([A-F]+)(?:[，,；;（(]|$)/i);
    if (optM && optM.length >= 2 && ansL) {
      const dsl = `::choice\n${q}\n= ${ansL[1].toUpperCase()}\n?? ${rest}`;
      const r = parseDSL(dsl, sid, 'a'); if (r.items.length) return r;
    }
    const id = `${sid}-a${Date.now().toString(36)}`;
    return { items: [{ id, t: 'qa', q, a: lines[0].trim(), ...(lines.length > 1 ? { x: lines.slice(1).join('\n').trim() } : {}) }], errors: [] };
  }
  const title = (it?.title ? it.title + ' · 补充' : plain(src).slice(0, 16)) || '学习补充';
  const id = `${sid}-a${Date.now().toString(36)}`;
  const short = src.length <= 220;
  return { items: [{ id, t: 'kp', title, q: short ? src : plain(src).slice(0, 120) + '…', ...(short ? {} : { d: src }) }], errors: [] };
}
function saveReplyAsCard(text, it) {
  const sec = SECS.get(it.sec); if (!sec) return;
  const s = sheet('转成卡片 · ' + sec.title, `<div id="rc-out"></div>`);
  showGenerated($('#rc-out', s.body), replyToCards(text, it, sec.id), sec, false, s);
}
function promoteToChat(it, turns, sh) {
  const sec = SECS.get(it.sec), c = COURSES.get(it.course);
  const id = newId('c'), title = (it.title || plain(it.q) || '卡片讨论').slice(0, 18);
  const intro = `我正在学习「${c.title} · ${sec.title}」的这张卡片：\n\n${itemToDSL(it)}`;
  const msgs = turns.length
    ? [{ role: 'user', text: intro }, ...turns.map(t => t.role === 'user' ? { role: 'user', text: t.label || t.content, ...(t.att?.length ? { att: t.att } : {}) } : { role: 'assistant', parts: [], text: t.content })]
    : [{ role: 'user', text: intro }, { role: 'assistant', parts: [], text: '已加载这张卡片，可以继续追问原理、出练习题，或让我结合你的学习记录一起分析。' }];
  Chat.list.unshift({ id, title, t: Date.now(), msgs, ctx: it.course });
  Chat.cur = id; Chat.save();
  sh.close(); Detail.cur?.(true);
  go('ai', {}, { tab: true });
}
function askAI(it, p) {
  const c = COURSES.get(it.course), sec = SECS.get(it.sec), q = isQ(it);
  const turns = AskMem.get(it.id);
  const wrong = p && p.auto === false;
  const picked = p && p.phase === 'back' && q ? (it.t === 'tf' && p.pick != null ? (p.pick ? '对' : '错') : p.picks?.size ? [...p.picks].map(i => String.fromCharCode(65 + i)).join('') : '') : '';
  const ctx = `你是耐心的「${c.title}」老师，学生正在手机上学习小节「${sec.title}」的这张卡片（格式：::类型 标题；--- 后是详解；A./B. 是选项；"= " 后是答案；">>" 是步骤提示；"??" 后是解答）：\n\n${itemToDSL(it)}\n${picked ? `\n学生选了：${picked}（${wrong ? '答错了' : '答对了'}）\n` : ''}${S().notes?.[it.id] ? `\n学生自己的笔记：${S().notes[it.id]}\n` : ''}\n请针对学生的问题回答：中文，直接讲重点，一般 300 字以内，Markdown，公式用 $...$，适合手机阅读，不要重复卡片原文。能用图说明的（结构、过程、状态变化）先画图，文字只补充图里没有的。\n${VIZ_SPEC}`;
  const chips = [
    wrong && ['我错在哪', '我答错了，帮我分析错在哪里，正确的思路是什么。'],
    ['讲透它', '把这张卡片的核心概念讲透，说清楚为什么。'],
    q && ['为什么是这个答案', '详细讲讲为什么是这个答案，其他选项或想法错在哪里。'],
    ['举个例子', '用一个具体的例子帮我理解。'],
    ['记忆方法', '给我一个好记的口诀或记忆方法。'],
    ['出道类似题', '出一道类似的题考我，题目在前，答案和解析放在最后，以"答案："开头。']
  ].filter(Boolean);
  const ui = aiChatSheet({ title: '问 AI', ids: ['ak-in', 'ak-go'], placeholder: '继续问…', turns, chips, sys: () => ctx, onSave: () => AskMem.save(),
    head: `<div class="askctx"><span class="ptype ${q ? 'q' : ''}">${TYPE_LABEL[it.t]}</span><span class="grow">${esc(plain(it.title || it.q).slice(0, 40))}</span><button class="askpro" data-promote aria-label="在 AI 页继续">${ico('grow')}<span>全屏</span></button></div>`,
    actions: [
      { icon: 'edit', label: '存为笔记', run: (t, x) => { const n = S().notes ||= {}; n[it.id] = n[it.id] ? n[it.id] + '\n\n' + t.trim() : t.trim(); saveState(); if (p) rerender(p); x.btn.innerHTML = ico('check') + '已存笔记'; x.btn.disabled = true; } },
      { icon: 'bulb', label: '加入详解', run: (t, x) => { const k = isQ(it) ? 'x' : 'd', prev = (it[k] || '').trim(); patchItem(it, { [k]: prev ? prev + '\n\n' + t.trim() : t.trim() }); if (p) rerender(p); if (Detail.cur && Detail.el) $('.dtl-md', Detail.el).innerHTML = md(it[k]); x.btn.innerHTML = ico('check') + '已加详解'; x.btn.disabled = true; toast('已加入详解'); } },
      { icon: 'layers', label: '转成卡片', run: t => saveReplyAsCard(t, it) }
    ] });
  $('[data-promote]', ui.sheet.body)?.addEventListener('click', () => promoteToChat(it, turns, ui.sheet));
}
/* 弹层里的 AI 对话（问 AI、帮我写共用）：消息 + 快捷问题 + 输入框（可带图片、视频、文件、链接）
   sys() 是放在最前面的背景说明；actions 显示在每条回复下面：{ icon, label, close?, run(text, { btn, turns }) } */
function aiChatSheet({ title, head = '', sys, chips = [], chipsOnce = false, placeholder, ids, turns = [], actions = [], onSave }) {
  const body = h(`<div class="aichat">${head}<div class="chat"></div><div class="chips qk">${chips.map(([l], i) => `<button class="chip" data-q="${i}">${esc(l)}</button>`).join('')}</div></div>`);
  const box = $('.chat', body), qk = $('.qk', body);
  let ctl = null;
  const cmp = Composer({ placeholder, ids, busy: () => !!ctl, onStop: () => ctl?.abort(), onSend: ({ text, att }) => send(text, att) });
  body.append(cmp.el);
  const s = sheet(title, body); s.onclose = () => ctl?.abort();
  const draw = () => {
    box.innerHTML = turns.map((t, i) => t.role === 'user' ? userBubble(t) : `<div class="am"><div class="md">${md(t.content)}</div><div class="acts2">${actions.map((a, k) => `<button data-a="${k}" data-i="${i}">${ico(a.icon)}${esc(a.label)}</button>`).join('')}<button data-copy="${i}">${ico('file')}复制</button></div></div>`).join('');
    qk.style.display = !chips.length || (chipsOnce && turns.length > 0) ? 'none' : '';
  };
  box.onclick = e => {
    const b = e.target.closest('[data-a],[data-copy]'); if (!b) return;
    if (b.dataset.copy) return copyText(turns[+b.dataset.copy].content, '已复制');
    const a = actions[+b.dataset.a]; if (a.close) s.close(); a.run(turns[+b.dataset.i].content, { btn: b, turns });
  };
  const send = async (text, att = [], label) => {
    if (ctl || (!text.trim() && !att.length)) return;
    if (!AI.ok) { if (Platform.aiConfigurable) { AI.require(); return; } copyText(sys() + '\n\n' + text, AI.need + '。已复制问题，可以粘贴到任意 AI'); return; }
    const pay = attPayload(att);
    turns.push({ role: 'user', content: text.trim() || '请看附件', label, att: attMeta(att), ctx: pay.text, blobs: att.filter(a => a.k === 'img').map(a => a.blob) }); draw();
    const bubble = h(`<div class="am"><div class="md"><div class="typing"><i></i><i></i><i></i></div></div></div>`); box.append(bubble); bubble.scrollIntoView({ block: 'end', behavior: 'smooth' });
    ctl = new AbortController(); cmp.sync(); let last = 0;
    try {
      const { text: out } = await AI.fn([{ role: 'user', content: sys() }, ...turns.map(t => ({ role: t.role, content: t.role === 'user' ? t.content + (t.ctx || '') : t.content }))],
        { signal: ctl.signal, cache: false, ...(pay.images.length ? { images: pay.images } : {}), onText: ({ text }) => { const n = Date.now(); if (n - last > 200) { last = n; $('.md', bubble).innerHTML = md(cleanAI(text)); } } });
      turns.push({ role: 'assistant', content: cleanAI(out) });
    } catch (e) { if (e?.text) turns.push({ role: 'assistant', content: cleanAI(e.text) }); else if (e?.code !== 'cancelled') { turns.pop(); toast(AI.err(e)); } else turns.pop(); }
    ctl = null; cmp.sync(); onSave?.(); draw(); box.lastElementChild?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  qk.onclick = e => { const b = e.target.closest('[data-q]'); if (!b) return; const [l, t] = chips[+b.dataset.q]; send(t, [], l); };
  draw();
  return { sheet: s, composer: cmp, send };
}
const userBubble = t => `<div class="ug">${t.att?.length ? `<div class="uatt">${attHTML(t.att)}</div>` : ''}${t.label || t.content ? `<div class="um">${esc(t.label || t.content)}</div>` : ''}</div>`;
function noteSheet(it, p) {
  const body = h(`<div style="display:flex;flex-direction:column;gap:12px"><textarea class="inp" id="nt-t" style="min-height:200px" placeholder="理解、易错点、口诀"></textarea><div class="acts"><button class="btn danger" id="nt-del">删除</button><button class="btn pri" id="nt-ok">保存</button></div></div>`);
  const s = sheet('我的笔记', body), ta = $('#nt-t', body); ta.value = S().notes?.[it.id] || ''; setTimeout(() => ta.focus(), 100);
  $('#nt-ok', body).onclick = () => { const n = S().notes ||= {}; const v = ta.value.trim(); if (v) n[it.id] = v; else delete n[it.id]; saveState(); s.close(); if (p) { p.noteOpen = true; rerender(p); } toast('已保存'); };
  $('#nt-del', body).onclick = () => { delete (S().notes ||= {})[it.id]; saveState(); s.close(); if (p) rerender(p); };
  return s;
}
function itemMenu(p) {
  const it = p.it, starred = !!S().stars[it.id], st = getSt(it), hasNote = !!S().notes?.[it.id];
  menuSheet(TYPE_LABEL[it.t], [
    { icon: 'spark', label: '问 AI', run: () => askAI(it, p) },
    typeof Speech !== 'undefined' && Speech.ok && { icon: 'speaker', label: Speech.isCard(it.id) ? '停止朗读' : '朗读卡片', run: () => Speech.toggleCard(p) },
    { icon: 'edit', label: hasNote ? '编辑笔记' : '写笔记', run: () => noteSheet(it, p) },
    { icon: 'star', label: starred ? '取消收藏' : '收藏', run: () => { if (starred) delete S().stars[it.id]; else S().stars[it.id] = 1; saveState(); toast(starred ? '已取消收藏' : '已收藏'); } },
    st && st.lapses && !st.cl && { icon: 'check', label: '移出错题本', run: () => { st.cl = 1; saveSrs(it.course); toast('已移出错题本'); } },
    { icon: 'pen', label: '编辑', run: () => itemEditSheet({ it, p }) },
    { icon: 'wand', label: '内容有误', run: () => fixItem(p) },
    { icon: 'list', label: '打开所在小节', run: () => go('section', { id: it.sec }) },
    { icon: it.builtin ? 'eyeoff' : 'trash', label: it.builtin ? '不再显示' : '删除', cls: 'danger', run: () => { removeItem(it); $(`[data-pk="${p.pk}"]`)?.remove(); toast(it.builtin ? '已隐藏' : '已删除'); } }
  ]);
}
function sbarH() { return $('.sfbar') ? 62 : 12; }
function advance(p) {
  const el = $(`[data-pk="${p.pk}"]`), nx = el?.nextElementSibling; if (!nx) return;
  setTimeout(() => {
    scrollTo({ top: nx.getBoundingClientRect().top + scrollY - sbarH(), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    if (typeof Speech !== 'undefined' && Speech.auto && nx.dataset.pk) { const np = Feed.posts.get(nx.dataset.pk); if (np) Speech.readCard(np); }
  }, 220);
}
function currentPost() {
  const top = sbarH() + 20;
  for (const el of $$('#feed > [data-pk]')) { const r = el.getBoundingClientRect(); if (r.bottom > top + 40) return el; }
  return null;
}
addEventListener('keydown', e => {
  const vw = Nav.stack[Nav.stack.length - 1]?.view;
  if ((vw !== 'session' && vw !== 'today') || $('.sheet-wrap') || Detail.cur || VizView.cur || e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
  const el = currentPost(); if (!el) return; const p = Feed.posts.get(el.dataset.pk); if (!p) return;
  const k = e.key.toLowerCase(), click = sel => { const b = $(sel, el); if (b && !b.disabled) { b.click(); return true; } return false; };
  if (k === ' ' || k === 'enter') { e.preventDefault(); if (!click('[data-act="reveal"]') && !click('[data-act="submit"]')) { if (p.g != null) advance(p); } }
  else if (/^[1-4]$/.test(k)) { e.preventDefault(); click(`.rate[data-g="${k}"]`); }
  else if (/^[a-f]$/.test(k)) { if (click(`[data-act="opt"][data-i="${k.charCodeAt(0) - 97}"]`)) e.preventDefault(); else if (k === 'a' && p.it.t === 'tf') click('[data-act="tf"][data-v="true"]'); else if (k === 'b' && p.it.t === 'tf') click('[data-act="tf"][data-v="false"]'); }
  else if (k === 'i') { e.preventDefault(); askAI(p.it, p); }
  else if (k === 'h') { e.preventDefault(); click('[data-act="step"]'); }
  else if (k === 'r' && typeof Speech !== 'undefined' && Speech.ok) { e.preventDefault(); Speech.toggleCard(p); }
  else if (k === 'arrowright' || k === 'l') { if (click('[data-act="detail"]')) e.preventDefault(); }
});
