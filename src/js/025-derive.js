/* ============ 状态推导 ============ */
const SEC_LABEL = { todo: '未开始', learning: '学习中', done: '已学完', external: '别处已学', skip: '暂不学', empty: '待生成' };
function secStatus(sec) {
  const o = S().sec[sec.id]; if (o === 'external' || o === 'skip') return o;
  const items = secItems(sec); if (!items.length) return 'empty';
  const n = items.filter(getSt).length; return n === items.length ? 'done' : n ? 'learning' : 'todo';
}
const learnItems = sec => secItems(sec).filter(it => !it.pr);
const practiceItems = sec => secItems(sec).filter(it => it.pr);
function secProg(sec) {
  const kp = secKps(sec), q = secQs(sec), l = learnItems(sec), pr = practiceItems(sec);
  return { kp: kp.length, kpd: kp.filter(getSt).length, q: q.length, qd: q.filter(getSt).length, l: l.length, ld: l.filter(getSt).length, p: pr.length, pd: pr.filter(getSt).length };
}
function courseStats(c) {
  let items = 0, learned = 0, mastered = 0, due = 0, secs = 0, secDone = 0, remain = 0; const eod = endOfToday();
  for (const sec of courseSecs(c)) {
    const st = secStatus(sec); secs++; if (['done', 'external'].includes(st)) secDone++;
    for (const it of secItems(sec)) {
      items++; const s = getSt(it);
      if (s) { learned++; if (s.ivl >= 21) mastered++; if (s.due <= eod && st !== 'skip') due++; }
      else if (['todo', 'learning'].includes(st)) remain++;
    }
  }
  const emptySecs = courseSecs(c).filter(s => secStatus(s) === 'empty').length;
  return { items, learned, mastered, due, secs, secDone, remain, emptySecs };
}
function nextSection(c) {
  const cur = SECS.get(S().cur[c.id]);
  if (cur && ['todo', 'learning', 'empty'].includes(secStatus(cur))) return cur;
  return courseSecs(c).find(s => ['learning', 'todo', 'empty'].includes(secStatus(s))) || null;
}
function setSecStatus(sid, to, batch = { n: 0 }) {
  const sec = SECS.get(sid); if (!sec) return;
  const now = Date.now(), per = plan().extPerDay || 25;
  if (to === 'external') {
    for (const it of secItems(sec)) if (!getSt(it)) { const k = batch.n++; setSt(it, { s: W[2], d: W[4], reps: 0, lapses: 0, last: now, lr: 3, ivl: 1, ext: 1, due: dayStart(now) + (1 + Math.floor(k / per)) * DAY }); }
    S().sec[sid] = 'external';
  } else if (to === 'todo') {
    for (const it of sec.items) { const s = getSt(it); if (s && s.ext && !s.reps) setSt(it, null); }
    delete S().sec[sid];
  } else if (to === 'skip') S().sec[sid] = 'skip';
  else if (to === 'reset') { for (const it of sec.items) setSt(it, null); delete S().sec[sid]; }
  saveSrs(sec.course);
}
function setUpto(sid) {
  const sec = SECS.get(sid); if (!sec) return 0; const c = COURSES.get(sec.course), batch = { n: 0 };
  for (const s of courseSecs(c)) { if (['todo', 'learning'].includes(secStatus(s))) setSecStatus(s.id, 'external', batch); if (s.id === sid) break; }
  return batch.n;
}
function dueItems() {
  const eod = endOfToday(), out = [];
  for (const it of ITEMS.values()) {
    if (!visible(it) || S().hiddenCourses[it.course]) continue;
    const sec = SECS.get(it.sec); if (S().sec[sec.id] === 'skip') continue;
    const s = getSt(it); if (s && s.due <= eod) out.push([s.due, it]);
  }
  return out.sort((a, b) => a[0] - b[0]).map(x => x[1]);
}
function wrongItems() {
  const out = [];
  for (const it of ITEMS.values()) { if (!visible(it) || S().hiddenCourses[it.course]) continue; const s = getSt(it); if (s && s.lapses && !s.cl) out.push([s.lr === 1 ? 0 : 1, -s.lapses, it]); }
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]);
}
const starItems = () => [...ITEMS.values()].filter(it => S().stars[it.id] && visible(it));
const reviewLeft = () => Math.max(0, plan().maxReview - todayStats().r);
function streak() { const ck = S().checkins; let k = dayKey(), n = 0; if (!ck[k]) k = addDays(k, -1); while (ck[k]) { n++; k = addDays(k, -1); } return n; }
