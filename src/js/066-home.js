/* ============ 首页：打开就能往下刷着学（今日学习流） ============ */
/* 今天的内容按计划生成一条信息流：到期复习穿插在新内容之间，新内容按课程计划的每日量、按小节顺序（先讲解后练习）排列。
   刷完后可以继续「再学一节」。原来首页的任务清单、打卡和本周统计收进顶部的「今日」条（点开是弹层）。 */
const Daily = { pr: null, day: '', extra: 0, party: 0 }, TabY = {};
/* 某门课从下一节开始往后的新内容（每节先讲解后练习） */
function freshItems(c, max) {
  const out = [], all = courseSecs(c), start = Math.max(0, all.indexOf(nextSection(c)));
  for (const sec of all.slice(start)) {
    if (!['todo', 'learning'].includes(secStatus(sec))) { if (secStatus(sec) === 'empty') break; continue; }
    for (const it of [...learnItems(sec), ...practiceItems(sec)]) { if (!getSt(it) && visible(it)) out.push(it); if (out.length >= max) return out; }
  }
  return out;
}
function dailyQueue(extra = 0) {
  const M = todayModel(), due = dueItems().slice(0, reviewLeft());
  const per = M.courses.filter(x => x.sec).map(x => freshItems(x.c, Math.max(0, x.pace - x.done) + extra));
  const fresh = []; // 各课程按 4 个一组轮流，保持同一节内容连贯
  for (let i = 0; per.some(l => l.length > i); i += 4) for (const l of per) fresh.push(...l.slice(i, i + 4));
  const q = []; let r = 0, n = 0;
  while (r < due.length || n < fresh.length) { q.push(...due.slice(r, r + 2)); r += 2; q.push(...fresh.slice(n, n + 4)); n += 4; }
  return q;
}
const dailyPr = () => { if (!Daily.pr || Daily.day !== dayKey()) { Daily.pr = { kind: 'daily' }; Daily.day = dayKey(); Daily.extra = 0; Daily.party = 0; } return Daily.pr; };

function dayBandHTML() {
  const M = todayModel(), sk = streak(), ck = S().checkins[dayKey()];
  const nGoal = M.courses.reduce((s, x) => s + (x.sec ? Math.max(x.pace, x.done) : x.done), 0), rGoal = M.t.r + M.due;
  const all = nGoal + rGoal, done = M.t.n + M.t.r, canCheck = !ck && (M.finished || M.doneN >= 20) && M.doneN > 0;
  return `<div class="dayband"><button class="db-main" id="db-open" aria-label="今日任务与统计">
      <span class="db-k" title="新学">${ico('layers', '', 'fill')}<b class="num">${M.t.n}<small>/${nGoal}</small></b></span>
      <span class="db-k" title="复习">${ico('review', '', 'fill')}<b class="num">${M.t.r}<small>/${rGoal}</small></b></span>
      <span class="db-k fire" title="连续打卡">${ico('flame', '', 'fill')}<b class="num">${sk}</b></span>
      ${ico('chev', 'chev')}<span class="db-bar"><i style="width:${all ? Math.min(100, done / all * 100) : done ? 100 : 0}%"></i></span></button>
    ${ck ? `<span class="db-ck on">${ico('check')}已打卡</span>` : canCheck ? `<button class="db-ck" id="db-ck">${ico('calendar')}打卡</button>` : ''}</div>`;
}
/* 今天的最后一个内容评完：撒花 */
function dailyRated() { if (Feed.params !== Daily.pr) return; updateDayband(); const left = Feed.queue.filter(it => !Feed.results.has(it.id)).length; if (!left && !Daily.party) { Daily.party = 1; setTimeout(() => Motion.confetti(), 300); } }
function updateDayband() { const b = $('#view .dayband'); if (!b || Nav.stack[Nav.stack.length - 1]?.view !== 'today') return; b.outerHTML = dayBandHTML(); bindDayband($('#view')); }
function bindDayband(v) {
  $('#db-open', v).onclick = todaySheet;
  $('#db-ck', v)?.addEventListener('click', checkIn);
}
function checkIn() { S().checkins[dayKey()] = 1; logEvent('打卡'); saveState(); toast(`打卡成功，已连续 ${streak()} 天`); updateDayband(); $('.endc [data-ck]')?.remove(); Motion.confetti(); }

