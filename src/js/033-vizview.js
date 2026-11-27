/* ============ 图示查看器：点开任意一张图，全屏自由缩放、拖动 ============ */
/* 缩放时直接改 SVG 的显示尺寸（而不是把位图放大），任何倍数下都清晰。
   手势：双指缩放、单指拖动、双击放大/还原；电脑上按住 Ctrl 滚轮或触控板捏合缩放，滚轮拖动。 */
const VizView = {
  open(fig) {
    const src = $('.vz-fr:not([hidden]) svg', fig) || $('svg', fig); if (!src) return;
    const vb = src.viewBox.baseVal, bw = vb.width || src.getBBox().width, bh = vb.height || src.getBBox().height;
    const w = h(`<div class="vzv" role="dialog" aria-label="查看图示">
      <div class="vzv-sc"><div class="vzv-in viz"></div></div>
      <div class="vzv-bar"><button class="ibtn" data-z="close" aria-label="关闭">${ico('close')}</button><span class="grow"></span>
        <button class="ibtn" data-z="out" aria-label="缩小">${ico('minus')}</button><button class="vzv-pct" data-z="fit" aria-label="适合屏幕">100%</button><button class="ibtn" data-z="in" aria-label="放大">${ico('plus')}</button></div>
    </div>`);
    const sc = $('.vzv-sc', w), inner = $('.vzv-in', w), svg = src.cloneNode(true), pct = $('.vzv-pct', w);
    svg.removeAttribute('style'); inner.append(svg); document.body.append(w); document.body.classList.add('vzv-on');
    const fit = () => Math.max(.1, Math.min((sc.clientWidth - 32) / bw, (sc.clientHeight - 32) / bh, 4));
    let s = 0;
    const set = (ns, fx = sc.clientWidth / 2, fy = sc.clientHeight / 2) => {
      if (!w.isConnected) return;
      ns = Math.max(fit() * .5, Math.min(ns, 12));
      const ox = sc.scrollLeft + fx - inner.offsetLeft, oy = sc.scrollTop + fy - inner.offsetTop, k = s ? ns / s : 1;
      s = ns; svg.setAttribute('width', r(bw * s)); svg.setAttribute('height', r(bh * s));
      inner.style.width = r(bw * s) + 'px'; inner.style.height = r(bh * s) + 'px';
      sc.scrollLeft = inner.offsetLeft + ox * k - fx; sc.scrollTop = inner.offsetTop + oy * k - fy;
      pct.textContent = Math.round(s / fit() * 100) + '%';
    };
    const r = n => Math.round(n * 10) / 10;
    const raf = requestAnimationFrame(() => set(fit()));
    const close = () => { cancelAnimationFrame(raf); w.remove(); document.body.classList.remove('vzv-on'); removeEventListener('keydown', key); VizView.cur = null; };
    const key = e => { if (e.key === 'Escape') close(); else if (e.key === '+' || e.key === '=') set(s * 1.25); else if (e.key === '-') set(s / 1.25); };
    addEventListener('keydown', key); VizView.cur = close;
    $('.vzv-bar', w).onclick = e => { const z = e.target.closest('[data-z]')?.dataset.z; if (z === 'close') close(); else if (z === 'in') set(s * 1.4); else if (z === 'out') set(s / 1.4); else if (z === 'fit') set(fit()); };
    // 触摸与鼠标：单指拖动，双指缩放（以两指中点为中心），双击切换
    const pts = new Map(); let pinch = null, drag = null, lastTap = 0;
    sc.addEventListener('pointerdown', e => {
      try { sc.setPointerCapture(e.pointerId); } catch {} pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s }; drag = null; }
      else if (pts.size === 1) {
        drag = { x: e.clientX, y: e.clientY, sl: sc.scrollLeft, st: sc.scrollTop, moved: false };
        const now = Date.now(); if (now - lastTap < 300) { const rc = sc.getBoundingClientRect(); set(s > fit() * 1.5 ? fit() : s * 2.5, e.clientX - rc.left, e.clientY - rc.top); lastTap = 0; } else lastTap = now;
      }
    });
    sc.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && pts.size === 2) { const [a, b] = [...pts.values()], rc = sc.getBoundingClientRect(); set(pinch.s * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, (a[0] + b[0]) / 2 - rc.left, (a[1] + b[1]) / 2 - rc.top); }
      else if (drag) { sc.scrollLeft = drag.sl - (e.clientX - drag.x); sc.scrollTop = drag.st - (e.clientY - drag.y); }
    });
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) drag = null; else if (pts.size === 1) { const [p] = pts.values(); drag = { x: p[0], y: p[1], sl: sc.scrollLeft, st: sc.scrollTop }; } };
    sc.addEventListener('pointerup', up); sc.addEventListener('pointercancel', up);
    sc.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); const rc = sc.getBoundingClientRect(); set(s * Math.exp(-e.deltaY / 200), e.clientX - rc.left, e.clientY - rc.top); }, { passive: false });
    addEventListener('resize', () => VizView.cur && set(s), { once: true });
  },
  cur: null
};
/* 图示交互：图内挖空（点击翻开）、分步演示（上/下一步）、点开放大查看 */
function setVizStep(fig, idx) {
  const frs = $$('.vz-fr', fig), n = frs.length; if (!n) return;
  const i = Math.max(0, Math.min(n - 1, idx));
  fig.dataset.vsi = String(i);
  frs.forEach((f, k) => f.hidden = k !== i);
  $$('.vz-dot', fig).forEach((d, k) => d.classList.toggle('on', k === i));
  const sn = $('.vz-sn', fig), st = $('.vz-st', fig), t = frs[i].dataset.ft || '';
  if (sn) sn.textContent = `${i + 1}/${n}`;
  if (st) { st.textContent = t; st.hidden = !t; }
  const prev = $('[data-vs="-1"]', fig), next = $('[data-vs="1"]', fig);
  if (prev) prev.disabled = i <= 0;
  if (next) next.disabled = i >= n - 1;
}
document.addEventListener('click', e => {
  const cz = e.target.closest('.vz-cz');
  if (cz) {
    if (cz.dataset.czCard) {
      const post = cz.closest('[data-pk]'), p = post && Feed.posts.get(post.dataset.pk);
      if (p) { p.rev.add(+cz.dataset.vcz); Motion.haptic(); rerender(p); return; }
    }
    cz.classList.toggle('on'); Motion.haptic(); return;
  }
  const all = e.target.closest('[data-vcz-all]');
  if (all) {
    const fig = all.closest('figure.viz'), list = $$('.vz-cz', fig);
    const show = list.some(x => !x.classList.contains('on'));
    list.forEach(x => x.classList.toggle('on', show));
    all.classList.toggle('on', show); Motion.haptic(); return;
  }
  const sb = e.target.closest('[data-vs],[data-vdot]');
  if (sb) {
    const fig = sb.closest('figure.viz');
    const cur = +(fig?.dataset.vsi || 0);
    const to = sb.dataset.vdot != null ? +sb.dataset.vdot : cur + (+sb.dataset.vs);
    setVizStep(fig, to); Motion.haptic(); return;
  }
  const f = e.target.closest('figure.viz');
  if (f && !e.target.closest('a,button,.vzv,.vz-cz,.vz-bar')) VizView.open(f);
});
