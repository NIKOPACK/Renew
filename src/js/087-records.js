/* ============ 学习记录：每天学了什么（今日页一周、学习记录页的日历与历史都能打开） ============ */
const fmtDay = k => { const d = keyToDate(k), t = dayKey(); return k === t ? '今天' : k === addDays(t, -1) ? '昨天' : `${d.getMonth() + 1}月${d.getDate()}日 周${WEEK[d.getDay()]}`; };
/* 某一天按小节汇总：有记录就用记录；更早的日子用卡片「最后一次学习时间」近似还原 */
function dayRecord(k) {
  const st = S().stats[k] || { n: 0, r: 0, ok: 0, bad: 0, sec: 0 }, h = S().hist?.[k];
  let secs;
  if (h) secs = Object.entries(h).map(([sid, [n, r, ok, bad]]) => ({ sid, n, r, ok, bad }));
  else {
    const m = {}, a = keyToDate(k).getTime() + CUT, b = a + DAY;
    for (const it of ITEMS.values()) { const s = getSt(it); if (!s || !(s.last >= a && s.last < b)) continue; const x = m[it.sec] ||= { sid: it.sec, n: 0, r: 0, ok: 0, bad: 0 }; s.reps > 1 ? x.r++ : x.n++; }
    secs = Object.values(m);
  }
  return { st, secs: secs.filter(x => SECS.has(x.sid)).sort((x, y) => (y.n + y.r) - (x.n + x.r)), ck: !!S().checkins[k] };
}
function daySheet(k) {
  const { st, secs, ck } = dayRecord(k), acc = st.ok + st.bad ? Math.round(st.ok / (st.ok + st.bad) * 100) + '%' : '—';
  const body = `<div class="kp4"><div><b>${st.n}</b><span>新学</span></div><div><b>${st.r}</b><span>复习</span></div><div><b>${acc}</b><span>正确率</span></div><div><b>${Math.round((st.sec || 0) / 60)}</b><span>分钟</span></div></div>
    ${ck ? `<div class="daytag">${ico('check')}已打卡</div>` : ''}
    ${secs.length ? `<div class="group icons">${secs.map(x => { const sec = SECS.get(x.sid), c = COURSES.get(sec.course); return `<button class="rowi" data-goto-sec="${x.sid}">${courseMark(c)}<span class="grow"><div class="t">${esc(sec.title)}</div><div class="m">${esc(c.title)}${x.n ? ` · 新学 ${x.n}` : ''}${x.r ? ` · 复习 ${x.r}` : ''}${x.bad ? ` · 答错 ${x.bad}` : ''}</div></span>${ico('chev', 'chev')}</button>`; }).join('')}</div>`
      : `<div class="empty">${ico('calendar')}<b>这一天没有学习</b></div>`}`;
  const s = sheet(fmtDay(k), body);
  $$('[data-goto-sec]', s.body).forEach(b => b.onclick = () => { s.close(); go('section', { id: b.dataset.gotoSec }); });
}
/* 学习记录页：最近有学习的日子 */
function historyGroup() {
  const days = []; for (let i = 0; i < 90; i++) { const k = addDays(dayKey(), -i), s = S().stats[k]; if (s && s.n + s.r) days.push(k); }
  if (!days.length) return '';
  const row = k => { const s = S().stats[k], { secs } = dayRecord(k), names = secs.slice(0, 2).map(x => SECS.get(x.sid).title).join('、');
    return `<button class="rowi" data-day="${k}"><span class="grow"><div class="t">${fmtDay(k)}</div><div class="m">${[s.n ? `新学 ${s.n}` : '', s.r ? `复习 ${s.r}` : '', s.sec >= 60 ? `${Math.round(s.sec / 60)} 分钟` : ''].filter(Boolean).join(' · ')}${names ? ` · ${esc(names)}${secs.length > 2 ? ' 等' : ''}` : ''}</div></span>${ico('chev', 'chev')}</button>`; };
  return `<div class="gh"><b>学习历史</b><span>${days.length} 天</span></div><div class="group hist">${days.map(row).join('')}${days.length > 5 ? '<button class="rowi more" id="hist-more"><span class="grow t" style="color:var(--accent)">显示全部</span></button>' : ''}</div>`;
}
document.addEventListener('click', e => { const d = e.target.closest('#view [data-day]'); if (d) daySheet(d.dataset.day); });
document.addEventListener('keydown', e => { if (e.key === 'Enter') { const d = e.target.closest?.('#view [data-day]'); if (d) daySheet(d.dataset.day); } });