function viewToday() {
  const v = $('#view'), d = new Date(Date.now() - CUT), pr = dailyPr(), same = Feed.params === pr;
  if (!same) { Feed.params = pr; Feed.queue = dailyQueue(Daily.extra); Feed.posts.clear(); Feed.rendered = 0; Feed.results = new Map(); Feed.resKey = 'daily'; }
  else { const have = new Set(Feed.queue.map(it => it.id)); Feed.queue.push(...dailyQueue(Daily.extra).filter(it => !have.has(it.id))); } // 计划调整、新生成的内容接到后面
  v.innerHTML = `<div class="wrap"><header class="lt"><div class="t"><div class="date">${d.getMonth() + 1}月${d.getDate()}日 星期${WEEK[d.getDay()]}</div><h1>今日</h1></div><button class="round" id="td-plan" aria-label="学习计划">${ico('target')}</button><button class="round" data-go="settings" aria-label="设置">${ico('gear')}</button></header>
  ${dayBandHTML()}
  <div class="feed home" id="feed"></div><div class="sentinel"></div></div>`;
  bindDayband(v); $('#td-plan').onclick = planSheet;
  const feed = $('#feed');
  if (!shownCourses().length || !activeCourses().length && !Feed.queue.length) { feed.append(startCard()); return; }
  if (same) for (const p of Feed.posts.values()) { const el = h(`<article class="post" data-pk="${p.pk}"></article>`); el.innerHTML = postHTML(p); feed.append(el); }
  else for (; Feed.rendered < Math.min(Feed.queue.length, 5); Feed.rendered++) feed.append(makePost(Feed.queue[Feed.rendered]));
  if (Feed.rendered >= Feed.queue.length) feed.append(endCard(pr));
  Feed.obs = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) moreFeed(); }, { rootMargin: '900px' });
  Feed.obs.observe($('.sentinel', v));
  feed.addEventListener('click', onFeedClick);
}
/* 还没有在学的课程 */
function startCard() {
  const el = h(`<article class="post"><div class="endc">${heroBadge('book')}<h3>先选一门课程</h3><p>在计划里打开一门课，首页就会按每天的量推送要学和要复习的内容</p><div class="acts"><button class="btn pri" data-go-lib>去选课程</button><button class="btn" data-plan>学习计划</button></div></div></article>`);
  $('[data-go-lib]', el).onclick = () => go('library', {}, { tab: true }); $('[data-plan]', el).onclick = planSheet;
  return el;
}
/* 今日学习流刷完 */
function dailyEndCard() {
  const M = todayModel(), ck = S().checkins[dayKey()], el = h(`<article class="post"><div class="endc"></div></article>`), box = $('.endc', el);
  const empty = M.courses.find(x => x.sec && secStatus(x.sec) === 'empty'), more = M.courses.some(x => freshItems(x.c, 1).length);
  box.innerHTML = `${heroBadge('check')}<h3>${Feed.queue.length ? '完成' : '今天没有内容'}</h3>
    <div class="kp3"><div><b>${M.t.n}</b><span>${ico('layers')}新学</span></div><div><b>${M.t.r}</b><span>${ico('review')}复习</span></div><div><b>${M.t.ok + M.t.bad ? Math.round(M.t.ok / (M.t.ok + M.t.bad) * 100) + '%' : '—'}</b><span>${ico('check')}正确率</span></div></div>
    ${empty ? `<div class="group menu" style="margin-bottom:14px"><button data-gen="${empty.sec.id}">${ico('wand')}<span class="grow">${esc(empty.c.title)}：${esc(empty.sec.title)}<small>${ico('wand')}生成内容</small></span></button></div>` : ''}
    <div class="acts">${!ck && M.doneN ? `<button class="btn pri" data-ck>${ico('calendar')}打卡</button>` : ''}${more ? `<button class="btn ${!ck && M.doneN ? '' : 'pri'}" data-more>${ico('plus')}再学一些</button>` : ''}${M.wrong ? `<button class="btn" data-wrong>${ico('alert')}错题 ${M.wrong}</button>` : ''}<button class="btn ghost" data-reflect-day>${ico('edit')}写笔记</button></div>`;
  box.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-ck')) checkIn();
    else if (b.dataset.gen) genSheet({ sid: b.dataset.gen });
    else if (b.hasAttribute('data-wrong')) openReview('wrong');
    else if (b.hasAttribute('data-more')) {
      Daily.extra += 8; const have = new Set(Feed.queue.map(it => it.id)), add = dailyQueue(Daily.extra).filter(it => !have.has(it.id));
      if (!add.length) return toast('计划内的小节都学完了');
      el.remove(); Feed.queue.push(...add); moreFeed();
    } else if (b.hasAttribute('data-reflect-day')) reflectToday();
  };
  return el;
}
/* 「今日」弹层：原首页的任务清单、打卡、本周 */
function todaySheet() {
  const M = todayModel(), ck = S().checkins[dayKey()], sk = streak(), canCheck = !ck && (M.finished || M.doneN >= 20) && M.doneN > 0;
  const nGoal = M.courses.reduce((s, x) => s + (x.sec ? Math.max(x.pace, x.done) : x.done), 0), rGoal = M.t.r + M.due;
  const task = (done, title, sub, attrs, right = '') => `<button class="rowi ${done ? 'done' : ''}" ${attrs}><span class="chk ${done ? 'on' : ''}">${ico('check')}</span><span class="grow"><div class="t">${title}</div>${sub ? `<div class="m">${sub}</div>` : ''}</span>${right}${ico('chev', 'chev')}</button>`;
  const rows = [task(M.due === 0, '复习', '', 'data-rv="review"', M.due ? `<span class="r num">${M.due}</span>` : '')];
  for (const x of M.courses) rows.push(x.sec ? task(x.done >= x.pace, esc(x.c.title), esc(x.sec.title), `data-sec="${x.sec.id}"`, `<span class="r num">${x.done}/${x.pace}</span>`) : task(true, esc(x.c.title), '', `data-course="${x.c.id}"`));
  if (M.wrong) rows.push(task(false, '错题', '', 'data-rv="wrong"', `<span class="r num">${M.wrong}</span>`));
  const days = [], today = dayKey(); let k0 = today; while ((keyToDate(k0).getDay() + 6) % 7 !== 0) k0 = addDays(k0, -1);
  for (let i = 0; i < 7; i++) { const k = addDays(k0, i), s = S().stats[k], n = s ? s.n + s.r : 0; days.push({ k, n, l: !n ? 0 : n < 15 ? 1 : n < 40 ? 2 : 3, ck: !!S().checkins[k], future: k > today }); }
  const s = sheet('今日', `<div class="stat3">
      <div><span class="rb">${ring(nGoal ? M.t.n / nGoal : 0, 46, 3.6, 'var(--accent)')}${ico('layers', '', 'fill')}</span><b>${M.t.n}<small>/${nGoal || 0}</small></b><span>新学</span></div>
      <div><span class="rb">${ring(rGoal ? M.t.r / rGoal : 0, 46, 3.6, 'var(--good)')}${ico('review', '', 'fill')}</span><b>${M.t.r}<small>/${rGoal}</small></b><span>复习</span></div>
      <div><span class="rb">${ring(Math.min(1, sk / 7), 46, 3.6, 'var(--warn)')}${ico('flame', '', 'fill')}</span><b>${sk}<small> 天</small></b><span>连续打卡</span></div></div>
    <div class="gh" style="margin-top:4px"><b>今日任务</b><button class="link" data-plan>计划</button></div><div class="group">${rows.join('')}</div>
    ${ck ? `<button class="btn soft block" disabled>${ico('check')}今日已打卡</button>` : `<button class="btn ${canCheck ? 'pri' : ''} block" data-ck ${canCheck ? '' : 'disabled'}>${ico('calendar')}打卡${canCheck ? '' : ` · ${M.doneN}/${Math.max(M.goal, 1)}`}</button>`}
    <div class="gh"><b>本周</b><button class="link" data-stats>学习记录</button></div>
    <div class="week">${days.map(x => `<div class="${x.k === today ? 'today' : ''} ${x.future ? 'future' : ''}" ${x.future ? '' : `data-wday="${x.k}" role="button" tabindex="0"`}><span>${WEEK[keyToDate(x.k).getDay()]}</span><span class="d" data-l="${x.l}">${keyToDate(x.k).getDate()}</span><span class="ckm ${x.ck ? 'on' : ''}"></span></div>`).join('')}</div>`);
  s.body.onclick = e => {
    const b = e.target.closest('button,[data-wday]'); if (!b) return;
    const run = f => { s.close(); f(); };
    if (b.dataset.rv) run(() => openReview(b.dataset.rv));
    else if (b.dataset.sec) run(() => startSection(b.dataset.sec));
    else if (b.dataset.course) run(() => go('course', { id: b.dataset.course }));
    else if (b.hasAttribute('data-plan')) run(planSheet);
    else if (b.hasAttribute('data-ck')) run(checkIn);
    else if (b.hasAttribute('data-stats')) run(() => go('review', {}, { tab: true }));
    else if (b.dataset.wday) run(() => daySheet(b.dataset.wday));
  };
}
