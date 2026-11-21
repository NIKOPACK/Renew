/* ============ 笔记阅读 ============ */
function viewNotes({ course, sec }) {
  const v = $('#view'), c = COURSES.get(course), s = sec && SECS.get(sec); if (!c) return back();
  const secHTML = x => { const kps = secKps(x), qs = secQs(x);
    return `<section class="doc-sec" id="n-${x.id}"><h2>${esc(x.title)}</h2>${!kps.length && !qs.length ? '<p class="small">这一节还没有内容。</p>' : ''}${kps.map(it => `<article class="doc-kp"><h3>${esc(it.title || '知识点')}${it.imp >= 2 ? ' <span class="pill bad" style="vertical-align:middle">高频</span>' : ''}</h3><div class="md">${md(it.q)}</div>${it.d ? `<div class="md doc-d">${md(it.d)}</div>` : ''}</article>`).join('')}
    ${qs.length ? `<h3 class="doc-qh">本节练习</h3>${qs.map((it, i) => `<article class="doc-q"><div class="ptype q">${i + 1}. ${TYPE_LABEL[it.t]}</div>${it.title && it.t === 'think' ? `<b>${esc(it.title)}</b>` : ''}<div class="md">${md(it.q, { cloze: true })}</div>${it.o ? `<div class="md">${it.o.map((o, k) => `<p>${String.fromCharCode(65 + k)}. ${md(o, { inline: true })}</p>`).join('')}</div>` : ''}<details><summary>答案与解答</summary><div class="md">${ansText(it) ? `<p><strong>答案：${ansText(it)}</strong></p>` : ''}${it.t === 'think' && it.st?.length ? `<ol>${it.st.map(t => `<li>${md(t, { inline: true })}</li>`).join('')}</ol>` : ''}${it.a && typeof it.a === 'string' ? md(it.a) : ''}${it.x ? md(it.x) : ''}</div></details></article>`).join('')}` : ''}</section>`; };
  const body = s ? secHTML(s) : c.chapters.map(ch => `<div class="doc-ch"><span class="eyebrow">${esc(ch.title)}</span></div>${ch.sections.map(secHTML).join('')}`).join('');
  v.innerHTML = appbar(s ? s.title : c.title + ' · 笔记', `<button class="ibtn" id="nt-typo" aria-label="阅读排版">${ico('aa')}</button>`) + `<div class="wrap"><div class="stack" style="padding-top:6px">
  <header style="padding:4px 2px"><span class="eyebrow" style="color:${c.color}">${esc(c.title)}${s ? ' · ' + esc(CHAPS.get(s.chap).title) : ''}</span><h1 style="margin:6px 0 4px;font-size:26px;font-weight:800">${esc(s ? s.title : '课程笔记')}</h1><p class="small" style="margin:0">把卡片按讲义的形式连起来阅读。练习的答案默认收起。</p></header>
  ${!s ? `<div class="chips">${c.chapters.map((ch, i) => `<button class="chip" data-jump="${ch.sections[0]?.id}">${esc(chapShort(ch))}</button>`).join('')}</div>` : ''}
  <div class="card doc">${body}</div>
  <button class="btn block" id="nt-exp">${ico('download')}导出为 Markdown</button></div></div>`;
  $('[data-back]', v).onclick = back; $('#nt-typo').onclick = typoSheet;
  $('#nt-exp').onclick = () => Files.save((s ? s.title : c.title) + '.md', s ? sectionMD(s, '#') : courseMD(c), 'text/markdown');
  $$('[data-jump]', v).forEach(b => b.onclick = () => { const t = $('#n-' + b.dataset.jump); if (t) scrollTo({ top: t.getBoundingClientRect().top + scrollY - 70, behavior: 'smooth' }); });
}
