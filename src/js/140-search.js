/* ============ 搜索 ============ */
let searchQ = '';
function viewSearch() {
  const v = $('#view');
  v.innerHTML = appbar('搜索') + `<div class="wrap"><div class="stack" style="padding-top:6px"><div class="searchbox">${ico('search')}<input id="sq" class="grow" placeholder="搜索知识点、题目、解答" value="${esc(searchQ)}" autocomplete="off"></div><div id="sr"></div></div></div>`;
  $('[data-back]', v).onclick = back;
  const inp = $('#sq'), run = () => {
    searchQ = inp.value.trim(); const box = $('#sr'); if (!searchQ) { box.innerHTML = '<p class="small" style="text-align:center;margin-top:30px">输入关键词，在所有课程中查找</p>'; return; }
    const q = searchQ.toLowerCase(), res = [];
    for (const it of ITEMS.values()) { if (!visible(it) || S().hiddenCourses[it.course]) continue; const t = ((it.title || '') + ' ' + it.q + ' ' + (it.d || '') + ' ' + (it.x || '') + ' ' + (it.o || []).join(' ')).toLowerCase(); const i = t.indexOf(q); if (i >= 0) res.push([(it.title || '').toLowerCase().includes(q) ? 0 : 1, it]); if (res.length > 300) break; }
    res.sort((a, b) => a[0] - b[0]);
    box.innerHTML = res.length ? `<div class="small" style="margin:0 2px 8px">找到 ${res.length} 个</div><section class="card list">${res.slice(0, 80).map(([, it]) => { const c = COURSES.get(it.course), s = SECS.get(it.sec), text = plain((it.title ? it.title + ' ' : '') + it.q), k = text.toLowerCase().indexOf(q), snip = k > 30 ? '…' + text.slice(k - 20, k + 70) : text.slice(0, 90);
      return `<button class="li" data-it="${it.id}"><span class="grow"><div class="m" style="margin:0 0 3px;color:${c.color};font-weight:700">${esc(c.title)} · ${esc(s.title)} · ${TYPE_LABEL[it.t]}</div><div class="t" style="font-weight:600;font-size:14px">${esc(snip).replace(new RegExp(searchQ.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => `<mark>${m}</mark>`)}</div></span>${ico('chev', 'chev')}</button>`; }).join('')}</section>` : '<div class="empty">' + ico('target') + '<span>没有找到相关内容</span></div>';
    $$('[data-it]', box).forEach(b => b.onclick = () => go('session', { kind: 'items', ids: [b.dataset.it] }));
  };
  inp.oninput = run; run(); setTimeout(() => inp.focus(), 50);
}
