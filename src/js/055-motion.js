/* ============ 动效与手势 ============ */
const Motion = {
  E: 'cubic-bezier(.32,.72,0,1)', OUT: 'cubic-bezier(.2,.8,.2,1)', SPRING: 'cubic-bezier(.34,1.56,.64,1)',
  ghost: null, seq: 0, dragX: 0,
  ok() { return P().motion !== false && !matchMedia('(prefers-reduced-motion: reduce)').matches; },
  anim(el, kf, o = {}) { if (!el || !this.ok() || !el.animate) return null; try { return el.animate(kf, { duration: 300, easing: this.E, ...o }); } catch { return null; } },
  haptic(k) { if (P().haptic === false) return; try { Platform.haptic(k); } catch {} },
  pop(el, s = 1.06) { return this.anim(el, [{ transform: 'scale(1)' }, { transform: `scale(${s})` }, { transform: 'scale(1)' }], { duration: 380, easing: 'ease-out' }); },
  shake(el) { return this.anim(el, [0, -8, 7, -5, 4, -2, 0].map(x => ({ transform: `translateX(${x}px)` })), { duration: 420, easing: 'ease-out' }); },
  rise(els, o = {}) { [...els].filter(Boolean).forEach((el, i) => this.anim(el, [{ opacity: 0, transform: `translateY(${o.y ?? 10}px)` }, { opacity: 1, transform: 'none' }], { duration: o.d ?? 420, delay: (o.delay ?? 0) + i * (o.step ?? 45), easing: this.OUT, fill: 'backwards' })); },
  /* 展开 / 收起 高度动画 */
  expand(el, d = 340) { if (!el || !this.ok()) return; const h = el.offsetHeight, ov = el.style.overflow; el.style.overflow = 'hidden'; const a = this.anim(el, [{ height: '0px', opacity: 0 }, { height: h + 'px', opacity: 1 }], { duration: d }); if (a) a.onfinish = a.oncancel = () => el.style.overflow = ov; else el.style.overflow = ov; },
  collapse(el, done, d = 260) { if (!el || !this.ok()) return done(); el.style.overflow = 'hidden'; const a = this.anim(el, [{ height: el.offsetHeight + 'px', opacity: 1 }, { height: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px', marginTop: '0px' }], { duration: d }); if (a) a.onfinish = done; else done(); },
  /* 数字递增 */
  count(root) {
    if (!this.ok()) return;
    $$('[data-count]', root).forEach(el => {
      const tn = [...el.childNodes].find(n => n.nodeType === 3 && /\d/.test(n.nodeValue)); if (!tn) return;
      const to = parseInt(tn.nodeValue, 10); if (!(to > 0)) return;
      const t0 = performance.now(), dur = Math.min(900, 380 + to * 12), suf = tn.nodeValue.replace(/^\s*\d+/, '');
      const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); tn.nodeValue = Math.round(to * e) + suf; if (k < 1 && tn.isConnected) requestAnimationFrame(step); };
      tn.nodeValue = '0' + suf; requestAnimationFrame(step);
    });
  },
  /* 信息流卡片进入视口时浮现 */
  io: 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); Motion.io.unobserve(e.target); } }), { rootMargin: '0px 0px -4% 0px' }) : null,
  reveal(el) { if (!el || !this.io || !this.ok()) return el; el.classList.add('rv'); this.io.observe(el); return el; },
  /* 彩带 */
  confetti(n = 90) {
    if (!this.ok()) return;
    const cv = document.createElement('canvas'), dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    cv.className = 'confetti'; cv.width = W * dpr; cv.height = H * dpr; document.body.append(cv);
    const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    const cs = getComputedStyle(document.documentElement), cols = ['--accent', '--good', '--warn', '--bad'].map(v => cs.getPropertyValue(v).trim() || '#3461f0').concat(['#a259ff', '#ffb800']);
    const ps = Array.from({ length: n }, (_, i) => { const L = i % 2 === 0, a = (L ? -60 : -120) * Math.PI / 180 + (Math.random() - .5) * .9, v = 9 + Math.random() * 8; return { x: L ? -10 : W + 10, y: H * .72, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6, w: 5 + Math.random() * 5, h: 8 + Math.random() * 6, c: cols[i % cols.length], s: (Math.random() - .5) * .35 }; });
    const t0 = performance.now();
    const fr = t => {
      const k = (t - t0) / 1800; ctx.clearRect(0, 0, W, H);
      for (const p of ps) { p.vy += .32; p.vx *= .985; p.vy *= .985; p.x += p.vx; p.y += p.vy; p.r += p.s; ctx.save(); ctx.globalAlpha = Math.max(0, 1 - Math.max(0, k - .6) / .4); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2))); ctx.restore(); }
      if (k < 1) requestAnimationFrame(fr); else cv.remove();
    };
    requestAnimationFrame(fr); this.haptic('ok');
  }
};

