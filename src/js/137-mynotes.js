/* ============ 我的笔记：自己写的感悟与总结（AI 帮写、润色、扩写、提炼要点、配图） ============ */
/* 每篇笔记一个文档 note/<id>：{ id, course, sec, title, body(Markdown), imgs: { key: 文件引用 }, created, updated }
   正文里用单独一行 ![说明](img:key) 引用配图；图片文件存在本机文件区（claude.ai 中存云端文件区）。 */
const Notes = {
  all: () => Store.keys('note/').map(k => Store.get(k)).filter(n => n && n.id),
  of: (cid, sid) => Notes.all().filter(n => n.course === cid && (!sid || n.sec === sid)).sort((a, b) => b.updated - a.updated),
  get: id => Store.get('note/' + id),
  create({ course, sec = null, title = '', body = '' }) {
    const t = Date.now(), n = { id: 'n' + t.toString(36) + Math.random().toString(36).slice(2, 5), course, sec, title, body, imgs: {}, created: t, updated: t };
    Store.put('note/' + n.id, n); return n;
  },
  save(n) { n.updated = Date.now(); Store.put('note/' + n.id, n); },
  empty: n => !n.title.trim() && !n.body.trim() && !Object.keys(n.imgs || {}).length,
  del(n) { for (const r of Object.values(n.imgs || {})) Files.del(r); Store.drop('note/' + n.id); }
};
const cardNotes = (c, sec) => (sec ? [sec] : courseSecs(c)).flatMap(s => secItems(s)).filter(it => S().notes?.[it.id]);
const fmtWhen = t => { const d = new Date(t), now = new Date(); const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; return d.toDateString() === now.toDateString() ? '今天 ' + hm : d.getFullYear() === now.getFullYear() ? `${d.getMonth() + 1}月${d.getDate()}日` : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; };
const IMG_MARK = /^!\[([^\]\n]*)\]\(img:([\w-]+)\)[ \t]*$/m;
const noteSnippet = n => plain(String(n.body || '').replace(new RegExp(IMG_MARK.source, 'gm'), '')).replace(/\s+/g, ' ').trim().slice(0, 90);
const noteFirstImg = n => { const m = String(n.body || '').match(IMG_MARK); return m && n.imgs?.[m[2]] ? m[2] : Object.keys(n.imgs || {})[0]; };
/* 正文 → HTML：按图片标记切开，图片位置放占位，之后异步填充 */
function noteHTML(n) {
  const parts = String(n.body || '').split(new RegExp(IMG_MARK.source, 'm' + 'g')); let out = '';
  for (let i = 0; i < parts.length; i += 3) {
    if (parts[i].trim()) out += md(parts[i]);
    if (i + 2 < parts.length && n.imgs?.[parts[i + 2]]) { const alt = parts[i + 1]; out += `<figure class="nfig"><img data-nimg="${esc(parts[i + 2])}" alt="${esc(alt || '配图')}">${alt && alt !== '配图' ? `<figcaption>${esc(alt)}</figcaption>` : ''}</figure>`; }
  }
  return out || '<p class="small">还没有内容</p>';
}
const IMG_URLS = new Map();
async function noteImgSrc(ref) {
  if (!ref) return ''; if (ref.u) return ref.u;
  const k = JSON.stringify(ref); if (IMG_URLS.has(k)) return IMG_URLS.get(k);
  const b = await Files.get(ref).catch(() => null), u = b ? URL.createObjectURL(b) : ''; if (u) IMG_URLS.set(k, u); return u;
}
async function hydrateImgs(root, n) { for (const img of $$('img[data-nimg]', root)) { const ref = (n.imgs || {})[img.dataset.nimg]; const src = await noteImgSrc(ref); if (src) img.src = src; else img.closest('.nfig,.nth')?.classList.add('miss'); } }
/* 图片压缩：长边不超过 max，转 JPEG，省空间 */
async function shrinkImage(blob, max = 1600) {
  try {
    const bmp = await createImageBitmap(blob), k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (k === 1 && blob.size < 700e3) return blob;
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(bmp, 0, 0, cv.width, cv.height);
    return await new Promise(r => cv.toBlob(b => r(b || blob), 'image/jpeg', .86));
  } catch { return blob; }
}
async function addNoteImage(n, res) {
  const key = 'i' + Date.now().toString(36);
  n.imgs ||= {}; n.imgs[key] = res.blob ? await Files.put(await shrinkImage(res.blob), 'image/jpeg') : { u: res.url };
  Notes.save(n); return key;
}

