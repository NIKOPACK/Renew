/* ============ 导航 ============ */
const Nav = { stack: [], tab: 'today' };
const TAB_META = { today: ['home', '今日'], library: ['book', '课程'], notebook: ['notebook', '笔记'], review: ['calendar', '记录'], ai: ['spark', 'AI'] };
function renderTabbar() {
  const due = Math.min(dueItems().length, reviewLeft());
  $$('.tabbar button').forEach(b => {
    const [i, l] = TAB_META[b.dataset.tab];
    b.innerHTML = `${ico(i, '', b.dataset.tab === Nav.tab ? 'fill' : '')}<span>${l}</span>${b.dataset.tab === 'review' && due ? `<span class="badge">${due > 99 ? '99+' : due}</span>` : ''}`;
    b.dataset.tip = l;
    b.setAttribute('aria-label', l);
    b.dataset.tab === Nav.tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current');
  });
}
function go(view, params = {}, opt = {}) {
  const cur = Nav.stack[Nav.stack.length - 1]; if (cur) cur.y = scrollY;
  let keep = false;
  if (opt.tab) {
    if (Nav.stack.length === 1) TabY[Nav.tab] = scrollY;
    keep = view === 'today' && Nav.tab !== 'today' && Feed.params === Daily.pr && Daily.day === dayKey(); // 切回首页时回到刚才刷到的位置
    if (view === 'ai' && Nav.tab !== 'ai') Nav.prevTab = Nav.tab; Nav.fx = Nav.tab === view && view !== 'ai' ? 'fade' : 'tab'; if (Motion.dragX) Nav.fx = 'pop'; Nav.tab = view; Nav.stack = [{ view, params, y: keep ? TabY.today : 0 }];
  }
  else if (opt.replace && Nav.stack.length) { Nav.stack[Nav.stack.length - 1] = { view, params }; Nav.fx = 'fade'; }
  else { Nav.stack.push({ view, params }); Nav.fx = opt.fx || 'push'; }
  render(true, keep);
}
function back() { if (Nav.stack.length > 1) { Nav.stack.pop(); Nav.fx = 'pop'; render(true, true); } else go(Nav.tab, {}, { tab: true }); }
function openReview(kind, opt = {}) { go('session', { kind, ...opt }); }
function render(anim, restore) {
  const top = Nav.stack[Nav.stack.length - 1], v = $('#view');
  Feed.obs?.disconnect();
  if (typeof Speech !== 'undefined') Speech.stop();
  const prevImm = document.body.classList.contains('immersive'), newImm = top.view === 'session' || top.view === 'ai';
  const fx = anim ? navType(Nav.fx, prevImm, newImm) : null; Nav.fx = null;
  const ghost = anim && v.firstElementChild && !v.querySelector('.loading') ? navCapture(fx) : null;
  document.body.classList.toggle('immersive', newImm);
  document.body.classList.toggle('aiv', top.view === 'ai');
  const fn = { today: viewToday, library: viewLibrary, course: viewCourse, section: viewSection, review: viewReview, ai: viewAI, settings: viewSettings, session: viewSession, materials: viewMaterials, notebook: viewNotebook, cmats: viewCourseMats, material: viewMaterial, notes: viewNotes, note: viewNote, search: viewSearch }[top.view];
  fn(top.params || {});
  renderTabbar(); updatePill();
  if (anim) { v.classList.remove('enter', 'solo'); void v.offsetWidth; v.classList.add('enter'); if (!ghost && !['next', 'prev'].includes(fx)) v.classList.add('solo'); }
  scrollTo(0, restore ? top.y || 0 : 0);
  if (anim) { navPlay(fx, ghost); Motion.count(v); if (fx === 'tab') Motion.pop($('.tabbar [aria-current] .ic'), 1.18); }
}
const refresh = () => render(false, true);
/* 页面顶部不再有导航栏：左上角悬浮返回按钮，右上角悬浮操作按钮（参考 Claude App）；有标题时作为正文大标题 */
function appbar(title, right = '', back = '<button class="fbtn" data-back aria-label="返回">' + ico('back') + '</button>') {
  return `<div class="fbar"><div class="wrap">${back}<span class="grow"></span>${right ? `<div class="fpill">${right}</div>` : ''}</div></div><div class="fsp"></div>${title ? `<div class="wrap"><h1 class="ptitle">${esc(title)}</h1></div>` : ''}`;
}
