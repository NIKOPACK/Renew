/* ============ 资料库 ============ */
const MATS = new Map(), matText = new Map(), matPdf = new Map();
function loadMats() { MATS.clear(); for (const k of Store.keys('mat/')) MATS.set(k.slice(4), Store.get(k)); }
function saveMat(m) { MATS.set(m.id, m); Store.put('mat/' + m.id, m); }
async function matPages(m) {
  if (matText.has(m.id)) return matText.get(m.id); if (!m.text) return [];
  const b = await Files.get(m.text); if (!b) return []; const j = JSON.parse(await b.text()); matText.set(m.id, j.pages || []); return j.pages || [];
}
async function setMatPages(m, pages) {
  const old = m.text; m.text = await Files.put(new Blob([JSON.stringify({ pages })], { type: 'application/json' }), 'application/json');
  matText.set(m.id, pages); m.pages = pages.length; m.chars = pages.reduce((s, p) => s + p.length, 0);
  m.scanned = m.kind !== 'text' && m.chars / Math.max(1, pages.length) < 40; saveMat(m); if (old) Files.del(old);
}
async function ensurePdfJs() { if (window.pdfjsLib) return; await loadScript(VENDOR.pdf); await loadScript(VENDOR.pdfWorker); pdfjsLib.GlobalWorkerOptions.workerSrc = VENDOR.pdfWorker; }
async function openPdf(m) {
  if (matPdf.has(m.id)) return matPdf.get(m.id);
  const blob = await Files.get(m.file); if (!blob) throw new Error('原文件不在这台设备上，请在资料页重新选择原文件');
  await ensurePdfJs(); const pdf = await pdfjsLib.getDocument({ data: await blob.arrayBuffer(), isEvalSupported: false }).promise; matPdf.set(m.id, pdf); return pdf;
}
async function renderPdfPage(pdf, i) {
  const pg = await pdf.getPage(i), vp = pg.getViewport({ scale: 1 }), v2 = pg.getViewport({ scale: Math.min(2, 1400 / vp.width) });
  const cv = document.createElement('canvas'); cv.width = v2.width; cv.height = v2.height;
  await pg.render({ canvasContext: cv.getContext('2d'), viewport: v2 }).promise; return new Promise(r => cv.toBlob(r, 'image/jpeg', .85));
}
async function matPageImages(m, a, b, max) {
  const end = Math.min(b, a + max - 1);
  if (m.kind === 'images') return (await Promise.all((m.imgs || []).slice(a - 1, end).map(r => Files.get(r)))).filter(Boolean);
  if (m.kind !== 'pdf') return [];
  const pdf = await openPdf(m), out = []; for (let i = a; i <= Math.min(end, pdf.numPages); i++) out.push(await renderPdfPage(pdf, i)); return out;
}
function splitPages(text, size = 1800) {
  const paras = String(text).replace(/\r/g, '').split(/\n{2,}/), pages = []; let cur = '';
  for (const p of paras) { if (cur && cur.length + p.length > size) { pages.push(cur.trim()); cur = ''; } cur += p + '\n\n'; while (cur.length > size * 1.6) { pages.push(cur.slice(0, size)); cur = cur.slice(size); } }
  if (cur.trim()) pages.push(cur.trim()); return pages.length ? pages : [''];
}
const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
async function ingestFile(f, msg) {
  const ext = (f.name.split('.').pop() || '').toLowerCase(), name = f.name.replace(/\.[^.]+$/, '') || f.name;
  const m = { id: newId('m'), name, ext, size: f.size, createdAt: Date.now(), kind: 'text', pages: 0 };
  if (ext === 'pdf' || f.type === 'application/pdf') {
    m.kind = 'pdf'; msg(`正在读取「${name}」…`); await ensurePdfJs();
    const pdf = await pdfjsLib.getDocument({ data: await f.arrayBuffer(), isEvalSupported: false }).promise, pages = [];
    for (let i = 1; i <= pdf.numPages; i++) { const tc = await (await pdf.getPage(i)).getTextContent(); pages.push(tc.items.map(x => x.str + (x.hasEOL ? '\n' : '')).join('').replace(/[ \t]+\n/g, '\n').trim()); if (i % 8 === 0 || i === pdf.numPages) msg(`正在提取文字 ${i}/${pdf.numPages} 页…`); }
    msg('正在保存原文件…'); m.file = await Files.put(f, 'application/pdf'); matPdf.set(m.id, pdf); await setMatPages(m, pages);
  } else if (ext === 'docx') {
    msg(`正在读取 Word 文档「${name}」…`);
    if (!window.mammoth) await loadScript(VENDOR.mammoth);
    const r = await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() }); await setMatPages(m, splitPages(r.value));
  } else if (['txt', 'md', 'markdown', 'text', 'csv', 'tsv'].includes(ext) || /^text\//.test(f.type)) {
    const t = await f.text(); m.file = await Files.put(new Blob([t], { type: ext === 'md' || ext === 'markdown' ? 'text/markdown' : 'text/plain' }), ext === 'md' || ext === 'markdown' ? 'text/markdown' : 'text/plain'); await setMatPages(m, splitPages(t));
  } else { toast(`暂不支持的文件类型：${f.name}`); return null; }
  logEvent('导入资料 ' + f.name); saveState(); return m;
}
async function ingestImages(files, name, msg) {
  const m = { id: newId('m'), name: name || `照片资料 ${new Date().toLocaleDateString()}`, ext: 'img', kind: 'images', size: 0, createdAt: Date.now(), imgs: [] };
  for (let i = 0; i < files.length; i++) { msg(`正在保存图片 ${i + 1}/${files.length}…`); const r = await Files.put(files[i], files[i].type || 'image/jpeg'); m.imgs.push(r); m.size += files[i].size; }
  await setMatPages(m, files.map(() => '')); logEvent('导入照片资料 ' + files.length + ' 张'); saveState(); return m;
}
async function ingestText(name, text) { const m = { id: newId('m'), name: name || '粘贴的资料', ext: 'txt', kind: 'text', size: text.length, createdAt: Date.now() }; await setMatPages(m, splitPages(text)); return m; }
function matIcon(m) { return m.kind === 'pdf' ? 'file' : m.kind === 'images' ? 'camera' : 'list'; }
function matMeta(m) {
  const c = m.course && COURSES.get(m.course);
  return [m.kind === 'pdf' ? `PDF · ${m.pages} 页` : m.kind === 'images' ? `${m.pages} 张照片` : `文本 · ${m.pages} 段`, m.size ? fmtSize(m.size) : '', m.file || m.imgs ? Files.where(m.file || m.imgs?.[0]) : '', c ? '→ ' + c.title : ''].filter(Boolean).join(' · ');
}

