/* ============ 录题：拍照 / PDF / 文字 → 逐题识别 → 确认 → 入库 ============ */
/* 精准做法：识别两次独立比对，不一致的字段标出来；原图裁剪放在旁边对照；没有答案的题盲解 3 次；你确认后才入库。 */
const Cap = { qs: [], course: '', scope: 'all', imgs: [], urls: [], stage: '', total: '', defSec: '', err: '' };
const CAP_TYPES = { choice: '单选', multi: '多选', tf: '判断', qa: '其他' };
function capSecs(cid) { const c = COURSES.get(cid); return c ? courseSecs(c) : []; }
function captureSheet({ course, files } = {}) {
  const cs = shownCourses(), st = { src: files?.length ? 'img' : 'img', scope: 'all', course: COURSES.has(course) ? course : activeCourses()[0]?.id || cs[0]?.id || '_new', files: files || [], text: '' };
  const lim = AI.limits?.images;
  const body = h(`<div style="display:flex;flex-direction:column;gap:14px">
    <div class="seg" id="cp-src"><button data-s="img" aria-pressed="true">${ico('camera')}照片</button><button data-s="pdf" aria-pressed="false">${ico('file')}PDF</button><button data-s="text" aria-pressed="false">${ico('list')}文字</button></div>
    <div id="cp-in"></div>
    <div class="seg" id="cp-scope"><button data-v="all" aria-pressed="true">整页录入</button><button data-v="wrong" aria-pressed="false">只录错题</button></div>
    <label class="field"><span>课程</span><select class="inp" id="cp-c">${cs.map(c => `<option value="${c.id}" ${c.id === st.course ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}<option value="_new" ${st.course === '_new' ? 'selected' : ''}>＋ 我的题目</option></select></label>
    <button class="btn pri block" id="cp-go">${ico('scan')}识别</button></div>`);
  const s = sheet('录题', body);
  const draw = () => {
    const el = $('#cp-in', body);
    if (st.src === 'text') { el.innerHTML = `<textarea class="inp" id="cp-t" placeholder="粘贴题目" style="min-height:160px">${esc(st.text)}</textarea>`; $('#cp-t', el).oninput = e => st.text = e.target.value; return; }
    if (!lim) { el.innerHTML = `<p class="small" style="margin:0">${AI.ok ? '当前模型不能看图片，请在设置里换成支持图片的模型，或改用文字。' : esc(AI.need)}</p>`; return; }
    el.innerHTML = `<input type="file" class="inp" id="cp-f" ${st.src === 'img' ? `accept="${lim.mediaTypes.join(',')}" multiple` : 'accept=".pdf,application/pdf"'}><div class="thumbs" id="cp-th"></div>`;
    const th = () => { $('#cp-th', el).innerHTML = st.src === 'img' ? st.files.map(f => `<img alt="" src="${URL.createObjectURL(f)}">`).join('') : st.files[0] ? `<span class="small">${esc(st.files[0].name)}</span>` : ''; };
    $('#cp-f', el).onchange = e => { st.files = [...e.target.files]; th(); }; th();
  };
  $$('#cp-src button', body).forEach(b => b.onclick = () => { st.src = b.dataset.s; if (st.src !== 'img') st.files = []; $$('#cp-src button', body).forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); });
  $$('#cp-scope button', body).forEach(b => b.onclick = () => { st.scope = b.dataset.v; $$('#cp-scope button', body).forEach(x => x.setAttribute('aria-pressed', x === b)); });
  $('#cp-c', body).onchange = e => st.course = e.target.value;
  $('#cp-go', body).onclick = async () => {
    if (!AI.require()) return;
    let imgs = [];
    if (st.src === 'img') imgs = st.files.slice(0, 12);
    else if (st.src === 'pdf') {
      const f = st.files[0]; if (!f) return toast('先选择 PDF');
      $('#cp-go', body).innerHTML = '<span class="spin"></span>';
      try { await ensurePdfJs(); const pdf = await pdfjsLib.getDocument({ data: await f.arrayBuffer(), isEvalSupported: false }).promise; for (let i = 1; i <= Math.min(8, pdf.numPages); i++) imgs.push(await renderPdfPage(pdf, i)); }
      catch { $('#cp-go', body).innerHTML = `${ico('scan')}识别`; return toast('PDF 读取失败'); }
    }
    if (st.src !== 'text' && !imgs.length) return toast('先选择照片');
    if (st.src === 'text' && !st.text.trim()) return toast('先粘贴题目');
    s.close(); startCapture({ course: st.course, scope: st.scope, imgs, text: st.src === 'text' ? st.text : '' });
  };
  draw();
}
function capCourse(cid) {
  if (cid !== '_new') return COURSES.get(cid);
  let c = [...COURSES.values()].find(x => !x.builtin && x.title === '我的题目'); if (c) return c;
  const id = 'u' + Date.now().toString(36) + 'q';
  const course = { id, title: '我的题目', cat: '我的课程', desc: '', color: PALETTE[COURSES.size % PALETTE.length], chapters: [{ id: id + 'c1', title: '录入的题目', sections: [{ id: id + 'c1s1', title: '录入的题目', points: [] }] }] };
  Store.put('course/' + id, course); c = addCourse(course, false); coursePlan(id); saveState(); return c;
}
const capSecList = c => courseSecs(c).map(s => `${s.id} | ${CHAPS.get(s.chap).title} · ${s.title}${s.points?.length ? '（' + s.points.slice(0, 4).join('、') + '）' : ''}`).join('\n');
function recogPrompt(c, n, fromText) {
  return `${fromText ? '下面是一份作业或试卷的文字。' : `下面 ${n} 张图片依次是同一份作业或试卷的第 1~${n} 张照片。`}请逐题识别，每道题输出：
${fromText ? '' : 'page 第几张图（从 1 开始）；box 这道题（含选项和学生作答）在图中的区域 [左, 上, 右, 下]，按图片宽、高的千分比（0~1000）；\n'}no 题号；type：choice 单选、multi 多选、tf 判断、qa 其他（填空、计算、简答等）；stem 题干（公式用 LaTeX $...$，填空处写 ____，不含选项）；options 选项内容数组（不写 A. B.）；answer 纸上印的或标注的标准答案（没有就留空，不要自己做题）；mine 学生写下的作答（选择题写字母，判断写对/错）；mark 老师的批改：right、wrong，没批改留空；sec 这道题最可能属于的小节 id（只能从下面列表里选，没有合适的留空）；unsure 看不清、拿不准的字段名数组。
只转写真实存在的内容，看不清的字写成 ？，不要猜，不要补全。
只输出 JSON：{"questions":[{"page":1,"box":[0,0,1000,1000],"no":"1","type":"choice","stem":"","options":[],"answer":"","mine":"","mark":"","sec":"","unsure":[]}]}

「${c.title}」的小节：
${capSecList(c)}${fromText ? `\n\n文字：\n"""\n${fromText.slice(0, 30000)}\n"""` : ''}`;
}
function cleanQ(q, c, nImg) {
  const type = ['choice', 'multi', 'tf', 'qa'].includes(q?.type) ? q.type : 'qa';
  const box = Array.isArray(q?.box) && q.box.length === 4 && q.box.every(v => Number.isFinite(+v)) ? q.box.map(v => Math.max(0, Math.min(1000, +v))) : null;
  return { page: Math.max(1, Math.min(nImg || 1, parseInt(q?.page) || 1)), box: box && box[2] > box[0] + 20 && box[3] > box[1] + 20 ? box : null, no: String(q?.no ?? '').slice(0, 8), type, stem: String(q?.stem || '').trim(), options: [].concat(q?.options || []).map(o => String(o).trim()).filter(Boolean).slice(0, 6), answer: String(q?.answer ?? '').trim(), mine: String(q?.mine ?? '').trim(), mark: q?.mark === 'right' || q?.mark === 'wrong' ? q.mark : '', sec: capSecs(c.id).some(s => s.id === q?.sec) ? q.sec : '', unsure: [].concat(q?.unsure || []).map(String) };
}
/* 两次识别对齐：同一页同一题号优先，否则按顺序 */
function capCompare(a, b) {
  const flags = new Set(a.unsure);
  if (!b) { flags.add('once'); return flags; }
  if (normAns(a.stem) !== normAns(b.stem)) flags.add('stem');
  if (a.type !== b.type) flags.add('type');
  if (a.options.length !== b.options.length || a.options.some((o, i) => normAns(o) !== normAns(b.options[i]))) flags.add('options');
  if (!keyEq(ansKey(a.type, a.mine), ansKey(a.type, b.mine)) && (a.mine || b.mine)) flags.add('mine');
  if (!keyEq(ansKey(a.type, a.answer), ansKey(a.type, b.answer)) && (a.answer || b.answer)) flags.add('answer');
  if (a.mark !== b.mark) flags.add('mark');
  return flags;
}
async function cropQ(img, box) {
  if (!img) return null; if (!box) return img;
  try {
    const bm = await createImageBitmap(img), W = bm.width, H = bm.height, m = 12;
    const x = Math.max(0, box[0] / 1000 * W - m), y = Math.max(0, box[1] / 1000 * H - m), w = Math.min(W - x, (box[2] - box[0]) / 1000 * W + 2 * m), hh = Math.min(H - y, (box[3] - box[1]) / 1000 * H + 2 * m);
    const sc = Math.min(1, 1400 / w), cv = document.createElement('canvas'); cv.width = Math.round(w * sc); cv.height = Math.round(hh * sc);
    cv.getContext('2d').drawImage(bm, x, y, w, hh, 0, 0, cv.width, cv.height);
    return await new Promise(r => cv.toBlob(r, 'image/jpeg', .85));
  } catch { return img; }
}
async function startCapture({ course, scope, imgs, text }) {
  Cap.urls.forEach(u => URL.revokeObjectURL(u));
  Object.assign(Cap, { qs: [], course, scope, imgs, urls: [], stage: 'recog', total: '', defSec: '', err: '' });
  go('capture');
  const c = capCourse(course); Cap.course = c.id;
  try {
    const p = recogPrompt(c, imgs.length, text), opt = { cache: false, ...(imgs.length ? { images: imgs } : {}) };
    const [r1, r2] = await Promise.allSettled([AI.fn.json(p, opt), AI.fn.json(p, opt)]);
    if (r1.status !== 'fulfilled' && r2.status !== 'fulfilled') throw r1.reason;
    const A = (r1.status === 'fulfilled' ? r1.value : r2.value)?.questions || [], B = r1.status === 'fulfilled' && r2.status === 'fulfilled' ? r2.value?.questions || [] : null;
    const qa = A.map(q => cleanQ(q, c, imgs.length)).filter(q => q.stem), qb = B ? B.map(q => cleanQ(q, c, imgs.length)).filter(q => q.stem) : null;
    for (let i = 0; i < qa.length; i++) {
      const a = qa[i], b = qb ? qb.find(x => x.page === a.page && x.no && x.no === a.no) || (qb.length === qa.length ? qb[i] : null) : null;
      const flags = capCompare(a, b); if (qb && !b) flags.add('once');
      const q = { ...a, flags: [...flags], ok: a.mark ? a.mark === 'right' : scope === 'wrong' ? false : null, ansSrc: a.answer ? 'given' : '', key: ansKey(a.type, a.answer), x: '', del: false };
      if (q.ok == null && q.key && q.mine) q.ok = keyEq(ansKey(q.type, q.mine), q.key);
      q.blob = imgs.length ? await cropQ(imgs[q.page - 1], q.box) : null; if (q.blob) { q.url = URL.createObjectURL(q.blob); Cap.urls.push(q.url); }
      Cap.qs.push(q);
    }
    const cnt = {}; Cap.qs.forEach(q => q.sec && (cnt[q.sec] = (cnt[q.sec] || 0) + 1));
    Cap.defSec = Object.entries(cnt).sort((x, y) => y[1] - x[1])[0]?.[0] || (S().cur[c.id] && capSecs(c.id).some(s => s.id === S().cur[c.id]) ? S().cur[c.id] : (nextSection(c) || capSecs(c.id)[0])?.id || '');
    Cap.qs.forEach(q => { if (!q.sec) q.sec = Cap.defSec; });
    Cap.stage = Cap.qs.length ? 'solve' : 'done'; if (!Cap.qs.length) Cap.err = '没有识别出题目';
  } catch (e) { Cap.stage = 'done'; Cap.err = AI.err(e); }
  capRedraw();
  for (const q of Cap.qs) {
    if (Cap.stage !== 'solve') break; if (q.key) continue;
    q.solving = true; capRedraw(q);
    try {
      const r = await solveBlind({ t: q.type, q: q.stem, o: q.type === 'choice' || q.type === 'multi' ? q.options : undefined }, 3);
      if (r.key && r.agree >= 2) { q.key = r.key; q.answer = String(r.raw ?? ''); q.ansSrc = 'ai' + r.agree; q.x = r.x; if (q.ok == null && q.mine) q.ok = keyEq(ansKey(q.type, q.mine), q.key); }
      else q.ansSrc = 'unsure';
    } catch { q.ansSrc = 'unsure'; }
    q.solving = false; capRedraw(q);
  }
  if (Cap.stage === 'solve') Cap.stage = 'done'; capRedraw();
}
const capOnPage = () => Nav.stack[Nav.stack.length - 1]?.view === 'capture';
function capRedraw(q) {
  if (!capOnPage()) return;
  if (q) { const el = $(`[data-cq="${Cap.qs.indexOf(q)}"]`); if (el) { el.outerHTML = capCard(q, Cap.qs.indexOf(q)); bindCapCard($(`[data-cq="${Cap.qs.indexOf(q)}"]`)); } capFoot(); return; }
  refresh();
}
const capFlag = (q, f) => q.flags.includes(f) ? 'flag' : '';
function capCard(q, i) {
  if (q.del) return `<div data-cq="${i}" hidden></div>`;
  const secs = capSecs(Cap.course), opt = q.type === 'choice' || q.type === 'multi';
  const src = q.solving ? `<span class="pill acc"><span class="spin" style="width:12px;height:12px;border-width:2px"></span>AI 解答</span>` : q.ansSrc === 'given' ? `<span class="pill good">${ico('check')}给定</span>` : q.ansSrc === 'ai3' ? `<span class="pill good">${ico('spark')}3/3</span>` : q.ansSrc === 'ai2' ? `<span class="pill warn">${ico('spark')}2/3</span>` : q.ansSrc === 'unsure' ? `<span class="pill bad">${ico('alert')}待确认</span>` : q.ansSrc === 'me' ? `<span class="pill">${ico('edit')}</span>` : '';
  return `<article class="card capq ${q.ok === false ? 'wrong' : ''}" data-cq="${i}">
    ${q.url ? `<button class="cap-img" data-zoom aria-label="查看原图"><img alt="原题" src="${q.url}"></button>` : ''}
    <div class="cap-f">
      <div class="cap-row"><span class="pill">${q.no ? '第 ' + esc(q.no) + ' 题' : '#' + (i + 1)}</span><select class="inp sm ${capFlag(q, 'type')}" data-f="type">${Object.entries(CAP_TYPES).map(([k, l]) => `<option value="${k}" ${q.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select>${q.flags.includes('once') ? `<span class="pill warn" title="只识别成功一次，没有复核">${ico('eye')}1×</span>` : ''}<span class="grow"></span><button class="ibtn" data-del aria-label="删除这题">${ico('trash')}</button></div>
      <textarea class="inp ${capFlag(q, 'stem')}" data-f="stem" rows="3">${esc(q.stem)}</textarea>
      ${opt ? `<div class="cap-opts ${capFlag(q, 'options')}">${q.options.map((o, j) => `<label><b>${String.fromCharCode(65 + j)}</b><input class="inp sm" data-o="${j}" value="${esc(o)}"></label>`).join('')}<button class="btn ghost sm" data-addo>${ico('plus')}</button></div>` : ''}
      <div class="cap-row"><label class="cap-k ${capFlag(q, 'answer')}"><span>${ico('check')}</span><input class="inp sm" data-f="answer" value="${esc(q.answer)}" placeholder="答案"></label>${src}</div>
      <div class="cap-row"><label class="cap-k ${capFlag(q, 'mine')}"><span>${ico('pen')}</span><input class="inp sm" data-f="mine" value="${esc(q.mine)}" placeholder="我的作答"></label><div class="seg cap-ok ${capFlag(q, 'mark')}"><button data-ok="1" aria-pressed="${q.ok === true}" aria-label="做对了">${ico('check')}</button><button data-ok="0" aria-pressed="${q.ok === false}" aria-label="做错了">${ico('x')}</button></div></div>
      <select class="inp sm" data-f="sec">${secs.map(s => `<option value="${s.id}" ${q.sec === s.id ? 'selected' : ''}>${esc(CHAPS.get(s.chap).title)} · ${esc(s.title)}</option>`).join('')}</select>
      ${q.x ? `<details class="cap-x"><summary>${ico('spark')}AI 解答</summary><div class="md">${md(q.x)}</div></details>` : ''}
    </div></article>`;
}
function bindCapCard(el) {
  if (!el || el.hidden) return; const i = +el.dataset.cq, q = Cap.qs[i];
  $$('[data-f]', el).forEach(inp => {
    const f = inp.dataset.f;
    inp.oninput = inp.onchange = () => {
      q[f] = inp.value; q.flags = q.flags.filter(x => x !== f);
      if (f === 'answer') { q.key = ansKey(q.type, q.answer); q.ansSrc = q.answer ? 'me' : ''; }
      if ((f === 'answer' || f === 'mine') && q.key && q.mine) q.ok = keyEq(ansKey(q.type, q.mine), q.key);
      if (f === 'type') { q.key = ansKey(q.type, q.answer); capRedraw(q); return; }
      if (f === 'answer' || f === 'mine') { $$('[data-ok]', el).forEach(b => b.setAttribute('aria-pressed', String(q.ok === (b.dataset.ok === '1')))); el.classList.toggle('wrong', q.ok === false); capFoot(); }
    };
  });
  $$('[data-o]', el).forEach(inp => inp.oninput = () => { q.options[+inp.dataset.o] = inp.value; q.flags = q.flags.filter(x => x !== 'options'); });
  $('[data-addo]', el)?.addEventListener('click', () => { q.options.push(''); capRedraw(q); });
  $$('[data-ok]', el).forEach(b => b.onclick = () => { const v = b.dataset.ok === '1'; q.ok = q.ok === v ? null : v; q.flags = q.flags.filter(x => x !== 'mark'); capRedraw(q); });
  $('[data-del]', el).onclick = () => { q.del = true; capRedraw(q); };
  $('[data-zoom]', el)?.addEventListener('click', () => imgSheet(q.url));
}
function imgSheet(url) { sheet('原题', h(`<div class="img-full"><img alt="原题" src="${url}"></div>`)); }
function capFoot() {
  const f = $('#cap-foot'); if (!f) return;
  const live = Cap.qs.filter(q => !q.del), w = live.filter(q => q.ok === false).length, unk = live.filter(q => q.ok == null).length;
  f.innerHTML = Cap.stage === 'recog' ? '' : `${Cap.scope === 'wrong' ? `<label class="cap-total"><span>这次共</span><input class="inp sm" id="cap-total" inputmode="numeric" value="${esc(Cap.total)}" placeholder="${live.length}"><span>题</span></label>` : ''}<div class="cap-sum"><span>${ico('check')}<b class="num">${live.length - w - unk}</b></span><span class="bad">${ico('x')}<b class="num">${w}</b></span>${unk ? `<span class="warn">${ico('alert')}<b class="num">${unk}</b></span>` : ''}</div><button class="btn pri" id="cap-save" ${live.length && Cap.stage !== 'solve' ? '' : 'disabled'}>${Cap.stage === 'solve' ? '<span class="spin"></span>' : ico('check')}入库 <span class="num">${live.length}</span></button>`;
  $('#cap-total')?.addEventListener('input', e => Cap.total = e.target.value);
  $('#cap-save')?.addEventListener('click', capCommit);
}
function viewCapture() {
  const v = $('#view'), c = COURSES.get(Cap.course);
  v.innerHTML = appbar('') + `<div class="wrap"><div class="stack cap-wrap">
    <header style="padding:4px 4px 0"><div class="eyebrow" style="color:${c?.color || 'var(--accent)'}">${esc(c?.title || '')}</div><h1 class="phead">录题</h1></header>
    ${Cap.stage === 'recog' ? `<div class="card"><div class="prog"><span class="spin"></span>${ico('scan')}识别中 · ${ico('eye')}2×</div></div>` : ''}
    ${Cap.err ? `<div class="card empty-s">${ico('alert')}${esc(Cap.err)}</div>` : ''}
    ${Cap.qs.map(capCard).join('')}
    <div class="cap-foot" id="cap-foot"></div>
  </div></div>`;
  $('[data-back]', v).onclick = async () => { if (Cap.qs.some(q => !q.del) && !Cap.saved && !await confirmBox('放弃录入', '识别结果还没有入库。', '放弃', true)) return; Cap.stage = 'done'; back(); };
  $$('[data-cq]', v).forEach(bindCapCard); capFoot();
}
/* 入库：题目进入小节练习（标记为录入，保存原图），同时写一条纸上作答记录，并进入复习和错题本 */
async function capCommit() {
  const live = Cap.qs.filter(q => !q.del && q.stem.trim()); if (!live.length) return;
  const btn = $('#cap-save'); if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; }
  const bySec = new Map(), now = Date.now(), recs = [];
  for (const q of live) {
    const sid = SECS.has(q.sec) ? q.sec : Cap.defSec; if (!SECS.has(sid)) continue;
    const opt = q.type === 'choice' || q.type === 'multi', key = q.key, known = !!key && (!opt || key.split(',').every(n => +n < q.options.length));
    let it;
    if (known && q.type === 'choice') it = { t: 'choice', q: q.stem, o: q.options, a: +key.split(',')[0] };
    else if (known && q.type === 'multi') it = { t: 'multi', q: q.stem, o: q.options, a: key.split(',').map(Number) };
    else if (known && q.type === 'tf') it = { t: 'tf', q: q.stem, a: key === 'true' };
    else it = { t: 'qa', q: q.stem + (opt && q.options.length ? '\n\n' + q.options.map((o, j) => `${String.fromCharCode(65 + j)}. ${o}`).join('\n') : ''), a: known ? q.answer : '答案待确认', ...(known ? {} : { unk: 1 }) };
    if (it.t === 'multi' && it.a.length === 1) { it.t = 'choice'; it.a = it.a[0]; }
    Object.assign(it, { pr: 1, src: 'import', ...(q.x ? { x: q.x } : {}) });
    const base = `${sid}-${h36(sid + it.t + String(it.q).split('\n')[0])}`, dup = ITEMS.get(base);
    if (dup && normAns(dup.q) === normAns(it.q)) { recs.push({ it: dup, q }); continue; }
    it.id = ITEMS.has(base) ? base + 'r' + now.toString(36).slice(-4) : base;
    if (q.blob) { try { it.img = await Files.put(q.blob, 'image/jpeg'); } catch {} }
    (bySec.get(sid) || bySec.set(sid, []).get(sid)).push(it); recs.push({ it, q });
  }
  for (const [sid, items] of bySec) saveItems(sid, items);
  const touched = new Set();
  for (const { it: x, q } of recs) {
    const it = ITEMS.get(x.id); if (!it) continue; touched.add(it.course);
    if (q.ok == null) continue;
    const mine = q.mine ? (it.t === 'choice' || it.t === 'multi' ? ansKey(it.t, q.mine)?.split(',').map(Number) : it.t === 'tf' ? ansKey('tf', q.mine) === 'true' : q.mine) : undefined;
    attPaper({ it, ok: q.ok, ans: mine, t: now });
    const st = getSt(it); if (!st) setSt(it, schedule(null, q.ok ? 3 : 1, now)); else if (!q.ok) setSt(it, schedule(st, 1, now));
  }
  if (Cap.scope === 'wrong' && +Cap.total > live.length) attPaperCount({ sec: Cap.defSec, right: +Cap.total - live.length, wrong: 0, t: now });
  touched.forEach(saveSrs); Cap.saved = true; logEvent(`录题 ${recs.length} 道`); saveState();
  toast(`已入库 ${recs.length} 道`); Cap.stage = 'done';
  Nav.stack.pop(); go('wrongbook', { course: Cap.course });
}
