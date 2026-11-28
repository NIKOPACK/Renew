/* ============ 错题本页 ============ */
/* 待巩固：答错过且还没攻克；已攻克：原题和变式题在不同的两天答对（没有变式题时原题在两天答对），或手动移出 */
function conqueredItems() {
  const out = [];
  for (const it of ITEMS.values()) { if (!visible(it) || S().hiddenCourses[it.course]) continue; const s = getSt(it); if (s && s.lapses && s.cl) out.push(it); }
  return out.sort((a, b) => (getSt(b).won || getSt(b).last) - (getSt(a).won || getSt(a).last));
}
const variantsOf = id => [...ITEMS.values()].filter(x => x.of === id && visible(x));
/* 答对后检查是否攻克：只看最近一次答错之后的作答 */
function checkConquer(it) {
  const st = getSt(it); if (!st?.lapses || st.cl) return false;
  const after = l => { let i = l.length - 1; while (i >= 0 && l[i].ok !== false) i--; return l.slice(i + 1).filter(r => r.ok); };
  const orig = attOf(it.id), lw = lastWrong(it.id); if (!lw) return false;
  const oDays = new Set(after(orig).map(r => dayKey(r.t)));
  const vDays = new Set(variantsOf(it.id).flatMap(v => attOf(v.id).filter(r => r.ok && r.t > lw.t)).map(r => dayKey(r.t)));
  const ok = vDays.size ? oDays.size >= 1 && new Set([...oDays, ...vDays]).size >= 2 : oDays.size >= 2;
  if (ok) { st.cl = 1; st.won = Date.now(); saveSrs(it.course); }
  return ok;
}
function viewWrongbook({ course = '', cause = '', tab = 'todo' } = {}) {
  const v = $('#view'), top = Nav.stack[Nav.stack.length - 1], all = tab === 'won' ? conqueredItems() : wrongItems();
  const courses = [...new Set([...wrongItems(), ...conqueredItems()].map(it => it.course))].map(id => COURSES.get(id)).filter(Boolean);
  const causeOf = it => lastWrong(it.id)?.cause || '';
  const list = all.filter(it => (!course || it.course === course) && (!cause || (cause === 'none' ? !causeOf(it) : causeOf(it) === cause)));
  const byCause = k => all.filter(it => (!course || it.course === course) && (k === 'none' ? !causeOf(it) : causeOf(it) === k)).length;
  const shown = list.slice(0, top.more ? 400 : 60);
  v.innerHTML = appbar('', `<button class="ibtn" id="wb-cap" aria-label="录题">${ico('scan')}</button><button class="ibtn" id="wb-exp" aria-label="导出">${ico('printer')}</button>`) + `<div class="wrap"><div class="stack">
  <header style="padding:4px 4px 0"><h1 class="phead">错题本</h1></header>
  <div class="dueh"><div class="grow"><div class="big" data-count>${tab === 'won' ? conqueredItems().length : wrongItems().length}</div><div class="lab">${tab === 'won' ? `${ico('trophy')}已攻克` : `${ico('alert')}待巩固`}</div></div>${tab !== 'won' && list.length ? `<button class="play" id="wb-go" aria-label="刷错题" style="width:56px;height:56px">${ico('play', '', 'fill')}</button>` : ''}</div>
  <div class="seg" id="wb-tab"><button data-t="todo" aria-pressed="${tab !== 'won'}">${ico('alert')}待巩固</button><button data-t="won" aria-pressed="${tab === 'won'}">${ico('trophy')}已攻克</button></div>
  ${courses.length > 1 ? `<div class="chips">${[['', '全部'], ...courses.map(c => [c.id, c.title])].map(([id, t]) => `<button class="chip" data-wc="${id}" aria-pressed="${course === id}">${id ? `<i class="cdot" style="--c:${COURSES.get(id).color}"></i>` : ''}${esc(t)}</button>`).join('')}</div>` : ''}
  ${tab !== 'won' ? `<div class="chips">${[...CAUSES, ['none', '未标', 'alert']].map(([k, l, i]) => { const n = byCause(k); return n || cause === k ? `<button class="chip" data-wz="${k}" aria-pressed="${cause === k}">${ico(i)}${l}<span class="n">${n}</span></button>` : ''; }).join('')}</div>` : ''}
  ${tab !== 'won' && list.length && AI.ok ? `<button class="btn soft block" id="wb-var">${ico('repeat')}举一反三<span class="n">${Math.min(5, list.length)}</span></button>` : ''}
  ${list.length ? `<div class="group" style="--sepl:52px">${shown.map(it => { const s = getSt(it), lw = lastWrong(it.id), z = lw?.cause && CAUSE[lw.cause], vs = variantsOf(it.id).length;
    return `<button class="rowi" data-wi="${it.id}"><span class="tico soft" style="--c:${z ? (lw.by === 'rule' ? 'var(--ink-3)' : 'var(--warn)') : 'var(--bad)'}">${tileIco(z ? z.i : tab === 'won' ? 'trophy' : 'alert')}</span><span class="grow"><div class="t wb-t">${esc(plain(it.title || it.q).slice(0, 40))}</div><div class="m">${esc(SECS.get(it.sec).title)} · ${ico('x')}<span class="num">${s.lapses}</span>${vs ? ` · ${ico('repeat')}<span class="num">${vs}</span>` : ''}${it.src === 'import' ? ` · ${ico('scan')}` : ''}${lw ? ` · ${dayKey(lw.t).slice(5)}` : ''}</div></span>${ico('chev', 'chev')}</button>`; }).join('')}${list.length > shown.length ? `<button class="rowi more" id="wb-more"><span class="grow t" style="color:var(--accent)">${list.length - shown.length}</span></button>` : ''}</div>`
    : `<div class="empty">${tileIco(tab === 'won' ? 'trophy' : 'check')}<b>${tab === 'won' ? '还没有攻克的题' : '没有错题'}</b></div>`}
  </div></div>`;
  const set = o => { top.params = { course, cause, tab, ...o }; refresh(); };
  $('[data-back]', v).onclick = back;
  $('#wb-go')?.addEventListener('click', () => go('session', { kind: 'items', ids: list.map(it => it.id), lab: '错题巩固' }));
  $$('#wb-tab button', v).forEach(b => b.onclick = () => set({ tab: b.dataset.t, cause: '' }));
  $$('[data-wc]', v).forEach(b => b.onclick = () => set({ course: b.dataset.wc }));
  $$('[data-wz]', v).forEach(b => b.onclick = () => set({ cause: cause === b.dataset.wz ? '' : b.dataset.wz }));
  $$('[data-wi]', v).forEach(b => b.onclick = () => go('session', { kind: 'items', ids: [b.dataset.wi], lab: tab === 'won' ? '已攻克' : '错题巩固' }));
  $('#wb-more')?.addEventListener('click', () => { top.more = 1; refresh(); });
  $('#wb-var')?.addEventListener('click', () => variantSheet(list.slice(0, 5).map(it => it.id)));
  $('#wb-cap').onclick = () => captureSheet({ course: course || courses[0]?.id });
  $('#wb-exp').onclick = () => exportWrong(list);
}
/* 错题整理成 Markdown：题目、我的作答、答案、错因、解答 */
function exportWrong(list) {
  if (!list.length) return toast('没有错题');
  const L = [`# 错题本（${dayKey()}）`, ''];
  list.forEach((it, i) => {
    const lw = lastWrong(it.id), z = lw?.cause && CAUSE[lw.cause];
    L.push(itemMD(it, i + 1).replace(/^#### 练习 /, '## '));
    if (lw && lw.ans !== undefined) L.push(`**我的作答**：${ansShow(it, lw.ans)}`, '');
    if (z) L.push(`**错因**：${z.l}${lw.why ? '（' + lw.why + '）' : ''}`, '');
    L.push(`> ${COURSES.get(it.course).title} · ${SECS.get(it.sec).title} · 错 ${getSt(it)?.lapses || 0} 次`, '');
  });
  Files.save(`错题本-${dayKey()}.md`, L.join('\n'), 'text/markdown');
}
