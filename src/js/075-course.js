/* ============ 课程详情 ============ */
function syncSheet(c) {
  const body = h(`<div style="display:flex;flex-direction:column;gap:12px"></div>`);
  body.innerHTML = `<p class="small" style="margin:0">选中的小节和它之前的内容会直接进入复习。</p>` +
    c.chapters.map(ch => `<div><div class="eyebrow" style="margin:6px 2px">${esc(ch.title)}</div><div class="menu">${ch.sections.map(sec => { const st = secStatus(sec); return `<button data-upto="${sec.id}"><span class="sti" data-s="${st}">${st === 'done' ? ico('check') : st === 'external' ? ico('sync') : ''}</span><span class="grow">${esc(sec.title)}<small>${SEC_LABEL[st]}</small></span></button>`; }).join('')}</div></div>`).join('');
  const s = sheet('我已经学到…', body);
  $$('[data-upto]', body).forEach(b => b.onclick = async () => {
    const sec = SECS.get(b.dataset.upto);
    if (!await confirmBox('同步进度', `把「${c.title}」从开头到「${sec.title}」中未学的小节标记为别处已学？`, '同步')) return;
    const n = setUpto(sec.id); logEvent(`同步进度：${c.title} 学到 ${sec.title}`); saveState(); s.close(); refresh(); toast(`已同步，${n} 个内容进入复习安排`);
  });
}