/* ---- AI 识别扫描版 / 照片文字 ---- */
async function ocrSheet(m) {
  const lim = AI.limits?.images; if (!AI.require()) return; if (!lim) return toast('当前模型不支持图片，请在设置里换成支持图片的模型');
  const pages = await matPages(m), todo = pages.map((t, i) => t.trim() ? null : i + 1).filter(Boolean);
  const body = h(`<div style="display:flex;flex-direction:column;gap:12px"><p class="small" style="margin:0">${todo.length} 页待识别</p><div class="row"><label class="field grow"><span>起始页</span><input class="inp" id="oc-a" inputmode="numeric" value="${todo[0] || 1}"></label><label class="field grow"><span>结束页</span><input class="inp" id="oc-b" inputmode="numeric" value="${Math.min(m.pages, (todo[0] || 1) + 19)}"></label></div><div class="acts"><button class="btn pri" id="oc-go">${ico('wand')}开始识别</button><button class="btn" id="oc-stop" hidden>${ico('stop')}停止</button></div><div id="oc-out" class="small"></div></div>`);
  const s = sheet('AI 识别文字', body); let stop = false, ctl; s.onclose = () => { stop = true; ctl?.abort(); };
  $('#oc-stop', body).onclick = () => { stop = true; ctl?.abort(); };
  $('#oc-go', body).onclick = async () => {
    const a = Math.max(1, +$('#oc-a', body).value || 1), b = Math.min(m.pages, +$('#oc-b', body).value || a), out = $('#oc-out', body);
    $('#oc-go', body).hidden = true; $('#oc-stop', body).hidden = false; stop = false;
    for (let i = a; i <= b && !stop; i += lim.maxCount) {
      const j = Math.min(b, i + lim.maxCount - 1); out.innerHTML = `<div class="prog"><span class="spin"></span>正在识别第 ${i}-${j} 页…</div>`;
      try {
        const imgs = await matPageImages(m, i, j, lim.maxCount); ctl = new AbortController();
        const { text } = await AI.fn(`下面 ${imgs.length} 张图片依次是资料的第 ${i} 到第 ${i + imgs.length - 1} 页。请逐页完整转写其中的文字：保留标题层级（用 #）、列表和表格（Markdown），公式用 LaTeX（$...$），忽略页眉页脚。每页开头单独一行写 "=== 第N页 ==="（N 为上面的页码）。只输出转写内容。`, { images: imgs, signal: ctl.signal, cache: false });
        const parts = text.split(/^===\s*第\s*(\d+)\s*页\s*===\s*$/m);
        for (let k = 1; k < parts.length; k += 2) { const n = +parts[k]; if (n >= 1 && n <= pages.length) pages[n - 1] = parts[k + 1].trim(); }
        if (parts.length < 3) pages[i - 1] = text.trim();
        await setMatPages(m, pages);
      } catch (e) { out.innerHTML = `<span style="color:var(--bad)">${esc(e?.code ? AI.err(e) : e.message || e)}</span>`; if (e?.code !== 'rate_limited') break; await sleep(15000); }
    }
    if (!stop) out.innerHTML = '识别完成，已保存。'; $('#oc-go', body).hidden = false; $('#oc-stop', body).hidden = true; refresh();
  };
}

