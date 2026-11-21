/* ============ 弹层 ============ */
function sheet(title, body) {
  const w = h(`<div class="sheet-wrap"><div class="sheet-bg"></div><section class="sheet" role="dialog" aria-modal="true"><div class="grab"></div><header class="sheet-h"><h2></h2><button class="ibtn" data-close aria-label="关闭">${ico('close')}</button></header><div class="sheet-b"></div></section></div>`);
  $('h2', w).textContent = title;
  const b = $('.sheet-b', w); if (typeof body === 'string') b.innerHTML = body; else if (body) b.append(body);
  const api = { el: w, body: b, onclose: null, closing: false, close() {
    if (api.closing) return; api.closing = true; w.style.pointerEvents = 'none';
    const sh = $('.sheet', w), from = sh.style.transform || 'translateY(0)';
    const a = Motion.anim(sh, [{ transform: from }, { transform: 'translateY(100%)' }], { duration: 280, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
    Motion.anim($('.sheet-bg', w), [{ opacity: getComputedStyle($('.sheet-bg', w)).opacity }, { opacity: 0 }], { duration: 280, fill: 'forwards' });
    if (a) a.onfinish = () => w.remove(); else w.remove();
    api.onclose?.();
  } };
  $('.sheet-bg', w).onclick = () => api.close(); $('[data-close]', w).onclick = () => api.close();
  document.body.append(w); sheetDrag(api); return api;
}
function confirmBox(title, msg, ok = '确定', danger = false) {
  return new Promise(res => {
    const s = sheet(title, `<p style="margin:0;color:var(--ink-2);line-height:1.65">${esc(msg)}</p><div class="acts"><button class="btn" data-v="0">取消</button><button class="btn ${danger ? 'danger' : 'pri'}" data-v="1">${esc(ok)}</button></div>`);
    let done = false; s.onclose = () => { if (!done) res(false); };
    $$('[data-v]', s.body).forEach(b => b.onclick = () => { done = true; s.close(); res(b.dataset.v === '1'); });
  });
}
function menuSheet(title, items) {
  const s = sheet(title, `<div class="menu">${items.filter(Boolean).map((m, i) => `<button data-i="${i}" class="${m.cls || ''}">${m.icon ? ico(m.icon) : ''}<span class="grow">${esc(m.label)}${m.sub ? `<small>${esc(m.sub)}</small>` : ''}</span></button>`).join('')}</div>`);
  const list = items.filter(Boolean);
  $$('[data-i]', s.body).forEach(b => b.onclick = () => { s.close(); list[+b.dataset.i].run(); });
  return s;
}
function copyText(text, msg) {
  const fallback = () => { const s = sheet('复制下面的内容', `<textarea class="inp" style="min-height:260px" readonly></textarea><p class="small" style="margin:0">长按全选后复制。</p>`); const ta = $('textarea', s.body); ta.value = text; ta.focus(); ta.select(); };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => toast(msg || '已复制'), fallback); else fallback();
}