/* ---- 页面切换：旧页面放进快照层，新旧页面一起做动画 ---- */
function navCapture(type) {
  const v = $('#view');
  if (Motion.ghost) { Motion.ghost.remove(); Motion.ghost = null; }
  if (!type || !Motion.ok() || !v.firstChild || ['next', 'prev'].includes(type)) return null;
  const sy = scrollY, g = document.createElement('div'), inner = document.createElement('div');
  g.className = 'navghost'; g.setAttribute('aria-hidden', 'true'); inner.className = 'navghost-in';
  while (v.firstChild) inner.append(v.firstChild);
  inner.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
  /* 快照层只做动画：旧页面的节点仍带着事件处理，必须让它失去焦点且不可交互，否则键盘输入会落到已离开的页面上 */
  if (inner.contains(document.activeElement)) document.activeElement.blur();
  g.inert = true;
  g.append(inner); document.body.append(g); g.scrollTop = sy;
  Motion.ghost = g; return g;
}
function navPlay(type, g) {
  const v = $('#view'), seq = ++Motion.seq, E = Motion.E;
  if (['next', 'prev'].includes(type)) {
    const s = type === 'next' ? 1 : -1;
    Motion.anim($('#feed'), [{ transform: `translateX(${36 * s}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: Motion.OUT });
    return;
  }
  if (!g) return;
  const fixed = [...v.children].filter(e => getComputedStyle(e).position === 'fixed');
  fixed.forEach(e => document.body.append(e));
  const dx = Motion.dragX; Motion.dragX = 0;
  const fromX = dx ? `translateX(${dx}px)` : 'translateX(0)';
  let gk, vk, dur = 440, gTop = false, ease = E;
  switch (type) {
    case 'push': gk = [{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(-26%)', opacity: .55 }]; vk = [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }]; break;
    case 'pop': gTop = true; gk = [{ transform: fromX }, { transform: 'translateX(100%)' }]; vk = [{ transform: 'translateX(-26%)', opacity: .55 }, { transform: 'translateX(0)', opacity: 1 }]; if (dx) dur = 320; break;
    case 'up': gk = [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.94)', opacity: .4 }]; vk = [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }]; dur = 480; break;
    case 'down': gTop = true; gk = [{ transform: 'translateY(0)' }, { transform: 'translateY(100%)' }]; vk = [{ transform: 'scale(.94)', opacity: .4 }, { transform: 'scale(1)', opacity: 1 }]; dur = 420; break;
    default: gTop = true; gk = [{ opacity: 1 }, { opacity: 0 }]; vk = [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }]; dur = 260; ease = Motion.OUT;
  }
  g.style.zIndex = gTop ? 6 : 4; v.classList.add('nav-anim'); v.style.zIndex = 5;
  if (type !== 'tab' && type !== 'fade') g.classList.add('shadow');
  const ga = g.animate(gk, { duration: type === 'tab' || type === 'fade' ? 160 : dur, easing: ease, fill: 'forwards' });
  const va = v.animate(vk, { duration: dur, easing: ease });
  fixed.forEach(e => Motion.anim(e, [{ opacity: 0, transform: type === 'up' ? 'translateY(40px)' : 'none' }, { opacity: 1, transform: 'none' }], { duration: dur, delay: type === 'up' ? 120 : 0, easing: E, fill: 'backwards' }));
  const done = () => {
    if (Motion.ghost === g) { g.remove(); Motion.ghost = null; } else g.remove();
    if (seq !== Motion.seq) { fixed.forEach(e => e.remove()); return; }
    v.classList.remove('nav-anim'); v.style.zIndex = '';
    fixed.forEach(e => { if (!e.id || !$('#view #' + CSS.escape(e.id))) v.append(e); else e.remove(); });
  };
  va.onfinish = va.oncancel = done;
}
function navType(fx, prevImm, newImm) {
  if (Motion.dragX) return 'pop';
  if (newImm && !prevImm && fx !== 'next' && fx !== 'prev') return 'up';
  if (prevImm && !newImm) return 'down';
  return fx || 'tab';
}

/* ---- 左边缘右滑返回 ---- */
(() => {
  let sx = 0, sy = 0, dx = 0, st = null, t0 = 0;
  const backBtn = () => $('#view [data-back]') || $('#view [data-close-s]') || $('#ch-back');
  addEventListener('touchstart', e => {
    st = null; if (e.touches.length !== 1 || !Motion.ok() || $('.sheet-wrap') || Detail.cur) return;
    const t = e.touches[0]; if (t.clientX > 28 || !backBtn()) return;
    sx = t.clientX; sy = t.clientY; dx = 0; st = 'maybe'; t0 = Date.now(); addEventListener('touchmove', move, { passive: false });
  }, { passive: true });
  const move = e => {
    if (!st) return; const t = e.touches[0], ddx = t.clientX - sx, ddy = t.clientY - sy;
    if (st === 'maybe') { if (Math.abs(ddy) > 10 && Math.abs(ddy) > ddx) { st = null; return; } if (ddx < 12) return; st = 'drag'; $('#view').classList.add('swiping'); }
    dx = Math.max(0, ddx); $('#view').style.transform = `translateX(${dx}px)`;
    if (e.cancelable) e.preventDefault();
  };
  const end = () => {
    removeEventListener('touchmove', move, { passive: false });
    if (st !== 'drag') { st = null; return; } st = null;
    const v = $('#view'), vel = dx / Math.max(1, Date.now() - t0);
    if (dx > innerWidth * .32 || (vel > .45 && dx > 40)) { v.style.transform = ''; v.classList.remove('swiping'); Motion.dragX = dx; Motion.haptic(); backBtn()?.click(); Motion.dragX = 0; }
    else { const a = v.animate([{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }], { duration: 260, easing: Motion.E }); v.style.transform = ''; a.onfinish = a.oncancel = () => v.classList.remove('swiping'); }
  };
  addEventListener('touchend', end); addEventListener('touchcancel', end);
})();

/* ---- 弹层：下拉关闭 ---- */
function sheetDrag(api) {
  const w = api.el, sh = $('.sheet', w), bg = $('.sheet-bg', w), body = $('.sheet-b', w);
  let y0 = 0, dy = 0, st = null, t0 = 0;
  sh.addEventListener('touchstart', e => {
    st = null; if (e.touches.length !== 1 || api.closing) return;
    const head = e.target.closest('.grab,.sheet-h'); if (!head && (body.scrollTop > 0 || e.target.closest('input,textarea,select,.tbl,pre,.thumbs'))) return;
    y0 = e.touches[0].clientY; dy = 0; st = 'maybe'; t0 = Date.now();
  }, { passive: true });
  sh.addEventListener('touchmove', e => {
    if (!st) return; const d = e.touches[0].clientY - y0;
    if (st === 'maybe') { if (d < -4) { st = null; return; } if (d < 8) return; st = 'drag'; }
    dy = Math.max(0, d); sh.style.transform = `translateY(${dy}px)`; bg.style.opacity = Math.max(.2, 1 - dy / (sh.offsetHeight || 600));
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  const end = () => {
    if (st !== 'drag') { st = null; return; } st = null;
    const vel = dy / Math.max(1, Date.now() - t0);
    if (dy > Math.min(160, sh.offsetHeight * .3) || (vel > .5 && dy > 30)) { Motion.haptic(); api.close(); }
    else { Motion.anim(sh, [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: 300 }); sh.style.transform = ''; bg.style.opacity = ''; }
  };
  sh.addEventListener('touchend', end); sh.addEventListener('touchcancel', end);
}

/* ---- 分段控件：选中块滑动 ---- */
document.addEventListener('click', e => {
  const b = e.target.closest('.seg button'); if (!b || !Motion.ok()) return;
  const seg = b.parentElement, btns = [...seg.querySelectorAll(':scope > button')], from = btns.findIndex(x => x.getAttribute('aria-pressed') === 'true');
  if (from < 0 || btns[from] === b) return;
  const r0 = seg.getBoundingClientRect(), fr = btns[from].getBoundingClientRect(), n = btns.length;
  requestAnimationFrame(() => {
    const s2 = seg.isConnected ? seg : $$('.seg').find(x => { const r = x.getBoundingClientRect(); return x.children.length === n && Math.abs(r.left - r0.left) < 2 && Math.abs(r.width - r0.width) < 2; });
    if (!s2) return; const nb = [...s2.querySelectorAll(':scope > button')].find(x => x.getAttribute('aria-pressed') === 'true'); if (!nb) return;
    const sr = s2.getBoundingClientRect(), nr = nb.getBoundingClientRect(); if (Math.abs(nr.left - (fr.left - r0.left + sr.left)) < 1) return;
    const th = document.createElement('i'); th.className = 'segthumb';
    th.style.cssText = `left:${nr.left - sr.left}px;top:${nr.top - sr.top}px;width:${nr.width}px;height:${nr.height}px`;
    s2.append(th); nb.classList.add('sliding');
    const a = th.animate([{ transform: `translateX(${fr.left - r0.left - (nr.left - sr.left)}px)`, width: fr.width + 'px' }, { transform: 'translateX(0)', width: nr.width + 'px' }], { duration: 340, easing: Motion.E });
    a.onfinish = a.oncancel = () => { th.remove(); nb.classList.remove('sliding'); };
  });
}, true);

/* ---- 开关：重绘后补上滑动 ---- */
document.addEventListener('click', e => {
  const t = e.target.closest('.toggle'); if (!t || !t.id || !Motion.ok()) return;
  const was = t.getAttribute('aria-checked') === 'true', id = t.id;
  requestAnimationFrame(() => {
    const n = document.getElementById(id); if (!n) return; const on = n.getAttribute('aria-checked') === 'true'; if (on === was) return;
    const bg0 = getComputedStyle(n).backgroundColor;
    try { n.animate([{ transform: `translateX(${was ? 20 : 0}px)` }, { transform: `translateX(${on ? 20 : 0}px)` }], { duration: 340, easing: Motion.SPRING, pseudoElement: '::after' }); } catch {}
    if (n !== t) { try { n.animate([{ backgroundColor: on ? getComputedStyle(document.documentElement).getPropertyValue('--fill') : getComputedStyle(document.documentElement).getPropertyValue('--good') }, { backgroundColor: bg0 }], { duration: 240 }); } catch {} }
    Motion.haptic();
  });
}, true);

/* ---- 折叠块（AI 工具记录）---- */
document.addEventListener('click', e => {
  const sm = e.target.closest('details.tg > summary'); if (!sm || !Motion.ok()) return;
  const d = sm.parentElement, body = $('.tgl', d); if (!body) return; e.preventDefault();
  if (d.open) Motion.collapse(body, () => { d.open = false; body.style.overflow = ''; }, 220);
  else { d.open = true; Motion.expand(body, 300); }
});
