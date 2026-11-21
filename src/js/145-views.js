/* ============ 界面（v4：iOS 风格） ============ */
/* 课程封面：按课程名、分类中的关键词选学科图标（课程可用 icon 字段指定），渐变底 + 白色双色图标 */
const TOPIC_ICONS = [
  [/数据结构|算法|algorithm|data struct|leetcode/i, 'tree'], [/组成原理|计算机组成|体系结构|硬件|芯片|cpu|电路|单片机/i, 'cpu'],
  [/操作系统|linux|unix|shell|命令行|\bos\b/i, 'terminal'], [/计算机网络|网络|tcp|http|通信/i, 'network'],
  [/编程|代码|程序|python|java|c\+\+|前端|后端|javascript|golang|rust|软件/i, 'code'], [/学习|记忆|心理|认知|脑/i, 'brain'],
  [/统计|概率/i, 'sigma'], [/数学|高数|微积分|线代|线性代数|离散|函数|math|calculus/i, 'fn'],
  [/英语|日语|韩语|法语|德语|单词|词汇|口语|语法|english|vocab|language/i, 'translate'], [/物理|physics|力学|量子/i, 'atom'],
  [/化学|chemistry/i, 'flask'], [/生物|医学|生理|解剖|药|biology|medic/i, 'dna'], [/历史|history|古代/i, 'scroll'],
  [/法律|法学|政治|宪法|law/i, 'scales'], [/经济|金融|会计|财务|投资|管理|econom|financ/i, 'chart'], [/地理|geograph/i, 'globe'],
  [/音乐|music|乐理/i, 'music'], [/美术|设计|绘画|艺术|design|art/i, 'palette'], [/语文|文学|古诗|写作|阅读|作文/i, 'nib'],
  [/考研|考试|备考|exam/i, 'student']
];
const courseIcon = c => c.icon && IC[c.icon] ? c.icon : (TOPIC_ICONS.find(([re]) => re.test(`${c.title} ${c.cat || ''}`)) || [, 'bookopen'])[1];
const courseMark = (c, cls = 'tico') => `<span class="${cls}" style="--c:${c.color}">${ico(courseIcon(c), '', 'duo')}</span>`;
const coverHTML = (c, extra = '') => `<div class="cover" style="--c:${c.color}"><span class="cat">${esc(c.cat)}</span><b>${esc(c.title)}</b><span class="art">${ico(courseIcon(c), '', 'duo')}</span>${extra}</div>`;
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

