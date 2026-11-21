/* ============ 今日 ============ */
function todayModel() {
  const t = todayStats(), due = Math.min(dueItems().length, reviewLeft());
  const courses = activeCourses().map(c => { const pace = coursePlan(c.id).pace, done = t.c[c.id] || 0; return { c, sec: nextSection(c), pace, done }; });
  const newGoal = courses.reduce((s, x) => s + (x.sec ? Math.max(x.pace, x.done) : x.done), 0);
  const goal = t.r + due + newGoal, doneN = t.r + t.n;
  const newLeft = courses.reduce((s, x) => s + (x.sec ? Math.max(0, x.pace - x.done) : 0), 0);
  const finished = due === 0 && newLeft === 0;
  return { t, due, courses, goal, doneN, finished, wrong: wrongItems().length };
}
function heatmap() {
  const today = dayKey(), st = S().stats, ck = S().checkins; let k = addDays(today, -7 * 17);
  while ((keyToDate(k).getDay() + 6) % 7 !== 0) k = addDays(k, -1);
  const cells = []; for (; k <= today; k = addDays(k, 1)) { const s = st[k], n = s ? s.n + s.r : 0, l = !n ? 0 : n < 15 ? 1 : n < 40 ? 2 : n < 80 ? 3 : 4; cells.push(`<i data-l="${l}" class="${ck[k] ? 'ck' : ''} ${k === today ? 'today' : ''}" title="${k}：${n} 张"></i>`); }
  return `<div class="heat">${cells.join('')}</div>`;
}
function planSheet() {
  const body = h(`<div style="display:flex;flex-direction:column;gap:14px"></div>`);
  const draw = () => {
    body.innerHTML = '' +
      shownCourses().map(c => { const cp = coursePlan(c.id), s = courseStats(c); const days = cp.target ? Math.max(1, daysBetween(dayKey(), cp.target)) : 0; const rec = days ? Math.ceil(s.remain / days) : 0;
        return `<section class="card card-in" style="display:flex;flex-direction:column;gap:12px"><div class="row"><span class="dot" style="width:10px;height:10px;border-radius:50%;background:${c.color}"></span><b class="grow">${esc(c.title)}</b><span class="small">剩 ${s.remain} 个</span><button class="toggle" role="switch" aria-checked="${cp.on}" data-on="${c.id}" aria-label="学习${esc(c.title)}"></button></div>
        ${cp.on ? `<div class="row" style="flex-wrap:wrap;align-items:flex-end"><label class="field grow" style="min-width:140px"><span>目标完成日期</span><input class="inp" type="date" data-target="${c.id}" value="${esc(cp.target)}"></label><div class="field"><span>每天新学</span><div class="stepper"><button data-step="${c.id}" data-d="-2">−</button><input data-pace="${c.id}" inputmode="numeric" value="${cp.pace}"><button data-step="${c.id}" data-d="2">＋</button></div></div></div>${rec && rec !== cp.pace ? `<button class="btn sm soft" data-rec="${c.id}" data-v="${rec}">按目标改为每天 ${rec} 个</button>` : ''}` : ''}</section>`; }).join('') +
      `<div class="row"><span class="grow small">每天复习上限</span><div class="stepper"><button data-mr="-50">−</button><input id="mr" inputmode="numeric" value="${plan().maxReview}"><button data-mr="50">＋</button></div></div>`;
    $$('[data-on]', body).forEach(b => b.onclick = () => { const cp = coursePlan(b.dataset.on); cp.on = !cp.on; saveState(); draw(); });
    $$('[data-target]', body).forEach(i => i.onchange = () => { coursePlan(i.dataset.target).target = i.value; saveState(); draw(); });
    $$('[data-pace]', body).forEach(i => i.onchange = () => { coursePlan(i.dataset.pace).pace = Math.max(0, Math.min(300, parseInt(i.value) || 0)); saveState(); draw(); });
    $$('[data-step]', body).forEach(b => b.onclick = () => { const cp = coursePlan(b.dataset.step); cp.pace = Math.max(0, cp.pace + +b.dataset.d); saveState(); draw(); });
    $$('[data-rec]', body).forEach(b => b.onclick = () => { coursePlan(b.dataset.rec).pace = +b.dataset.v; saveState(); draw(); });
    $$('[data-mr]', body).forEach(b => b.onclick = () => { plan().maxReview = Math.max(10, plan().maxReview + +b.dataset.mr); saveState(); draw(); });
    $('#mr', body).onchange = e => { plan().maxReview = Math.max(10, parseInt(e.target.value) || 200); saveState(); };
  };
  draw();
  const s = sheet('学习计划', body); s.onclose = () => refresh();
}
