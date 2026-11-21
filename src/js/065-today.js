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
  const body = h(`<div style="display:flex;flex-direction:column;gap:18px"></div>`);
  const stepper = (attr, id, val, unit) => `<div class="pstep"><button ${attr}="${id}" data-d="-1" aria-label="减少">${ico('minus')}</button><input ${attr.replace('step', 'val')}="${id}" inputmode="numeric" value="${val}" aria-label="${unit}"><button ${attr}="${id}" data-d="1" aria-label="增加">${ico('plus')}</button></div>`;
  const draw = () => {
    body.innerHTML = shownCourses().map(c => {
      const cp = coursePlan(c.id), st = courseStats(c), days = cp.target ? Math.max(1, daysBetween(dayKey(), cp.target)) : 0, rec = days ? Math.ceil(st.remain / days) : 0;
      return `<div class="group plan-g">
        <div class="rowi"><span class="pdot" style="--c:${c.color}"></span><span class="grow"><div class="t">${esc(c.title)}</div><div class="m">${st.remain ? `还剩 ${st.remain} 个内容` : '已全部学完'}</div></span><button class="toggle" role="switch" aria-checked="${cp.on}" data-on="${c.id}" aria-label="学习${esc(c.title)}"></button></div>
        ${cp.on ? `<div class="rowi"><span class="grow t">每天新学</span>${stepper('data-step', c.id, cp.pace, '每天新学')}</div>
        <label class="rowi"><span class="grow t">目标日期</span><input class="pdate ${cp.target ? '' : 'empty'}" type="date" data-target="${c.id}" value="${esc(cp.target)}" min="${dayKey()}">${cp.target ? `<button class="pclr" data-clr="${c.id}" aria-label="清除目标日期">${ico('x')}</button>` : ''}</label>
        ${rec && rec !== cp.pace ? `<div class="rowi prec"><span class="grow m">按目标需要每天 ${rec} 个</span><button class="btn sm soft" data-rec="${c.id}" data-v="${rec}">采用</button></div>` : ''}` : ''}
      </div>`; }).join('') +
      `<div class="group plan-g"><div class="rowi"><span class="grow t">每天复习上限</span>${stepper('data-mstep', 'r', plan().maxReview, '每天复习上限')}</div></div>`;
    $$('[data-on]', body).forEach(b => b.onclick = () => { const cp = coursePlan(b.dataset.on); cp.on = !cp.on; saveState(); draw(); });
    $$('[data-target]', body).forEach(i => i.onchange = () => { coursePlan(i.dataset.target).target = i.value; saveState(); draw(); });
    $$('[data-clr]', body).forEach(b => b.onclick = e => { e.preventDefault(); coursePlan(b.dataset.clr).target = ''; saveState(); draw(); });
    $$('[data-val]', body).forEach(i => i.onchange = () => { coursePlan(i.dataset.val).pace = Math.max(0, Math.min(300, parseInt(i.value) || 0)); saveState(); draw(); });
    $$('[data-step]', body).forEach(b => b.onclick = () => { const cp = coursePlan(b.dataset.step); cp.pace = Math.max(0, Math.min(300, cp.pace + +b.dataset.d * (cp.pace >= 20 ? 5 : 1))); saveState(); draw(); });
    $$('[data-rec]', body).forEach(b => b.onclick = () => { coursePlan(b.dataset.rec).pace = +b.dataset.v; saveState(); draw(); });
    $$('[data-mstep]', body).forEach(b => b.onclick = () => { plan().maxReview = Math.max(10, Math.min(2000, plan().maxReview + +b.dataset.d * 50)); saveState(); draw(); });
    $$('[data-mval]', body).forEach(i => i.onchange = () => { plan().maxReview = Math.max(10, parseInt(i.value) || 200); saveState(); draw(); });
  };
  draw();
  const s = sheet('学习计划', body); s.onclose = () => refresh();
}