/* ---- 给 AI 的课程背景：小节知识点、错题、卡片笔记、学习记录 ---- */
function recentSecs(c, k = 3) {
  const out = [];
  for (let i = 0; i < 30 && out.length < k; i++) { const h = S().hist?.[addDays(dayKey(), -i)]; if (!h) continue; for (const sid of Object.keys(h)) { const s = SECS.get(sid); if (s && s.course === c.id && !out.includes(s)) out.push(s); } }
  if (!out.length) { const all = courseSecs(c), learned = all.filter(s => ['learning', 'done'].includes(secStatus(s))); out.push(...(learned.length ? learned.slice(-k) : all.slice(0, 1))); }
  return out.slice(0, k);
}
function noteCtx(n) {
  const c = COURSES.get(n.course); if (!c) return '';
  const secs = n.sec && SECS.has(n.sec) ? [SECS.get(n.sec)] : recentSecs(c), L = [`课程：${c.title}`];
  for (const sec of secs) {
    L.push(`\n## 小节：${sec.title}`);
    secKps(sec).slice(0, 12).forEach(it => L.push(`- 知识点「${plain(it.title || '')}」：${plain(it.q).slice(0, 150)}`));
    const wrong = secItems(sec).filter(it => { const s = getSt(it); return s && s.lapses && !s.cl; });
    if (wrong.length) { L.push('我做错过的题：'); wrong.slice(0, 6).forEach(it => L.push(`- ${plain(it.title || it.q).slice(0, 90)}`)); }
    const cn = secItems(sec).filter(it => S().notes?.[it.id]);
    if (cn.length) { L.push('我写过的卡片笔记：'); cn.slice(0, 6).forEach(it => L.push(`- （${plain(it.title || it.q).slice(0, 30)}）${plain(S().notes[it.id]).slice(0, 160)}`)); }
    const days = []; for (let i = 0; i < 30; i++) { const k = addDays(dayKey(), -i), x = S().hist?.[k]?.[sec.id]; if (x) days.push(`${fmtDay(k)} 新学 ${x[0]}、复习 ${x[1]}${x[3] ? `、答错 ${x[3]}` : ''}`); }
    if (days.length) L.push('学习记录：' + days.slice(0, 5).join('；'));
  }
  return L.join('\n').slice(0, 7000);
}
const cleanAI = t => String(t || '').trim().replace(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/, '$1').trim();
const NOTE_RULES = '只输出笔记正文，不要开场白和结尾客套。使用 Markdown（可以用小标题、列表、**加粗**），公式用 $…$。原文中形如 ![说明](img:xxx) 的图片标记必须原样保留在合适位置；原文里的作图代码块也原样保留。能用图表达的（结构、流程、对比）用作图代码块画出来，少写描述性文字。\n' + VIZ_SPEC;

/* ---- 通用 AI 写作弹层：生成（流式显示）→ 替换 / 插入 ---- */
function aiWriteSheet({ title, form = '', auto = !form, prompt, actions }) {
  const body = h(`<div class="aiw">${form}<div class="aout md" hidden></div><div class="small aimsg"></div><div class="acts aiacts"></div></div>`);
  const s = sheet(title, body), out = $('.aout', body), acts = $('.aiacts', body), msg = $('.aimsg', body);
  let ctl = null, text = '';
  const idle = () => { acts.innerHTML = text ? `<button class="btn" data-a="again">${ico('sync')}重新生成</button>${actions.map((a, i) => `<button class="btn ${a.pri ? 'pri' : ''}" data-a="${i}">${esc(a.label)}</button>`).join('')}` : `<button class="btn pri" data-a="go">${ico('spark')}生成</button>`; };
  const run = async () => {
    if (!AI.require()) return;
    ctl = new AbortController(); text = ''; out.hidden = false; out.innerHTML = '<p class="small"><span class="spin"></span> AI 正在写…</p>'; msg.textContent = '';
    acts.innerHTML = `<button class="btn" data-a="stop">${ico('stop')}停止</button>`;
    let last = 0;
    try {
      const r = await AI.fn(prompt(body), { signal: ctl.signal, cache: false, onText: ({ text: t }) => { text = t; const now = Date.now(); if (now - last > 150) { last = now; out.innerHTML = md(cleanAI(t)); } } });
      text = cleanAI(r?.text || text); out.innerHTML = md(text);
    } catch (e) {
      text = cleanAI(text);
      if (ctl?.signal.aborted || e?.code === 'cancelled') { if (!text) out.hidden = true; }
      else { msg.innerHTML = `<span style="color:var(--bad)">${esc(AI.err(e))}</span>`; if (!text) out.hidden = true; }
    }
    ctl = null; idle();
  };
  acts.onclick = e => { const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a; if (a === 'go' || a === 'again') run(); else if (a === 'stop') ctl?.abort(); else { s.close(); actions[+a].run(text); } };
  s.onclose = () => ctl?.abort();
  idle(); if (auto) run();
  return s;
}

