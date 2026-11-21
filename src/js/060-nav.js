/* ============ 导航 ============ */
const Nav = { stack: [], tab: 'today' };
const TAB_META = { today: ['home', '今日'], library: ['book', '课程'], review: ['review', '复习'], materials: ['folder', '资料'], ai: ['spark', 'AI'] };
function renderTabbar() {
  const due = Math.min(dueItems().length, reviewLeft());
  $$('.tabbar button').forEach(b => {
    const [i, l] = TAB_META[b.dataset.tab];
    b.innerHTML = `${ico(i, '', b.dataset.tab === Nav.tab ? 'fill' : '')}<span>${l}</span>${b.dataset.tab === 'review' && due ? `<span class="badge">${due > 99 ? '99+' : due}</span>` : ''}`;
    b.dataset.tab === Nav.tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current');
  });
}
function go(view, params = {}, opt = {}) {
  const cur = Nav.stack[Nav.stack.length - 1]; if (cur) cur.y = scrollY;
  if (opt.tab) { if (view === 'ai' && Nav.tab !== 'ai') Nav.prevTab = Nav.tab; Nav.fx = Nav.tab === view && view !== 'ai' ? 'fade' : 'tab'; if (Motion.dragX) Nav.fx = 'pop'; Nav.tab = view; Nav.stack = [{ view, params }]; }
  else if (opt.replace && Nav.stack.length) { Nav.stack[Nav.stack.length - 1] = { view, params }; Nav.fx = 'fade'; }
  else { Nav.stack.push({ view, params }); Nav.fx = opt.fx || 'push'; }
  render(true);
}
function back() { if (Nav.stack.length > 1) { Nav.stack.pop(); Nav.fx = 'pop'; render(true, true); } else go(Nav.tab, {}, { tab: true }); }
function render(anim, restore) {
  const top = Nav.stack[Nav.stack.length - 1], v = $('#view');
  Feed.obs?.disconnect();
  const prevImm = document.body.classList.contains('immersive'), newImm = top.view === 'session' || top.view === 'ai';
  const fx = anim ? navType(Nav.fx, prevImm, newImm) : null; Nav.fx = null;
  const ghost = anim && v.firstElementChild && !v.querySelector('.loading') ? navCapture(fx) : null;
  document.body.classList.toggle('immersive', newImm);
  document.body.classList.toggle('aiv', top.view === 'ai');
  const fn = { today: viewToday, library: viewLibrary, course: viewCourse, section: viewSection, review: viewReview, ai: viewAI, settings: viewSettings, session: viewSession, materials: viewMaterials, cmats: viewCourseMats, material: viewMaterial, notes: viewNotes, search: viewSearch }[top.view];
  fn(top.params || {});
  renderTabbar(); updatePill();
  if (anim) { v.classList.remove('enter', 'solo'); void v.offsetWidth; v.classList.add('enter'); if (!ghost && !['next', 'prev'].includes(fx)) v.classList.add('solo'); }
  scrollTo(0, restore ? top.y || 0 : 0);
  if (anim) { navPlay(fx, ghost); Motion.count(v); if (fx === 'tab') Motion.pop($('.tabbar [aria-current] .ic'), 1.18); }
}
const refresh = () => render(false, true);
function appbar(title, right = '') {
  return `<div class="appbar"><div class="wrap"><button class="ibtn" data-back aria-label="返回">${ico('back')}</button><div class="ttl">${esc(title)}</div>${right || '<span style="width:40px"></span>'}</div></div>`;
}
addEventListener('scroll', () => { const a = $('.appbar'); if (a) a.classList.toggle('scrolled', scrollY > 4); }, { passive: true });
