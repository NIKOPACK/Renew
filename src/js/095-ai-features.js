/* ============ AI 功能 ============ */
async function genDetail(p) {
  const it = p.it, sec = SECS.get(it.sec), c = COURSES.get(it.course);
  const btn = $(`[data-pk="${p.pk}"] [data-act="gen-d"]`); if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>生成中…'; }
  try {
    const { text } = await AI.fn(`你是「${c.title}」的老师。为下面这个知识点写「详解」，帮助学生真正理解：讲清原理或原因，给出例子，指出易错点。300~600 字，Markdown，公式用 $...$，表格不超过 4 列。只输出详解正文。\n小节：${sec.title}\n知识点：${it.title}\n要点：\n${it.q}`, { cache: false });
    patchItem(it, { d: text.trim() }); p.open = true; rerender(p); toast('详解已保存');
  } catch (e) { toast(AI.err(e)); rerender(p); }
}
async function fixItem(p) {
  const it = p.it;
  if (!AI.ok) { if (await confirmBox('隐藏这张卡', '当前无法调用 AI 修正，先隐藏这张卡？之后可以在设置里恢复。', '隐藏')) { removeItem(it); $(`[data-pk="${p.pk}"]`)?.remove(); } return; }
  const body = h(`<div style="display:flex;flex-direction:column;gap:12px"><label class="field"><span>哪里有问题？</span><textarea class="inp" id="fx-in" placeholder="例如：答案应该是 C；解答没讲清楚为什么；公式显示不对…"></textarea></label><button class="btn pri" id="fx-go">${ico('wand')}让 AI 核对并修正</button><div id="fx-out"></div></div>`);
  const s = sheet('修正内容', body);
  $('#fx-go', body).onclick = async () => {
    const out = $('#fx-out', body); out.innerHTML = '<div class="prog"><span class="spin"></span>AI 正在核对…</div>';
    try {
      const { text } = await AI.fn(`下面是学习 App 里的一张卡片，用户反馈：「${$('#fx-in', body).value.trim() || '可能有错误或不清楚'}」。请先核对内容是否正确，再输出修正后的这一张卡片，保持同样的格式（只输出卡片本身）。即使原卡没有错，也按反馈改得更清楚。\n\n${DSL_SPEC}\n\n原卡片：\n${itemToDSL(it)}`, { cache: false });
      const nc = parseDSL(text, it.sec, 'f').items[0];
      if (!nc) { out.innerHTML = `<p class="small" style="color:var(--bad)">没能解析修正结果，请再试一次。</p>`; return; }
      delete nc.id;
      out.innerHTML = `<div class="panel open"><div class="ph2">${ico('edit')}修正后</div><div class="pb md">${nc.title ? `<p><strong>${esc(nc.title)}</strong></p>` : ''}${md(nc.q)}${nc.o ? '<p>' + nc.o.map((o, i) => `${String.fromCharCode(65 + i)}. ${md(o, { inline: true })}`).join('<br>') + '</p>' : ''}${ansText(nc) ? `<p>答案：${ansText(nc)}</p>` : ''}${nc.d ? md(nc.d) : ''}${nc.x ? md(nc.x) : ''}</div></div><button class="btn pri block" id="fx-save" style="margin-top:10px">用修正版替换</button>`;
      $('#fx-save', out).onclick = () => { const keep = ['t', 'title', 'q', 'd', 'o', 'a', 'x', 'st', 'imp']; const f = {}; keep.forEach(k => { if (nc[k] !== undefined) f[k] = nc[k]; }); patchItem(it, f); s.close(); rerender(p); toast('已替换为修正版'); logEvent('AI 修正 ' + it.id); saveState(); };
    } catch (e) { out.innerHTML = `<p class="small" style="color:var(--bad)">${esc(AI.err(e))}</p>`; }
  };
}
function materialPicker(box) {
  const st = { src: MATS.size ? 'lib' : 'text', text: '', images: [], pageImages: [], mat: [...MATS.values()].sort((a, b) => b.createdAt - a.createdAt)[0]?.id, a: 1, b: 5 };
  box.innerHTML = `<div class="field"><span>教材资料（可选）</span><div class="seg" id="mp-src">${MATS.size ? `<button data-s="lib" aria-pressed="true">资料库</button>` : ''}<button data-s="text" aria-pressed="${!MATS.size}">文字</button><button data-s="file" aria-pressed="false">文件</button><button data-s="img" aria-pressed="false">拍照</button><button data-s="none" aria-pressed="false">不提供</button></div></div><div id="mp-in"></div>`;
  const draw = () => {
    const el = $('#mp-in', box);
    if (st.src === 'lib') {
      const m = MATS.get(st.mat);
      el.innerHTML = `<select class="inp" id="mp-m">${[...MATS.values()].sort((a, b) => b.createdAt - a.createdAt).map(x => `<option value="${x.id}" ${x.id === st.mat ? 'selected' : ''}>${esc(x.name)}（${x.pages} ${x.kind === 'text' ? '段' : '页'}）</option>`).join('')}</select><div class="row" style="margin-top:10px"><label class="field grow"><span>从第几页</span><input class="inp" id="mp-a" inputmode="numeric" value="${st.a}"></label><label class="field grow"><span>到第几页</span><input class="inp" id="mp-b" inputmode="numeric" value="${Math.min(st.b, m?.pages || 1)}"></label></div><div class="small" style="margin-top:6px">${m?.scanned ? '扫描版：会把这几页的图片发给 AI（最多 ' + (AI.limits?.images?.maxCount || 5) + ' 页）。' : '会把这几页提取的文字发给 AI。'}</div>`;
      $('#mp-m', el).onchange = e => { st.mat = e.target.value; draw(); }; $('#mp-a', el).onchange = e => st.a = Math.max(1, +e.target.value || 1); $('#mp-b', el).onchange = e => st.b = Math.max(1, +e.target.value || 1);
    }
    if (st.src === 'text') { el.innerHTML = `<textarea class="inp" id="mp-t" placeholder="粘贴这一节的教材内容（建议 1~5 页）">${esc(st.text)}</textarea>`; $('#mp-t', el).oninput = e => st.text = e.target.value; }
    if (st.src === 'file') { el.innerHTML = `<input type="file" accept=".pdf,.txt,.md,text/plain,application/pdf" class="inp" id="mp-f"><div id="mp-pdf"></div><div class="small" id="mp-msg">${st.text ? `已读取 ${st.text.length} 字` : 'PDF 在本机提取文字；扫描版可以把页面转成图片发给 AI。'}</div>`; $('#mp-f', el).onchange = e => readFile(e.target.files[0], st, el); }
    if (st.src === 'img') { const lim = AI.limits?.images; el.innerHTML = lim ? `<input type="file" accept="${lim.mediaTypes.join(',')}" multiple class="inp" id="mp-i"><div class="thumbs" id="mp-th"></div><div class="small">一次最多 ${lim.maxCount} 张，书页尽量拍平拍清楚。</div>` : `<p class="small" style="margin:0">${AI.ok ? '当前模型不支持图片，请改用文字或 PDF，或在设置里换成支持图片的模型。' : esc(AI.need)}</p>`; const fi = $('#mp-i', el); if (fi) fi.onchange = e => { st.images = [...e.target.files].slice(0, lim.maxCount); $('#mp-th', el).innerHTML = st.images.map(f => `<img alt="" src="${URL.createObjectURL(f)}">`).join(''); }; }
    if (st.src === 'none') el.innerHTML = `<p class="small" style="margin:0">AI 会依据该课程的标准知识体系编写。提供教材原文会更贴合你的书。</p>`;
  };
  $$('#mp-src button', box).forEach(b => b.onclick = () => { st.src = b.dataset.s; $$('#mp-src button', box).forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); });
  draw();
  return async () => {
    if (st.src === 'lib') {
      const m = MATS.get(st.mat); if (!m) return { text: '', images: [] };
      const a = Math.min(st.a, st.b), b = Math.max(st.a, st.b), pages = await matPages(m), sl = pages.slice(a - 1, b);
      if (sl.join('').trim().length > 80) return { text: sl.map((t, i) => `【第${a + i}页】\n${t}`).join('\n\n').slice(0, 60000), images: [] };
      return { text: '', images: await matPageImages(m, a, b, AI.limits?.images?.maxCount || 5) };
    }
    return { text: ['text', 'file'].includes(st.src) ? st.text.slice(0, 60000) : '', images: st.src === 'img' ? st.images : st.src === 'file' ? st.pageImages : [] };
  };
}
async function readFile(file, st, el) {
  if (!file) return; const msg = $('#mp-msg', el);
  if (!/\.pdf$/i.test(file.name)) { st.text = await file.text(); msg.textContent = `已读取 ${st.text.length} 字`; return; }
  msg.textContent = '正在加载 PDF 解析器…';
  try {
    await ensurePdfJs();
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise, n = pdf.numPages;
    $('#mp-pdf', el).innerHTML = `<div class="row" style="margin-top:10px"><label class="field grow"><span>起始页</span><input class="inp" id="pa" inputmode="numeric" value="1"></label><label class="field grow"><span>结束页</span><input class="inp" id="pb" inputmode="numeric" value="${Math.min(n, 5)}"></label></div><div class="acts" style="margin-top:10px"><button class="btn sm" id="ptx">提取文字</button><button class="btn sm" id="pim">转成图片</button></div>`;
    msg.textContent = `共 ${n} 页，选好页码范围（建议一次一节、5 页以内）。`;
    const range = () => { const a = Math.max(1, +$('#pa', el).value || 1); return [a, Math.min(n, Math.max(a, +$('#pb', el).value || a))]; };
    $('#ptx', el).onclick = async () => { const [a, b] = range(); let t = ''; msg.textContent = '正在提取…'; for (let i = a; i <= b; i++) { const tc = await (await pdf.getPage(i)).getTextContent(); t += tc.items.map(x => x.str + (x.hasEOL ? '\n' : '')).join('') + '\n\n'; } st.text = t.trim(); st.pageImages = []; msg.textContent = st.text.replace(/\s/g, '').length > 50 ? `已提取第 ${a}-${b} 页，共 ${st.text.length} 字` : '几乎没有提取到文字，可能是扫描版，请用「转成图片」。'; };
    $('#pim', el).onclick = async () => {
      const lim = AI.limits?.images; if (!lim) { msg.textContent = '当前环境不能发送图片。'; return; }
      let [a, b] = range(); b = Math.min(b, a + lim.maxCount - 1); msg.textContent = '正在渲染页面…'; st.pageImages = []; st.text = '';
      for (let i = a; i <= b; i++) { const pg = await pdf.getPage(i), vp = pg.getViewport({ scale: 1 }), v2 = pg.getViewport({ scale: Math.min(2, 1400 / vp.width) }); const cv = document.createElement('canvas'); cv.width = v2.width; cv.height = v2.height; await pg.render({ canvasContext: cv.getContext('2d'), viewport: v2 }).promise; st.pageImages.push(await new Promise(r => cv.toBlob(r, 'image/jpeg', .85))); }
      msg.textContent = `已把第 ${a}-${b} 页转成 ${st.pageImages.length} 张图片，生成时一起发给 AI。`;
    };
  } catch (e) { msg.textContent = 'PDF 无法解析：' + (e.message || e); }
}
function genSheet({ sid, kpN, qN, focus = '', weak = false }) {
  const sec = SECS.get(sid), c = COURSES.get(sec.course), ch = CHAPS.get(sec.chap), empty = !secItems(sec).length;
  kpN ??= empty ? Math.max(3, Math.min(8, sec.points.length || 4)) : 2; qN ??= empty ? 4 : 3;
  const body = h(`<div style="display:flex;flex-direction:column;gap:14px">
    <div class="small" style="margin:0">${esc(c.title)} · ${esc(ch.title)} · <b style="color:var(--ink)">${esc(sec.title)}</b></div>
    <div id="g-mat"></div>
    <div class="row"><label class="field grow"><span>知识点卡</span><select class="inp" id="g-k">${[0, 2, 3, 4, 5, 6, 8, 10].map(n => `<option ${n === kpN ? 'selected' : ''}>${n}</option>`).join('')}</select></label><label class="field grow"><span>练习题</span><select class="inp" id="g-q">${[0, 2, 3, 4, 5, 6, 8, 10].map(n => `<option ${n === qN ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
    <label class="field"><span>侧重（可选）</span><input class="inp" id="g-f" value="${esc(focus)}" placeholder="例如：多出辨析题；侧重某个概念"></label>
    <div class="acts"><button class="btn pri" id="g-go">${ico('wand')}${AI.ok ? '生成' : '复制提示词'}</button><button class="btn" id="g-stop" hidden>${ico('stop')}停止</button></div><div id="g-out"></div></div>`);
  const s = sheet(empty ? '生成本节内容' : 'AI 补充内容', body), getMat = materialPicker($('#g-mat', body));
  let ctl = null; s.onclose = () => ctl?.abort(); $('#g-stop', body).onclick = () => ctl?.abort();
  $('#g-go', body).onclick = async () => {
    let m; try { m = await getMat(); } catch (e) { return toast(e.message || '资料读取失败'); }
    const existing = secItems(sec).map(x => x.title || plain(x.q).slice(0, 18)).join('；');
    const weakTxt = weak ? secItems(sec).filter(x => getSt(x)?.lapses).slice(0, 10).map(itemToDSL).join('\n\n') : '';
    const prompt = genPrompt({ course: c, chap: ch, sec, kpN: +$('#g-k', body).value, qN: +$('#g-q', body).value, focus: $('#g-f', body).value.trim(), material: m.text, existing, weak: weakTxt, hasImages: m.images.length > 0 });
    if (!AI.ok) return copyText(prompt, '提示词已复制，把 AI 的回复粘贴到「导入卡片文本」即可。');
    const out = $('#g-out', body), go = $('#g-go', body), stop = $('#g-stop', body);
    out.innerHTML = `<div class="prog"><span class="spin"></span>AI 正在阅读资料并编写…（通常 30 秒到 2 分钟）</div>`; go.disabled = true; stop.hidden = false; ctl = new AbortController();
    try {
      const { text, truncated } = await AI.fn(prompt, { signal: ctl.signal, ...(m.images.length ? { images: m.images } : {}), cache: false, onText: ({ text }) => { $('.prog', out) && ($('.prog', out).innerHTML = `<span class="spin"></span>已写好 ${(text.match(/^::/gm) || []).length} 张…`); } });
      showGenerated(out, parseDSL(text, sid), sec, truncated, s);
    } catch (e) { out.innerHTML = `<p class="small" style="color:var(--bad)">${esc(AI.err(e))}</p>`; if (e?.text) { const r = parseDSL(e.text, sid); if (r.items.length) showGenerated(out, r, sec, true, s); } }
    go.disabled = false; stop.hidden = true;
  };
}
function showGenerated(out, res, sec, truncated, s) {
  if (!res.items.length) { out.innerHTML = `<p class="small" style="color:var(--bad)">没有解析出内容。${res.errors.slice(0, 3).map(esc).join('；')}</p>`; return; }
  const kp = res.items.filter(x => x.t === 'kp').length;
  out.innerHTML = `<div class="row" style="margin-bottom:8px"><b class="grow">生成了 ${kp} 个知识点、${res.items.length - kp} 道练习</b></div>${truncated ? '<p class="small">回复被截断，最后一张可能不完整。</p>' : ''}${res.errors.length ? `<p class="small">有 ${res.errors.length} 张格式不对，已跳过。</p>` : ''}
  <div class="gen-list">${res.items.map((it, i) => `<label class="gen-item"><input type="checkbox" checked data-i="${i}"><div class="grow"><div class="ptype ${isQ(it) ? 'q' : ''}" style="margin:0 0 4px">${TYPE_LABEL[it.t]}</div><div class="md">${it.title ? `<strong>${esc(it.title)}</strong>` : ''}${md(it.q.length > 300 ? it.q.slice(0, 300) + '…' : it.q)}</div>${it.d || it.x ? `<div class="small" style="margin-top:4px">含${it.d ? '详解' : '解答'} · ${(it.d || it.x).length} 字</div>` : ''}</div></label>`).join('')}</div>
  <button class="btn pri block" id="g-save" style="margin-top:12px">${ico('check')}保存到「${esc(sec.title)}」</button>`;
  $('#g-save', out).onclick = () => {
    const picked = $$('input[data-i]:checked', out).map(x => res.items[+x.dataset.i]); if (!picked.length) return toast('没有勾选内容');
    saveItems(sec.id, picked); s.close(); toast(`已保存 ${picked.length} 个`); logEvent(`生成 ${picked.length} 个内容到 ${sec.title}`); saveState(); refresh();
  };
}
function importSheet(sid) {
  const body = h(`<div style="display:flex;flex-direction:column;gap:12px"><label class="field"><span>卡片文本（:: 开头的格式，可从其他 AI 复制回来）</span><textarea class="inp" id="im-t" style="min-height:220px"></textarea></label><div class="acts"><button class="btn pri" id="im-go">解析</button><button class="btn" id="im-spec">复制格式说明</button></div><div id="im-out"></div></div>`);
  const s = sheet('导入到「' + SECS.get(sid).title + '」', body);
  $('#im-spec', body).onclick = () => copyText(DSL_SPEC, '格式说明已复制');
  $('#im-go', body).onclick = () => showGenerated($('#im-out', body), parseDSL($('#im-t', body).value, sid, 'i'), SECS.get(sid), false, s);
}
function batchGenSheet(c) {
  const empties = courseSecs(c).filter(s => secStatus(s) === 'empty');
  const body = h(`<div style="display:flex;flex-direction:column;gap:12px"><p class="small" style="margin:0">${empties.length} 个空小节，每节约 1 分钟，可随时停止。</p><div class="menu" id="bg-list">${empties.map(s => `<button data-s="${s.id}" disabled><span class="sti" data-s="empty"></span><span class="grow">${esc(s.title)}<small>等待</small></span></button>`).join('')}</div><div class="acts"><button class="btn pri" id="bg-go">${ico('wand')}开始生成</button><button class="btn" id="bg-stop" hidden>${ico('stop')}停止</button></div></div>`);
  const s = sheet('AI 生成「' + c.title + '」', body); let ctl = null, stopped = false;
  s.onclose = () => { stopped = true; ctl?.abort(); refresh(); };
  $('#bg-stop', body).onclick = () => { stopped = true; ctl?.abort(); };
  $('#bg-go', body).onclick = async () => {
    if (!AI.require()) return;
    $('#bg-go', body).hidden = true; $('#bg-stop', body).hidden = false; stopped = false;
    for (const sec of empties) {
      if (stopped) break; const row = $(`[data-s="${sec.id}"] small`, body); if (secItems(sec).length) { row.textContent = '已有内容'; continue; }
      row.innerHTML = '<span class="spin" style="width:14px;height:14px;border-width:2px"></span> 生成中'; ctl = new AbortController();
      try {
        const { text } = await AI.fn(genPrompt({ course: c, chap: CHAPS.get(sec.chap), sec, kpN: Math.max(3, Math.min(8, sec.points.length || 4)), qN: 4 }), { signal: ctl.signal, cache: false });
        const r = parseDSL(text, sec.id); if (r.items.length) { saveItems(sec.id, r.items); row.textContent = `完成：${r.items.length} 个`; $(`[data-s="${sec.id}"] .sti`, body).dataset.s = 'todo'; } else row.textContent = '没有解析出内容';
      } catch (e) { row.textContent = AI.err(e); if (e?.code === 'cancelled' || e?.code === 'not_granted') break; if (e?.code === 'rate_limited') await sleep(8000); }
    }
    $('#bg-stop', body).hidden = true; toast('批量生成结束'); logEvent('批量生成 ' + c.title);
  };
}
