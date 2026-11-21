/* ============ 状态 ============ */
const DEFAULT_PREFS = { fs: 17, lh: 1.75, math: 1, code: .88, tbl: .92, pgap: .7, pad: 18, font: 'system', theme: 'auto', feed: 'flow', wrapCode: false };
function defaultState() {
  return { v: 2, plan: { courses: {}, maxReview: 200, retention: .9, extPerDay: 25 }, sec: {}, cur: {}, stats: {}, checkins: {}, stars: {}, hidden: {}, hiddenCourses: {}, log: [] };
}
const S = () => Store.docs['app/state'];
const P = () => Store.docs['app/prefs'];
const plan = () => S().plan;
const saveState = () => Store.put('app/state', S());
const savePrefs = () => Store.put('app/prefs', P());
function todayStats() { const k = dayKey(); const t = S().stats[k] ||= { n: 0, r: 0, ok: 0, bad: 0, sec: 0, c: {} }; t.c ||= {}; return t; }
function logEvent(text) { const l = S().log ||= []; l.push({ t: Date.now(), text }); if (l.length > 80) l.splice(0, l.length - 80); }
function coursePlan(cid) { return plan().courses[cid] ||= { on: true, pace: 10, target: '' }; }
