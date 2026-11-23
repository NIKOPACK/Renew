/* ============ 学习时问 AI、个人笔记、翻页与快捷键（v5） ============ */
const askMem = new Map();
function askAI(it, p) {
  const c = COURSES.get(it.course), sec = SECS.get(it.sec), q = isQ(it);
  const turns = askMem.get(it.id) || []; askMem.set(it.id, turns);
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
  const body = h(`<div style="display:flex;flex-direction:column;gap:12px">
    <div class="askctx"><span class="ptype ${q ? 'q' : ''}">${TYPE_LABEL[it.t]}</span><span class="grow">${esc(plain(it.title || it.q).slice(0, 40))}</span></div>
    <div class="chat" id="ak-chat"></div>
    <div class="chips" id="ak-chips">${chips.map(([l], i) => `<button class="chip" data-c="${i}">${esc(l)}</button>`).join('')}</div>
    <div class="cbox"><textarea id="ak-in" rows="1" placeholder="继续问…"></textarea><div class="crow"><span class="grow"></span><button class="send" id="ak-go" aria-label="发送">${ico('send')}</button></div></div></div>`);
  const s = sheet('问 AI', body), box = $('#ak-chat', body), inp = $('#ak-in', body);
  let ctl = null, busy = false; s.onclose = () => ctl?.abort();
  const draw = () => {
    box.innerHTML = '';
    turns.forEach((t, i) => {
      if (t.role === 'user') return box.append(h(`<div class="um">${esc(t.label || t.content)}</div>`));
      const m = h(`<div class="am"><div class="md">${md(t.content)}</div><div class="acts2"><button data-save="${i}">${ico('edit')}存为笔记</button><button data-copy="${i}">${ico('file')}复制</button></div></div>`); box.append(m);
    });
    $$('[data-save]', box).forEach(b => b.onclick = () => { const t = turns[+b.dataset.save].content.trim(); const n = S().notes ||= {}; n[it.id] = n[it.id] ? n[it.id] + '\n\n' + t : t; saveState(); if (p) rerender(p); b.innerHTML = ico('check') + '已存入笔记'; b.disabled = true; });
    $$('[data-copy]', box).forEach(b => b.onclick = () => copyText(turns[+b.dataset.copy].content, '已复制'));
  };
  const send = async (content, label) => {
    if (busy || !content.trim()) return;
    if (!AI.ok) { if (Platform.aiConfigurable) { AI.require(); return; } copyText(ctx + '\n\n学生问：' + content, AI.need + '。已复制问题，可以粘贴到任意 AI'); return; }
    busy = true; turns.push({ role: 'user', content, label }); draw();
    const bubble = h(`<div class="am"><div class="md"><div class="typing"><i></i><i></i><i></i></div></div></div>`); box.append(bubble); bubble.scrollIntoView({ block: 'end', behavior: 'smooth' });
    ctl = new AbortController(); let last = 0;
    try {
      const { text } = await AI.fn([{ role: 'user', content: ctx }, ...turns.map(t => ({ role: t.role, content: t.content }))], { signal: ctl.signal, cache: false, onText: ({ text }) => { const n = Date.now(); if (n - last > 200) { last = n; $('.md', bubble).innerHTML = md(text); } } });
      turns.push({ role: 'assistant', content: text });
    } catch (e) { if (e?.text) turns.push({ role: 'assistant', content: e.text }); else { turns.pop(); toast(AI.err(e)); } }
    busy = false; draw(); box.lastElementChild?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  $$('[data-c]', body).forEach(b => b.onclick = () => { const [l, t] = chips[+b.dataset.c]; send(t, l); });
  $('#ak-go', body).onclick = () => { const v = inp.value; inp.value = ''; send(v); };
  inp.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#ak-go', body).click(); } };
  draw();
}
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
    { icon: 'edit', label: hasNote ? '编辑笔记' : '写笔记', run: () => noteSheet(it, p) },
    { icon: 'star', label: starred ? '取消收藏' : '收藏', run: () => { if (starred) delete S().stars[it.id]; else S().stars[it.id] = 1; saveState(); toast(starred ? '已取消收藏' : '已收藏'); } },
    st && st.lapses && !st.cl && { icon: 'check', label: '移出错题本', run: () => { st.cl = 1; saveSrs(it.course); toast('已移出错题本'); } },
    { icon: 'wand', label: '内容有误', run: () => fixItem(p) },
    { icon: 'list', label: '打开所在小节', run: () => go('section', { id: it.sec }) },
    { icon: it.builtin ? 'eyeoff' : 'trash', label: it.builtin ? '不再显示' : '删除', cls: 'danger', run: () => { removeItem(it); $(`[data-pk="${p.pk}"]`)?.remove(); toast(it.builtin ? '已隐藏' : '已删除'); } }
  ]);
}
function sbarH() { return ($('.sbar')?.offsetHeight || 0) + 8; }
function advance(p) {
  const el = $(`[data-pk="${p.pk}"]`), nx = el?.nextElementSibling; if (!nx) return;
  setTimeout(() => scrollTo({ top: nx.getBoundingClientRect().top + scrollY - sbarH(), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }), 220);
}
function currentPost() {
  const top = sbarH() + 20;
  for (const el of $$('#feed > [data-pk]')) { const r = el.getBoundingClientRect(); if (r.bottom > top + 40) return el; }
  return null;
}
addEventListener('keydown', e => {
  if (Nav.stack[Nav.stack.length - 1]?.view !== 'session' || $('.sheet-wrap') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
  const el = currentPost(); if (!el) return; const p = Feed.posts.get(el.dataset.pk); if (!p) return;
  const k = e.key.toLowerCase(), click = sel => { const b = $(sel, el); if (b && !b.disabled) { b.click(); return true; } return false; };
  if (k === ' ' || k === 'enter') { e.preventDefault(); if (!click('[data-act="reveal"]') && !click('[data-act="submit"]')) { if (p.g != null) advance(p); } }
  else if (/^[1-4]$/.test(k)) { e.preventDefault(); click(`.rate[data-g="${k}"]`); }
  else if (/^[a-f]$/.test(k)) { if (click(`[data-act="opt"][data-i="${k.charCodeAt(0) - 97}"]`)) e.preventDefault(); else if (k === 'a' && p.it.t === 'tf') click('[data-act="tf"][data-v="true"]'); else if (k === 'b' && p.it.t === 'tf') click('[data-act="tf"][data-v="false"]'); }
  else if (k === 'i') { e.preventDefault(); askAI(p.it, p); }
  else if (k === 'h') { e.preventDefault(); click('[data-act="step"]'); }
});
