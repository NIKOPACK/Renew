/* ============ 界面（v4：iOS 风格） ============ */
/* 课程封面：按课程名、分类中的关键词选学科图标（课程可用 icon 字段指定），渐变底 + 白色双色图标 */
const TOPIC_ICONS = [
  [/数据结构|算法|algorithm|data struct|leetcode/i, 'tree'], [/组成原理|计算机组成|体系结构|硬件|芯片|cpu|电路|单片机/i, 'cpu'],
  [/操作系统|linux|unix|shell|命令行|\bos\b/i, 'terminal'], [/计算机网络|网络|tcp|http|通信/i, 'network'],
  [/编程|代码|程序|python|java|c\+\+|前端|后端|javascript|golang|rust|软件/i, 'code'], [/学习|记忆|心理|认知|脑/i, 'bulb'],
  [/统计|概率/i, 'sigma'], [/数学|高数|微积分|线代|线性代数|离散|函数|math|calculus/i, 'fn'],
  [/英语|日语|韩语|法语|德语|单词|词汇|口语|语法|english|vocab|language/i, 'translate'], [/物理|physics|力学|量子/i, 'atom'],
  [/化学|chemistry/i, 'flask'], [/生物|医学|生理|解剖|药|biology|medic/i, 'dna'], [/历史|history|古代/i, 'scroll'],
  [/法律|法学|政治|宪法|law/i, 'scales'], [/经济|金融|会计|财务|投资|管理|econom|financ/i, 'chart'], [/地理|geograph/i, 'globe'],
  [/音乐|music|乐理/i, 'music'], [/美术|设计|绘画|艺术|design|art/i, 'palette'], [/语文|文学|古诗|写作|阅读|作文/i, 'nib'],
  [/考研|考试|备考|exam/i, 'student']
];
const courseIcon = c => c.icon && IC[c.icon] ? c.icon : (TOPIC_ICONS.find(([re]) => re.test(`${c.title} ${c.cat || ''}`)) || [, 'bookopen'])[1];
const courseMark = (c, cls = 'tico') => `<span class="${cls}" style="--c:${c.color}">${tileIco(courseIcon(c))}</span>`;
const coverHTML = (c, extra = '') => `<div class="cover" style="--c:${c.color}"><span class="cat">${esc(c.cat)}</span><b>${esc(c.title)}</b><span class="art">${tileIco(courseIcon(c))}</span>${extra}</div>`;
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

/* ---- 今日 ---- */

