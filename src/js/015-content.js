/* ============ 内容 ============ */
const COURSES = new Map(), CHAPS = new Map(), SECS = new Map(), ITEMS = new Map();
function addCourse(c, builtin) {
  const course = { id: c.id, title: c.title, color: safeColor(c.color), cat: c.cat || '我的课程', desc: c.desc || '', builtin, chapters: [] };
  COURSES.set(course.id, course);
  for (const ch of c.chapters || []) {
    const chap = { id: ch.id, title: ch.title, course: course.id, sections: [] };
    course.chapters.push(chap); CHAPS.set(chap.id, chap);
    for (const s of ch.sections || []) {
      const sec = { id: s.id, title: s.title, chap: chap.id, course: course.id, points: s.points || [], items: [] };
      chap.sections.push(sec); SECS.set(sec.id, sec);
      for (const it of s.items || []) addItem(it, sec, builtin);
    }
  }
  return course;
}
function addItem(it, sec, builtin) {
  if (ITEMS.has(it.id)) { const old = ITEMS.get(it.id); const { _p, ...rest } = it; Object.assign(old, rest); return old; }
  if (it._p) return null;
  const x = { ...it, sec: sec.id, course: sec.course, builtin: !!builtin };
  ITEMS.set(x.id, x); sec.items.push(x); return x;
}
async function loadContent() {
  const idx = await fetch('data/index.json').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  const data = await Promise.all(idx.courses.map(c => fetch(`data/${c.id}.json`).then(r => r.json())));
  data.forEach(c => addCourse(c, true));
  for (const k of Store.keys('course/')) addCourse(Store.get(k), false);
  for (const k of Store.keys('sec/')) { const sec = SECS.get(k.slice(4)); if (sec) for (const it of Store.get(k).items || []) addItem(it, sec, false); }
}
const visible = it => !S().hidden[it.id];
const isQ = it => it.t !== 'kp';
const secItems = sec => sec.items.filter(visible);
const secKps = sec => secItems(sec).filter(it => !isQ(it));
const secQs = sec => secItems(sec).filter(isQ);
const courseSecs = c => c.chapters.flatMap(ch => ch.sections);
const shownCourses = () => [...COURSES.values()].filter(c => !S().hiddenCourses[c.id]);
const activeCourses = () => shownCourses().filter(c => coursePlan(c.id).on);
const secLabel = sec => sec.title;
const chapShort = ch => (ch.title.match(/^第\s*\d+\s*章/) || [ch.title])[0];
