/* ============ 详解页：从右侧滑入的独立页面，整屏宽度阅读 ============ */
/* 打开：点卡片上的「详解」，或在卡片上向左滑（页面跟手滑入）。
   关闭：向右滑（页面跟手滑出）、左上角返回、Esc、安卓返回键。 */
const Detail = {
  cur: null,
  html(p, k) {
    const it = p.it, sec = SECS.get(it.sec), c = COURSES.get(it.course);
    const spk = typeof Speech !== 'undefined' && Speech.ok ? `<button class="ibtn" data-d="speak" aria-label="朗读">${ico('speaker')}</button>` : '';
    return `<div class="dtl" role="dialog" aria-label="${k === 'd' ? '详解' : '详细解答'}">
      <div class="dtl-bar"><button class="fbtn" data-d="back" aria-label="返回">${ico('back')}</button><span class="grow"></span><div class="fpill">${spk}<button class="ibtn" data-d="ask" aria-label="问 AI">${ico('spark')}</button></div></div>
      <div class="dtl-sc" tabindex="-1"><div class="dtl-in">
        <div class="dtl-k"><i class="cdot" style="--c:${c.color}"></i><span>${esc(sec.title)}</span></div>
        <h2 class="pt">${esc(it.title || plain(it.q).slice(0, 40) || TYPE_LABEL[it.t])}</h2>
        <div class="md dtl-md">${md(it[k])}</div>
      </div></div>
    </div>`;
  },
  /* 先建好页面（放在屏幕右侧外），手势与点按共用 */
  mount(p, k) {
    Detail.cur?.(true);
    const w = h(Detail.html(p, k)); w.style.transform = 'translateX(100%)'; document.body.append(w); document.body.classList.add('dtl-on');
    let done = false;
    const close = instant => {
      if (done) return; done = true; Detail.cur = null; removeEventListener('keydown', key);
      if (typeof Speech !== 'undefined' && Speech.cur?.startsWith('detail:')) Speech.stop(true);
      const fin = () => { w.remove(); if (!$('.dtl')) document.body.classList.remove('dtl-on'); };
      if (instant || !Motion.ok()) return fin();
      const a = w.animate([{ transform: getComputedStyle(w).transform === 'none' ? 'translateX(0)' : getComputedStyle(w).transform }, { transform: 'translateX(100%)' }], { duration: 240, easing: Motion.E, fill: 'forwards' });
      a.onfinish = a.oncancel = fin;
    };
    const key = e => { if (e.key === 'Escape' && !VizView.cur && !$('.sheet-wrap')) { e.preventDefault(); close(); } };
    addEventListener('keydown', key);
    $('.dtl-bar', w).onclick = e => { const d = e.target.closest('[data-d]')?.dataset.d; if (d === 'back') close(); else if (d === 'ask') askAI(p.it, p); else if (d === 'speak') Speech?.toggleDetail?.(p.it, k); };
    Detail.swipeBack(w, close);
    Detail.cur = close; Detail.el = w;
    return w;
  },
  /* 从当前位置滑到位 */
  settle(w, from) {
    w.style.transform = '';
    if (Motion.ok()) w.animate([{ transform: `translateX(${from}px)` }, { transform: 'translateX(0)' }], { duration: Math.max(160, Math.min(320, from / innerWidth * 360)), easing: Motion.E });
    $('.dtl-sc', w).focus?.({ preventScroll: true });
  },
  open(p, k) { const w = Detail.mount(p, k); Motion.haptic(); Detail.settle(w, innerWidth); },
  /* 详解页内向右滑关闭：从任何位置起手都行，横向可滚动的表格、公式、代码除外 */
  swipeBack(w, close) {
    let sx = 0, sy = 0, dx = 0, st = null, t0 = 0;
    w.addEventListener('touchstart', e => {
      st = null; if (e.touches.length !== 1 || hScrollable(e.target, w) || VizView.cur) return;
      const t = e.touches[0]; sx = t.clientX; sy = t.clientY; dx = 0; st = 'maybe'; t0 = Date.now();
    }, { passive: true });
    w.addEventListener('touchmove', e => {
      if (!st) return; const t = e.touches[0], ddx = t.clientX - sx, ddy = t.clientY - sy;
      if (st === 'maybe') { if (Math.abs(ddy) > 10 && Math.abs(ddy) > Math.abs(ddx)) { st = null; return; } if (ddx < 12 || Math.abs(ddx) < Math.abs(ddy) * 1.3) return; st = 'drag'; }
      dx = Math.max(0, ddx); w.style.transform = `translateX(${dx}px)`; if (e.cancelable) e.preventDefault();
    }, { passive: false });
    const end = () => {
      if (st !== 'drag') { st = null; return; } st = null;
      const vel = dx / Math.max(1, Date.now() - t0);
      if (dx > innerWidth * .3 || (vel > .45 && dx > 40)) { Motion.haptic(); close(); } else Detail.settle(w, dx);
    };
    w.addEventListener('touchend', end); w.addEventListener('touchcancel', end);
  },
};
/* 起手点是否落在可横向滚动的元素里（表格、长公式、代码块），这些地方让给原生横向滚动 */
function hScrollable(t, stop) {
  for (let e = t; e && e !== stop && e !== document.body; e = e.parentElement) {
    if (e.scrollWidth > e.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(e).overflowX)) return true;
  }
  return false;
}
/* 卡片上的详解入口：只在有内容时出现（知识点直接可看；题目在作答后才出现） */
function detailRow(p, k) {
  const v = p.it[k]; if (!v) return '';
  return `<button class="drow" data-act="detail" data-k="${k}">${ico('bulb', '', 'fill')}<span class="pl">${k === 'd' ? '详解' : '详细解答'}</span><span class="pv">${esc(plain(v).slice(0, 40))}</span>${ico('chev', 'chev')}</button>`;
}
/* 信息流里向左滑卡片 → 详解页跟手从右侧滑入 */
(() => {
  let sx = 0, sy = 0, dx = 0, st = null, t0 = 0, p = null, k = null, w = null, post = null;
  addEventListener('touchstart', e => {
    st = null; if (e.touches.length !== 1 || Detail.cur || VizView.cur || $('.sheet-wrap') || !Motion.ok()) return;
    post = e.target.closest?.('#feed [data-pk]'); if (!post || hScrollable(e.target, post)) return;
    const row = $('[data-act="detail"]', post); if (!row) return;
    p = Feed.posts.get(post.dataset.pk); k = row.dataset.k; if (!p) return;
    const t = e.touches[0]; if (t.clientX < 28) return; // 左边缘留给返回手势
    sx = t.clientX; sy = t.clientY; dx = 0; st = 'maybe'; t0 = Date.now();
  }, { passive: true });
  addEventListener('touchmove', e => {
    if (!st) return; const t = e.touches[0], ddx = t.clientX - sx, ddy = t.clientY - sy;
    if (st === 'maybe') {
      if (Math.abs(ddy) > 10 && Math.abs(ddy) > Math.abs(ddx)) { st = null; return; }
      if (ddx > -12 || Math.abs(ddx) < Math.abs(ddy) * 1.3) return;
      st = 'drag'; w = Detail.mount(p, k); post.style.transition = 'none';
    }
    dx = Math.min(0, ddx); w.style.transform = `translateX(${innerWidth + dx}px)`; post.style.transform = `translateX(${dx * .25}px)`;
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  const end = () => {
    if (st !== 'drag') { st = null; return; } st = null;
    const vel = -dx / Math.max(1, Date.now() - t0), el = post;
    if (Motion.ok()) { const a = el.animate([{ transform: el.style.transform }, { transform: 'translateX(0)' }], { duration: 260, easing: Motion.E }); a.onfinish = a.oncancel = () => { el.style.transition = ''; }; }
    el.style.transform = '';
    if (-dx > innerWidth * .22 || (vel > .4 && -dx > 36)) { Motion.haptic(); Detail.settle(w, innerWidth + dx); }
    else Detail.cur?.();
    w = null;
  };
  addEventListener('touchend', end); addEventListener('touchcancel', end);
})();