/* ---- AI 自动整理：分析目录 → 对应页码 → 逐节生成 ---- */
const DENSITY = { lite: { label: '精简', kp: 3, q: 2 }, std: { label: '标准', kp: 5, q: 4 }, full: { label: '详尽', kp: 8, q: 6 } };
const normT = s => String(s || '').replace(/[\s　·•.,，、:：;；()（）《》<>\[\]【】"'“”‘’\-—_*#|]/g, '').toLowerCase();
function locateSections(list, pages, tocEnd) {
  const np = pages.map(normT); let from = Math.min(tocEnd, Math.max(0, np.length - 1)); const found = [];
  for (const s of list) {
    const full = normT(s.title), core = normT(String(s.title).replace(/^(第\s*[\d一二三四五六七八九十百]+\s*[章节篇部分讲]|[\dA-Za-z]+(\.\d+)*)\s*/, ''));
    let hit = -1;
    for (let i = from; i < np.length; i++) { if ((full.length >= 3 && np[i].includes(full)) || (core.length >= 3 && np[i].includes(core))) { hit = i; break; } }
    found.push(hit); if (hit >= 0) from = hit;
  }
  const diffs = list.map((s, i) => found[i] >= 0 && +s.page ? found[i] + 1 - +s.page : null).filter(x => x != null).sort((a, b) => a - b);
  const offset = diffs.length ? diffs[Math.floor(diffs.length / 2)] : 0;
  const starts = []; let prev = tocEnd + 1;
  list.forEach((s, i) => { let st = found[i] >= 0 ? found[i] + 1 : +s.page ? +s.page + offset : prev; st = Math.max(1, Math.min(pages.length, st)); if (st < prev && found[i] < 0) st = prev; starts.push(st); prev = st; });
  const ends = starts.map((st, i) => { const nx = starts.slice(i + 1).find(x => x > st); return Math.max(st, Math.min(pages.length, nx ? nx : st + 12)); });
  return { starts, ends, offset, hits: found.filter(x => x >= 0).length };
}
function tocMaterial(pages, a, b) { return pages.slice(a - 1, b).map((t, i) => `【第${a + i}页】\n${t}`).join('\n\n').slice(0, 30000); }
function organizeSheet(m, preset = {}) {
  if (!m.pages) return toast('资料是空的');
  const body = h(`<div style="display:flex;flex-direction:column;gap:14px"></div>`); const s = sheet('AI 整理资料', body); let ctl; s.onclose = () => ctl?.abort();
  const st = { mode: preset.course ? 'fill' : 'new', course: preset.course || shownCourses()[0]?.id, density: 'std', tocA: 1, tocB: Math.min(m.pages, m.kind === 'text' ? 6 : 16) };
  const step1 = () => {
    body.innerHTML = `<div class="card card-in" style="display:flex;gap:12px;align-items:center;box-shadow:none;background:var(--surface-2)">${ico(matIcon(m))}<div class="grow"><b>${esc(m.name)}</b><div class="small">${esc(matMeta(m))}${m.scanned ? ' · 扫描版' : ''}</div></div></div>
    <div class="field"><span>整理成</span><div class="seg" id="og-mode"><button data-v="new" aria-pressed="${st.mode === 'new'}">新课程</button><button data-v="fill" aria-pressed="${st.mode === 'fill'}">补充到已有课程</button></div></div>
    ${st.mode === 'new' ? `<div class="row"><label class="field grow"><span>课程名（可空，AI 会起名）</span><input class="inp" id="og-t" value="${esc(st.title || '')}"></label><label class="field grow"><span>分类</span><input class="inp" id="og-c" value="${esc(st.cat || '')}" list="og-cats"><datalist id="og-cats">${[...new Set(shownCourses().map(c => c.cat))].map(c => `<option value="${esc(c)}">`).join('')}</datalist></label></div>`
      : `<label class="field"><span>补充到</span><select class="inp" id="og-course">${shownCourses().map(c => `<option value="${c.id}" ${c.id === st.course ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}</select></label>`}
    <div class="row"><label class="field grow"><span>目录在第几页起</span><input class="inp" id="og-a" inputmode="numeric" value="${st.tocA}"></label><label class="field grow"><span>到第几页</span><input class="inp" id="og-b" inputmode="numeric" value="${st.tocB}"></label></div>
    
    <div class="field"><span>每节内容量</span><div class="seg" id="og-d">${Object.entries(DENSITY).map(([k, d]) => `<button data-v="${k}" aria-pressed="${st.density === k}">${d.label}<span class="n">${d.kp}+${d.q}</span></button>`).join('')}</div></div>
    <button class="btn pri block" id="og-go">${ico('wand')}分析目录并对应页码</button><div id="og-out"></div>`;
    $$('#og-mode button', body).forEach(b => b.onclick = () => { keep(); st.mode = b.dataset.v; step1(); });
    $$('#og-d button', body).forEach(b => b.onclick = () => { st.density = b.dataset.v; $$('#og-d button', body).forEach(x => x.setAttribute('aria-pressed', x === b)); });
    $('#og-go', body).onclick = analyze;
  };
  const keep = () => { st.title = $('#og-t', body)?.value.trim() ?? st.title; st.cat = $('#og-c', body)?.value.trim() ?? st.cat; st.course = $('#og-course', body)?.value || st.course; st.tocA = Math.max(1, +$('#og-a', body).value || 1); st.tocB = Math.min(m.pages, Math.max(st.tocA, +$('#og-b', body).value || st.tocA)); };
  const analyze = async () => {
    keep(); if (!AI.require()) return;
    const out = $('#og-out', body); out.innerHTML = '<div class="prog"><span class="spin"></span>AI 正在阅读目录…</div>'; $('#og-go', body).disabled = true;
    try {
      const pages = await matPages(m), toc = tocMaterial(pages, st.tocA, st.tocB);
      const useImg = m.scanned && toc.replace(/【第\d+页】|\s/g, '').length < 200;
      const images = useImg ? await matPageImages(m, st.tocA, st.tocB, AI.limits?.images?.maxCount || 5) : [];
      const src = useImg ? '目录页见附带图片。' : `资料共 ${pages.length} 页（PDF 页码）。以下是第 ${st.tocA}-${st.tocB} 页的文字：\n"""\n${toc}\n"""`;
      ctl = new AbortController();
      if (st.mode === 'new') {
        const r = await AI.fn.json(`你在为手机刷卡学习 App 规划课程。根据下面资料的目录（或开头内容），按原书顺序列出章和节。每节粒度适合 10~25 分钟学完（过细的小节可以合并，过大的可以拆分）；每节列出 2~6 个需要掌握的知识点；"page" 填目录上印的该节起始页码（数字，看不到就填 null）。
只输出 JSON：{"title":"课程名","cat":"分类","desc":"一句话简介","chapters":[{"title":"第1章 xxx","sections":[{"title":"1.1 xxx","page":12,"points":["…"]}]}]}
用户给的课程名：${st.title || '无'}；分类：${st.cat || '无'}
${src}`, { signal: ctl.signal, cache: false, ...(images.length ? { images } : {}) });
        if (!Array.isArray(r?.chapters) || !r.chapters.length) throw { code: 'invalid_json' };
        const flat = []; r.chapters.forEach((ch, ci) => (ch.sections?.length ? ch.sections : [{ title: ch.title, page: ch.page, points: [] }]).forEach(x => flat.push({ ci, title: String(x.title), page: x.page, points: (x.points || []).map(String) })));
        const loc = locateSections(flat, pages, st.tocB);
        flat.forEach((x, i) => { x.a = loc.starts[i]; x.b = loc.ends[i]; x.on = true; });
        st.outline = { title: st.title || r.title || m.name, cat: st.cat || r.cat || '我的课程', desc: r.desc || '', chapters: r.chapters.map(ch => String(ch.title)), flat, offset: loc.offset, hits: loc.hits };
      } else {
        const c = COURSES.get(st.course), secs = courseSecs(c);
        const r = await AI.fn.json(`下面是一门课程在 App 里的小节列表（id 和标题），以及一份教材资料的目录。请找出资料中与每个小节对应的内容，给出该节在目录上印的起始页码。资料里没有的小节不要列出。
只输出 JSON：{"map":[{"sec":"小节id","page":12}]}
小节列表：
${secs.map(x => `${x.id} ${CHAPS.get(x.chap).title} / ${x.title}`).join('\n')}
${src}`, { signal: ctl.signal, cache: false, ...(images.length ? { images } : {}) });
        const map = new Map((r?.map || []).filter(x => SECS.has(x.sec)).map(x => [x.sec, x.page]));
        const flat = secs.map(x => ({ sec: x.id, title: x.title, page: map.get(x.id) ?? null, ch: CHAPS.get(x.chap).title }));
        const loc = locateSections(flat, pages, st.tocB);
        flat.forEach((x, i) => { x.a = loc.starts[i]; x.b = loc.ends[i]; x.on = map.has(x.sec); });
        st.outline = { flat, offset: loc.offset, hits: loc.hits };
      }
      step2();
    } catch (e) { out.innerHTML = `<p class="small" style="color:var(--bad)">${esc(e?.code ? AI.err(e) : e.message || e)}</p>`; $('#og-go', body).disabled = false; }
  };
  const step2 = () => {
    const o = st.outline, n = () => o.flat.filter(x => x.on).length;
    body.innerHTML = `${st.mode === 'new' ? `<div class="row"><label class="field grow"><span>课程名</span><input class="inp" id="o2-t" value="${esc(o.title)}"></label><label class="field grow"><span>分类</span><input class="inp" id="o2-c" value="${esc(o.cat)}"></label></div>` : `<b>补充到「${esc(COURSES.get(st.course).title)}」</b>`}
    <div class="card card-in" style="box-shadow:none;background:var(--surface-2);display:flex;flex-direction:column;gap:8px"><div class="small" style="margin:0">已定位 ${o.hits}/${o.flat.length} 节 · 页码偏移 ${o.offset}</div><div class="row"><span class="small grow" style="margin:0">整体平移页码</span><button class="btn sm" data-shift="-1">−1</button><button class="btn sm" data-shift="1">＋1</button></div></div>
    <div class="menu" id="o2-list" style="max-height:none">${o.flat.map((x, i) => `${st.mode === 'new' && (i === 0 || o.flat[i - 1].ci !== x.ci) ? `<div class="eyebrow" style="padding:10px 14px 4px">${esc(o.chapters[x.ci])}</div>` : st.mode === 'fill' && (i === 0 || o.flat[i - 1].ch !== x.ch) ? `<div class="eyebrow" style="padding:10px 14px 4px">${esc(x.ch)}</div>` : ''}<label style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-top:1px solid var(--line)"><input type="checkbox" data-on="${i}" ${x.on ? 'checked' : ''} style="accent-color:var(--accent)"><span class="grow" style="font-size:14px;font-weight:600;min-width:0">${esc(x.title)}</span><input class="inp num" data-a="${i}" value="${x.a}" inputmode="numeric" style="width:58px;min-height:36px;padding:4px 6px;text-align:center"><span class="muted">–</span><input class="inp num" data-b="${i}" value="${x.b}" inputmode="numeric" style="width:58px;min-height:36px;padding:4px 6px;text-align:center"></label>`).join('')}</div>
    <p class="small" style="margin:0">每节约 1 分钟，整理时保持页面打开。</p>
    <div class="acts"><button class="btn" id="o2-back">返回</button><button class="btn pri" id="o2-go">${ico('wand')}开始整理 <span id="o2-n">${n()}</span> 节</button></div>`;
    const sync = () => { $$('[data-on]', body).forEach(c => o.flat[+c.dataset.on].on = c.checked); $$('[data-a]', body).forEach(c => o.flat[+c.dataset.a].a = Math.max(1, +c.value || 1)); $$('[data-b]', body).forEach(c => o.flat[+c.dataset.b].b = Math.max(1, +c.value || 1)); $('#o2-n', body).textContent = n(); if (st.mode === 'new') { o.title = $('#o2-t', body).value.trim() || o.title; o.cat = $('#o2-c', body).value.trim() || o.cat; } };
    body.addEventListener('change', sync);
    $$('[data-shift]', body).forEach(b => b.onclick = () => { sync(); o.flat.forEach(x => { x.a = Math.max(1, Math.min(m.pages, x.a + +b.dataset.shift)); x.b = Math.max(x.a, Math.min(m.pages, x.b + +b.dataset.shift)); }); o.offset += +b.dataset.shift; step2(); });
    $('#o2-back', body).onclick = step1;
    $('#o2-go', body).onclick = () => {
      sync(); if (!n()) return toast('至少选择一个小节');
      let cid = st.course, steps = [];
      if (st.mode === 'new') {
        cid = newId('u'); const chapters = o.chapters.map((t, ci) => ({ id: `${cid}c${ci + 1}`, title: t, sections: [] }));
        o.flat.forEach(x => { const ch = chapters[x.ci]; const sid = `${ch.id}s${ch.sections.length + 1}`; ch.sections.push({ id: sid, title: x.title, points: x.points }); x.sec = sid; });
        const course = { id: cid, title: o.title, cat: o.cat, desc: o.desc || `由资料「${m.name}」整理`, color: PALETTE[COURSES.size % PALETTE.length], chapters: chapters.filter(c => c.sections.length), src: m.id };
        Store.put('course/' + cid, course); addCourse(course, false); coursePlan(cid);
      }
      steps = o.flat.filter(x => x.on).map(x => ({ sec: x.sec, a: Math.min(x.a, x.b), b: Math.max(x.a, x.b), st: 'wait' }));
      m.course = cid; saveMat(m);
      const job = { id: newId('j'), mat: m.id, course: cid, mode: st.mode, density: st.density, title: `${m.name} → ${COURSES.get(cid).title}`, steps, status: 'paused', createdAt: Date.now() };
      Store.put('job/' + job.id, job); logEvent('创建整理任务 ' + job.title); saveState(); s.close();
      Nav.tab = 'materials'; Nav.stack = [{ view: 'materials' }]; render(true); Runner.run(job.id);
    };
  };
  step1();
}
const jobs = () => Store.keys('job/').map(k => Store.get(k)).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
const saveJob = j => Store.put('job/' + j.id, j);
const Runner = {
  job: null, ctl: null, stop: false,
  async run(id) {
    if (this.job) return toast('已有整理任务在进行，请等它完成或暂停');
    if (!AI.require()) return;
    const job = Store.get('job/' + id); if (!job) return; const m = MATS.get(job.mat), c = COURSES.get(job.course);
    if (!m || !c) return toast('资料或课程已被删除');
    this.job = job; this.stop = false; job.status = 'running'; saveJob(job); jobUI();
    const dens = DENSITY[job.density] || DENSITY.std;
    for (const step of job.steps) {
      if (this.stop) break; if (['done', 'skip'].includes(step.st)) continue;
      const sec = SECS.get(step.sec); if (!sec) { step.st = 'skip'; continue; }
      step.st = 'run'; step.msg = ''; jobUI();
      try {
        const pages = await matPages(m), slice = pages.slice(step.a - 1, step.b);
        let material = slice.join('').trim().length > 80 ? slice.map((t, i) => `【第${step.a + i}页】\n${t}`).join('\n\n').slice(0, 30000) : '', images = [];
        if (!material) images = await matPageImages(m, step.a, step.b, AI.limits?.images?.maxCount || 5);
        if (!material && !images.length) throw new Error('这几页没有可用的文字或图片');
        const existing = secItems(sec).map(x => x.title || plain(x.q).slice(0, 18)).join('；');
        this.ctl = new AbortController();
        const { text } = await AI.fn(genPrompt({ course: c, chap: CHAPS.get(sec.chap), sec, kpN: dens.kp, qN: dens.q, material, existing, hasImages: images.length > 0, focus: '只依据所给资料中属于本节的内容；资料里有例题时，改写成练习并给出详细解答' }), { signal: this.ctl.signal, cache: false, ...(images.length ? { images } : {}) });
        const r = parseDSL(text, sec.id); if (!r.items.length) throw new Error('没有解析出内容');
        saveItems(sec.id, r.items); step.st = 'done'; step.n = r.items.length;
      } catch (e) {
        step.st = e?.code === 'cancelled' ? 'wait' : 'err'; step.msg = e?.code ? AI.err(e) : String(e?.message || e);
        if (['not_granted', 'sampling_disabled', 'session_expired', 'not_declared'].includes(e?.code)) this.stop = true;
        if (e?.code === 'rate_limited') { step.st = 'wait'; await sleep(20000); }
      }
      saveJob(job); jobUI();
    }
    job.status = job.steps.every(x => ['done', 'skip'].includes(x.st)) ? 'done' : 'paused';
    saveJob(job); this.job = null; this.ctl = null; jobUI();
    if (job.status === 'done') { toast('整理完成：' + c.title); logEvent('整理完成 ' + job.title); saveState(); }
  },
  pause() { this.stop = true; this.ctl?.abort(); }
};
function jobProg(j) { const d = j.steps.filter(x => ['done', 'skip'].includes(x.st)).length; return { d, t: j.steps.length, err: j.steps.filter(x => x.st === 'err').length, items: j.steps.reduce((s, x) => s + (x.n || 0), 0) }; }
function jobUI() {
  updatePill();
  const v = Nav.stack[Nav.stack.length - 1]?.view; if (v === 'materials' || v === 'material') { const y = scrollY; render(false); scrollTo(0, y); }
}
function updatePill() {
  const j = Runner.job, pill = $('#jobpill'), v = Nav.stack[Nav.stack.length - 1]?.view;
  if (j && v !== 'session' && v !== 'materials' && v !== 'ai') {
    const p = jobProg(j), html = `<span class="spin" style="width:16px;height:16px;border-width:2px"></span><span>AI 整理中 ${p.d}/${p.t}</span>`;
    if (pill) pill.innerHTML = html; else { const el = h(`<button id="jobpill" class="jobpill">${html}</button>`); el.onclick = () => go('materials', {}, { tab: true }); document.body.append(el); }
  } else pill?.remove();
}

/* ---- 资料页 ---- */
function bindJobButtons(v) {
  $$('[data-jrun]', v).forEach(b => b.onclick = () => Runner.run(b.dataset.jrun));
  $$('[data-jpause]', v).forEach(b => b.onclick = () => Runner.pause());
  $$('[data-jcourse]', v).forEach(b => b.onclick = () => { Nav.tab = 'library'; Nav.stack = [{ view: 'library' }, { view: 'course', params: { id: b.dataset.jcourse } }]; render(true); });
  $$('[data-jdel]', v).forEach(b => b.onclick = async () => { if (await confirmBox('删除任务', '只删除任务记录，已生成的内容会保留。', '删除', true)) { Store.drop('job/' + b.dataset.jdel); refresh(); } });
}
function pasteSheet() {
  const body = h(`<div style="display:flex;flex-direction:column;gap:12px"><label class="field"><span>名称</span><input class="inp" id="ps-n" placeholder="如：第三章课堂笔记"></label><label class="field"><span>内容</span><textarea class="inp" id="ps-t" style="min-height:240px" placeholder="粘贴讲义、网页文章、笔记或卡片文本（:: 格式）"></textarea></label><button class="btn pri" id="ps-ok">保存为资料</button></div>`);
  const s = sheet('粘贴资料', body);
  $('#ps-ok', body).onclick = async () => {
    const t = $('#ps-t', body).value; if (!t.trim()) return toast('内容是空的');
    if (/^::\s*(kp|note|choice|multi|tf|qa|cloze|think)\b/m.test(t) || /^@course/m.test(t)) { s.close(); return importCardText(t, $('#ps-n', body).value.trim()); }
    const m = await ingestText($('#ps-n', body).value.trim(), t); s.close(); go('material', { id: m.id }); toast('已保存，可以交给 AI 整理');
  };
}
function busySheet(title) { const body = h(`<div style="display:flex;flex-direction:column;gap:12px;padding:10px 0 20px"><div class="prog" id="bz"><span class="spin"></span><span>准备中…</span></div></div>`); const s = sheet(title, body); return { s, msg: t => { const el = $('#bz span:last-child', body); if (el) el.textContent = t; } }; }
async function importFiles(files) {
  if (!files.length) return;
  const imgs = files.filter(f => /^image\//.test(f.type)), others = files.filter(f => !/^image\//.test(f.type));
  const b = busySheet('导入'), made = [];
  try {
    for (const f of others) {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (ext === 'json') { b.msg('正在读取 ' + f.name); const data = JSON.parse(await f.text()); if (isCoursePack(data)) { importPack(data); continue; } if (isBackup(data)) { b.s.close(); return importData(data); } toast('无法识别的 JSON 文件：' + f.name); continue; }
      if (['csv', 'tsv'].includes(ext)) { const t = await f.text(); b.s.close(); return csvImportSheet(t, f.name); }
      if (['txt', 'md', 'markdown'].includes(ext)) { const t = await f.text(); if (/^::\s*(kp|note|choice|multi|tf|qa|cloze|think)\b/m.test(t) || /^@course/m.test(t)) { b.s.close(); return importCardText(t, f.name.replace(/\.[^.]+$/, '')); } }
      const m = await ingestFile(f, b.msg); if (m) made.push(m);
    }
    if (imgs.length) made.push(await ingestImages(imgs, '', b.msg));
  } catch (e) { b.s.close(); return toast('导入失败：' + (e.message || e)); }
  b.s.close();
  if (made.length === 1) { go('material', { id: made[0].id }); toast('已导入，下一步交给 AI 整理'); }
  else if (made.length) { refresh(); toast(`已导入 ${made.length} 份资料`); }
}

/* ---- 资料详情 ---- */
let matPageFrom = 0;
async function pageSheet(m, i) {
  const pages = await matPages(m), body = h(`<div style="display:flex;flex-direction:column;gap:12px"><div id="pg-img"></div><div class="md" style="font-size:15px">${pages[i]?.trim() ? md(pages[i]) : '<p class="small">这一页没有提取到文字。</p>'}</div><div class="acts"><button class="btn sm" id="pg-prev" ${i ? '' : 'disabled'}>上一页</button><button class="btn sm" id="pg-next" ${i < pages.length - 1 ? '' : 'disabled'}>下一页</button></div></div>`);
  const s = sheet(`第 ${i + 1} ${m.kind === 'text' ? '段' : '页'}`, body);
  $('#pg-prev', body).onclick = () => { s.close(); pageSheet(m, i - 1); }; $('#pg-next', body).onclick = () => { s.close(); pageSheet(m, i + 1); };
  if (m.kind !== 'text') { try { const [img] = await matPageImages(m, i + 1, i + 1, 1); if (img) $('#pg-img', body).innerHTML = `<img alt="第 ${i + 1} 页" src="${URL.createObjectURL(img)}" style="width:100%;border-radius:12px;border:1px solid var(--line)">`; } catch {} }
}
async function openOriginal(m) {
  try { const ref = m.file || m.imgs?.[0]; if (ref?.a) { window.open('/_blob/' + ref.a, '_blank'); return; } const b = await Files.get(ref); if (!b) throw new Error('原文件不在这台设备上'); window.open(URL.createObjectURL(b), '_blank'); }
  catch (e) { toast(e.message || '无法打开原文件'); }
}