/* ---- 今日 ---- */
function viewToday() {
  const v = $('#view'), M = todayModel(), d = new Date(Date.now() - CUT), ck = S().checkins[dayKey()];
  const canCheck = !ck && (M.finished || M.doneN >= 20) && M.doneN > 0, sk = streak();
  const next = M.courses.find(x => x.sec && x.done < x.pace) || M.courses.find(x => x.sec);
  let hero = '';
  if (next) {
    const p = secProg(next.sec), st = secStatus(next.sec), all = p.kp + p.q, dn = p.kpd + p.qd;
    hero = `<button class="cont press" data-sec="${next.sec.id}" style="--c:${next.c.color}"><span class="cv">${ico(courseIcon(next.c), '', 'duo')}</span><span class="grow"><div class="k">${st === 'learning' ? '继续学习' : st === 'empty' ? '待生成内容' : '下一节'} · ${esc(next.c.title)}</div><div class="tt">${esc(next.sec.title)}</div><div class="pbar"><i style="width:${pct(dn, all)}%;background:${next.c.color}"></i></div><div class="m">${st === 'empty' ? '待生成' : `${p.kp} 个知识点 · ${p.q} 道练习`}</div></span><span class="play">${ico('play', '', 'fill')}</span></button>`;
  } else if (!M.courses.length) hero = `<button class="cont press" data-tabgo="library"><span class="cv" style="--c:var(--accent)">${ico('book')}</span><span class="grow"><div class="k">开始</div><div class="tt">选择一门课程</div></span><span class="play">${ico('chev')}</span></button>`;
  const nGoal = M.courses.reduce((s, x) => s + (x.sec ? Math.max(x.pace, x.done) : x.done), 0);
  const rGoal = M.t.r + M.due;
  const task = (done, title, sub, attrs, right = '') => `<button class="rowi ${done ? 'done' : ''}" ${attrs}><span class="chk ${done ? 'on' : ''}">${ico('check')}</span><span class="grow"><div class="t">${title}</div>${sub ? `<div class="m">${sub}</div>` : ''}</span>${right}${ico('chev', 'chev')}</button>`;
  const rows = [];
  rows.push(task(M.due === 0, '复习', M.due ? `${M.due} 个今天到期` : M.t.r ? `已复习 ${M.t.r} 个` : '今天没有到期内容', 'data-review="review"', M.due ? `<span class="r num">${M.due}</span>` : ''));
  for (const x of M.courses) {
    if (!x.sec) { rows.push(task(true, esc(x.c.title), '计划内的小节都学完了', `data-course="${x.c.id}"`)); continue; }
    rows.push(task(x.done >= x.pace, `${esc(x.c.title)}`, `${esc(x.sec.title)}`, `data-sec="${x.sec.id}"`, `<span class="r num">${x.done}/${x.pace}</span>`));
  }
  if (M.wrong) rows.push(task(false, '巩固错题', `${M.wrong} 个答错或忘记的内容`, 'data-review="wrong"', `<span class="r num">${M.wrong}</span>`));
  const days = []; const today = dayKey(); let k0 = today; while ((keyToDate(k0).getDay() + 6) % 7 !== 0) k0 = addDays(k0, -1);
  for (let i = 0; i < 7; i++) { const k = addDays(k0, i), s = S().stats[k], n = s ? s.n + s.r : 0; days.push({ k, n, l: !n ? 0 : n < 15 ? 1 : n < 40 ? 2 : 3, ck: !!S().checkins[k], future: k > today }); }
  v.innerHTML = `<div class="wrap"><header class="lt"><div class="t"><div class="date">${d.getMonth() + 1}月${d.getDate()}日 星期${WEEK[d.getDay()]}</div><h1>今日</h1></div><button class="round" data-go="settings" aria-label="设置">${ico('gear', '', 'duo')}</button></header>
  <div class="stack">
    ${hero}
    <div class="stat3">
      <div><span class="rb">${ring(nGoal ? M.t.n / nGoal : 0, 46, 3.6, 'var(--accent)')}${ico('layers')}</span><b data-count>${M.t.n}<small>/${nGoal || 0}</small></b><span>新学</span></div>
      <div><span class="rb">${ring(rGoal ? M.t.r / rGoal : 0, 46, 3.6, 'var(--good)')}${ico('review')}</span><b data-count>${M.t.r}<small>/${rGoal}</small></b><span>复习</span></div>
      <div><span class="rb">${ring(Math.min(1, sk / 7), 46, 3.6, 'var(--warn)')}${ico('flame')}</span><b data-count>${sk}<small> 天</small></b><span>连续打卡</span></div>
    </div>
    <div class="gh"><b>今日任务</b><button class="link" id="plan-btn">计划</button></div>
    <div class="group">${rows.join('')}</div>
    ${ck ? `<button class="btn soft block" disabled>${ico('check')}今日已打卡</button>` : `<button class="btn ${canCheck ? 'pri' : ''} block" id="ck" ${canCheck ? '' : 'disabled'}>${ico('calendar')}打卡${canCheck ? '' : ` · ${M.doneN}/${Math.max(M.goal, 1)}`}</button>`}
    <div class="gh"><b>本周</b><button class="link" data-tabgo="review">统计</button></div>
    <div class="week">${days.map(x => `<div class="${x.k === today ? 'today' : ''} ${x.future ? 'future' : ''}" ${x.future ? '' : `data-day="${x.k}" role="button" tabindex="0" aria-label="${x.k} 的学习记录"`}><span>${WEEK[keyToDate(x.k).getDay()]}</span><span class="d" data-l="${x.l}" title="${x.k}：${x.n} 个">${keyToDate(x.k).getDate()}</span><span class="ckm ${x.ck ? 'on' : ''}"></span></div>`).join('')}</div>
  </div></div>`;
  $('#ck')?.addEventListener('click', () => { S().checkins[dayKey()] = 1; logEvent('打卡'); saveState(); toast(`打卡成功，已连续 ${streak()} 天`); refresh(); Motion.confetti(); });
  $('#plan-btn').onclick = planSheet;
  $$('[data-sec]', v).forEach(b => b.onclick = () => startSection(b.dataset.sec));
  $$('[data-course]', v).forEach(b => b.onclick = () => go('course', { id: b.dataset.course }));
}