/* ---- 课程书架 ---- */
let libCat = '全部';
function viewLibrary() {
  const v = $('#view'), all = shownCourses(), cats = ['全部', ...new Set(all.map(c => c.cat))];
  if (!cats.includes(libCat)) libCat = '全部';
  const groups = {}; all.filter(c => libCat === '全部' || c.cat === libCat).forEach(c => (groups[c.cat] ||= []).push(c));
  const tile = c => { const s = courseStats(c), p = pct(s.learned, s.items), done = s.items && !s.remain && s.learned;
    return `<button class="tile press" data-course="${c.id}">${coverHTML(c, done ? `<span class="done">${ico('check')}</span>` : '')}<div class="tm"><b>${s.items ? (s.learned ? p + '%' : '未开始') : s.secs ? '待生成' : '卡片'}</b><span>${s.secs ? s.secs + ' 节' : courseCards(c.id).length + ' 张'}</span></div><div class="pbar"><i style="width:${p}%;background:${c.color}"></i></div></button>`; };
  v.innerHTML = `<div class="wrap"><header class="lt"><div class="t"><h1>课程</h1></div><button class="round acc" id="newc" aria-label="新建课程">${ico('plus')}</button></header>
  <div class="stack"><button class="search-field" data-go="search">${ico('search')}搜索知识点、题目</button>
  ${cats.length > 2 ? `<div class="chips">${cats.map(c => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${c === libCat}">${esc(c)}</button>`).join('')}</div>` : ''}
  ${Object.entries(groups).map(([cat, cs]) => `<div class="gh"><b>${esc(cat)}</b><span>${cs.length} 门</span></div><div class="shelf">${cs.map(tile).join('')}</div>`).join('')}
  ${MATS.size ? `<div class="group icons"><button class="rowi" data-go="materials"><span class="tico" style="--c:#6e7582">${tileIco('folder')}</span><span class="grow"><div class="t">全部资料</div><div class="m">${MATS.size} 份${(n => n ? ` · ${n} 份未归类` : '')([...MATS.values()].filter(m => !m.course || !COURSES.has(m.course)).length)}</div></span>${ico('chev', 'chev')}</button></div>` : ''}
  <div class="gh"><b>添加</b></div><div class="shelf"><button class="tile press" id="newc2"><div class="cover new">${ico('plus')}新建课程</div></button></div>
  </div></div>`;
  $$('[data-cat]', v).forEach(b => b.onclick = () => { libCat = b.dataset.cat; refresh(); });
  $$('[data-course]', v).forEach(b => b.onclick = () => go('course', { id: b.dataset.course }));
  $('#newc').onclick = $('#newc2').onclick = newCourseSheet;
}

/* ---- 课程详情 ---- */
function viewCourse({ id }) {
  const c = COURSES.get(id), v = $('#view'); if (!c) return back();
  const s = courseStats(c), cp = coursePlan(id), next = nextSection(c);
  const secRow = sec => { const st = secStatus(sec), p = secProg(sec), all = p.kp + p.q, d = p.kpd + p.qd;
    const right = next && next.id === sec.id ? '<span class="pill acc">下一节</span>' : st === 'empty' ? '<span class="pill">待生成</span>' : st === 'external' ? '<span class="pill warn">别处已学</span>' : st === 'skip' ? '<span class="pill">暂不学</span>' : st === 'learning' ? `<span class="r num">${d}/${all}</span>` : st === 'done' ? '' : `<span class="r num">${all}</span>`;
    return `<button class="rowi" data-sec="${sec.id}"><span class="sti" data-s="${st}" style="--p:${pct(d, all)}%">${st === 'done' ? ico('check') : st === 'external' ? ico('sync') : ''}</span><span class="grow"><div class="t">${esc(sec.title)}</div></span>${right}${ico('chev', 'chev')}</button>`; };
  v.innerHTML = appbar('', `<button class="ibtn" id="cmore" aria-label="更多">${ico('more')}</button>`) + `<div class="wrap"><div class="stack">
  <div class="chead">${coverHTML(c)}<div class="grow"><h1>${esc(c.title)}</h1><div class="m cmeta"><span>${ico('list')}${s.secs}</span>${s.due ? `<span class="due">${ico('review')}${s.due}</span>` : ''}<span class="pc">${pct(s.learned, s.items)}%</span></div><div class="pbar" style="margin-top:8px"><i style="width:${pct(s.learned, s.items)}%;background:${c.color}"></i></div></div></div>
  ${next ? `<button class="btn pri block" id="cont">${ico('play', '', 'fill')}${secStatus(next) === 'learning' ? '继续' : '开始'}：${esc(next.title)}</button>` : `<button class="btn soft block" data-review-course="${c.id}">${ico('review')}复习这门课</button>`}
  <div class="qa4"><button id="cplan"><span class="ib">${tileIco('target')}</span>计划</button><button id="csync"><span class="ib">${tileIco('sync')}</span>同步进度</button><button id="cnotes"><span class="ib">${tileIco('doc')}</span>笔记</button><button id="cmat"><span class="ib">${tileIco('folder')}</span>资料</button></div>
  ${s.emptySecs ? `<div class="group"><button class="rowi" id="cgen"><span class="grow"><div class="t" style="color:var(--accent)">AI 生成 ${s.emptySecs} 个空小节</div></span>${ico('chev', 'chev')}</button></div>` : ''}
  ${c.chapters.map(ch => { const done = ch.sections.filter(x => ['done', 'external'].includes(secStatus(x))).length; return `<div class="gh" id="ch-${ch.id}"><b>${esc(ch.title)}</b><span class="num">${done}/${ch.sections.length}</span></div><div class="group" style="--sepl:50px">${ch.sections.map(secRow).join('')}</div>`; }).join('')}
  <div class="gh" id="ccards"><b>${ico('grid', 'brico')}卡片</b>${courseCards(c.id).length > 1 ? `<button class="link" id="ccord">${ico('list')}排序</button>` : ''}<button class="link" id="ccadd">${ico('plus')}添加</button><button class="link" id="ccai">${ico('spark')}AI</button></div>
  <div id="ccl">${courseCardsHTML(c)}</div>
  </div></div>`;
  $('[data-back]', v).onclick = back;
  $('#cont')?.addEventListener('click', () => startSection(next.id));
  $('[data-review-course]', v)?.addEventListener('click', () => openReview('review', { course: c.id }));
  $$('[data-sec]', v).forEach(b => b.onclick = () => go('section', { id: b.dataset.sec }));
  const redrawCards = () => { const l = $('#ccl', v); if (!l) return; l.innerHTML = courseCardsHTML(c); bindCardRows(l, redrawCards); };
  bindCardRows($('#ccl', v), redrawCards);
  $('#ccadd').onclick = () => homeCardSheet({ course: c.id, after: redrawCards });
  $('#ccord')?.addEventListener('click', () => cardOrderSheet(c.id, redrawCards));
  $('#ccai').onclick = () => { if (AI.require()) homeAISheet({ course: c.id, after: redrawCards }); };
  $('#cplan').onclick = planSheet; $('#csync').onclick = () => syncSheet(c);
  $('#cgen')?.addEventListener('click', () => batchGenSheet(c));
  $('#cnotes').onclick = () => go('notes', { course: c.id });
  $('#cmat').onclick = () => go('cmats', { id: c.id });
  $('#cmore').onclick = () => menuSheet(c.title, [
    { icon: 'download', label: '导出', run: () => exportSheet(c) },
    { icon: 'target', label: cp.on ? '移出今日任务' : '加入今日任务', run: () => { cp.on = !cp.on; saveState(); refresh(); } },
    { icon: 'review', label: '复习这门课', run: () => openReview('review', { course: c.id }) },
    !c.builtin && { icon: 'edit', label: '编辑目录', run: () => editOutlineSheet(c) },
    c.builtin ? { icon: 'eyeoff', label: '从书架隐藏', run: () => { S().hiddenCourses[c.id] = 1; cp.on = false; saveState(); go('library', {}, { tab: true }); } }
      : { icon: 'trash', label: '删除课程', cls: 'danger', run: () => deleteCourse(c) }
  ]);
  if (next && !Nav.stack[Nav.stack.length - 1].y) { const el = $('#ch-' + next.chap); if (el && next.chap !== c.chapters[0].id) requestAnimationFrame(() => scrollTo(0, el.getBoundingClientRect().top + scrollY - 120)); }
}

/* 课程的「卡片」分支：文字、倒计时、AI 每日，显示在首页 */
function courseCardsHTML(c) { const cs = courseCards(c.id); return cs.length ? `<div class="group">${cs.map(cardRowHTML).join('')}</div>` : ''; }
/* ---- 小节 ---- */
function viewSection({ id }) {
  const sec = SECS.get(id), v = $('#view'); if (!sec) return back();
  const c = COURSES.get(sec.course), ch = CHAPS.get(sec.chap), st = secStatus(sec), p = secProg(sec), kps = secKps(sec), qs = secQs(sec);
  const learnDone = p.l && p.ld === p.l, pracDone = !p.p || p.pd === p.p, allDone = learnDone && pracDone;
  const step = (cls, n, t, m) => `<div class="s ${cls}"><span class="c">${cls === 'done' ? ico('check') : n}</span><b>${t}</b><span>${m}</span></div>`;
  v.innerHTML = appbar('', `<button class="ibtn" id="smore" aria-label="更多">${ico('more')}</button>`) + `<div class="wrap"><div class="stack">
  <header style="padding:4px 4px 0"><div class="eyebrow" style="color:${c.color}">${esc(ch.title)}</div><h1 class="phead">${esc(sec.title)}</h1><button class="small" id="sst" style="color:var(--ink-2)"><span class="sst-c" data-s="${st}">${SEC_LABEL[st]}</span><span class="sst-n">${ico('bulb')}${p.kp}</span><span class="sst-n">${ico('pen')}${p.q}</span>${ico('chev', 'chev')}</button></header>
  ${st === 'empty' ? `<div class="card card-in" style="display:flex;flex-direction:column;gap:12px;align-items:center;text-align:center;padding:28px 18px"><span class="round acc" style="width:56px;height:56px">${ico('wand', '', 'duo')}</span><b style="font-size:18px">这一节还没有内容</b>${sec.points.length ? `<span class="small">${sec.points.map(esc).join(' · ')}</span>` : ''}<button class="btn pri block" id="egen">${ico('wand')}生成本节内容</button><div class="row" style="justify-content:center;gap:4px"><button class="btn ghost" id="enew">${ico('pen')}手动新建</button><button class="btn ghost" id="eimp">导入卡片文本</button></div></div>`
    : `<div class="card"><div class="steps3">${step(learnDone ? 'done' : 'cur', 1, '学习', `${p.ld}/${p.l}`)}<span class="ln"></span>${step(learnDone && p.p && !pracDone ? 'cur' : p.p && pracDone ? 'done' : '', 2, '练习', `${p.pd}/${p.p}`)}<span class="ln"></span>${step(allDone ? 'done' : '', 3, '小结', allDone ? '完成' : '—')}</div>
    <div style="padding:10px 16px 16px;display:flex;flex-direction:column;gap:6px"><button class="btn pri block" id="start">${ico('play', '', 'fill')}${st === 'todo' ? '开始学习' : st === 'done' ? '重新学习' : learnDone ? '继续练习' : '继续学习'}</button>
    <div class="row" style="justify-content:center;gap:4px">${p.p ? `<button class="btn ghost sm" id="prac">${ico('pen')}练习</button>` : ''}<button class="btn ghost sm" id="snotes">${ico('doc')}笔记</button><button class="btn ghost sm" id="sgen">${ico('wand')}补充</button></div></div></div>`}
  ${st !== 'empty' ? `<div class="gh"><b>知识点</b><span>${p.kpd}/${p.kp}</span><button class="link" data-new="kp">${ico('plus')}新建</button></div>` : ''}${kps.length ? `<div class="group" style="--sepl:36px">${kps.map(it => `<div><button class="rowi" data-kp="${it.id}"><span class="dotst ${getSt(it) ? 'h' : ''}"></span><span class="grow"><div class="t">${esc(it.title || '知识点')}${it.imp >= 2 ? '<span class="badge-hot" title="高频"></span>' : ''}</div><div class="kprev">${esc(plain(it.q).slice(0, 80))}</div></span>${ico('chev', 'chev')}</button></div>`).join('')}</div>` : ''}
  ${st !== 'empty' ? `<div class="gh"><b>练习</b><span>${p.qd}/${p.q}</span><button class="link" data-new="choice">${ico('plus')}新建</button></div>` : ''}${qs.length ? `<div class="group" style="--sepl:36px">${qs.map(it => { const s = getSt(it); return `<div class="qrow"><button class="rowi" data-q="${it.id}"><span class="dotst ${!s ? '' : s.lr === 1 ? 'n' : 'y'}"></span><span class="grow"><div class="m" style="margin:0 0 2px;color:var(--warn);font-weight:600">${TYPE_LABEL[it.t]}</div><div class="t" style="font-size:15px">${esc(plain(it.title || it.q).slice(0, 70))}</div></span>${ico('chev', 'chev')}</button><button class="ibtn qed" data-edit="${it.id}" aria-label="编辑">${ico('pen')}</button></div>`; }).join('')}</div>` : ''}
  </div></div>`;
  $('[data-back]', v).onclick = back;
  $('#start')?.addEventListener('click', () => startSection(id));
  $('#prac')?.addEventListener('click', () => { S().cur[c.id] = id; saveState(); go('session', { kind: 'section', sid: id, step: 'practice' }); });
  $('#sgen')?.addEventListener('click', () => genSheet({ sid: id }));
  $('#snotes')?.addEventListener('click', () => go('notes', { course: c.id, sec: id }));
  $('#egen')?.addEventListener('click', () => genSheet({ sid: id }));
  $('#eimp')?.addEventListener('click', () => importSheet(id));
  $('#enew')?.addEventListener('click', () => itemEditSheet({ sid: id, type: 'kp' }));
  $$('[data-new]', v).forEach(b => b.onclick = () => itemEditSheet({ sid: id, type: b.dataset.new }));
  $('.stack', v).addEventListener('click', e => { const b = e.target.closest('[data-edit]'); if (b && ITEMS.has(b.dataset.edit)) { e.stopPropagation(); itemEditSheet({ it: ITEMS.get(b.dataset.edit) }); } });
  $('#sst').onclick = () => statusSheet(id);
  $$('[data-kp]', v).forEach(b => b.onclick = () => {
    const w = b.parentElement, ex = $('.kopen', w), chev = $('.chev', b);
    chev.style.transition = 'transform .3s var(--e-ios)';
    if (ex) { chev.style.transform = ''; Motion.collapse(ex, () => ex.remove()); return; }
    const it = ITEMS.get(b.dataset.kp); chev.style.transform = 'rotate(90deg)';
    const kx = w.appendChild(h(`<div class="kopen"><div class="md">${md(it.q)}</div>${it.d ? `<div class="panel open"><div class="ph2">${ico('bulb')}详解</div><div class="pb md">${md(it.d)}</div></div>` : ''}<button class="btn soft sm" data-edit="${it.id}" style="margin-top:12px">${ico('pen')}编辑</button></div>`)); Motion.expand(kx);
  });
  $$('[data-q]', v).forEach(b => b.onclick = () => go('session', { kind: 'section', sid: id, step: 'practice', only: b.dataset.q }));
  $('#smore').onclick = () => menuSheet(sec.title, [
    { icon: 'wand', label: 'AI 补充内容', run: () => genSheet({ sid: id }) },
    { icon: 'pen', label: '新建知识点', run: () => itemEditSheet({ sid: id, type: 'kp' }) },
    { icon: 'pen', label: '新建题目', run: () => itemEditSheet({ sid: id, type: 'choice' }) },
    { icon: 'list', label: '调整顺序', run: () => secOrderSheet(id) },
    { icon: 'upload', label: '导入卡片文本', run: () => importSheet(id) },
    { icon: 'doc', label: '本节笔记', run: () => go('notes', { course: c.id, sec: id }) },
    { icon: 'edit', label: '写本节笔记', run: () => newNote({ course: c.id, sec: id, ai: true }) },
    { icon: 'download', label: '导出本节', run: () => exportSheet(c, sec) },
    { icon: 'review', label: '复习本节', run: () => openReview('section-review', { sid: id }) },
    { icon: 'flag', label: '更改学习状态', run: () => statusSheet(id) }
  ]);
}

/* ---- 学习会话 ---- */
function sessionBar(pr) {
  let crumb, steps = '', dot = '';
  if (pr.kind === 'section') {
    const sec = SECS.get(pr.sid), c = COURSES.get(sec.course), p = secProg(sec);
    dot = `<i class="cdot" style="--c:${c.color}"></i>`;
    crumb = `${c.title} · ${sec.title}`;
    steps = `<div class="fpill ssteps">${[['learn', '学习', p.l && p.ld === p.l], ['practice', '练习', p.p && p.pd === p.p], ['summary', '小结', false]].map(([k, l, d]) => `<button data-step="${k}" aria-pressed="${pr.step === k}">${d && pr.step !== k ? ico('check') : ''}${l}</button>`).join('')}</div>`;
  } else {
    const it0 = pr.kind === 'items' && ITEMS.get(pr.ids?.[0]);
    const c = it0 ? COURSES.get(it0.course) : pr.course ? COURSES.get(pr.course) : pr.sid ? COURSES.get(SECS.get(pr.sid)?.course) : null;
    if (c) dot = `<i class="cdot" style="--c:${c.color}"></i>`;
    crumb = ({ review: '复习', wrong: '错题巩固', star: '收藏', 'section-review': '复习本节', items: '查看' }[pr.kind]) + ' · ' + (it0 ? SECS.get(it0.sec).title : pr.course ? COURSES.get(pr.course).title : pr.sid ? SECS.get(pr.sid).title : '全部课程');
  }
  const done = [...Feed.posts.values()].filter(p => p.g != null).length, tot = Math.max(1, Feed.queue.length);
  const pctW = pr.step === 'summary' ? 100 : done / tot * 100;
  const spk = typeof Speech !== 'undefined' && Speech.ok ? `<button class="ibtn${Speech.auto ? ' on' : ''}" data-speak aria-label="听学朗读">${ico('speaker')}</button>` : '';
  return `<div class="readprog"><i id="sp" style="width:${pctW}%"></i></div>
    <div class="fbar sfbar"><div class="wrap"><button class="fbtn" data-close-s aria-label="退出">${ico('close')}</button><span class="grow"></span>${steps}<span class="grow"></span><div class="fpill">${pr.step === 'summary' ? '' : `<span class="scnt" id="sc">${done}/${Feed.queue.length}</span>`}${spk}<button class="ibtn" data-typo aria-label="阅读排版">${ico('aa')}</button></div></div></div><div class="fsp"></div>
    <div class="wrap"><div class="scrumb">${dot}<span>${esc(crumb)}</span></div></div>`;
}
function postHTML(p) {
  const it = p.it, c = COURSES.get(it.course), sec = SECS.get(it.sec), showSrc = Feed.params?.kind !== 'section';
  const head = `<div class="ph"><span class="ptype ${isQ(it) ? 'q' : ''}">${TYPE_LABEL[it.t]}</span>${it.imp >= 2 ? '<span class="hot">高频</span>' : ''}<span class="src">${showSrc ? `<i class="cdot" style="--c:${c.color}" title="${esc(c.title)}"></i><span>${esc(sec.title)}</span>` : ''}</span><button class="more" data-act="more" aria-label="更多：问 AI、笔记、收藏">${ico('more')}</button></div>`;
  let body = '', foot = '';
  const sol = () => detailRow(p, 'x');
  const note = S().notes?.[it.id] ? panel('noteOpen', '我的笔记', 'edit', S().notes[it.id], p.noteOpen) : '';
  if (it.t === 'kp') {
    body = `<h3 class="pt">${esc(it.title || '知识点')}</h3>`;
    { body += `<div class="keypts md">${md(it.q)}</div>` + (it.d ? detailRow(p, 'd') : (AI.ok ? `<button class="btn soft sm" style="margin-top:14px" data-act="gen-d">${ico('wand')}AI 生成详解</button>` : '')); foot = rateBar(p, p.review ? 4 : 3); }
  } else if (it.t === 'choice' || it.t === 'multi') {
    const done = p.phase === 'back', ans = [].concat(it.a);
    body = (it.title ? `<h3 class="pt">${esc(it.title)}</h3>` : '') + `<div class="md" style="margin-top:6px">${md(it.q)}</div><div class="opts">` + it.o.map((o, i) => {
      let cls = ''; if (done) { if (ans.includes(i)) cls = 'ok'; else if (p.picks.has(i)) cls = 'no'; } else if (p.picks.has(i)) cls = 'sel';
      return `<button class="opt ${cls}" data-act="opt" data-i="${i}" ${done ? 'disabled' : ''}><span class="k">${String.fromCharCode(65 + i)}</span><span class="md">${md(o, { inline: true })}</span></button>`;
    }).join('') + `</div>`;
    if (!done && it.t === 'multi') foot = `<button class="btn pri block" data-act="submit" ${p.picks.size ? '' : 'disabled'}>提交</button>`;
    if (done) { body += verdict(p) + sol(); foot = rateBar(p, 4); }
  } else if (it.t === 'tf') {
    const done = p.phase === 'back';
    body = `<div class="md" style="margin-top:6px">${md(it.q)}</div><div class="tf">` + [[true, '对'], [false, '错']].map(([val, l]) => { let cls = ''; if (done) { if (val === it.a) cls = 'ok'; else if (p.pick === val) cls = 'no'; } return `<button class="opt ${cls}" data-act="tf" data-v="${val}" ${done ? 'disabled' : ''}>${ico(val ? 'check' : 'x')}${l}</button>`; }).join('') + `</div>`;
    if (done) { body += verdict(p) + sol(); foot = rateBar(p, 4); }
  } else if (it.t === 'cloze') {
    const n = (it.q.match(/\{\{/g) || []).length, all = p.phase === 'back' || p.rev.size >= n;
    body = (it.title ? `<h3 class="pt">${esc(it.title)}</h3>` : '') + `<div class="md" style="margin-top:6px">${md(it.q, { cloze: true, revealAll: all, revealed: p.rev })}</div>`;
    if (all) { body += sol(); foot = rateBar(p, 4); } else foot = `<button class="btn soft block" data-act="reveal">显示全部答案</button>`;
  } else if (it.t === 'qa') {
    body = (it.title ? `<h3 class="pt">${esc(it.title)}</h3>` : '') + `<div class="md" style="margin-top:6px">${md(it.q)}</div>`;
    if (p.phase === 'back') { body += panel('ans', '参考答案', 'check', it.a, true, 'ans') + sol(); foot = rateBar(p, 4); }
    else foot = `<button class="btn pri block" data-act="reveal">显示答案</button>`;
  } else if (it.t === 'think') {
    const st = it.st || [], shown = p.phase === 'back' ? st.length : p.step;
    body = (it.title ? `<h3 class="pt">${esc(it.title)}</h3>` : '') + `<div class="md" style="margin-top:6px">${md(it.q)}</div>`;
    if (shown) body += `<div class="steps2">${st.slice(0, shown).map((s, i) => `<div class="s"><span class="n">${i + 1}</span><div class="md">${md(s)}</div></div>`).join('')}</div>`;
    if (p.phase === 'back') { if (it.a) body += panel('ans', '结论', 'check', it.a, true, 'ans'); body += sol(); foot = rateBar(p, 4); }
    else foot = `<div class="acts">${shown < st.length ? `<button class="btn" data-act="step">提示 ${shown + 1}/${st.length}</button>` : ''}<button class="btn pri" data-act="reveal">看结论</button></div>`;
  }
  return `<div class="pin">${head}${body}${note}<div class="pf">${foot}</div></div>`;
}
function panel(key, label, icon, content, open, cls = '') {
  return `<div class="panel ${cls} ${open ? 'open' : ''}"><button class="ph2" ${cls === 'ans' ? '' : `data-act="tog" data-k="${key}"`}>${ico(icon)}<span class="pl">${label}</span>${!open && key === 'open' ? `<span class="pv">${esc(plain(content).slice(0, 36))}</span>` : ''}${cls === 'ans' ? '' : ico('chev', 'chev')}</button>${open ? `<div class="pb md">${md(content)}</div>` : ''}</div>`;
}
function verdict(p) { return p.auto == null ? '' : `<div class="verdict ${p.auto ? 'ok' : 'no'}">${ico(p.auto ? 'check' : 'x')}${p.auto ? '正确' : '错误'}<span class="key">答案 ${ansText(p.it)}</span></div>`; }
function rateBar(p, n) {
  const base = p.g != null ? p.snap : getSt(p.it), now = Date.now(), st = p.g != null ? getSt(p.it) : null;
  const opts = n === 3 ? [[1, '没懂'], [3, '记住了'], [4, '太简单']] : [[1, '忘了'], [2, '模糊'], [3, '记得'], [4, '简单']];
  return `${st ? `<div class="rated">${fmtNext(st)}</div>` : ''}<div class="rates ${n === 3 ? 'r3' : ''} ${p.g != null ? 'done' : ''}">${opts.map(([g, l]) => { const s = schedule(base, g, now); return `<button class="rate ${p.g === g ? 'on' : ''}" data-act="rate" data-g="${g}"><b>${l}</b><small>${s.ivl ? fmtDays(s.ivl) : fmtIvl(s.due - now)}</small></button>`; }).join('')}</div>`;
}
function endCard(pr) {
  if (pr.kind === 'daily') return dailyEndCard();
  const el = h(`<article class="post"><div class="endc"></div></article>`), box = $('.endc', el);
  if (pr.kind === 'section') {
    const p = secProg(SECS.get(pr.sid));
    if (pr.step === 'learn') box.innerHTML = `${heroBadge('learn')}<h3>学完了</h3><p>${p.p ? `接下来 ${p.p} 道练习` : '本节还没有练习'}</p><div class="acts">${p.p ? `<button class="btn pri" data-step-go="practice">开始练习</button>` : `<button class="btn pri" data-act="gen-q">${ico('wand')}AI 出练习</button><button class="btn ghost" data-step-go="summary">查看小结</button>`}</div>`;
    else box.innerHTML = `${heroBadge('check')}<h3>练习完成</h3><div class="acts"><button class="btn pri" data-step-go="summary">查看小结</button></div>`;
  } else { const t = todayStats(); if (Feed.queue.length && Feed.results.size) setTimeout(() => Motion.confetti(), 250); box.innerHTML = `${heroBadge('check')}<h3>${Feed.queue.length ? '完成' : '这里还没有内容'}</h3><p>今天新学 ${t.n} 个，复习 ${t.r} 个</p><div class="acts"><button class="btn pri" data-home>回到今日</button></div>`; }
  return el;
}
function summaryCard(pr) {
  const sec = SECS.get(pr.sid), c = COURSES.get(sec.course), p = secProg(sec), res = [...Feed.results.entries()].map(([id, r]) => ({ it: ITEMS.get(id), ...r })).filter(x => x.it);
  const qs = res.filter(x => x.q), right = qs.filter(x => x.ok).length, wrong = res.filter(x => !x.ok);
  const nxt = (() => { const all = courseSecs(c), i = all.indexOf(sec); return all.slice(i + 1).find(s => ['todo', 'learning', 'empty'].includes(secStatus(s))); })();
  const el = h(`<article class="post"><div class="endc"></div></article>`);
  if (p.kpd === p.kp && p.qd === p.q && Feed.results.size) setTimeout(() => Motion.confetti(), 350);
  $('.endc', el).innerHTML = `${heroBadge('flag')}<h3>${esc(sec.title)}</h3>
  <div class="kp3"><div><b data-count>${p.kpd}/${p.kp}</b><span>知识点</span></div><div><b>${qs.length ? right + '/' + qs.length : '—'}</b><span>本次答对</span></div><div><b>${wrong.length}</b><span>需加强</span></div></div>
  ${wrong.length ? `<div class="group menu">${wrong.slice(0, 6).map(x => `<button data-only="${x.it.id}"><span class="tico soft" style="--c:${x.q ? 'var(--warn)' : 'var(--accent)'}">${tileIco(x.q ? 'pen' : 'bulb')}</span><span class="grow">${esc(plain(x.it.title || x.it.q).slice(0, 36))}<small>${TYPE_LABEL[x.it.t]} · 已加入错题本</small></span></button>`).join('')}</div>` : ''}
  <button class="btn soft block" data-reflect>${ico('edit')}写笔记</button>
  <div class="acts">${nxt ? `<button class="btn pri" data-next="${nxt.id}">下一节：${esc(nxt.title)}</button>` : ''}<button class="btn" data-home>回到今日</button><button class="btn ghost" data-course-go="${c.id}">课程目录</button></div>`;
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.next) { Nav.stack.pop(); startSection(b.dataset.next); }
    else if (b.dataset.only) go('session', { kind: 'section', sid: pr.sid, step: 'practice', only: b.dataset.only });
    else if (b.dataset.courseGo != null) { Nav.stack = [{ view: 'library' }, { view: 'course', params: { id: b.dataset.courseGo } }]; Nav.tab = 'library'; render(true); }
    else if (b.hasAttribute('data-home')) go('today', {}, { tab: true });
    else if (b.hasAttribute('data-reflect')) newNote({ course: c.id, sec: sec.id, ai: true });
  });
  return el;
}

/* ---- 复习 ---- */
function viewReview() {
  const v = $('#view'), due = dueItems(), wrong = wrongItems(), star = starItems(), left = reviewLeft(), today = dayKey(), fc = [];
  for (let i = 0; i < 7; i++) fc.push({ k: addDays(today, i), n: 0 });
  let learned = 0, mastered = 0;
  for (const it of ITEMS.values()) { const s = getSt(it); if (!s || !visible(it)) continue; learned++; if (s.ivl >= 21) mastered++; const k = dayKey(Math.max(s.due, Date.now())); const f = fc.find(x => x.k === k); if (f) f.n++; }
  const max = Math.max(1, ...fc.map(x => x.n)), dueN = Math.min(due.length, left);
  const byCourse = {}; due.slice(0, left).forEach(it => byCourse[it.course] = (byCourse[it.course] || 0) + 1);
  const days = []; for (let i = 29; i >= 0; i--) { const k = addDays(today, -i), s = S().stats[k]; days.push({ k, n: s?.n || 0, r: s?.r || 0, sec: s?.sec || 0 }); }
  const mx = Math.max(1, ...days.map(d => d.n + d.r)), tot = days.reduce((a, d) => a + d.n + d.r, 0), act = days.filter(d => d.n + d.r).length, mins = Math.round(days.reduce((a, d) => a + d.sec, 0) / 60);
  v.innerHTML = `<div class="wrap"><header class="lt"><div class="t"><h1>学习记录</h1></div></header><div class="stack">
  <div class="dueh"><div class="grow"><div class="big" data-count>${dueN}</div><div class="lab">${dueN ? `${ico('clock')}约 ${Math.max(1, Math.round(dueN * .4))} 分钟` : due.length ? '额度已用完' : `${ico('check')}已清空`}</div></div>${dueN ? `<button class="play" id="rv-go" aria-label="开始复习" style="width:56px;height:56px">${ico('play', '', 'fill')}</button>` : ''}</div>
  <div class="group icons">
    <button class="rowi" data-rk="wrong"><span class="tico" style="--c:var(--bad)">${tileIco('alert')}</span><span class="grow"><div class="t">错题本</div></span><span class="r num">${wrong.length}</span>${ico('chev', 'chev')}</button>
    <button class="rowi" data-rk="star"><span class="tico" style="--c:var(--warn)">${tileIco('star')}</span><span class="grow"><div class="t">收藏</div></span><span class="r num">${star.length}</span>${ico('chev', 'chev')}</button>
  </div>
  ${Object.keys(byCourse).length > 1 ? `<div class="gh"><b>按课程</b></div><div class="group icons">${Object.entries(byCourse).map(([cid, n]) => { const c = COURSES.get(cid); return `<button class="rowi" data-rc="${cid}">${courseMark(c)}<span class="grow"><div class="t">${esc(c.title)}</div></span><span class="r num">${n}</span>${ico('chev', 'chev')}</button>`; }).join('')}</div>` : ''}
  ${historyGroup()}
  <div class="gh"><b>未来 7 天</b><span>已学 ${learned} · 牢固 ${mastered}</span></div>
  <div class="card card-in">${true ? `<div class="fc">${fc.map((x, i) => `<div class="c ${i === 0 ? 't' : ''} ${x.n ? '' : 'z'}"><b>${x.n}</b><i style="height:${x.n / max * 72}px"></i><span>${i === 0 ? '今天' : WEEK[keyToDate(x.k).getDay()]}</span></div>`).join('')}</div>` : ''}</div>
  <div class="gh"><b>近 30 天</b><span>${act} 天 · ${tot} 个 · ${mins} 分钟</span></div>
  <div class="card card-in">${true ? `<div class="trend">${days.map(d => `<div class="c ${d.n + d.r ? '' : 'z'}" title="${d.k}：新学 ${d.n}，复习 ${d.r}"><i class="n" style="height:${d.n / mx * 100}%"></i><i class="r" style="height:${d.r / mx * 100}%"></i></div>`).join('')}</div>` : ''}</div>
  <div class="gh"><b>学习日历</b><span>${Object.keys(S().checkins).length} 天打卡</span></div>
  <div class="card card-in">${heatmap()}</div>
  </div></div>`;
  $('#rv-go')?.addEventListener('click', () => openReview('review'));
  $('#hist-more')?.addEventListener('click', e => { e.currentTarget.parentElement.classList.add('all'); e.currentTarget.remove(); });
  $$('[data-rk]', v).forEach(b => b.onclick = () => openReview(b.dataset.rk));
  $$('[data-rc]', v).forEach(b => b.onclick = () => openReview('review', { course: b.dataset.rc }));
}

/* ---- 资料 ---- */
const MAT_COLOR = { pdf: '#c43d3d', images: '#1f8a4c', text: '#1d5bd6' };
const matBadge = (m, lg) => docBadge(m.kind === 'pdf' ? 'PDF' : m.kind === 'images' ? 'IMG' : (m.ext || 'TXT').toUpperCase().slice(0, 4), MAT_COLOR[m.kind] || '#6e7582', lg);
function jobCard(j) {
  const p = jobProg(j), running = Runner.job?.id === j.id, c = COURSES.get(j.course), cur = j.steps.find(x => x.st === 'run');
  return `<div class="rowi" style="flex-wrap:wrap;align-items:center"><span style="position:relative;width:40px;height:40px;flex:none">${ring(p.t ? p.d / p.t : 0, 40, 4, running ? 'var(--accent)' : j.status === 'done' ? 'var(--good)' : 'var(--warn)')}</span><span class="grow"><div class="t">${esc(j.title)}</div><div class="m">${running && cur ? `正在整理 ${esc(SECS.get(cur.sec)?.title || '')}` : j.status === 'done' ? '已完成' : '已暂停'} · ${p.d}/${p.t} 节 · ${p.items} 个内容${p.err ? ` · ${p.err} 节失败` : ''}</div></span>
  ${running ? `<button class="btn sm" data-jpause>暂停</button>` : j.status !== 'done' ? `<button class="btn sm soft" data-jrun="${j.id}">${p.d ? '继续' : '开始'}</button>` : c ? `<button class="btn sm soft" data-jcourse="${c.id}">查看</button>` : ''}
  ${!running ? `<button class="ibtn" data-jdel="${j.id}" aria-label="删除任务" style="color:var(--ink-3)">${ico('trash')}</button>` : ''}</div>`;
}
/* ---- 课程资料：只列出与这门课关联的资料（整理进这门课的资料及其整理任务） ---- */
function viewCourseMats({ id }) {
  const c = COURSES.get(id), v = $('#view'); if (!c) return back();
  const js = jobs().filter(j => j.course === id), linked = new Set(js.map(j => j.mat));
  const list = [...MATS.values()].filter(m => m.course === id || linked.has(m.id)).sort((a, b) => b.createdAt - a.createdAt);
  const loose = [...MATS.values()].filter(m => !m.course || !COURSES.has(m.course));
  v.innerHTML = appbar('', loose.length ? `<button class="ibtn" id="cm-add" aria-label="从未归类资料添加">${ico('plus')}</button>` : '') + `<div class="wrap"><div class="stack">
  <header style="padding:4px 4px 0"><div class="eyebrow" style="color:${c.color}">${esc(c.title)}</div><h1 class="phead">资料</h1></header>
  ${importBox(id)}
  ${js.length ? `<div class="gh"><b>整理任务</b></div><div class="group">${js.map(jobCard).join('')}</div>` : ''}
  ${list.length ? `<div class="gh"><b>本课程资料</b><span>${list.length}</span></div><div class="group" style="--sepl:64px">${list.map(matRow).join('')}</div>`
    : `<div class="empty">${tileIco('folder')}<b>还没有资料</b></div>`}
  </div></div>`;
  $('[data-back]', v).onclick = back;
  bindImportBox(v, id);
  $$('[data-mat]', v).forEach(b => b.onclick = () => go('material', { id: b.dataset.mat }));
  bindJobButtons(v);
  $('#cm-add')?.addEventListener('click', () => menuSheet('从未归类资料添加', loose.map(m => ({ icon: matIcon(m), label: m.name, sub: matMeta(m), run: () => { m.course = id; saveMat(m); refresh(); toast('已归到「' + c.title + '」'); } }))));
}
/* 资料的导入入口（文件、拍照、粘贴），course 为空时导入后再选课程 */
function importBox(course) {
  return `<div class="dropzone" data-drop><div class="imp3"><button data-imp="file"><span class="ib" style="--c:var(--accent)">${tileIco('folder')}</span>文件</button><button data-imp="cam"><span class="ib" style="--c:var(--good)">${tileIco('camera')}</span>拍照</button><button data-imp="paste"><span class="ib" style="--c:var(--warn)">${tileIco('list')}</span>粘贴</button></div>
    <input type="file" hidden multiple data-f accept=".pdf,.docx,.txt,.md,.json,.csv,.tsv,image/*"><input type="file" hidden data-c accept="image/*" capture="environment" multiple></div>`;
}
function bindImportBox(v, course) {
  const dz = $('[data-drop]', v); if (!dz) return;
  const fi = $('[data-f]', dz), cam = $('[data-c]', dz), opt = course ? { course } : {};
  $('[data-imp="file"]', dz).onclick = () => fi.click(); $('[data-imp="cam"]', dz).onclick = () => cam.click(); $('[data-imp="paste"]', dz).onclick = () => pasteSheet(course);
  fi.onchange = () => { importFiles([...fi.files], opt); fi.value = ''; }; cam.onchange = () => { importFiles([...cam.files], opt); cam.value = ''; };
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); importFiles([...e.dataTransfer.files], opt); };
}
const matRow = m => `<button class="rowi" data-mat="${m.id}">${matBadge(m)}<span class="grow"><div class="t">${esc(m.name)}</div><div class="m">${esc(matMeta(m))}</div></span>${m.scanned ? '<span class="pill warn">扫描版</span>' : ''}${ico('chev', 'chev')}</button>`;
/* 全部资料：按课程分组，未归类的放最后 */
function viewMaterials() {
  const v = $('#view'), list = [...MATS.values()].sort((a, b) => b.createdAt - a.createdAt), js = jobs();
  const by = new Map(); for (const m of list) { const k = m.course && COURSES.has(m.course) ? m.course : ''; (by.get(k) || by.set(k, []).get(k)).push(m); }
  const groups = [...shownCourses().filter(c => by.has(c.id)).map(c => [c, by.get(c.id)]), ...(by.has('') ? [[null, by.get('')]] : [])];
  v.innerHTML = appbar('全部资料') + `<div class="wrap"><div class="stack">
  ${importBox('')}
  ${js.length ? `<div class="gh"><b>整理任务</b></div><div class="group">${js.map(jobCard).join('')}</div>` : ''}
  ${groups.length ? groups.map(([c, ms]) => `<div class="gh">${c ? `<b>${esc(c.title)}</b><button class="link" data-cm="${c.id}">课程资料</button>` : `<b>未归类</b><span>导入后选择所属课程</span>`}</div><div class="group" style="--sepl:64px">${ms.map(matRow).join('')}</div>`).join('')
    : `<div class="empty">${tileIco('folder')}<b>还没有资料</b></div>`}
  </div></div>`;
  $('[data-back]', v).onclick = back;
  bindImportBox(v, '');
  $$('[data-mat]', v).forEach(b => b.onclick = () => go('material', { id: b.dataset.mat }));
  $$('[data-cm]', v).forEach(b => b.onclick = () => go('cmats', { id: b.dataset.cm }));
  bindJobButtons(v);
}
function viewMaterial({ id }) {
  const m = MATS.get(id), v = $('#view'); if (!m) return back();
  const js = jobs().filter(j => j.mat === id), c = m.course && COURSES.get(m.course);
  v.innerHTML = appbar('', `<button class="ibtn" id="mm-more" aria-label="更多">${ico('more')}</button>`) + `<div class="wrap"><div class="stack">
  <div class="chead" style="align-items:center">${matBadge(m, true)}<div class="grow"><h1 style="font-size:22px">${esc(m.name)}</h1><div class="m">${esc(matMeta(m))}</div></div></div>
  ${m.scanned ? `<div class="gf" style="margin:0 4px;color:var(--warn)">扫描版：建议先识别文字</div>` : ''}
  ${c ? `<button class="btn pri block" id="mm-in">${ico('wand')}AI 整理进「${esc(c.title)}」</button>` : `<div class="card card-in" style="display:flex;gap:12px;align-items:center"><span class="grow small" style="color:var(--ink);display:flex;align-items:center;gap:6px">${ico('folder')}未归类</span><button class="btn sm soft" id="mm-set">选择课程</button></div><button class="btn pri block" id="mm-org">${ico('wand')}AI 整理成新课程</button>`}
  <div class="qa4"><button id="mm-fill"><span class="ib">${tileIco('plus')}</span>补充到课程</button>${m.kind !== 'text' ? `<button id="mm-ocr"><span class="ib">${tileIco('spark')}</span>识别文字</button>` : ''}${m.file || m.imgs ? `<button id="mm-open"><span class="ib">${tileIco('file')}</span>原文件</button>` : ''}<button id="mm-exp"><span class="ib">${tileIco('download')}</span>导出文字</button></div>
  ${c ? `<div class="group icons"><button class="rowi" data-jcourse="${c.id}">${courseMark(c)}<span class="grow"><div class="t">${esc(c.title)}</div><div class="m">所属课程 · ${courseStats(c).items} 个内容</div></span>${ico('chev', 'chev')}</button></div>` : ''}
  ${js.length ? `<div class="gh"><b>整理任务</b></div><div class="group">${js.map(jobCard).join('')}</div>` : ''}
  <div class="gh"><b>内容</b><span>${m.pages} ${m.kind === 'text' ? '段' : '页'}</span></div>
  <div class="group" id="mm-pages" style="--sepl:58px"><div class="empty"><span class="spin"></span></div></div>
  </div></div>`;
  $('[data-back]', v).onclick = back;
  const setCourse = () => menuSheet('所属课程', shownCourses().map(x => ({ icon: x.id === m.course ? 'check' : 'book', label: x.title, sub: x.cat, run: () => { m.course = x.id; saveMat(m); refresh(); toast('已归到「' + x.title + '」'); } })));
  $('#mm-org')?.addEventListener('click', () => organizeSheet(m));
  $('#mm-in')?.addEventListener('click', () => organizeSheet(m, { course: c.id }));
  $('#mm-set')?.addEventListener('click', setCourse);
  $('#mm-fill').onclick = () => organizeSheet(m, { course: m.course || shownCourses()[0]?.id });
  $('#mm-ocr')?.addEventListener('click', () => ocrSheet(m));
  $('#mm-open')?.addEventListener('click', () => openOriginal(m));
  $('#mm-exp').onclick = async () => Files.save(m.name + '.md', (await matPages(m)).map((t, i) => `<!-- 第 ${i + 1} 页 -->\n${t}`).join('\n\n'), 'text/markdown');
  bindJobButtons(v);
  $('#mm-more').onclick = () => menuSheet(m.name, [
    { icon: 'book', label: '更改所属课程', run: setCourse },
    c && { icon: 'wand', label: 'AI 整理成新课程', run: () => organizeSheet(m) },
    { icon: 'edit', label: '重命名', run: () => { const s = sheet('重命名', `<input class="inp" id="rn" value="${esc(m.name)}"><button class="btn pri" id="rn-ok">保存</button>`); $('#rn-ok', s.body).onclick = () => { m.name = $('#rn', s.body).value.trim() || m.name; saveMat(m); s.close(); refresh(); }; } },
    m.kind === 'pdf' && { icon: 'upload', label: '重新选择原文件', run: () => { const i = h('<input type="file" accept="application/pdf" hidden>'); document.body.append(i); i.onchange = async () => { const f = i.files[0]; i.remove(); if (!f) return; await ensurePdfJs(); matPdf.set(m.id, await pdfjsLib.getDocument({ data: await f.arrayBuffer(), isEvalSupported: false }).promise); m.file = await Files.put(f, 'application/pdf'); saveMat(m); toast('已重新关联原文件'); refresh(); }; i.click(); } },
    { icon: 'trash', label: '删除资料', cls: 'danger', run: async () => { if (!await confirmBox('删除资料', `删除「${m.name}」及其文件？`, '删除', true)) return; for (const r of [m.file, m.text, ...(m.imgs || [])]) if (r) Files.del(r); Store.drop('mat/' + m.id); MATS.delete(m.id); back(); } }
  ]);
  matPageFrom = 0; drawPages(m);
}
async function drawPages(m) {
  const box = $('#mm-pages'); if (!box) return;
  let pages; try { pages = await matPages(m); } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const to = Math.min(pages.length, matPageFrom + 30);
  box.innerHTML = pages.slice(0, to).map((t, i) => `<button class="rowi" data-pg="${i}"><span class="pgno">${i + 1}</span><span class="grow"><div class="kprev" style="-webkit-line-clamp:2;color:var(--ink)">${t.trim() ? esc(t.slice(0, 160)) : '<span class="muted">没有文字</span>'}</div></span>${ico('chev', 'chev')}</button>`).join('') + (to < pages.length ? `<button class="rowi" id="mm-more-p" style="justify-content:center;color:var(--accent)">再显示 30 ${m.kind === 'text' ? '段' : '页'}</button>` : '');
  $('#mm-more-p', box)?.addEventListener('click', () => { matPageFrom = to; drawPages(m); });
  $$('[data-pg]', box).forEach(b => b.onclick = () => pageSheet(m, +b.dataset.pg));
}

/* ---- AI ---- */

/* ---- 设置 ---- */
function viewSettings() {
  const v = $('#view'), p = P(), pl = plan(), hiddenN = Object.keys(S().hidden).length, hc = Object.keys(S().hiddenCourses);
  const segRow = (id, label, opts, cur) => `<div class="rowi" style="flex-direction:column;align-items:stretch;gap:8px"><div class="m" style="margin:0">${label}</div><div class="seg" id="${id}">${opts.map(([k, l]) => `<button data-v="${k}" aria-pressed="${cur == k}">${l}</button>`).join('')}</div></div>`;
  v.innerHTML = appbar('设置') + `<div class="wrap"><div class="stack">
  <div class="gh"><b>阅读排版</b></div>
  <div class="preview"><article class="post"><div class="pin"><div class="ph"><span class="ptype">知识点</span></div><h3 class="pt">时延、公式与表格</h3><div class="md">${md(SAMPLE)}</div></div></article></div>
  <div class="card card-in" style="display:flex;flex-direction:column;gap:14px">${typoControls()}<button class="btn ghost sm" id="t-reset" style="align-self:center">恢复默认</button></div>
  ${Platform.aiConfigurable ? aiSettingsGroup() : ''}${Platform.notify ? reminderGroup() : ''}
  <div class="gh"><b>外观</b></div>
  <div class="group">${segRow('s-theme', '主题', [['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色'], ['eye', '护眼']], p.theme)}${segRow('s-feed', '学习时的滚动', [['flow', '连续滚动'], ['snap', '一屏一张']], p.feed === 'snap' ? 'snap' : 'flow')}<div class="rowi"><span class="grow"><div class="t">评分后翻到下一张</div></span><button class="toggle" role="switch" id="s-auto" aria-checked="${p.autoNext !== false}" aria-label="评分后翻到下一张"></button></div><div class="rowi"><span class="grow"><div class="t">界面动效</div></span><button class="toggle" role="switch" id="s-motion" aria-checked="${p.motion !== false}" aria-label="界面动效"></button></div><div class="rowi"><span class="grow"><div class="t">触感反馈</div></span><button class="toggle" role="switch" id="s-hap" aria-checked="${p.haptic !== false}" aria-label="触感反馈"></button></div></div>
  <div class="gh"><b>首页</b></div>
  <div class="group icons"><button class="rowi" id="s-home"><span class="tico">${tileIco('sliders')}</span><span class="grow"><div class="t">首页内容</div></span>${ico('chev', 'chev')}</button></div>
  <div class="gh"><b>复习</b></div>
  <div class="group">${segRow('s-ret', '目标记忆保持率', [[.85, '85%'], [.9, '90%'], [.93, '93%'], [.95, '95%']], pl.retention)}
    <div class="rowi"><span class="grow"><div class="t">每天复习上限</div></span><div class="stepper"><button data-mr="-50">−</button><input id="s-mr" inputmode="numeric" value="${pl.maxReview}"><button data-mr="50">＋</button></div></div>
    <div class="rowi"><span class="grow"><div class="t">别处已学每天放入</div></span><div class="stepper"><button data-e="-5">−</button><input id="s-ext" inputmode="numeric" value="${pl.extPerDay}"><button data-e="5">＋</button></div></div></div>
  <div class="gh"><b>数据</b></div>
  <div class="group icons">
    <div class="rowi"><span class="tico" style="--c:${Store.mode === 'cloud' ? 'var(--good)' : 'var(--warn)'}">${tileIco(Store.mode === 'cloud' ? 'sync' : 'alert')}</span><span class="grow"><div class="t">${Store.mode === 'cloud' ? Platform.cloudLabel : '只保存在这台设备'}</div><div class="m">${Store.mode === 'cloud' ? Platform.cloudSub : '建议定期导出备份'}</div></span></div>
    <button class="rowi" id="s-export"><span class="tico">${tileIco('download')}</span><span class="grow"><div class="t">导出完整备份</div></span>${ico('chev', 'chev')}</button>
    <button class="rowi" id="s-import"><span class="tico">${tileIco('upload')}</span><span class="grow"><div class="t">导入备份</div></span>${ico('chev', 'chev')}</button>
    ${hiddenN ? `<button class="rowi" id="s-unhide"><span class="tico" style="--c:#6e7582">${tileIco('eyeoff')}</span><span class="grow"><div class="t">恢复 ${hiddenN} 张隐藏的卡片</div></span></button>` : ''}
    ${hc.length ? `<button class="rowi" id="s-unhidec"><span class="tico" style="--c:#6e7582">${tileIco('book')}</span><span class="grow"><div class="t">恢复隐藏的课程</div></span></button>` : ''}
    <button class="rowi" id="s-reset"><span class="tico" style="--c:var(--bad)">${tileIco('trash')}</span><span class="grow"><div class="t" style="color:var(--bad)">清空学习记录</div></span></button>
  </div>
  <div class="gf">温新 ${APP_VERSION} · 开源软件（MIT）· github.com/NIKOPACK/Renew</div>
  </div></div>`;
  $('[data-back]', v).onclick = back; $('#s-home', v).onclick = homeSheet;
  bindTypo(v);
  if (Platform.aiConfigurable) bindAiSettingsGroup(v);
  if (Platform.notify) bindReminderGroup(v);
  $('#t-reset').onclick = () => { Object.assign(P(), { fs: 17, lh: 1.75, math: 1, code: .88, tbl: .92, pgap: .7, pad: 18, font: 'system', wrapCode: false }); applyPrefs(); savePrefs(); refresh(); };
  $$('#s-theme button').forEach(b => b.onclick = () => { p.theme = b.dataset.v; applyPrefs(); savePrefs(); refresh(); });
  $$('#s-feed button').forEach(b => b.onclick = () => { p.feed = b.dataset.v; applyPrefs(); savePrefs(); refresh(); });
  $('#s-auto').onclick = () => { p.autoNext = p.autoNext === false; savePrefs(); refresh(); };
  $('#s-motion').onclick = () => { p.motion = p.motion === false; savePrefs(); applyPrefs(); refresh(); };
  $('#s-hap').onclick = () => { p.haptic = p.haptic === false; savePrefs(); refresh(); Motion.haptic('ok'); };
  $$('#s-ret button').forEach(b => b.onclick = () => { pl.retention = +b.dataset.v; saveState(); refresh(); });
  $$('[data-e]').forEach(b => b.onclick = () => { pl.extPerDay = Math.max(5, pl.extPerDay + +b.dataset.e); saveState(); refresh(); });
  $$('[data-mr]').forEach(b => b.onclick = () => { pl.maxReview = Math.max(10, pl.maxReview + +b.dataset.mr); saveState(); refresh(); });
  $('#s-ext').onchange = e => { pl.extPerDay = Math.max(5, parseInt(e.target.value) || 25); saveState(); };
  $('#s-mr').onchange = e => { pl.maxReview = Math.max(10, parseInt(e.target.value) || 200); saveState(); };
  $('#s-export').onclick = exportData; $('#s-import').onclick = () => importData();
  $('#s-unhide')?.addEventListener('click', () => { S().hidden = {}; saveState(); refresh(); toast('已恢复'); });
  $('#s-unhidec')?.addEventListener('click', () => { S().hiddenCourses = {}; saveState(); refresh(); toast('已恢复'); });
  $('#s-reset').onclick = async () => {
    if (!await confirmBox('清空学习记录', '会删除所有复习记录、小节状态、打卡和统计。建议先导出备份。', '清空', true)) return;
    for (const k of Store.keys('srs/')) Store.put(k, { c: {} });
    Object.assign(S(), { sec: {}, cur: {}, stats: {}, checkins: {} }); logEvent('清空学习记录'); saveState(); toast('已清空'); refresh();
  };
}
