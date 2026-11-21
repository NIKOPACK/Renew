/* ============ 启动 ============ */
async function boot() {
  await Platform.init();
  const aiP = AI.init(), fP = Files.ready = Files.init();
  await Store.init();
  if (!Store.docs['app/state']) Store.docs['app/state'] = defaultState();
  else { const d = defaultState(), m = Store.docs['app/state']; for (const k in d) if (m[k] == null) m[k] = d[k]; for (const k in d.plan) if (m.plan[k] == null) m.plan[k] = d.plan[k]; }
  Store.docs['app/prefs'] = { ...DEFAULT_PREFS, ...(Store.docs['app/prefs'] || {}) };
  applyPrefs();
  try { await loadContent(); }
  catch (e) { $('#view').innerHTML = `<div class="loading">课程数据加载失败（${esc(e.message || e)}），请检查网络后刷新。</div>`; return; }
  for (const c of COURSES.values()) coursePlan(c.id);
  loadMats();
  for (const j of jobs()) if (j.status === 'running') { j.status = 'paused'; j.steps.forEach(x => { if (x.st === 'run') x.st = 'wait'; }); saveJob(j); }
  fP.then(() => { if (Nav.stack[Nav.stack.length - 1]?.view === 'materials') refresh(); });
  if (Store.note) setTimeout(() => toast(Store.note), 800);
  $$('.tabbar button').forEach(b => b.onclick = () => { if (Nav.tab === b.dataset.tab && Nav.stack.length === 1) return scrollTo({ top: 0, behavior: 'smooth' }); go(b.dataset.tab, {}, { tab: true }); });
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-go],[data-tabgo],[data-review]'); if (!t || !$('#view').contains(t)) return;
    if (t.dataset.go) go(t.dataset.go); else if (t.dataset.tabgo) go(t.dataset.tabgo, {}, { tab: true }); else if (t.dataset.review) openReview(t.dataset.review);
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') { const sh = $$('.sheet-wrap').filter(x => x.style.pointerEvents !== 'none').pop(); if (sh) $('[data-close]', sh).click(); } });
  Nav.stack = [{ view: 'today' }]; render(true);
  Platform.started();
  aiP.then(() => { if (['ai'].includes(Nav.stack[Nav.stack.length - 1].view)) refresh(); });
}
boot();