/* ---- 课程书架 ---- */
function viewLibrary() {
  const v = $('#view'), all = shownCourses(), cats = ['全部', ...new Set(all.map(c => c.cat))];
  if (!cats.includes(libCat)) libCat = '全部';
  const groups = {}; all.filter(c => libCat === '全部' || c.cat === libCat).forEach(c => (groups[c.cat] ||= []).push(c));
  const tile = c => { const s = courseStats(c), p = pct(s.learned, s.items), done = s.items && !s.remain && s.learned;
    return `<button class="tile press" data-course="${c.id}">${coverHTML(c, done ? `<span class="done">${ico('check')}</span>` : '')}<div class="tm"><b>${s.items ? (s.learned ? p + '%' : '未开始') : '待生成'}</b><span>${s.secs} 节</span></div><div class="pbar"><i style="width:${p}%;background:${c.color}"></i></div></button>`; };
  v.innerHTML = `<div class="wrap"><header class="lt"><div class="t"><h1>课程</h1></div><button class="round acc" id="newc" aria-label="新建课程">${ico('plus', '', 'duo')}</button></header>
  <div class="stack"><button class="search-field" data-go="search">${ico('search')}搜索知识点、题目</button>
  ${cats.length > 2 ? `<div class="chips">${cats.map(c => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${c === libCat}">${esc(c)}</button>`).join('')}</div>` : ''}
  ${Object.entries(groups).map(([cat, cs]) => `<div class="gh"><b>${esc(cat)}</b><span>${cs.length} 门</span></div><div class="shelf">${cs.map(tile).join('')}</div>`).join('')}
  <div class="gh"><b>添加</b></div><div class="shelf"><button class="tile press" id="newc2"><div class="cover new">${ico('plus')}新建课程</div><div class="tm"><span>导入教材，AI 规划</span></div></button></div>
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
  <div class="chead">${coverHTML(c)}<div class="grow"><h1>${esc(c.title)}</h1><div class="m">${c.chapters.length} 章 · ${s.secs} 节 · 已学 ${pct(s.learned, s.items)}%${s.due ? ` · ${s.due} 个待复习` : ''}</div></div></div>
  ${next ? `<button class="btn pri block" id="cont">${ico('play', '', 'fill')}${secStatus(next) === 'learning' ? '继续' : '开始'}：${esc(next.title)}</button>` : `<button class="btn soft block" data-review-course="${c.id}">${ico('review')}复习这门课</button>`}
  <div class="qa4"><button id="cplan"><span class="ib">${ico('target', '', 'duo')}</span>计划</button><button id="csync"><span class="ib">${ico('sync', '', 'duo')}</span>同步进度</button><button id="cnotes"><span class="ib">${ico('doc', '', 'duo')}</span>笔记</button><button id="cmat"><span class="ib">${ico('folder', '', 'duo')}</span>资料</button></div>
  ${s.emptySecs ? `<div class="group"><button class="rowi" id="cgen"><span class="grow"><div class="t" style="color:var(--accent)">AI 生成 ${s.emptySecs} 个空小节</div></span>${ico('chev', 'chev')}</button></div>` : ''}
  ${c.chapters.map(ch => { const done = ch.sections.filter(x => ['done', 'external'].includes(secStatus(x))).length; return `<div class="gh" id="ch-${ch.id}"><b>${esc(ch.title)}</b><span class="num">${done}/${ch.sections.length}</span></div><div class="group" style="--sepl:50px">${ch.sections.map(secRow).join('')}</div>`; }).join('')}
  </div></div>`;
  $('[data-back]', v).onclick = back;
  $('#cont')?.addEventListener('click', () => startSection(next.id));
  $('[data-review-course]', v)?.addEventListener('click', () => openReview('review', { course: c.id }));
  $$('[data-sec]', v).forEach(b => b.onclick = () => go('section', { id: b.dataset.sec }));
  $('#cplan').onclick = planSheet; $('#csync').onclick = () => syncSheet(c);
  $('#cgen')?.addEventListener('click', () => batchGenSheet(c));
  $('#cnotes').onclick = () => go('notes', { course: c.id });
  $('#cmat').onclick = () => go('cmats', { id: c.id });
  $('#cmore').onclick = () => menuSheet(c.title, [
    { icon: 'download', label: '导出', sub: '课程包、Markdown 笔记、Anki 卡片', run: () => exportSheet(c) },
    { icon: 'target', label: cp.on ? '移出今日任务' : '加入今日任务', run: () => { cp.on = !cp.on; saveState(); refresh(); } },
    { icon: 'review', label: '复习这门课', run: () => openReview('review', { course: c.id }) },
    !c.builtin && { icon: 'edit', label: '编辑目录', run: () => editOutlineSheet(c) },
    c.builtin ? { icon: 'eyeoff', label: '从书架隐藏', run: () => { S().hiddenCourses[c.id] = 1; cp.on = false; saveState(); go('library', {}, { tab: true }); } }
      : { icon: 'trash', label: '删除课程', cls: 'danger', run: () => deleteCourse(c) }
  ]);
  if (next && !Nav.stack[Nav.stack.length - 1].y) { const el = $('#ch-' + next.chap); if (el && next.chap !== c.chapters[0].id) requestAnimationFrame(() => scrollTo(0, el.getBoundingClientRect().top + scrollY - 120)); }
}

/* ---- 小节 ---- */
function viewSection({ id }) {
  const sec = SECS.get(id), v = $('#view'); if (!sec) return back();
  const c = COURSES.get(sec.course), ch = CHAPS.get(sec.chap), st = secStatus(sec), p = secProg(sec), kps = secKps(sec), qs = secQs(sec);
  const learnDone = p.l && p.ld === p.l, pracDone = !p.p || p.pd === p.p, allDone = learnDone && pracDone;
  const step = (cls, n, t, m) => `<div class="s ${cls}"><span class="c">${cls === 'done' ? ico('check') : n}</span><b>${t}</b><span>${m}</span></div>`;
  v.innerHTML = appbar(c.title, `<button class="ibtn" id="smore" aria-label="更多">${ico('more')}</button>`) + `<div class="wrap"><div class="stack">
  <header style="padding:4px 4px 0"><div class="eyebrow" style="color:${c.color}">${esc(ch.title)}</div><h1 style="margin:4px 0 6px;font-size:28px;font-weight:800;line-height:1.2;letter-spacing:-.01em">${esc(sec.title)}</h1><button class="small" id="sst" style="color:var(--ink-2)">${SEC_LABEL[st]} · ${p.kp} 个知识点 · ${p.q} 道练习 ›</button></header>
  ${st === 'empty' ? `<div class="card card-in" style="display:flex;flex-direction:column;gap:12px;align-items:center;text-align:center;padding:28px 18px"><span class="round acc" style="width:56px;height:56px">${ico('wand', '', 'duo')}</span><b style="font-size:18px">这一节还没有内容</b>${sec.points.length ? `<span class="small">${sec.points.map(esc).join(' · ')}</span>` : ''}<button class="btn pri block" id="egen">${ico('wand')}生成本节内容</button><button class="btn ghost" id="eimp">导入卡片文本</button></div>`
    : `<div class="card"><div class="steps3">${step(learnDone ? 'done' : 'cur', 1, '学习', `${p.ld}/${p.l}`)}<span class="ln"></span>${step(learnDone && p.p && !pracDone ? 'cur' : p.p && pracDone ? 'done' : '', 2, '练习', `${p.pd}/${p.p}`)}<span class="ln"></span>${step(allDone ? 'done' : '', 3, '小结', allDone ? '完成' : '—')}</div>
    <div style="padding:10px 16px 16px;display:flex;flex-direction:column;gap:6px"><button class="btn pri block" id="start">${ico('play', '', 'fill')}${st === 'todo' ? '开始学习' : st === 'done' ? '重新学习' : learnDone ? '继续练习' : '继续学习'}</button>
    <div class="row" style="justify-content:center;gap:4px">${p.p ? `<button class="btn ghost sm" id="prac">只做练习</button>` : ''}<button class="btn ghost sm" id="snotes">笔记</button><button class="btn ghost sm" id="sgen">AI 补充</button></div></div></div>`}
  ${kps.length ? `<div class="gh"><b>知识点</b><span>${p.kpd}/${p.kp}</span></div><div class="group" style="--sepl:36px">${kps.map(it => `<div><button class="rowi" data-kp="${it.id}"><span class="dotst ${getSt(it) ? 'h' : ''}"></span><span class="grow"><div class="t">${esc(it.title || '知识点')}${it.imp >= 2 ? '<span class="badge-hot" title="高频"></span>' : ''}</div><div class="kprev">${esc(plain(it.q).slice(0, 80))}</div></span>${ico('chev', 'chev')}</button></div>`).join('')}</div>` : ''}
  ${qs.length ? `<div class="gh"><b>练习</b><span>${p.qd}/${p.q}</span></div><div class="group" style="--sepl:36px">${qs.map(it => { const s = getSt(it); return `<button class="rowi" data-q="${it.id}"><span class="dotst ${!s ? '' : s.lr === 1 ? 'n' : 'y'}"></span><span class="grow"><div class="m" style="margin:0 0 2px;color:var(--warn);font-weight:600">${TYPE_LABEL[it.t]}</div><div class="t" style="font-size:15px">${esc(plain(it.title || it.q).slice(0, 70))}</div></span>${ico('chev', 'chev')}</button>`; }).join('')}</div>` : ''}
  </div></div>`;
  $('[data-back]', v).onclick = back;
  $('#start')?.addEventListener('click', () => startSection(id));
  $('#prac')?.addEventListener('click', () => { S().cur[c.id] = id; saveState(); go('session', { kind: 'section', sid: id, step: 'practice' }); });
  $('#sgen')?.addEventListener('click', () => genSheet({ sid: id }));
  $('#snotes')?.addEventListener('click', () => go('notes', { course: c.id, sec: id }));
  $('#egen')?.addEventListener('click', () => genSheet({ sid: id }));
  $('#eimp')?.addEventListener('click', () => importSheet(id));
  $('#sst').onclick = () => statusSheet(id);
  $$('[data-kp]', v).forEach(b => b.onclick = () => {
    const w = b.parentElement, ex = $('.kopen', w), chev = $('.chev', b);
    chev.style.transition = 'transform .3s var(--e-ios)';
    if (ex) { chev.style.transform = ''; Motion.collapse(ex, () => ex.remove()); return; }
    const it = ITEMS.get(b.dataset.kp); chev.style.transform = 'rotate(90deg)';
    const kx = w.appendChild(h(`<div class="kopen"><div class="md">${md(it.q)}</div>${it.d ? `<div class="panel open"><div class="ph2">${ico('bulb')}详解</div><div class="pb md">${md(it.d)}</div></div>` : ''}</div>`)); Motion.expand(kx);
  });
  $$('[data-q]', v).forEach(b => b.onclick = () => go('session', { kind: 'section', sid: id, step: 'practice', only: b.dataset.q }));
  $('#smore').onclick = () => menuSheet(sec.title, [
    { icon: 'wand', label: 'AI 补充内容', run: () => genSheet({ sid: id }) },
    { icon: 'upload', label: '导入卡片文本', run: () => importSheet(id) },
    { icon: 'doc', label: '本节笔记', run: () => go('notes', { course: c.id, sec: id }) },
    { icon: 'download', label: '导出本节', run: () => exportSheet(c, sec) },
    { icon: 'review', label: '复习本节', run: () => openReview('section-review', { sid: id }) },
    { icon: 'flag', label: '更改学习状态', run: () => statusSheet(id) }
  ]);
}

/* ---- 学习会话 ---- */
function sessionBar(pr) {
  let crumb, steps = '';
  if (pr.kind === 'section') {
    const sec = SECS.get(pr.sid), c = COURSES.get(sec.course), p = secProg(sec);
    crumb = `${c.title} · ${sec.title}`;
    steps = `<div class="seg">${[['learn', '学习', p.l && p.ld === p.l], ['practice', '练习', p.p && p.pd === p.p], ['summary', '小结', false]].map(([k, l, d]) => `<button data-step="${k}" aria-pressed="${pr.step === k}">${d && pr.step !== k ? ico('check') : ''}${l}</button>`).join('')}</div>`;
  } else {
    const it0 = pr.kind === 'items' && ITEMS.get(pr.ids?.[0]);
    crumb = ({ review: '复习', wrong: '错题巩固', star: '收藏', 'section-review': '复习本节', items: '查看' }[pr.kind]) + ' · ' + (it0 ? SECS.get(it0.sec).title : pr.course ? COURSES.get(pr.course).title : pr.sid ? SECS.get(pr.sid).title : '全部课程');
  }
  const done = [...Feed.posts.values()].filter(p => p.g != null).length, tot = Math.max(1, Feed.queue.length);
  return `<div class="sbar"><div class="wrap"><div class="r1"><button class="ibtn" data-close-s aria-label="退出">${ico('close')}</button><div class="sprog"><i id="sp" style="width:${pr.step === 'summary' ? 100 : done / tot * 100}%"></i></div><span class="cnt" id="sc">${pr.step === 'summary' ? '' : `${done}/${Feed.queue.length}`}</span><button class="ibtn" data-typo aria-label="阅读排版">${ico('aa')}</button></div><div class="crumb">${esc(crumb)}</div>${steps}</div></div>`;
}
function postHTML(p) {
  const it = p.it, c = COURSES.get(it.course), sec = SECS.get(it.sec), showSrc = Feed.params?.kind !== 'section';
  const head = `<div class="ph"><span class="ptype ${isQ(it) ? 'q' : ''}">${TYPE_LABEL[it.t]}</span>${it.imp >= 2 ? '<span class="hot">· 高频</span>' : ''}${p.review ? '<span class="pill acc">· 复习</span>' : ''}<span class="src">${showSrc ? esc(c.title) + ' · ' + esc(sec.title) : ''}</span><button class="more ask" data-act="ask" aria-label="问 AI">${ico('spark')}</button><button class="more" data-act="more" aria-label="更多">${ico('more')}</button></div>`;
  let body = '', foot = '';
  const sol = () => it.x ? panel('sol', '详细解答', 'bulb', it.x, p.sol) : '';
  const note = S().notes?.[it.id] ? panel('noteOpen', '我的笔记', 'edit', S().notes[it.id], p.noteOpen) : '';
  if (it.t === 'kp') {
    body = `<h3 class="pt">${esc(it.title || '知识点')}</h3>`;
    if (p.phase === 'front') foot = `<button class="btn pri block" data-act="reveal">回忆后展开</button>`;
    else { body += `<div class="keypts md">${md(it.q)}</div>` + (it.d ? panel('open', '详解', 'bulb', it.d, p.open) : (AI.ok ? `<button class="btn soft sm" style="margin-top:14px" data-act="gen-d">${ico('wand')}AI 生成详解</button>` : '')); foot = rateBar(p, p.review ? 4 : 3); }
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
  const el = h(`<article class="post"><div class="endc"></div></article>`), box = $('.endc', el);
  if (pr.kind === 'section') {
    const p = secProg(SECS.get(pr.sid));
    if (pr.step === 'learn') box.innerHTML = `<div class="badge" style="background:var(--accent-soft);color:var(--accent)">${ico('layers')}</div><h3>学完了</h3><p>${p.p ? `接下来 ${p.p} 道练习` : '本节还没有练习'}</p><div class="acts">${p.p ? `<button class="btn pri" data-step-go="practice">开始练习</button>` : `<button class="btn pri" data-act="gen-q">${ico('wand')}AI 出练习</button><button class="btn ghost" data-step-go="summary">查看小结</button>`}</div>`;
    else box.innerHTML = `<div class="badge">${ico('check')}</div><h3>练习完成</h3><div class="acts"><button class="btn pri" data-step-go="summary">查看小结</button></div>`;
  } else { const t = todayStats(); if (Feed.queue.length && Feed.results.size) setTimeout(() => Motion.confetti(), 250); box.innerHTML = `<div class="badge">${ico('check')}</div><h3>${Feed.queue.length ? '完成' : '这里还没有内容'}</h3><p>今天新学 ${t.n} 个，复习 ${t.r} 个</p><div class="acts"><button class="btn pri" data-home>回到今日</button></div>`; }
  return el;
}
function summaryCard(pr) {
  const sec = SECS.get(pr.sid), c = COURSES.get(sec.course), p = secProg(sec), res = [...Feed.results.entries()].map(([id, r]) => ({ it: ITEMS.get(id), ...r })).filter(x => x.it);
  const qs = res.filter(x => x.q), right = qs.filter(x => x.ok).length, wrong = res.filter(x => !x.ok);
  const nxt = (() => { const all = courseSecs(c), i = all.indexOf(sec); return all.slice(i + 1).find(s => ['todo', 'learning', 'empty'].includes(secStatus(s))); })();
  const el = h(`<article class="post"><div class="endc"></div></article>`);
  if (p.kpd === p.kp && p.qd === p.q && Feed.results.size) setTimeout(() => Motion.confetti(), 350);
  $('.endc', el).innerHTML = `<div class="badge">${ico('flag')}</div><h3>${esc(sec.title)}</h3><p>${p.kpd === p.kp && p.qd === p.q ? '本节学完了，之后按记忆曲线复习' : `还有 ${p.kp - p.kpd + p.q - p.qd} 个内容没学`}</p>
  <div class="kp3"><div><b data-count>${p.kpd}/${p.kp}</b><span>知识点</span></div><div><b>${qs.length ? right + '/' + qs.length : '—'}</b><span>本次答对</span></div><div><b>${wrong.length}</b><span>需加强</span></div></div>
  ${wrong.length ? `<div class="group menu">${wrong.slice(0, 6).map(x => `<button data-only="${x.it.id}">${ico(x.q ? 'pen' : 'bulb')}<span class="grow">${esc(plain(x.it.title || x.it.q).slice(0, 36))}<small>${TYPE_LABEL[x.it.t]} · 已加入错题本</small></span></button>`).join('')}</div>` : ''}
  <div class="acts">${nxt ? `<button class="btn pri" data-next="${nxt.id}">下一节：${esc(nxt.title)}</button>` : ''}<button class="btn" data-home>回到今日</button><button class="btn ghost" data-course-go="${c.id}">课程目录</button></div>`;
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.next) { Nav.stack.pop(); startSection(b.dataset.next); }
    else if (b.dataset.only) go('session', { kind: 'section', sid: pr.sid, step: 'practice', only: b.dataset.only });
    else if (b.dataset.courseGo != null) { Nav.stack = [{ view: 'library' }, { view: 'course', params: { id: b.dataset.courseGo } }]; Nav.tab = 'library'; render(true); }
    else if (b.hasAttribute('data-home')) go('today', {}, { tab: true });
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
  <div class="dueh"><div class="grow"><div class="big" data-count>${dueN}</div><div class="lab">${dueN ? `今天待复习 · 约 ${Math.max(1, Math.round(dueN * .4))} 分钟` : due.length ? '今天的复习额度已用完' : '今天没有到期的内容'}</div></div>${dueN ? `<button class="play" id="rv-go" aria-label="开始复习" style="width:56px;height:56px">${ico('play', '', 'fill')}</button>` : ''}</div>
  <div class="group icons">
    <button class="rowi" data-rk="wrong"><span class="tico" style="--c:var(--bad)">${ico('alert', '', 'duo')}</span><span class="grow"><div class="t">错题本</div></span><span class="r num">${wrong.length}</span>${ico('chev', 'chev')}</button>
    <button class="rowi" data-rk="star"><span class="tico" style="--c:var(--warn)">${ico('star', '', 'duo')}</span><span class="grow"><div class="t">收藏</div></span><span class="r num">${star.length}</span>${ico('chev', 'chev')}</button>
  </div>
  ${Object.keys(byCourse).length > 1 ? `<div class="gh"><b>按课程</b></div><div class="group icons">${Object.entries(byCourse).map(([cid, n]) => { const c = COURSES.get(cid); return `<button class="rowi" data-rc="${cid}">${courseMark(c)}<span class="grow"><div class="t">${esc(c.title)}</div></span><span class="r num">${n}</span>${ico('chev', 'chev')}</button>`; }).join('')}</div>` : ''}
  ${historyGroup()}
  <div class="gh"><b>未来 7 天</b><span>已学 ${learned} · 牢固 ${mastered}</span></div>
  <div class="card card-in">${learned ? `<div class="fc">${fc.map((x, i) => `<div class="c ${i === 0 ? 't' : ''}"><b>${x.n}</b><i style="height:${x.n / max * 72}px"></i><span>${i === 0 ? '今天' : WEEK[keyToDate(x.k).getDay()]}</span></div>`).join('')}</div>` : `<div class="small" style="text-align:center;padding:18px 0">学过的内容会按遗忘曲线排进这里</div>`}</div>
  <div class="gh"><b>近 30 天</b><span>${act} 天 · ${tot} 个 · ${mins} 分钟</span></div>
  <div class="card card-in">${tot ? `<div class="trend">${days.map(d => `<div class="c" title="${d.k}：新学 ${d.n}，复习 ${d.r}"><i class="n" style="height:${d.n / mx * 100}%"></i><i class="r" style="height:${d.r / mx * 100}%"></i></div>`).join('')}</div>` : `<div class="small" style="text-align:center;padding:18px 0">开始学习后，这里会显示每天的新学和复习量</div>`}</div>
  <div class="gh"><b>学习日历</b><span>${Object.keys(S().checkins).length} 天打卡</span></div>
  <div class="card card-in">${heatmap()}</div>
  </div></div>`;
  $('#rv-go')?.addEventListener('click', () => openReview('review'));
  $('#hist-more')?.addEventListener('click', e => { e.currentTarget.parentElement.classList.add('all'); e.currentTarget.remove(); });
  $$('[data-rk]', v).forEach(b => b.onclick = () => openReview(b.dataset.rk));
  $$('[data-rc]', v).forEach(b => b.onclick = () => openReview('review', { course: b.dataset.rc }));
}

/* ---- 资料 ---- */
const MAT_COLOR = { pdf: '#e0453f', images: '#2f9e63', text: '#3461f0' };
const matBadge = (m, lg) => `<span class="micon ${lg ? 'lg' : ''}" style="--c:${MAT_COLOR[m.kind] || '#8e8e93'}">${m.kind === 'pdf' ? 'PDF' : m.kind === 'images' ? 'IMG' : (m.ext || 'TXT').toUpperCase().slice(0, 4)}</span>`;
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
  v.innerHTML = appbar('', `<button class="ibtn" id="cm-add" aria-label="添加资料">${ico('plus')}</button>`) + `<div class="wrap"><div class="stack">
  <header style="padding:4px 4px 0"><div class="eyebrow" style="color:${c.color}">${esc(c.title)}</div><h1 style="margin:4px 0 0;font-size:28px;font-weight:800">资料</h1></header>
  ${js.length ? `<div class="gh"><b>整理任务</b></div><div class="group">${js.map(jobCard).join('')}</div>` : ''}
  ${list.length ? `<div class="group" style="--sepl:64px">${list.map(m => `<button class="rowi" data-mat="${m.id}">${matBadge(m)}<span class="grow"><div class="t">${esc(m.name)}</div><div class="m">${esc(matMeta(m))}</div></span>${ico('chev', 'chev')}</button>`).join('')}</div>`
    : `<div class="empty">${ico('folder')}<b>还没有资料</b></div>`}
  </div></div>`;
  $('[data-back]', v).onclick = back;
  $$('[data-mat]', v).forEach(b => b.onclick = () => go('material', { id: b.dataset.mat }));
  bindJobButtons(v);
  $('#cm-add').onclick = () => {
    const others = [...MATS.values()].filter(m => !list.includes(m)).sort((a, b) => b.createdAt - a.createdAt);
    menuSheet('添加资料', [
      ...others.map(m => ({ icon: matIcon(m), label: m.name, sub: matMeta(m), run: () => organizeSheet(m, { course: id }) })),
      { icon: 'upload', label: '导入新文件', run: () => { const i = h('<input type="file" multiple hidden>'); document.body.append(i); i.onchange = () => { importFiles([...i.files]); i.remove(); }; i.click(); } }
    ]);
  };
}
function viewMaterials() {
  const v = $('#view'), list = [...MATS.values()].sort((a, b) => b.createdAt - a.createdAt), js = jobs();
  v.innerHTML = `<div class="wrap"><header class="lt"><div class="t"><h1>资料</h1></div></header><div class="stack">
  <div id="mt-drop" class="dropzone"><div class="imp3"><button id="mt-imp"><span class="ib" style="--c:var(--accent)">${ico('folder', '', 'duo')}</span>文件</button><button id="mt-cam"><span class="ib" style="--c:#2f9e63">${ico('camera', '', 'duo')}</span>拍照</button><button id="mt-paste"><span class="ib" style="--c:#df8a0b">${ico('edit', '', 'duo')}</span>粘贴</button></div><input type="file" id="mt-file" multiple hidden accept=".pdf,.docx,.txt,.md,.markdown,.json,.csv,.tsv,image/*,application/pdf,text/plain"><input type="file" id="mt-camf" accept="image/*" capture="environment" multiple hidden></div>
  ${js.length ? `<div class="gh"><b>整理任务</b></div><div class="group">${js.map(jobCard).join('')}</div>` : ''}
  <div class="gh"><b>我的资料</b>${list.length ? `<span>${list.length}</span>` : ''}</div>
  ${list.length ? `<div class="group" style="--sepl:64px">${list.map(m => `<button class="rowi" data-mat="${m.id}">${matBadge(m)}<span class="grow"><div class="t">${esc(m.name)}</div><div class="m">${esc(matMeta(m))}</div></span>${m.scanned ? '<span class="pill warn">扫描版</span>' : m.course ? '<span class="pill good">已整理</span>' : ''}${ico('chev', 'chev')}</button>`).join('')}</div>` : `<div class="card"><div class="empty">${ico('folder')}<b>还没有资料</b></div></div>`}
  <div class="gh"><b>导出</b></div>
  <div class="group icons">${shownCourses().map(c => `<button class="rowi" data-exp="${c.id}">${courseMark(c)}<span class="grow"><div class="t">${esc(c.title)}</div></span>${ico('chev', 'chev')}</button>`).join('')}<button class="rowi" data-go="settings"><span class="tico" style="--c:#8e8e93">${ico('download', '', 'duo')}</span><span class="grow"><div class="t">完整备份</div></span>${ico('chev', 'chev')}</button></div>
  </div></div>`;
  const fi = $('#mt-file'), cam = $('#mt-camf');
  $('#mt-imp').onclick = () => fi.click(); $('#mt-cam').onclick = () => cam.click();
  fi.onchange = () => { importFiles([...fi.files]); fi.value = ''; }; cam.onchange = () => { importFiles([...cam.files]); cam.value = ''; };
  const dz = $('#mt-drop'); dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = () => dz.classList.remove('over'); dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); importFiles([...e.dataTransfer.files]); };
  $('#mt-paste').onclick = pasteSheet;
  $$('[data-mat]', v).forEach(b => b.onclick = () => go('material', { id: b.dataset.mat }));
  $$('[data-exp]', v).forEach(b => b.onclick = () => exportSheet(COURSES.get(b.dataset.exp)));
  bindJobButtons(v);
}
function viewMaterial({ id }) {
  const m = MATS.get(id), v = $('#view'); if (!m) return back();
  const js = jobs().filter(j => j.mat === id), c = m.course && COURSES.get(m.course);
  v.innerHTML = appbar('', `<button class="ibtn" id="mm-more" aria-label="更多">${ico('more')}</button>`) + `<div class="wrap"><div class="stack">
  <div class="chead" style="align-items:center">${matBadge(m, true)}<div class="grow"><h1 style="font-size:22px">${esc(m.name)}</h1><div class="m">${esc(matMeta(m))}</div></div></div>
  ${m.scanned ? `<div class="gf" style="margin:0 4px;color:var(--warn)">扫描版：建议先识别文字</div>` : ''}
  <button class="btn pri block" id="mm-org">${ico('wand')}AI 整理成新课程</button>
  <div class="qa4"><button id="mm-fill"><span class="ib">${ico('plus', '', 'duo')}</span>补充到课程</button>${m.kind !== 'text' ? `<button id="mm-ocr"><span class="ib">${ico('spark', '', 'duo')}</span>识别文字</button>` : ''}${m.file || m.imgs ? `<button id="mm-open"><span class="ib">${ico('file', '', 'duo')}</span>原文件</button>` : ''}<button id="mm-exp"><span class="ib">${ico('download', '', 'duo')}</span>导出文字</button></div>
  ${c ? `<div class="group icons"><button class="rowi" data-jcourse="${c.id}">${courseMark(c)}<span class="grow"><div class="t">${esc(c.title)}</div><div class="m">已整理 · ${courseStats(c).items} 个内容</div></span>${ico('chev', 'chev')}</button></div>` : ''}
  ${js.length ? `<div class="gh"><b>整理任务</b></div><div class="group">${js.map(jobCard).join('')}</div>` : ''}
  <div class="gh"><b>内容</b><span>${m.pages} ${m.kind === 'text' ? '段' : '页'}</span></div>
  <div class="group" id="mm-pages" style="--sepl:58px"><div class="empty"><span class="spin"></span></div></div>
  </div></div>`;
  $('[data-back]', v).onclick = back;
  $('#mm-org').onclick = () => organizeSheet(m);
  $('#mm-fill').onclick = () => organizeSheet(m, { course: m.course || shownCourses()[0]?.id });
  $('#mm-ocr')?.addEventListener('click', () => ocrSheet(m));
  $('#mm-open')?.addEventListener('click', () => openOriginal(m));
  $('#mm-exp').onclick = async () => Files.save(m.name + '.md', (await matPages(m)).map((t, i) => `<!-- 第 ${i + 1} 页 -->\n${t}`).join('\n\n'), 'text/markdown');
  bindJobButtons(v);
  $('#mm-more').onclick = () => menuSheet(m.name, [
    { icon: 'edit', label: '重命名', run: () => { const s = sheet('重命名', `<input class="inp" id="rn" value="${esc(m.name)}"><button class="btn pri" id="rn-ok">保存</button>`); $('#rn-ok', s.body).onclick = () => { m.name = $('#rn', s.body).value.trim() || m.name; saveMat(m); s.close(); refresh(); }; } },
    m.kind === 'pdf' && { icon: 'upload', label: '重新选择原文件', sub: '原文件在别的设备上时使用', run: () => { const i = h('<input type="file" accept="application/pdf" hidden>'); document.body.append(i); i.onchange = async () => { const f = i.files[0]; i.remove(); if (!f) return; await ensurePdfJs(); matPdf.set(m.id, await pdfjsLib.getDocument({ data: await f.arrayBuffer(), isEvalSupported: false }).promise); m.file = await Files.put(f, 'application/pdf'); saveMat(m); toast('已重新关联原文件'); refresh(); }; i.click(); } },
    { icon: 'trash', label: '删除资料', sub: '已生成的课程内容会保留', cls: 'danger', run: async () => { if (!await confirmBox('删除资料', `删除「${m.name}」及其文件？`, '删除', true)) return; for (const r of [m.file, m.text, ...(m.imgs || [])]) if (r) Files.del(r); Store.drop('mat/' + m.id); MATS.delete(m.id); back(); } }
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
  <div class="gh"><b>复习</b></div>
  <div class="group">${segRow('s-ret', '目标记忆保持率', [[.85, '85%'], [.9, '90%'], [.93, '93%'], [.95, '95%']], pl.retention)}
    <div class="rowi"><span class="grow"><div class="t">每天复习上限</div></span><div class="stepper"><button data-mr="-50">−</button><input id="s-mr" inputmode="numeric" value="${pl.maxReview}"><button data-mr="50">＋</button></div></div>
    <div class="rowi"><span class="grow"><div class="t">别处已学每天放入</div></span><div class="stepper"><button data-e="-5">−</button><input id="s-ext" inputmode="numeric" value="${pl.extPerDay}"><button data-e="5">＋</button></div></div></div>
  <div class="gh"><b>数据</b></div>
  <div class="group icons">
    <div class="rowi"><span class="tico" style="--c:${Store.mode === 'cloud' ? 'var(--good)' : 'var(--warn)'}">${ico(Store.mode === 'cloud' ? 'sync' : 'alert', '', 'duo')}</span><span class="grow"><div class="t">${Store.mode === 'cloud' ? Platform.cloudLabel : '只保存在这台设备'}</div><div class="m">${Store.mode === 'cloud' ? Platform.cloudSub : '建议定期导出备份'}</div></span></div>
    <button class="rowi" id="s-export"><span class="tico">${ico('download', '', 'duo')}</span><span class="grow"><div class="t">导出完整备份</div></span>${ico('chev', 'chev')}</button>
    <button class="rowi" id="s-import"><span class="tico">${ico('upload', '', 'duo')}</span><span class="grow"><div class="t">导入备份</div></span>${ico('chev', 'chev')}</button>
    ${hiddenN ? `<button class="rowi" id="s-unhide"><span class="tico" style="--c:#8e8e93">${ico('eyeoff', '', 'duo')}</span><span class="grow"><div class="t">恢复 ${hiddenN} 张隐藏的卡片</div></span></button>` : ''}
    ${hc.length ? `<button class="rowi" id="s-unhidec"><span class="tico" style="--c:#8e8e93">${ico('book', '', 'duo')}</span><span class="grow"><div class="t">恢复隐藏的课程</div></span></button>` : ''}
    <button class="rowi" id="s-reset"><span class="tico" style="--c:var(--bad)">${ico('trash', '', 'duo')}</span><span class="grow"><div class="t" style="color:var(--bad)">清空学习记录</div></span></button>
  </div>
  <div class="gf">温新 ${APP_VERSION} · 开源软件（MIT）· github.com/NIKOPACK/Renew</div>
  </div></div>`;
  $('[data-back]', v).onclick = back;
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
