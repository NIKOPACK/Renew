/* ============ 笔记阅读 ============ */
function viewNotes({ course, sec, tab }) {
  if (tab === 'mine') return viewMyNotes({ course, sec });
  const v = $('#view'), c = COURSES.get(course), s = sec && SECS.get(sec); if (!c) return back();
  const secHTML = x => { const kps = secKps(x), qs = secQs(x);
    return `<section class="doc-sec" id="n-${x.id}"><h2>${esc(x.title)}</h2>${!kps.length && !qs.length ? '<p class="small">这一节还没有内容。</p>' : ''}${kps.map(it => `<article class="doc-kp" id="a-${it.id}" data-it="${it.id}">${bmBtn(c, it)}<h3>${esc(it.title || '知识点')}${it.imp >= 2 ? ' <span class="pill bad" style="vertical-align:middle">高频</span>' : ''}</h3><div class="md">${md(it.q)}</div>${it.d ? `<div class="md doc-d">${md(it.d)}</div>` : ''}</article>`).join('')}
    ${qs.length ? `<h3 class="doc-qh">本节练习</h3>${qs.map((it, i) => `<article class="doc-q" id="a-${it.id}" data-it="${it.id}">${bmBtn(c, it)}<div class="ptype q">${i + 1}. ${TYPE_LABEL[it.t]}</div>${it.title && it.t === 'think' ? `<b>${esc(it.title)}</b>` : ''}<div class="md">${md(it.q, { cloze: true })}</div>${it.o ? `<div class="md">${it.o.map((o, k) => `<p>${String.fromCharCode(65 + k)}. ${md(o, { inline: true })}</p>`).join('')}</div>` : ''}<details><summary>答案与解答</summary><div class="md">${ansText(it) ? `<p><strong>答案：${ansText(it)}</strong></p>` : ''}${it.t === 'think' && it.st?.length ? `<ol>${it.st.map(t => `<li>${md(t, { inline: true })}</li>`).join('')}</ol>` : ''}${it.a && typeof it.a === 'string' ? md(it.a) : ''}${it.x ? md(it.x) : ''}</div></details></article>`).join('')}` : ''}</section>`; };
  const body = s ? secHTML(s) : c.chapters.map(ch => `<div class="doc-ch"><span class="eyebrow">${esc(ch.title)}</span></div>${ch.sections.map(secHTML).join('')}`).join('');
  v.innerHTML = appbar(s ? s.title : c.title + ' · 笔记', `<button class="ibtn" id="nt-bms" aria-label="书签">${ico('bookmarks')}</button><button class="ibtn" id="nt-typo" aria-label="阅读排版">${ico('aa')}</button>`) + `<div class="wrap"><div class="stack" style="padding-top:6px">
  <header style="padding:4px 2px"><span class="eyebrow" style="color:${c.color}">${esc(c.title)}${s ? ' · ' + esc(CHAPS.get(s.chap).title) : ''}</span><h1 style="margin:6px 0 4px;font-size:26px;font-weight:800">${esc(s ? s.title : '课程笔记')}</h1></header>
  ${noteTabs(c, s, 'read')}
  ${!s ? `<div class="chips">${c.chapters.map((ch, i) => `<button class="chip" data-jump="${ch.sections[0]?.id}">${esc(chapShort(ch))}</button>`).join('')}</div>` : ''}
  <div class="card doc">${body}</div>
  <button class="btn block" id="nt-exp">${ico('download')}导出为 Markdown</button></div></div>`;
  $('[data-back]', v).onclick = back; $('#nt-typo').onclick = typoSheet; bindNoteTabs(v);
  $('#nt-exp').onclick = () => Files.save((s ? s.title : c.title) + '.md', s ? sectionMD(s, '#') : courseMD(c), 'text/markdown');
  $$('[data-jump]', v).forEach(b => b.onclick = () => { const t = $('#n-' + b.dataset.jump); if (t) scrollTo({ top: t.getBoundingClientRect().top + scrollY - 70, behavior: 'smooth' }); });
  $('.appbar', v).insertAdjacentHTML('beforeend', '<div class="readprog"><i id="nt-bar"></i></div>');
  $('#nt-bms').onclick = () => bookmarkSheet(c);
  const top = Nav.stack[Nav.stack.length - 1], pos = Reading.get(c.id), jump = top.params.jump;
  requestAnimationFrame(() => {
    if (jump) { Reading.scrollTo(jump); top.params = { ...top.params, jump: undefined }; }
    else if (!s && !top.y && pos?.it && $('#a-' + CSS.escape(pos.it))) { Reading.scrollTo(pos.it); toast('已回到上次读到的位置'); }
    Reading.track();
  });
}