/* ---- 课程「笔记」页的「我的笔记」分页 ---- */
const noteTabs = (c, s, cur) => { const n = Notes.of(c.id, s?.id).length + cardNotes(c, s).length;
  return `<div class="seg ntab"><button data-ntab="read" aria-pressed="${cur === 'read'}">讲义</button><button data-ntab="mine" aria-pressed="${cur === 'mine'}">我的笔记${n ? ` <span class="n">${n}</span>` : ''}</button></div>`; };
function bindNoteTabs(v) { $$('[data-ntab]', v).forEach(b => b.onclick = () => { const top = Nav.stack[Nav.stack.length - 1]; if ((top.params.tab || 'read') === b.dataset.ntab) return; top.params = { ...top.params, tab: b.dataset.ntab, jump: undefined }; top.y = 0; render(false); }); }
function noteCard(n, showCourse) {
  const sec = n.sec && SECS.get(n.sec), k = noteFirstImg(n), sn = noteSnippet(n), c = showCourse && COURSES.get(n.course);
  return `<button class="ncard" data-note="${n.id}"><span class="grow"><b>${esc(n.title.trim() || sn.slice(0, 18) || '无标题笔记')}</b>${sn ? `<p>${esc(sn)}</p>` : ''}<span class="m">${c ? esc(c.title) + ' · ' : ''}${sec ? esc(sec.title) + ' · ' : ''}${fmtWhen(n.updated)}</span></span>${k ? `<span class="nth"><img data-nimg="${esc(k)}" alt=""></span>` : ''}</button>`;
}
function viewMyNotes({ course, sec }) {
  const v = $('#view'), c = COURSES.get(course), s = sec && SECS.get(sec); if (!c) return back();
  Notes.all().filter(x => Notes.empty(x) && Date.now() - x.created > 3000).forEach(x => Notes.del(x)); // 清理新建后没写内容的笔记
  const list = Notes.of(c.id, s?.id), cards = cardNotes(c, s);
  v.innerHTML = appbar(s ? s.title : c.title + ' · 笔记', `<button class="ibtn" id="mn-more" aria-label="更多">${ico('more')}</button>`) + `<div class="wrap"><div class="stack" style="padding-top:6px">
  <header style="padding:4px 2px"><span class="eyebrow" style="color:${c.color}">${esc(c.title)}${s ? ' · ' + esc(CHAPS.get(s.chap).title) : ''}</span><h1 style="margin:6px 0 4px;font-size:26px;font-weight:800">${esc(s ? s.title : '课程笔记')}</h1></header>
  ${noteTabs(c, s, 'mine')}
  <div class="mn-cta"><button class="btn pri" id="mn-new">${ico('edit')}写笔记</button><button class="btn soft" id="mn-ai">${ico('spark')}AI 帮我写感悟</button></div>
  ${list.length ? `<div class="nlist">${list.map(noteCard).join('')}</div>` : cards.length ? '' : `<div class="empty">${ico('notebook')}<b>还没有笔记</b></div>`}
  ${cards.length ? `<div class="gh"><b>卡片笔记</b><span>${cards.length}</span></div><div class="group">${cards.map(it => `<button class="rowi" data-cnote="${it.id}"><span class="grow"><div class="t">${esc(plain(it.title || it.q).slice(0, 40))}</div><div class="m">${esc(plain(S().notes[it.id]).slice(0, 60))}</div></span>${ico('chev', 'chev')}</button>`).join('')}</div>` : ''}
  </div></div>`;
  $('[data-back]', v).onclick = back; bindNoteTabs(v);
  $('#mn-new').onclick = () => newNote({ course: c.id, sec: s?.id });
  $('#mn-ai').onclick = () => newNote({ course: c.id, sec: s?.id, ai: true });
  $$('[data-note]', v).forEach(b => b.onclick = () => go('note', { id: b.dataset.note }));
  $$('[data-cnote]', v).forEach(b => b.onclick = () => { const x = noteSheet(ITEMS.get(b.dataset.cnote)); if (x) x.onclose = () => setTimeout(refresh, 300); });
  $('#mn-more').onclick = () => menuSheet('我的笔记', [
    { icon: 'download', label: '导出全部笔记', run: () => Files.save(`${s ? s.title : c.title}-我的笔记.md`, myNotesMD(c, s), 'text/markdown') }
  ]);
  hydrateImgs(v, { imgs: Object.assign({}, ...list.map(n => n.imgs || {})) });
}
const noteMD = n => { const sec = n.sec && SECS.get(n.sec); return `## ${n.title.trim() || '无标题笔记'}\n\n> ${sec ? sec.title + ' · ' : ''}${fmtWhen(n.updated)}\n\n${String(n.body || '').replace(new RegExp(IMG_MARK.source, 'gm'), (_, a) => `[图片${a && a !== '配图' ? '：' + a : ''}]`).trim()}\n`; };
function myNotesMD(c, s) {
  const cards = cardNotes(c, s);
  return `# ${s ? s.title : c.title} · 我的笔记\n\n${Notes.of(c.id, s?.id).map(noteMD).join('\n')}${cards.length ? `\n## 卡片笔记\n\n${cards.map(it => `### ${plain(it.title || it.q).slice(0, 40)}\n\n${S().notes[it.id]}\n`).join('\n')}` : ''}`;
}
function newNote({ course, sec, ai }) { const n = Notes.create({ course, sec: sec || null }); go('note', { id: n.id, fresh: 1, ai: ai ? 1 : 0 }); }

