/* ============ AI 对话界面（v7：全屏，参考 ChatGPT / Claude App） ============ */
function msgHTML(m, i, last) {
  if (m.role === 'user') return userBubble({ content: m.text, att: m.att });
  const tools = (m.parts || []).filter(p => p.type === 'tool'), perms = (m.parts || []).filter(p => p.type === 'perm'), running = tools.find(p => p.st === 'run');
  const tg = tools.length ? `<details class="tg" ${running ? 'open' : ''}><summary>${running ? '<span class="spin"></span>' : ico('check')}<span class="grow">${running ? esc(running.label) : `已查看 ${tools.length} 项`}</span>${ico('down', 'chev')}</summary><div class="tgl">${tools.map(p => `<div class="tl ${p.st}"><span class="d"></span><span class="grow">${esc(p.label)}${p.res ? `<span class="res"> · ${esc(p.res)}</span>` : ''}</span></div>`).join('')}</div></details>` : '';
  const pm = perms.map(p => `<div class="perm ${p.st}"><div class="pt">${p.st === 'allowed' ? ico('check') : p.st === 'pending' ? ico('alert') : ico('x')}${esc(p.label)}</div><div class="pd">${esc(p.detail)}</div>${p.st === 'pending' ? `<div class="pa"><button class="btn sm" data-deny="${p.id}">拒绝</button><button class="btn sm pri" data-allow="${p.id}">允许</button></div>` : `<div class="ps">${p.st === 'allowed' ? '已执行' + (p.res ? ' · ' + esc(p.res) : '') : p.st === 'expired' ? '已过期' : '已拒绝'}</div>`}</div>`).join('');
  const waiting = m.streaming && !m.text && !perms.some(p => p.st === 'pending');
  const text = m.text ? `<div class="md">${md(m.text)}</div>${m.streaming ? '<span class="caret"></span>' : ''}` : waiting ? `<div class="typing"><i></i><i></i><i></i></div>` : '';
  const btns = m.buttons?.length ? `<div class="amb">${m.buttons.map((b, k) => `<button class="chip" data-mb="${i}:${k}">${ico(b.type === 'open_section' ? 'play' : b.type === 'generate' ? 'wand' : b.type === 'wrong_book' ? 'alert' : 'review')}${esc(b.label || { open_section: '打开小节', start_review: '开始复习', wrong_book: '错题本', generate: '生成内容' }[b.type])}</button>`).join('')}</div>` : '';
  const foot = !m.streaming && m.text ? `<div class="amf"><button data-copy="${i}" aria-label="复制">${ico('file')}</button>${last ? `<button data-regen aria-label="重新生成">${ico('sync')}</button>` : ''}</div>` : '';
  return `<div class="am">${tg}${pm}${text}${btns}${foot}</div>`;
}
const chatCtx = () => { const id = lsGet('chatctx'); return COURSES.has(id) ? id : null; };
function viewAI() {
  const v = $('#view'), c = Chat.get(), hr = new Date().getHours(), ctx = COURSES.get(c?.ctx ?? chatCtx());
  const hello = hr < 5 ? '夜深了' : hr < 11 ? '早上好' : hr < 14 ? '中午好' : hr < 18 ? '下午好' : '晚上好';
  const empty = !c || !c.msgs.length;
  v.innerHTML = `<div class="appbar aibar"><div class="wrap"><button class="ibtn" id="ch-back" aria-label="返回">${ico('back')}</button><button class="tbtn" id="ch-hist"><span>${c ? esc(c.title) : '温新 AI'}</span>${ico('down')}</button><button class="ibtn" id="ch-new" aria-label="新对话">${ico('edit')}</button></div></div>
  <div class="wrap"><div class="cm ${empty ? 'blank' : ''}" id="cm">${empty ? `<div class="hello2"><img class="hi hl" src="__BRAND_MARK__" alt=""><img class="hi hd" src="__BRAND_MARK_DARK__" alt="温新"><h2>${hello}</h2>${AI.ready && !AI.ok && Platform.aiConfigurable ? `<button class="btn pri" id="ch-setup">${ico('spark')}设置 AI 服务</button>` : ''}</div>` : ''}</div></div>
  <button class="tobottom" id="ch-down" hidden aria-label="回到底部">${ico('down')}</button>
  <div class="composer3" id="cmp"><div class="wrap">
    ${empty ? `<div class="chips sgs">${SUGGEST.map(([t], i) => `<button class="chip" data-sg="${i}">${t}</button>`).join('')}</div>` : ''}
    <div id="cmp-box"></div>
  </div></div>`;
  const cmp = Composer({ ids: ['ch-in', 'ch-send'], placeholder: AI.ok ? '和 AI 聊聊学习' : AI.ready ? Platform.aiNeedShort : '正在连接…',
    chips: `<button class="cctx" id="ch-ctx" aria-label="对话范围">${ico('book')}<span>${ctx ? esc(ctx.title) : '全部课程'}</span></button>`,
    extra: [
      { icon: 'plus', label: '新建课程', run: newCourseSheet },
      { icon: 'wand', label: '为小节生成内容', run: () => pickSection('选择小节', sid => genSheet({ sid })) },
      { icon: 'target', label: '薄弱点补强', run: weakSheet },
      { icon: 'folder', label: '导入资料到课程', run: () => go('materials') }
    ],
    busy: () => Chat.busy, onStop: () => Chat.ctl?.abort(), onSend: ({ text, att }) => aiSend(text, att) });
  $('#cmp-box').replaceWith(cmp.el);
  const inp = cmp.ta, sync = cmp.sync;
  $('#ch-back').onclick = () => go(Nav.prevTab && Nav.prevTab !== 'ai' ? Nav.prevTab : 'today', {}, { tab: true });
  $('#ch-setup')?.addEventListener('click', () => aiConfigSheet());
  $('#ch-new').onclick = () => { Chat.ctl?.abort(); Chat.cur = null; refresh(); setTimeout(() => $('#ch-in')?.focus(), 50); };
  $('#ch-hist').onclick = historySheet;
  $('#ch-ctx').onclick = () => menuSheet('对话范围', [{ icon: 'layers', label: '全部课程', cls: !ctx ? 'cur' : '', run: () => setCtx(null) }, ...shownCourses().map(x => ({ icon: 'book', label: x.title, cls: ctx?.id === x.id ? 'cur' : '', run: () => setCtx(x.id) }))]);
  $$('[data-sg]', v).forEach(b => b.onclick = () => { const q = SUGGEST[+b.dataset.sg][1]; if (b.dataset.sg === '0') cmp.set('我在书上已经学到了'); else aiSend(q); });
  $('#ch-down').onclick = () => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
  drawMsgs(true); sync(); kbFix();
  v._sync = sync;
}
function setCtx(id) { lsSet('chatctx', id); const c = Chat.get(); if (c) { c.ctx = id; Chat.save(); } refresh(); }
function drawMsgs(toBottom) {
  const box = $('#cm'); if (!box) return; const c = Chat.get();
  if (!c || !c.msgs.length) return;
  const near = innerHeight + scrollY > document.documentElement.scrollHeight - 200;
  const was = box.classList.contains('blank') ? 0 : +box.dataset.n || 0;
  box.classList.remove('blank');
  box.innerHTML = c.msgs.map((m, i) => msgHTML(m, i, i === c.msgs.length - 1)).join('');
  if (c.msgs.length > was && (was || Chat.busy)) { const ms = [...box.children].slice(was); ms.forEach((m, i) => Motion.anim(m, m.classList.contains('ug') ? [{ opacity: 0, transform: 'translateY(14px) scale(.96)' }, { opacity: 1, transform: 'none' }] : [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: i * 90, easing: Motion.OUT, fill: 'backwards' })); }
  box.dataset.n = c.msgs.length;
  $$('[data-allow]', box).forEach(b => b.onclick = () => Chat.resolvers.get(b.dataset.allow)?.(true));
  $$('[data-deny]', box).forEach(b => b.onclick = () => Chat.resolvers.get(b.dataset.deny)?.(false));
  $$('[data-copy]', box).forEach(b => b.onclick = () => copyText(c.msgs[+b.dataset.copy].text, '已复制'));
  $('[data-regen]', box)?.addEventListener('click', () => { const lastU = [...c.msgs].reverse().find(m => m.role === 'user'); if (!lastU || Chat.busy) return; c.msgs.splice(c.msgs.lastIndexOf(lastU)); aiSend(lastU.text, lastU._att || []); });
  $$('[data-mb]', box).forEach(b => b.onclick = () => { const [i, k] = b.dataset.mb.split(':').map(Number), bt = c.msgs[i].buttons[k];
    if (bt.type === 'open_section') go('section', { id: bt.sid }); else if (bt.type === 'generate') genSheet({ sid: bt.sid }); else if (bt.type === 'wrong_book') openReview('wrong'); else openReview('review', bt.cid ? { course: bt.cid } : {}); });
  if (toBottom || near) requestAnimationFrame(() => scrollTo(0, document.documentElement.scrollHeight));
}
function kbFix() {
  const cmp = $('#cmp'); if (!cmp || !window.visualViewport) return;
  const vv = visualViewport, off = Math.max(0, innerHeight - vv.height - vv.offsetTop); cmp.style.bottom = off + 'px';
}
window.visualViewport?.addEventListener('resize', kbFix); window.visualViewport?.addEventListener('scroll', kbFix);
const syncDown = () => { const b = $('#ch-down'); if (b) b.hidden = !!$('#cm.blank') || innerHeight + scrollY > document.documentElement.scrollHeight - 240; };
addEventListener('scroll', syncDown, { passive: true });
