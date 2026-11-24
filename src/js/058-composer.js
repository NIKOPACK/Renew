/* ============ 对话输入框（参考 Claude App）：附件 + 模型 + 语音 + 发送 ============ */
/* 附件：拍照、图片、视频（均匀截取几帧画面给模型看）、文件（PDF / Word / 文本，提取文字）、链接（抓取网页正文）。
   消息里直接粘贴的网址、图片也会自动变成附件。所有 AI 对话（问 AI、帮我写、AI 助手）共用这一个组件。 */
const ATT_MAX = 10;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const URL_RE = /https?:\/\/[^\s<>"'，。；、）)]+/g;
const fmtDur = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const prettyModel = m => { const c = m.match(/^claude-([a-z]+)-(\d+)(?:-(\d+))?/); return c ? `${c[1][0].toUpperCase() + c[1].slice(1)} ${c[2]}${c[3] ? '.' + c[3] : ''}` : m; };
const modelLabel = () => { const m = AI.fn?.cfg?.model; return AI.fn ? (m ? prettyModel(m) : Platform.builtinAI || 'Claude') : '未设置模型'; };

/* ---- 附件读取 ---- */
async function thumbOf(src, max = 200) {
  try {
    const bmp = src instanceof Blob ? await createImageBitmap(src) : src, w = bmp.videoWidth || bmp.width, hh = bmp.videoHeight || bmp.height, k = Math.min(1, max / Math.max(w, hh));
    const cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(hh * k); cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', .7);
  } catch { return ''; }
}
/* 视频：均匀截取 n 帧（长边 max 像素），模型看画面；同时记下时长 */
async function videoFrames(file, n = 6, max = 768) {
  const url = URL.createObjectURL(file), v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  const wait = (ev, ms = 8000) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('读取视频超时')), ms); v.addEventListener(ev, () => { clearTimeout(t); res(); }, { once: true }); v.addEventListener('error', () => { clearTimeout(t); rej(new Error('无法读取这个视频')); }, { once: true }); });
  try {
    await wait('loadedmetadata');
    let dur = v.duration; if (!isFinite(dur) || dur <= 0) { v.currentTime = 1e7; await wait('seeked').catch(() => {}); dur = v.duration || 1; }
    const k = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight)), cv = document.createElement('canvas'); cv.width = Math.round(v.videoWidth * k); cv.height = Math.round(v.videoHeight * k);
    const g = cv.getContext('2d'), frames = [], times = []; let thumb = '';
    for (let i = 0; i < n; i++) {
      const t = dur * (i + .5) / n; v.currentTime = t; await wait('seeked');
      g.drawImage(v, 0, 0, cv.width, cv.height); frames.push(await new Promise(r => cv.toBlob(r, 'image/jpeg', .8))); times.push(t);
      if (!i) thumb = await thumbOf(v);
    }
    return { frames: frames.filter(Boolean), times, dur, thumb };
  } finally { URL.revokeObjectURL(url); v.removeAttribute('src'); v.load(); }
}
async function fileText(f) {
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf' || f.type === 'application/pdf') {
    await ensurePdfJs(); const pdf = await pdfjsLib.getDocument({ data: await f.arrayBuffer(), isEvalSupported: false }).promise, out = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 60); i++) { const tc = await (await pdf.getPage(i)).getTextContent(); out.push(tc.items.map(x => x.str + (x.hasEOL ? '\n' : '')).join('').trim()); }
    return { text: out.join('\n\n'), pages: pdf.numPages };
  }
  if (ext === 'docx') { if (!window.mammoth) await loadScript(VENDOR.mammoth); return { text: (await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() })).value }; }
  if (/^text\//.test(f.type) || ['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'py', 'js', 'c', 'cpp', 'java', 'html'].includes(ext)) return { text: await f.text() };
  throw new Error('暂不支持这种文件');
}
/* 网页正文：App 里用原生 HTTP（不受跨域限制），网页版尽量直接读取，读不到时只把网址交给模型 */
async function fetchLink(url) {
  let html = null;
  const http = NATIVE && Plug('CapacitorHttp');
  try {
    if (http) { const r = await http.request({ url, method: 'GET', responseType: 'text', connectTimeout: 12000, readTimeout: 20000 }); if (r.status < 400) html = typeof r.data === 'string' ? r.data : JSON.stringify(r.data); }
    else { const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 12000); const r = await fetch(url, { signal: ctl.signal }); clearTimeout(t); if (r.ok) html = await r.text(); }
  } catch {}
  if (html == null) return null;
  if (!/<html|<body|<p[ >]/i.test(html)) return { title: '', text: html.slice(0, 12000) };
  const doc = new DOMParser().parseFromString(html.replace(/<\/(p|div|h[1-6]|li|tr|section|article|pre|blockquote)>|<br\s*\/?>/gi, '$&\n'), 'text/html');
  const title = (doc.querySelector('meta[property="og:title"]')?.content || doc.title || '').trim();
  doc.querySelectorAll('script,style,noscript,nav,footer,header,aside,form,svg,iframe').forEach(e => e.remove());
  const root = doc.querySelector('article') || doc.querySelector('main') || doc.body, desc = doc.querySelector('meta[name="description"],meta[property="og:description"]')?.content || '';
  const text = (desc ? desc + '\n\n' : '') + (root?.textContent || '').replace(/[ \t ]+/g, ' ').replace(/\n\s*\n\s*/g, '\n\n').trim();
  return { title: title.slice(0, 80), text: text.slice(0, 12000) };
}
/* 发给模型：文字部分 + 图片（图片与视频画面，受模型上限约束） */
function attPayload(att) {
  const lim = AI.limits?.images, max = lim?.maxCount || 0, images = [], parts = [];
  for (const a of att) {
    if (a.k === 'img') { if (images.length < max) images.push(a.blob); parts.push(`[图片] ${a.name || ''}${max ? `（见附图第 ${images.length} 张）` : '（当前模型看不了图片）'}`); }
    else if (a.k === 'video') {
      const room = Math.max(0, max - images.length), fr = a.frames.slice(0, room), i0 = images.length + 1; images.push(...fr);
      parts.push(`[视频] ${a.name}，时长 ${fmtDur(a.dur)}${fr.length ? `。附图第 ${i0}~${i0 + fr.length - 1} 张是按时间顺序均匀截取的画面（${a.times.slice(0, fr.length).map(fmtDur).join('、')}）` : '（当前模型看不了画面）'}`);
    }
    else if (a.k === 'file') parts.push(`[文件] ${a.name}${a.pages ? `（${a.pages} 页）` : ''}\n"""\n${a.text.slice(0, 30000)}\n"""`);
    else if (a.k === 'link') parts.push(`[链接] ${a.title ? a.title + ' ' : ''}${a.url}${a.text ? `\n网页正文：\n"""\n${a.text}\n"""` : '\n（没能读取网页内容，只能根据网址判断）'}`);
  }
  return { text: parts.length ? '\n\n用户附带的内容：\n' + parts.join('\n\n') : '', images };
}
/* 可以保存的附件信息（不含原图、正文），用于在消息里显示 */
const attMeta = att => att.map(a => ({ k: a.k, name: a.name, thumb: a.thumb, url: a.url, title: a.title, dur: a.dur }));
function attHTML(list, rm) {
  return list.map((a, i) => {
    const x = rm ? `<button class="rm" data-rm="${i}" aria-label="移除">${ico('x')}</button>` : '';
    if (a.k === 'img') return `<span class="at img">${a.thumb ? `<img src="${a.thumb}" alt="">` : ico('image')}${x}</span>`;
    if (a.k === 'video') return `<span class="at img vid">${a.thumb ? `<img src="${a.thumb}" alt="">` : ''}<i>${ico('play', '', 'fill')}${a.dur ? fmtDur(a.dur) : ''}</i>${x}</span>`;
    const ic = a.k === 'link' ? 'web' : 'doc', t = a.k === 'link' ? (a.title || a.url.replace(/^https?:\/\/(www\.)?/, '')) : a.name, sub = a.k === 'link' ? a.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : (a.name.split('.').pop() || '').toUpperCase();
    return `<span class="at doc">${a.busy ? '<span class="spin"></span>' : ico(ic)}<span class="grow"><b>${esc(t)}</b><small>${esc(sub)}</small></span>${x}</span>`;
  }).join('');
}
/* 添加附件的面板：上面一排大按钮，下面是调用方附加的其它工具 */
function attachSheet(add, extra = []) {
  const body = h(`<div><div class="attg">
    <button data-a="cam"><span>${ico('camera')}</span>拍照</button><button data-a="img"><span>${ico('images')}</span>图片</button>
    <button data-a="vid"><span>${ico('video')}</span>视频</button><button data-a="file"><span>${ico('clip')}</span>文件</button></div>
    <div class="menu"><button data-a="link">${ico('link')}<span class="grow">添加链接<small>网页、文章、视频页面</small></span></button>${extra.map((m, i) => `<button data-x="${i}">${ico(m.icon)}<span class="grow">${esc(m.label)}</span></button>`).join('')}</div></div>`);
  const s = sheet('添加', body);
  const pickFile = (accept, opt = {}) => { const i = h(`<input type="file" hidden accept="${accept}" ${opt.multi ? 'multiple' : ''} ${opt.cap ? 'capture="environment"' : ''}>`); document.body.append(i); i.onchange = () => { const fs = [...i.files]; i.remove(); fs.forEach(add.file); }; i.click(); };
  body.onclick = e => {
    const b = e.target.closest('[data-a],[data-x]'); if (!b) return;
    if (b.dataset.x) { s.close(); return extra[+b.dataset.x].run(); }
    const a = b.dataset.a;
    if (a === 'cam') pickFile('image/*', { cap: true }); else if (a === 'img') pickFile('image/*', { multi: true }); else if (a === 'vid') pickFile('video/*');
    else if (a === 'file') pickFile('.pdf,.docx,.txt,.md,.markdown,.csv,.json,text/*', { multi: true });
    s.close();
    if (a === 'link') setTimeout(() => linkSheet(add.link), 120);
  };
}
function linkSheet(done) {
  const body = h(`<div style="display:flex;flex-direction:column;gap:12px"><input class="inp" id="lk" type="url" inputmode="url" placeholder="https://"><button class="btn pri" id="lk-ok">${ico('link')}添加</button></div>`);
  const s = sheet('添加链接', body), inp = $('#lk', body); setTimeout(() => inp.focus(), 250);
  const ok = () => { const v = inp.value.trim(), u = /^https?:\/\//i.test(v) ? v : v ? 'https://' + v : ''; if (!u) return inp.focus(); s.close(); done(u); };
  $('#lk-ok', body).onclick = ok; inp.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) ok(); };
}