/* ---- 笔记编辑页 ---- */
let noteSaveTimer = 0;
function viewNote({ id }) {
  const n = Notes.get(id), v = $('#view'); if (!n) return back();
  n.imgs ||= {}; const c = COURSES.get(n.course), top = Nav.stack[Nav.stack.length - 1];
  const mode = top.params.mode || (top.params.fresh || !n.body.trim() ? 'edit' : 'read');
  const sec = n.sec && SECS.get(n.sec);
  const link = `<button class="nlink" id="ne-sec">${c ? courseMark(c) : ''}<span>${esc(c?.title || '')}${sec ? ' · ' + esc(sec.title) : ' · 关联小节'}</span>${ico('down')}</button>`;
  const tools = [['draft', 'spark', '帮我写'], ['polish', 'wand', '润色'], ['expand', 'grow', '扩写'], ['points', 'listck', '提炼要点'], ['art', 'image', 'AI 配图'], ['pic', 'imgadd', '插入图片']];
  v.innerHTML = appbar('', `<button class="ibtn" id="ne-mode" aria-label="${mode === 'edit' ? '预览' : '编辑'}">${ico(mode === 'edit' ? 'eye' : 'edit')}</button><button class="ibtn" id="ne-more" aria-label="更多">${ico('more')}</button>`) + `<div class="wrap"><div class="stack ned" style="padding-top:6px">
  ${link}
  ${mode === 'edit' ? `<input class="ntitle" id="ne-title" placeholder="标题" maxlength="80" value="${esc(n.title)}">
  <textarea class="nbody" id="ne-body" placeholder="收获、疑问、联想…"></textarea>
  ${Object.keys(n.imgs).length ? `<div class="nimgs">${Object.keys(n.imgs).map(k => `<span class="nth" data-k="${esc(k)}"><img data-nimg="${esc(k)}" alt="配图"><button class="rm" data-rm="${esc(k)}" aria-label="删除图片">${ico('x')}</button></span>`).join('')}</div>` : ''}
  <div class="ntools" role="toolbar" aria-label="AI 工具">${tools.map(([k, i, l]) => `<button class="chip" data-tool="${k}">${ico(i)}${l}</button>`).join('')}</div>
  <div class="small nsaved" id="ne-saved">${n.body || n.title ? '已自动保存' : '内容会自动保存'}</div>`
    : `<article class="card doc nread"><h1>${esc(n.title.trim() || '无标题笔记')}</h1><div class="small" style="margin:-4px 0 12px">${fmtWhen(n.updated)}</div><div class="md">${noteHTML(n)}</div></article>
  <button class="btn soft block" id="ne-edit">${ico('edit')}编辑</button>`}
  </div></div>`;
  const save = () => { clearTimeout(noteSaveTimer); Notes.save(n); const sv = $('#ne-saved'); if (sv) sv.textContent = '已自动保存 · ' + fmtWhen(n.updated); };
  const later = () => { clearTimeout(noteSaveTimer); noteSaveTimer = setTimeout(save, 600); };
  const leave = () => { clearTimeout(noteSaveTimer); if (Notes.empty(n)) Notes.del(n); else if (mode === 'edit') save(); back(); };
  $('[data-back]', v).onclick = leave;
  const setMode = m => { if (mode === 'edit') save(); top.params = { ...top.params, mode: m, fresh: 0 }; render(false); };
  $('#ne-mode').onclick = () => setMode(mode === 'edit' ? 'read' : 'edit');
  $('#ne-edit')?.addEventListener('click', () => setMode('edit'));
  $('#ne-sec').onclick = () => { if (!c) return; menuSheet('关联小节', [{ icon: 'x', label: '不关联小节', run: () => { n.sec = null; save(); refresh(); } },
    ...courseSecs(c).map(x => ({ icon: x.id === n.sec ? 'check' : 'doc', label: x.title, sub: CHAPS.get(x.chap)?.title, run: () => { n.sec = x.id; save(); refresh(); } }))]); };
  $('#ne-more').onclick = () => menuSheet('笔记', [
    { icon: 'download', label: '导出为 Markdown', run: () => Files.save((n.title.trim() || '笔记') + '.md', noteMD(n), 'text/markdown') },
    { icon: 'list', label: '复制全文', run: () => copyText(noteMD(n)) },
    { icon: 'trash', label: '删除笔记', cls: 'danger', run: async () => { if (!await confirmBox('删除笔记', '删除后不能恢复。', '删除', true)) return; clearTimeout(noteSaveTimer); Notes.del(n); back(); toast('已删除'); } }
  ]);
  hydrateImgs(v, n);
  if (mode !== 'edit') return;
  const ta = $('#ne-body', v), ti = $('#ne-title', v);
  ta.value = n.body;
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.max(220, ta.scrollHeight + 2) + 'px'; };
  requestAnimationFrame(grow);
  ti.oninput = () => { n.title = ti.value; later(); };
  ta.oninput = () => { n.body = ta.value; grow(); later(); };
  if (top.params.fresh && !top.params.ai) setTimeout(() => (n.title ? ta : ti).focus(), 350);
  /* 选中文字时只处理选中部分（点工具按钮后文本框失焦，选区仍保留在文本框上） */
  const pick = () => { const a = ta.selectionStart, b = ta.selectionEnd, t = ta.value.slice(a, b); return b > a && t.trim() ? { a, b, text: t } : null; };
  const setBody = t => { n.body = t; ta.value = t; grow(); save(); Motion.haptic('ok'); };
  const insertAt = (pos, t) => { const b = n.body, pre = b.slice(0, pos), post = b.slice(pos); const glue = s => s && !/\n\n$/.test(s) ? (/\n$/.test(s) ? '\n' : '\n\n') : ''; setBody(pre + glue(pre) + t.trim() + (post && !/^\n/.test(post) ? '\n\n' : '') + post); };
  const append = t => insertAt(n.body.length, t);
  const cursor = () => ta.selectionEnd ?? n.body.length;
  const putImage = async res => { const k = await addNoteImage(n, res); insertAt(cursor(), `![配图](img:${k})`); refresh(); toast('已插入图片'); };
  const T = {
    draft: () => noteDraftSheet(n, append),
    polish: () => { const p = pick(), src = p ? p.text : n.body; if (!src.trim()) return toast('先写点内容再润色');
      aiWriteSheet({ title: p ? '润色选中内容' : '润色', prompt: () => `你在帮一位学生润色自己写的学习笔记（课程「${c?.title || ''}」）。修正错别字和不通顺的句子，让表达更清楚、有条理；保持第一人称、原有观点和语气，不要增加新观点，不要删掉内容。${NOTE_RULES}\n\n笔记原文：\n${src}`,
        actions: [{ label: '替换原文', pri: true, run: t => p ? setBody(n.body.slice(0, p.a) + t + n.body.slice(p.b)) : setBody(t) }] }); },
    expand: () => { const p = pick(), src = p ? p.text : n.body; if (!src.trim()) return toast('先写几句想法，AI 再帮你扩写');
      aiWriteSheet({ title: p ? '扩写选中内容' : '扩写', prompt: () => `你在帮一位学生扩写自己的学习笔记。保持原意、第一人称和原有结构，补充解释、具体例子以及与课程知识点的联系（参考下面的课程资料，不要编造学生没提过的个人经历），篇幅约为原来的 1.5~2 倍。${NOTE_RULES}\n\n课程资料：\n${noteCtx(n)}\n\n要扩写的内容：\n${src}`,
        actions: [{ label: '插入到后面', run: t => insertAt(p ? p.b : n.body.length, t) }, { label: '替换原文', pri: true, run: t => p ? setBody(n.body.slice(0, p.a) + t + n.body.slice(p.b)) : setBody(t) }] }); },
    points: () => { if (!n.body.trim()) return toast('笔记还是空的');
      aiWriteSheet({ title: '提炼要点', prompt: () => `把下面这篇学习笔记提炼成 3~6 条要点，每条一句话，用 Markdown 列表输出，第一行写「**要点**」。只输出这些内容。\n\n${n.body.replace(new RegExp(IMG_MARK.source, 'gm'), '')}`,
        actions: [{ label: '放到末尾', run: t => append(t) }, { label: '放到开头', pri: true, run: t => insertAt(0, t) }] }); },
    art: async () => { const cfg = await needImg(() => T.art()); if (cfg) noteArtSheet(n, cfg, putImage); },
    pic: () => { const i = h('<input type="file" accept="image/*" hidden>'); document.body.append(i); i.onchange = async () => { const f = i.files[0]; i.remove(); if (f) putImage({ blob: f }); }; i.click(); }
  };
  $$('[data-tool]', v).forEach(b => b.onclick = () => T[b.dataset.tool]());
  $$('[data-rm]', v).forEach(b => b.onclick = async e => { e.stopPropagation(); const k = b.dataset.rm; if (!await confirmBox('删除图片', '图片会从这篇笔记中移除。', '删除', true)) return;
    Files.del(n.imgs[k]); delete n.imgs[k]; n.body = n.body.replace(new RegExp(`^!\\[[^\\]\\n]*\\]\\(img:${k}\\)[ \\t]*\\n?`, 'gm'), ''); save(); refresh(); });
  $$('.nth[data-k]', v).forEach(x => x.onclick = () => { if (!new RegExp(`\\(img:${x.dataset.k}\\)`).test(n.body)) { insertAt(cursor(), `![配图](img:${x.dataset.k})`); toast('已插入到正文'); } else toast('这张图已在正文中，可以点右上角预览'); });
  if (top.params.ai) { top.params = { ...top.params, ai: 0 }; setTimeout(() => T.draft(), 380); }
}
/* 帮我写：根据学习记录、错题和自己的几句话起草感悟 */
function noteDraftSheet(n, done) {
  const c = COURSES.get(n.course), secs = n.sec && SECS.has(n.sec) ? [SECS.get(n.sec)] : c ? recentSecs(c) : [];
  const KINDS = { feel: ['感悟', '这节最有收获的地方、想通的点、和以前知识的联系、接下来打算怎么做'], sum: ['学习总结', '用自己的话梳理这节的核心内容和知识结构，标出容易混淆的地方'], ask: ['疑问与反思', '还没想明白的问题、做错题的原因、需要回头再看的地方'] };
  let kind = 'feel';
  const form = `<div class="seg" id="nd-k">${Object.entries(KINDS).map(([k, [l]]) => `<button data-k="${k}" aria-pressed="${k === kind}">${l}</button>`).join('')}</div>
    <label class="field"><textarea class="inp" id="nd-t" style="min-height:84px" placeholder="几个关键词（可选）"></textarea></label>
`;
  const s = aiWriteSheet({ title: 'AI 帮我写', form, prompt: b => `你在帮一位学生写自己的学习笔记。请以学生本人的口吻（第一人称，真诚、朴素、像自己写给自己看的），写一篇「${KINDS[kind][0]}」，侧重：${KINDS[kind][1]}。300~600 字。
要求：围绕学生自己的想法展开；只根据下面给出的课程内容和学习记录来写，不要编造学生没提到的个人经历或感受；需要学生补充的地方用【……】留空。${NOTE_RULES}
${n.body.trim() ? `\n笔记里已经写了（接着写，不要重复）：\n${n.body.slice(-1500)}\n` : ''}
学生的想法：${$('#nd-t', b).value.trim() || '（没写，请根据学习记录挑最值得记的点）'}

${noteCtx(n)}`, actions: [{ label: n.body.trim() ? '接在笔记后面' : '放进笔记', pri: true, run: t => { if (!n.title.trim()) { const m = t.match(/^#{1,3}\s+(.+)$/m); n.title = m ? m[1].trim().slice(0, 40) : `${secs[0]?.title || c?.title || ''} ${KINDS[kind][0]}`.trim(); t = m && t.indexOf(m[0]) < 4 ? t.replace(m[0], '').trim() : t; } done(t); refresh(); } }] });
  $$('#nd-k [data-k]', s.body).forEach(b => b.onclick = () => { kind = b.dataset.k; $$('#nd-k [data-k]', s.body).forEach(x => x.setAttribute('aria-pressed', x === b)); });
}
/* AI 配图：画面描述（可让 AI 根据笔记写）→ 图片模型生成 → 插入 */
function noteArtSheet(n, cfg, insert) {
  const STY = { flat: ['扁平插画', '简洁扁平插画风格，柔和配色'], hand: ['手绘涂鸦', '手绘涂鸦风格，像笔记本上的钢笔线稿加淡彩'], water: ['水彩', '清新水彩画风格'], diag: ['概念示意', '清晰的概念示意图风格，白色背景，图形化表达'] };
  let sty = 'flat', size = cfg.size || '1024x1024', res = null, busy = null;
  const body = h(`<div style="display:flex;flex-direction:column;gap:12px">
    <label class="field"><span>画什么</span><textarea class="inp" id="na-p" style="min-height:90px" placeholder="画面内容"></textarea></label>
    ${AI.ok ? `<button class="btn sm soft" id="na-ai" style="align-self:flex-start">${ico('spark')}根据笔记写画面描述</button>` : ''}
    <div class="field"><span>风格</span><div class="chips" id="na-s">${Object.entries(STY).map(([k, [l]]) => `<button class="chip" data-s="${k}" aria-pressed="${k === sty}">${l}</button>`).join('')}</div></div>
    <div class="field"><span>尺寸</span><div class="seg" id="na-z">${IMG_SIZES.map(([v, l]) => `<button data-v="${v}" aria-pressed="${v === size}">${l}</button>`).join('')}</div></div>
    <div id="na-prev" class="nprev" hidden></div><div id="na-msg" class="small" style="min-height:1.2em"></div>
    <div class="acts" id="na-acts"></div>
    <span class="mchip">${ico('image')}${esc(cfg.model)}</span></div>`);
  const s = sheet('AI 配图', body), pt = $('#na-p', body), msg = t => $('#na-msg', body).innerHTML = t;
  const acts = () => { $('#na-acts', body).innerHTML = busy ? `<button class="btn" data-a="stop">${ico('stop')}停止</button>` : res ? `<button class="btn" data-a="gen">${ico('sync')}重新生成</button><button class="btn pri" data-a="ins">插入笔记</button>` : `<button class="btn pri" data-a="gen">${ico('image')}生成图片</button>`; };
  $$('#na-s [data-s]', body).forEach(b => b.onclick = () => { sty = b.dataset.s; $$('#na-s [data-s]', body).forEach(x => x.setAttribute('aria-pressed', x === b)); });
  $$('#na-z [data-v]', body).forEach(b => b.onclick = () => { size = b.dataset.v; $$('#na-z [data-v]', body).forEach(x => x.setAttribute('aria-pressed', x === b)); });
  $('#na-ai', body)?.addEventListener('click', async e => {
    const b = e.currentTarget; b.disabled = true; msg('<span class="spin"></span> 正在构思画面…');
    try { const { text } = await AI.fn(`根据下面这篇学习笔记，写一段给 AI 绘图用的中文画面描述（60~120 字）：一张适合放在笔记里的插图，用具体的画面或比喻表现笔记的核心概念。只写画面内容，不要写风格，画面中不要出现文字。只输出描述本身。\n\n标题：${n.title}\n${n.body.replace(new RegExp(IMG_MARK.source, 'gm'), '').slice(0, 2500) || noteCtx(n).slice(0, 1500)}`, { cache: false }); pt.value = cleanAI(text).replace(/^["“]|["”]$/g, ''); msg(''); }
    catch (err) { msg(`<span style="color:var(--bad)">${esc(AI.err(err))}</span>`); }
    b.disabled = false;
  });
  $('#na-acts', body).onclick = async e => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'stop') { busy?.abort(); return; }
    if (a === 'ins') { s.close(); insert(res); return; }
    const desc = pt.value.trim(); if (!desc) { msg('先写下想画的内容'); pt.focus(); return; }
    busy = new AbortController(); acts(); msg('<span class="spin"></span> 正在生成，通常需要 10~60 秒…');
    try {
      res = await ImageClient.generate(cfg, `${desc}。${STY[sty][1]}，画面中不要出现任何文字。`, { size, signal: busy.signal });
      const pv = $('#na-prev', body); pv.hidden = false; pv.innerHTML = `<img src="${esc(res.blob ? URL.createObjectURL(res.blob) : res.url)}" alt="生成的配图">`; msg(res.blob ? '' : '这个服务只返回临时链接，图片可能在几小时后失效'); Motion.haptic('ok');
    } catch (err) { msg(err?.code === 'cancelled' || busy?.signal.aborted ? '已停止' : `<span style="color:var(--bad)">${esc(AI.err(err))}</span>`); }
    busy = null; acts();
  };
  s.onclose = () => busy?.abort();
  acts(); setTimeout(() => pt.focus(), 300);
}

/* ============ 「笔记」标签页：所有课程的笔记、书签、收藏 ============ */
let nbCourse = '';
function reflectToday() {
  const sid = Object.keys(S().hist?.[dayKey()] || {}).find(id => SECS.has(id)), c = sid ? SECS.get(sid).course : activeCourses()[0]?.id || shownCourses()[0]?.id;
  if (!c) return toast('先添加一门课程'); newNote({ course: c, sec: sid, ai: true });
}
function pickCourse(title, run) {
  const cs = shownCourses(); if (!cs.length) return toast('先添加一门课程');
  if (cs.length === 1) return run(cs[0]);
  const recent = Object.keys(S().hist?.[dayKey()] || {}).map(id => SECS.get(id)?.course);
  cs.sort((a, b) => (recent.includes(b.id) - recent.includes(a.id)) || (activeCourses().includes(b) - activeCourses().includes(a)));
  menuSheet(title, cs.map(c => ({ icon: 'book', label: c.title, sub: c.cat, run: () => run(c) })));
}
function viewNotebook() {
  const v = $('#view');
  Notes.all().filter(x => Notes.empty(x) && Date.now() - x.created > 3000).forEach(x => Notes.del(x));
  const all = Notes.all().filter(n => COURSES.has(n.course)).sort((a, b) => b.updated - a.updated), cs = shownCourses();
  const withN = cs.filter(c => all.some(n => n.course === c.id) || cardNotes(c).length);
  if (nbCourse && !withN.some(c => c.id === nbCourse)) nbCourse = '';
  const list = all.filter(n => !nbCourse || n.course === nbCourse), cards = (nbCourse ? [COURSES.get(nbCourse)] : withN).flatMap(c => cardNotes(c));
  const bmN = cs.reduce((s, c) => s + bookmarks(c.id).filter(b => ITEMS.has(b.it)).length, 0), starN = starItems().length;
  v.innerHTML = `<div class="wrap"><header class="lt"><div class="t"><h1>笔记</h1></div><button class="round acc" id="nb-new" aria-label="写笔记">${ico('edit', '', 'duo')}</button></header>
  <div class="stack">
  <div class="nb3"><button id="nb-ai"><span class="ib" style="--c:var(--accent)">${ico('spark', '', 'duo')}</span><b>写感悟</b><span class="n">AI</span></button>
    <button id="nb-star"><span class="ib" style="--c:#df8a0b">${ico('star', '', 'duo')}</span><b>收藏</b><span class="n">${starN}</span></button>
    <button id="nb-bm"><span class="ib" style="--c:#2f9e63">${ico('bookmarks', '', 'duo')}</span><b>书签</b><span class="n">${bmN}</span></button></div>
  ${withN.length > 1 ? `<div class="chips">${[['', '全部'], ...withN.map(c => [c.id, c.title])].map(([id, l]) => `<button class="chip" data-nbc="${id}" aria-pressed="${nbCourse === id}">${esc(l)}</button>`).join('')}</div>` : ''}
  ${list.length ? `<div class="nlist">${list.map(n => noteCard(n, !nbCourse)).join('')}</div>` : ''}
  ${cards.length ? `<div class="gh"><b>卡片笔记</b><span>${cards.length}</span></div><div class="group">${cards.map(it => `<button class="rowi" data-cnote="${it.id}"><span class="grow"><div class="t">${esc(plain(it.title || it.q).slice(0, 40))}</div><div class="m">${esc(COURSES.get(it.course).title)} · ${esc(plain(S().notes[it.id]).slice(0, 50))}</div></span>${ico('chev', 'chev')}</button>`).join('')}</div>` : ''}
  ${!list.length && !cards.length ? `<div class="empty">${ico('notebook')}<b>还没有笔记</b></div>` : ''}
  </div></div>`;
  $('#nb-new').onclick = () => nbCourse ? newNote({ course: nbCourse }) : pickCourse('选择科目', c => newNote({ course: c.id }));
  $('#nb-ai').onclick = reflectToday;
  $('#nb-star').onclick = () => starN ? openReview('star') : toast('学习时点卡片右上角「…」→ 收藏');
  $('#nb-bm').onclick = () => { const bc = cs.filter(c => bookmarks(c.id).some(b => ITEMS.has(b.it))); if (!bc.length) return toast('阅读课程笔记时，点知识点右上角的书签图标添加'); if (bc.length === 1) return bookmarkSheet(bc[0]); menuSheet('书签', bc.map(c => ({ icon: 'bookmarks', label: c.title, sub: bookmarks(c.id).length + ' 处', run: () => bookmarkSheet(c) }))); };
  $$('[data-nbc]', v).forEach(b => b.onclick = () => { nbCourse = b.dataset.nbc; refresh(); });
  $$('[data-note]', v).forEach(b => b.onclick = () => go('note', { id: b.dataset.note }));
  $$('[data-cnote]', v).forEach(b => b.onclick = () => { const x = noteSheet(ITEMS.get(b.dataset.cnote)); if (x) x.onclose = () => setTimeout(refresh, 300); });
  hydrateImgs(v, { imgs: Object.assign({}, ...list.map(n => n.imgs || {})) });
}
