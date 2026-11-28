/* ============ 学情：记录页的学情卡与学情页 ============ */
/* 数字全部来自本机的作答记录（027-attempts、028-mastery）；AI 分析只能引用这些数字（097-diagnose） */
function insightCard() {
  const rows = shownCourses().map(courseInsight).filter(x => x.rows.length);
  if (!rows.length) return '';
  const n = rows.reduce((s, x) => s + x.n, 0);
  return `<div class="gh"><b>学情</b><span>${ico('pen')}${n}</span></div><div class="group icons">${rows.map(x => `<button class="rowi" data-ins="${x.c.id}">${courseMark(x.c)}<span class="grow"><div class="t">${esc(x.c.title)}</div>${mStack(x.cnt)}</span>${x.weak.length ? `<span class="pill bad">${ico('alert')}${x.weak.length}</span>` : ''}${ico('chev', 'chev')}</button>`).join('')}</div>`;
}
/* 练某个薄弱点：知识点 → 先看知识点卡，再做关联的题；小节 → 先做错过的题 */
function weakItems(x) {
  if (x.it) return [x.it, ...secQs(SECS.get(x.it.sec)).filter(q => kpsOf(q).includes(x.it.id))];
  const qs = secQs(x.sec), w = qs.filter(q => getSt(q)?.lapses && !getSt(q).cl);
  return [...w, ...qs.filter(q => !w.includes(q))];
}
function practiceWeak(x, lab = '补弱') { const ids = weakItems(x).map(it => it.id); if (!ids.length) return toast('这里还没有题目'); go('session', { kind: 'items', ids, lab }); }
const weakTitle = x => x.it ? x.it.title || plain(x.it.q).slice(0, 18) : x.sec.title;
function weakRow(x, i) {
  const sub = x.it ? SECS.get(x.it.sec).title : CHAPS.get(x.sec.chap)?.title || '';
  return `<div class="rowi wrow"><button class="grow wr-t" data-wo="${i}"><div class="t">${esc(weakTitle(x))}</div><div class="m">${x.it ? ico('bulb') : ico('list')}${esc(sub)} · <span class="num">${x.ok}/${x.raw}</span></div></button>${mBar(x)}<button class="play sm" data-wp="${i}" aria-label="练这里">${ico('play', '', 'fill')}</button></div>`;
}
function viewInsight({ course } = {}) {
  const v = $('#view'), list = shownCourses().map(courseInsight).filter(x => x.rows.length || x.n);
  if (!list.length) { v.innerHTML = appbar('学情') + `<div class="wrap"><div class="empty">${tileIco('insight')}<b>还没有作答记录</b></div></div>`; $('[data-back]', v).onclick = back; return; }
  const cur = list.find(x => x.c.id === course) || list[0], c = cur.c, cnt = cur.cnt, causes = cur.causes;
  const ctot = CAUSES.reduce((s, [k]) => s + causes[k].all, 0), cmax = Math.max(1, ...CAUSES.map(([k]) => causes[k].all));
  const wk = weeklyAcc(c.id), cal = calibration(c.id), top = Nav.stack[Nav.stack.length - 1], fit = refreshModels(); top.params = { course: c.id };
  v.innerHTML = appbar('', AI.ok || Platform.aiConfigurable ? `<button class="ibtn" id="in-ai" aria-label="AI 分析">${ico('spark')}</button>` : '') + `<div class="wrap"><div class="stack">
  <header style="padding:4px 4px 0"><div class="eyebrow" style="color:${c.color}">学情</div><h1 class="phead">${esc(c.title)}</h1></header>
  ${list.length > 1 ? `<div class="chips">${list.map(x => `<button class="chip" data-ic="${x.c.id}" aria-pressed="${x.c.id === c.id}"><i class="cdot" style="--c:${x.c.color}"></i>${esc(x.c.title)}${x.weak.length ? `<span class="n">${x.weak.length}</span>` : ''}</button>`).join('')}</div>` : ''}
  <div class="card ins-hero">${mStack(cnt)}<div class="ins-leg">${['good', 'mid', 'weak', 'none'].map(k => `<span><i style="background:${M_COLOR[k]}"></i>${M_LABEL[k]}<b class="num">${cnt[k]}</b></span>`).join('')}</div><div class="ins-n">${ico('pen')}<span class="num">${cur.n}</span> 次作答 · ${ico('list')}<span class="num">${cur.rows.length}</span> 节</div></div>
  <div class="gh"><b>薄弱</b><span class="num">${cur.weak.length}</span></div>
  ${cur.weak.length ? `<div class="group">${cur.weak.slice(0, 12).map(weakRow).join('')}</div>` : `<div class="card empty-s">${ico('check')}${cnt.none === cur.rows.length ? '数据还不够' : '没有薄弱点'}</div>`}
  ${ctot ? `<div class="gh"><b>错因</b><span class="num">${ctot}</span></div><div class="card cz-grid">${CAUSES.map(([k, l, i]) => `<button data-cause="${k}" ${causes[k].all ? '' : 'disabled'}><span class="cz-i">${ico(i)}</span><b class="num">${causes[k].all}</b><span>${l}</span><i class="cz-b" style="height:${causes[k].all / cmax * 100}%"></i></button>`).join('')}</div>` : ''}
  ${wk.some(w => w.n) ? `<div class="gh"><b>正确率</b><span>近 8 周</span></div><div class="card card-in"><div class="wk">${wk.map((w, i) => `<div class="c ${w.n ? '' : 'z'}" title="${dayKey(w.from)}：${w.ok}/${w.n}"><b>${w.n ? Math.round(w.ok / w.n * 100) : ''}</b><i style="height:${w.n ? w.ok / w.n * 64 : 0}px"></i><span>${i === wk.length - 1 ? '本周' : (wk.length - 1 - i) + '周前'}</span></div>`).join('')}</div></div>` : ''}
  <div class="gh"><b>AI 分析</b></div><div id="in-report">${reportBlock(c)}</div>
  <div class="gh"><b>全部小节</b><span class="num">${cur.rows.length}</span></div>
  <div class="group">${cur.rows.map(x => `<button class="rowi" data-is="${x.sec.id}"><span class="grow"><div class="t">${esc(x.sec.title)}</div><div class="m"><span class="mtag" style="color:${x.st === 'none' ? 'var(--ink-3)' : M_COLOR[x.st]}">${M_LABEL[x.st]}</span>${x.raw ? ` · <span class="num">${x.ok}/${x.raw}</span>` : ''}</div></span>${mBar(x)}${ico('chev', 'chev')}</button>`).join('')}</div>
  ${cal.n >= 200 ? calibrationCard(cal) : ''}
  ${modelCard(fit, c.id)}
  </div></div>`;
  $('[data-back]', v).onclick = back;
  $$('[data-ic]', v).forEach(b => b.onclick = () => { top.params = { course: b.dataset.ic }; refresh(); });
  $$('[data-wp]', v).forEach(b => b.onclick = () => practiceWeak(cur.weak[+b.dataset.wp]));
  $$('[data-wo]', v).forEach(b => b.onclick = () => { const x = cur.weak[+b.dataset.wo]; go('section', { id: x.it ? x.it.sec : x.sec.id }); });
  $$('[data-cause]', v).forEach(b => b.onclick = () => go('wrongbook', { course: c.id, cause: b.dataset.cause }));
  $$('[data-is]', v).forEach(b => b.onclick = () => go('section', { id: b.dataset.is }));
  $('#in-ai')?.addEventListener('click', () => runReport(c));
  bindReport($('#in-report', v), c);
  $('#in-fsrs')?.addEventListener('click', () => { const pl = plan(); pl.fsrsOff = !pl.fsrsOff; refreshModels(true); refresh(); toast(pl.fsrsOff ? '已恢复默认复习参数' : '已按你的记录调整'); });
  $('#in-refit')?.addEventListener('click', () => { refreshModels(true); refresh(); });
}
/* 按你的记录拟合的模型：都用留出数据检验，更准才启用 */
function modelCard(fit, cid) {
  const f = fit.fsrs || {}, p = fit.pfa?.[cid], pc = (a, b) => Math.round((1 - b / a) * 100);
  const fs = !f.n || f.n < (f.need || 0) ? `<span class="m">${ico('clock')}<span class="num">${f.n || 0}/${f.need || MODEL_MIN.fsrs}</span></span>`
    : plan().fsrsW ? `<span class="pill good">${ico('check')}误差 −${pc(f.ll0, f.ll1)}%</span>` : plan().fsrsOff && f.ok ? `<span class="pill">默认</span>` : `<span class="pill">默认更准</span>`;
  const ps = !p || p.n < (p.need || 0) ? `<span class="m">${ico('clock')}<span class="num">${p?.n || 0}/${MODEL_MIN.pfa}</span></span>` : p.ok ? `<span class="pill good">${ico('check')}误差 −${pc(p.ll0, p.ll1)}%</span>` : `<span class="pill">掌握度更准</span>`;
  return `<div class="gh"><b>个性化</b><button class="link" id="in-refit">${ico('sync')}</button></div><div class="group"><div class="rowi"><span class="grow"><div class="t">复习间隔</div><div class="m">FSRS · 按你的复习记录</div></span>${fs}${f.ok ? `<button class="toggle" role="switch" id="in-fsrs" aria-checked="${!plan().fsrsOff}" aria-label="按你的记录调整复习间隔"></button>` : ''}</div><div class="rowi"><span class="grow"><div class="t">答对预测</div><div class="m">PFA · 用来给薄弱点排序</div></span>${ps}</div></div>`;
}
/* 预测准确度：FSRS 预测的回忆概率 vs 实际记得的比例 */
function calibrationCard(cal) {
  const good = cal.ll < cal.base;
  return `<div class="gh"><b>预测准确度</b><span class="num">${cal.n}</span></div><div class="card calib"><div class="cb-bars">${cal.bins.map(b => `<div class="c ${b.n ? '' : 'z'}" title="预测 ${b.pred == null ? '—' : Math.round(b.pred * 100) + '%'}，实际 ${b.act == null ? '—' : Math.round(b.act * 100) + '%'}（${b.n} 次）"><i class="p" style="height:${(b.pred || 0) * 64}px"></i><i class="a" style="height:${(b.act || 0) * 64}px"></i><span>${Math.round(b.lo * 100)}</span></div>`).join('')}</div><div class="cb-leg"><span><i class="p"></i>预测</span><span><i class="a"></i>实际</span><span class="pill ${good ? 'good' : 'warn'}">${ico(good ? 'check' : 'alert')}${good ? '优于平均' : '待校准'}</span></div></div>`;
}