/* ---- 组件 ---- */
/* opts: placeholder, ids（[输入框 id, 发送按钮 id]）, chips（输入框里的额外按钮 HTML）, extra（「+」面板里的其它工具）, onSend({ text, att }), onStop(), busy() */
function Composer(opts) {
  const el = h(`<div class="cbox"><div class="catt" hidden></div><textarea rows="1"></textarea>
    <div class="crow"><button class="cb" data-c="plus" aria-label="添加图片、视频、文件或链接">${ico('plus')}</button><button class="cmod" data-c="model"><span>${esc(modelLabel())}</span>${ico('down')}</button>${opts.chips || ''}<span class="grow"></span>${SR ? `<button class="cb mic" data-c="mic" aria-label="语音输入">${ico('mic')}</button>` : ''}<button class="send" data-c="send" aria-label="发送">${ico('send')}</button></div></div>`);
  const ta = $('textarea', el), strip = $('.catt', el), send = $('[data-c="send"]', el), att = [];
  ta.placeholder = opts.placeholder || '';
  if (opts.ids) { ta.id = opts.ids[0]; send.id = opts.ids[1]; }
  const busy = () => !!opts.busy?.();
  const drawAtt = () => { strip.hidden = !att.length; strip.innerHTML = attHTML(att, true); sync(); };
  const sync = () => { const b = busy(); send.innerHTML = b ? ico('stop', '', 'fill') : ico('send'); send.classList.toggle('stop', b); send.disabled = !b && (!ta.value.trim() && !att.length || att.some(a => a.busy)); };
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(168, ta.scrollHeight) + 'px'; sync(); };
  const push = a => { if (att.length >= ATT_MAX) { toast(`最多 ${ATT_MAX} 个附件`); return null; } att.push(a); drawAtt(); return a; };
  const warnImg = () => { if (AI.ok && !AI.limits?.images) toast('当前模型看不了图片'); };
  const add = {
    async file(f) {
      if (/^image\//.test(f.type)) { const a = push({ k: 'img', name: f.name, busy: true }); if (!a) return; warnImg(); a.blob = await shrinkImage(f, 1568); a.thumb = await thumbOf(a.blob); a.busy = false; drawAtt(); return; }
      if (/^video\//.test(f.type)) { const a = push({ k: 'video', name: f.name, busy: true }); if (!a) return; warnImg();
        try { Object.assign(a, await videoFrames(f)); a.busy = false; } catch (e) { att.splice(att.indexOf(a), 1); toast(e.message || '无法读取这个视频'); } drawAtt(); return; }
      const a = push({ k: 'file', name: f.name, busy: true }); if (!a) return;
      try { Object.assign(a, await fileText(f)); a.busy = false; if (!a.text.trim()) { att.splice(att.indexOf(a), 1); toast('这个文件里没有可读取的文字，可以拍照或截图后作为图片添加'); } }
      catch (e) { att.splice(att.indexOf(a), 1); toast(`${f.name}：${e.message || '读取失败'}`); }
      drawAtt();
    },
    async link(url) {
      if (att.some(a => a.url === url)) return;
      const a = push({ k: 'link', url, busy: true }); if (!a) return;
      const r = await fetchLink(url); if (r) Object.assign(a, r); a.busy = false; drawAtt();
    }
  };
  el.onclick = e => {
    const rm = e.target.closest('[data-rm]'); if (rm) { att.splice(+rm.dataset.rm, 1); drawAtt(); return; }
    const c = e.target.closest('[data-c]')?.dataset.c; if (!c) { if (e.target === el) ta.focus(); return; }
    if (c === 'plus') attachSheet(add, opts.extra);
    else if (c === 'model') { if (Platform.aiConfigurable) aiConfigSheet(); else toast(modelLabel()); }
    else if (c === 'mic') listen();
    else if (c === 'send') go();
  };
  const go = () => {
    if (busy()) return opts.onStop?.();
    const text = ta.value.trim(); if (!text && !att.length) return;
    // 正文里的网址自动作为链接附件（不重复抓取）
    const urls = [...new Set(text.match(URL_RE) || [])].filter(u => !att.some(a => a.url === u)).slice(0, 3);
    const pending = urls.map(u => { const a = { k: 'link', url: u, busy: true }; att.push(a); return fetchLink(u).then(r => { if (r) Object.assign(a, r); a.busy = false; }); });
    const list = att.splice(0); ta.value = ''; ta.style.height = ''; drawAtt();
    const fire = () => opts.onSend({ text, att: list.filter(a => !a.busy || a.k === 'link') });
    if (pending.length) { send.disabled = true; Promise.all(pending).then(fire); } else fire();
  };
  ta.oninput = grow;
  ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer:fine)').matches) { e.preventDefault(); go(); } };
  ta.onpaste = e => {
    const fs = [...(e.clipboardData?.files || [])].filter(f => /^(image|video)\//.test(f.type));
    if (fs.length) { e.preventDefault(); fs.forEach(add.file); return; }
    const t = e.clipboardData?.getData('text') || ''; if (/^https?:\/\/\S+$/.test(t.trim()) && !ta.value.trim()) { e.preventDefault(); add.link(t.trim()); }
  };
  /* 语音输入（浏览器支持时才显示麦克风） */
  let rec = null;
  const listen = () => {
    if (rec) { rec.stop(); return; }
    rec = new SR(); rec.lang = 'zh-CN'; rec.interimResults = true; rec.continuous = true;
    const base = ta.value, mic = $('[data-c="mic"]', el); mic.classList.add('on');
    rec.onresult = e => { ta.value = base + [...e.results].map(r => r[0].transcript).join(''); grow(); };
    rec.onend = rec.onerror = () => { rec = null; mic.classList.remove('on'); };
    try { rec.start(); } catch { rec = null; mic.classList.remove('on'); }
  };
  sync();
  return { el, ta, sync, add, focus: () => ta.focus(), set(t) { ta.value = t; grow(); ta.focus(); } };
}
