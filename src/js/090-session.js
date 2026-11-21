/* ============ 学习会话（信息流） ============ */
const Feed = { queue: [], posts: new Map(), rendered: 0, seq: 0, obs: null, params: null, results: new Map() };
function buildQueue(pr) {
  if (pr.kind === 'section') {
    const sec = SECS.get(pr.sid);
    if (pr.only) return [ITEMS.get(pr.only)].filter(Boolean);
    const list = pr.step === 'learn' ? learnItems(sec) : pr.step === 'practice' ? practiceItems(sec) : [];
    const fresh = list.filter(it => !getSt(it)); return fresh.length ? fresh : list;
  }
  const f = it => !pr.course || it.course === pr.course;
  if (pr.kind === 'review') return dueItems().filter(f).slice(0, pr.course ? 1e9 : reviewLeft());
  if (pr.kind === 'wrong') return wrongItems().filter(f);
  if (pr.kind === 'star') return starItems().filter(f);
  if (pr.kind === 'section-review') return secItems(SECS.get(pr.sid)).filter(getSt);
  if (pr.kind === 'items') return (pr.ids || []).map(id => ITEMS.get(id)).filter(Boolean);
  return [];
}
function viewSession(pr) {
  if (pr.kind === 'section' && !SECS.get(pr.sid)) return back();
  const v = $('#view');
  if (pr.kind === 'section' && pr.step !== 'summary') { const sec = SECS.get(pr.sid); if (pr.step === 'learn' && !learnItems(sec).length) pr.step = 'practice'; if (pr.step === 'practice' && !practiceItems(sec).length && !pr.only) pr.step = 'summary'; }
  const same = Feed.params === pr;
  if (!same) {
    Feed.params = pr; Feed.queue = pr.step === 'summary' ? [] : buildQueue(pr); Feed.posts.clear(); Feed.rendered = 0;
    const rk = pr.kind + ':' + (pr.sid || '');
    if (Feed.resKey !== rk || pr.step === 'learn') { Feed.results = new Map(); Feed.resKey = rk; }
  }
  v.innerHTML = sessionBar(pr) + `<div class="wrap"><div class="feed" id="feed"></div><div class="sentinel"></div></div>`;
  $('[data-close-s]', v).onclick = back;
  $('[data-typo]', v).onclick = typoSheet;
  if (same && pr.step !== 'summary') for (const p of Feed.posts.values()) { const el = h(`<article class="post" data-pk="${p.pk}"></article>`); el.innerHTML = postHTML(p); $('#feed', v).append(el); }
  $$('[data-step]', v).forEach(b => b.onclick = () => { if (b.dataset.step === pr.step) return; const np = { ...pr, step: b.dataset.step }; delete np.only; Nav.fx = stepDir(pr.step, np.step); Nav.stack[Nav.stack.length - 1].params = np; render(true); });
  const feed = $('#feed');
  if (pr.step === 'summary') { feed.append(summaryCard(pr)); return; }
  for (; Feed.rendered < Math.min(Feed.queue.length, 5); Feed.rendered++) feed.append(makePost(Feed.queue[Feed.rendered]));
  if (Feed.rendered >= Feed.queue.length) feed.append(endCard(pr));
  Feed.obs = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) moreFeed(); }, { rootMargin: '900px' });
  Feed.obs.observe($('.sentinel', v));
  feed.addEventListener('click', onFeedClick);
}
const stepDir = (a, b) => ['learn', 'practice', 'summary'].indexOf(b) >= ['learn', 'practice', 'summary'].indexOf(a) ? 'next' : 'prev';
function updateSessionBar() {
  const done = [...Feed.posts.values()].filter(p => p.g != null).length, tot = Math.max(1, Feed.queue.length);
  const sc = $('#sc'), sp = $('#sp'), txt = `${done}/${Feed.queue.length}`; if (sc && sc.textContent !== txt) { sc.textContent = txt; Motion.pop(sc, 1.2); } if (sp) sp.style.width = done / tot * 100 + '%';
}
function moreFeed() {
  const feed = $('#feed'); if (!feed || Feed.params?.step === 'summary') return;
  const end = Math.min(Feed.queue.length, Feed.rendered + 5);
  for (; Feed.rendered < end; Feed.rendered++) { $('.endc', feed)?.remove(); feed.append(makePost(Feed.queue[Feed.rendered])); }
  if (Feed.rendered >= Feed.queue.length && !$('.endc', feed)) feed.append(endCard(Feed.params));
}
function makePost(it) {
  const pk = 'p' + (++Feed.seq), st = getSt(it), pr = Feed.params;
  const review = !!st && pr.kind !== 'section' && pr.kind !== 'star';
  const p = { pk, it, review, phase: 'front', picks: new Set(), pick: null, rev: new Set(), step: 0, g: null, snap: undefined, requeued: false, auto: null, open: false, sol: false };
  if (it.t === 'kp' && !review) p.phase = 'back';
  Feed.posts.set(pk, p);
  const el = h(`<article class="post" data-pk="${pk}"></article>`); el.innerHTML = postHTML(p); return Motion.reveal(el);
}
const rerender = (p, fx, arg) => { const el = $(`[data-pk="${p.pk}"]`); if (!el) return; el.innerHTML = postHTML(p); if (fx) postFx(el, p, fx, arg); };
function postFx(el, p, fx, arg) {
  if (fx === 'ans') {
    const ok = p.auto; Motion.haptic(ok ? 'ok' : 'bad');
    if (ok) Motion.pop($('.opt.ok', el) || $('.verdict', el), 1.035); else { Motion.shake($('.opt.no', el)); Motion.pop($('.opt.ok', el), 1.025); }
    Motion.rise([$('.verdict', el), ...$$('.panel', el), $('.pf', el)], { delay: 120, step: 70 });
  } else if (fx === 'rate') { Motion.haptic(); Motion.pop($('.rate.on', el), 1.07); Motion.rise([$('.rated', el)], { y: -4, d: 300 }); }
  else if (fx === 'reveal') Motion.rise([$('.keypts', el), ...$$('.panel', el), ...$$('.cz.on .cza', el), $('.pf', el)], { step: 60 });
  else if (fx === 'step') { const ss = $$('.steps2 .s', el); Motion.rise([ss[ss.length - 1], $('.concl', el), $('.pf', el)], { step: 60 }); }
  else if (fx === 'cz') Motion.anim($(`.cz[data-i="${arg}"] .cza`, el), [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 380, easing: Motion.SPRING });
  else if (fx === 'pick') Motion.pop($(`.opt[data-i="${arg}"] .k`, el), 1.25);
  else if (fx === 'open') { const pan = $(`[data-k="${arg}"]`, el)?.closest('.panel'); if (pan) { Motion.expand($('.pb', pan)); Motion.anim($('.chev', pan), [{ transform: 'rotate(90deg)' }, { transform: 'rotate(-90deg)' }], { duration: 320 }); } }
}
function togPanel(p, k) {
  const el = $(`[data-pk="${p.pk}"]`), pan = el && $(`[data-k="${k}"]`, el)?.closest('.panel');
  if (!p[k]) { p[k] = true; rerender(p, 'open', k); return; }
  if (!pan || !Motion.ok() || p._closing) { p[k] = false; rerender(p); return; }
  p._closing = true; pan.classList.remove('open');
  Motion.collapse($('.pb', pan), () => { p._closing = false; p[k] = false; rerender(p); });
}
let lastAct = Date.now();
function rate(p, g, manual) {
  const it = p.it, now = Date.now(), first = p.g == null;
  if (first) p.snap = clone(getSt(it));
  setSt(it, schedule(p.snap, g, now));
  if (first) {
    const t = todayStats(); if (!p.snap) { t.n++; t.c[it.course] = (t.c[it.course] || 0) + 1; } else t.r++;
    const ok = p.auto != null ? p.auto : g >= 2; if (isQ(it) || p.auto != null) ok ? t.ok++ : t.bad++;
    t.sec += Math.min(180, Math.round((now - lastAct) / 1000)); lastAct = now;
    const hs = ((S().hist ||= {})[dayKey()] ||= {})[it.sec] ||= [0, 0, 0, 0]; // 当天该小节：新学、复习、答对、答错
    hs[p.snap ? 1 : 0]++; if (isQ(it) || p.auto != null) hs[ok ? 2 : 3]++;
  }
  Feed.results.set(it.id, { g, ok: p.auto != null ? p.auto : g >= 3, q: isQ(it) });
  p.g = g; p.phase = 'back';
  if (g === 1 && !p.requeued && Feed.params.kind !== 'star') {
    p.requeued = true; Feed.queue.splice(Math.min(Feed.queue.length, Feed.rendered + 3), 0, it);
    if (Feed.rendered < Feed.queue.length) { $('.endc')?.remove(); if (Feed.queue.length - Feed.rendered <= 1) moreFeed(); }
  }
  saveSrs(it.course); saveState(); rerender(p, p.auto != null && first ? 'ans' : 'rate'); updateSessionBar();
  if (manual && P().autoNext !== false) advance(p);
}
function onFeedClick(e) {
  const t = e.target.closest('[data-act],[data-step-go],[data-home]'); if (!t) return;
  if (t.hasAttribute('data-home')) return go('today', {}, { tab: true });
  if (t.dataset.stepGo) { const np = { ...Feed.params, step: t.dataset.stepGo }; delete np.only; Nav.fx = stepDir(Feed.params.step, np.step); Nav.stack[Nav.stack.length - 1].params = np; render(true); return; }
  const act = t.dataset.act;
  if (act === 'gen-q') return genSheet({ sid: Feed.params.sid, kpN: 0, qN: 5 });
  const el = t.closest('[data-pk]'); if (!el) return; const p = Feed.posts.get(el.dataset.pk); if (!p) return; const it = p.it;
  if (act === 'more') return itemMenu(p);
  if (act === 'tog') return togPanel(p, t.dataset.k);
  if (act === 'gen-d') return genDetail(p);
  if (act === 'reveal') { p.phase = 'back'; if (it.t === 'cloze') p.rev = new Set([...Array(60).keys()]); rerender(p, 'reveal'); return; }
  if (act === 'step') { p.step++; rerender(p, 'step'); return; }
  if (act === 'cz') { p.rev.add(+t.dataset.i); Motion.haptic(); rerender(p, 'cz', +t.dataset.i); return; }
  if (act === 'rate') return rate(p, +t.dataset.g, true);
  if (act === 'ask') return askAI(it, p);
  if (act === 'opt') {
    const i = +t.dataset.i;
    if (it.t === 'multi') { p.picks.has(i) ? p.picks.delete(i) : p.picks.add(i); Motion.haptic(); rerender(p, 'pick', i); return; }
    p.picks = new Set([i]); p.auto = i === it.a; p.phase = 'back'; return rate(p, p.auto ? 3 : 1);
  }
  if (act === 'submit') { p.auto = [...it.a].sort().join() === [...p.picks].sort().join(); p.phase = 'back'; return rate(p, p.auto ? 3 : 1); }
  if (act === 'tf') { p.pick = t.dataset.v === 'true'; p.auto = p.pick === it.a; p.phase = 'back'; return rate(p, p.auto ? 3 : 1); }
}
function removeItem(it) {
  if (it.builtin) { S().hidden[it.id] = 1; saveState(); return; }
  const path = 'sec/' + it.sec, doc = Store.get(path); if (doc) { doc.items = doc.items.filter(x => x.id !== it.id); Store.put(path, doc); }
  ITEMS.delete(it.id); const sec = SECS.get(it.sec); sec.items = sec.items.filter(x => x.id !== it.id); setSt(it, null); saveSrs(it.course);
}
function saveItems(sid, items) {
  const sec = SECS.get(sid), path = 'sec/' + sid, doc = Store.get(path) || { items: [] };
  for (const it of items) { const i = doc.items.findIndex(x => x.id === it.id); if (i >= 0) doc.items[i] = { ...doc.items[i], ...it }; else doc.items.push(it); addItem(it, sec, false); }
  Store.put(path, doc);
}
function patchItem(it, fields) { saveItems(it.sec, [{ id: it.id, ...(it.builtin ? { _p: 1 } : {}), ...fields }]); Object.assign(it, fields); }