/* ---- 阅读进度与书签（存在学习数据 app/state 中，随备份一起保存） ---- */
const Reading = {
  get: cid => S().reading?.[cid] || null,
  scrollTo(id, smooth) { const el = $('#a-' + CSS.escape(id)); if (el) scrollTo({ top: el.getBoundingClientRect().top + scrollY - 76, behavior: smooth ? 'smooth' : 'auto' }); },
  timer: 0,
  track() {
    const top = Nav.stack[Nav.stack.length - 1]; if (top?.view !== 'notes') return;
    const h = document.documentElement.scrollHeight - innerHeight, bar = $('#nt-bar');
    if (bar) bar.style.width = (h > 0 ? Math.min(100, scrollY / h * 100) : 100) + '%';
    const arts = $$('#view article[data-it]'), y = ($('.appbar')?.offsetHeight || 56) + 24;
    const cur = arts.find(a => a.getBoundingClientRect().bottom > y); if (!cur) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const it = ITEMS.get(cur.dataset.it); if (!it || Nav.stack[Nav.stack.length - 1]?.view !== 'notes') return;
      (S().reading ||= {})[top.params.course] = { it: it.id, sec: it.sec, at: Date.now() }; saveState();
    }, 800);
  }
};
addEventListener('scroll', () => Reading.track(), { passive: true });
document.addEventListener('click', e => { const b = e.target.closest('#view [data-bm]'), top = Nav.stack[Nav.stack.length - 1]; if (b && top?.view === 'notes') toggleBookmark(COURSES.get(top.params.course), b.dataset.bm); });
const bookmarks = cid => (S().bookmarks ||= {})[cid] ||= [];
const bmBtn = (c, it) => { const on = bookmarks(c.id).some(b => b.it === it.id); return `<button class="bm ${on ? 'on' : ''}" data-bm="${it.id}" aria-label="${on ? '取消书签' : '添加书签'}" aria-pressed="${on}">${ico('bookmark', '', on ? 'fill' : '')}</button>`; };
function toggleBookmark(c, id) {
  const list = bookmarks(c.id), i = list.findIndex(b => b.it === id), it = ITEMS.get(id);
  if (i >= 0) list.splice(i, 1); else list.push({ it: id, sec: it?.sec, at: Date.now() });
  saveState(); Motion.haptic();
  const btn = $(`[data-bm="${CSS.escape(id)}"]`);
  if (btn) { btn.outerHTML = bmBtn(c, it || { id }); Motion.pop($(`[data-bm="${CSS.escape(id)}"]`), 1.25); }
  toast(i >= 0 ? '已取消书签' : '已加入书签');
}
function bookmarkSheet(c) {
  const order = new Map(courseSecs(c).map((x, i) => [x.id, i]));
  const list = bookmarks(c.id).filter(b => ITEMS.has(b.it)).sort((a, b) => (order.get(a.sec) ?? 1e9) - (order.get(b.sec) ?? 1e9));
  const pos = Reading.get(c.id), posIt = pos && ITEMS.get(pos.it);
  const row = (id, last) => { const it = ITEMS.get(id), sec = SECS.get(it.sec); return `<button data-go-it="${it.id}">${ico(last ? 'flag' : 'bookmark', '', last ? '' : 'fill')}<span class="grow">${last ? '上次读到：' : ''}${esc(plain(it.title || it.q).slice(0, 40))}<small>${esc(sec?.title || '')}</small></span>${last ? '' : `<span class="ibtn" data-del-bm="${it.id}" role="button" aria-label="删除书签" style="color:var(--ink-3)">${ico('trash')}</span>`}</button>`; };
  const s = sheet('书签', `${posIt ? `<div class="menu">${row(posIt.id, true)}</div>` : ''}${list.length ? `<div class="menu">${list.map(b => row(b.it)).join('')}</div>` : `<div class="empty">${ico('bookmark')}<b>还没有书签</b></div>`}`);
  $$('[data-del-bm]', s.body).forEach(x => x.onclick = e => { e.stopPropagation(); toggleBookmark(c, x.dataset.delBm); s.close(); bookmarkSheet(c); });
  $$('[data-go-it]', s.body).forEach(x => x.onclick = () => {
    s.close(); const id = x.dataset.goIt, top = Nav.stack[Nav.stack.length - 1];
    if (top.view === 'notes' && !top.params.sec && $('#a-' + CSS.escape(id))) Reading.scrollTo(id, true);
    else go('notes', { course: c.id, jump: id });
  });
}

