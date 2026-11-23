/* ============ 导入课程 ============ */
/* 课程包与完整备份的识别（兼容改名前「学流」导出的文件） */
const isCoursePack = d => ['renew-course', 'xueliu-course'].includes(d?.format) && !!d.course;
const isBackup = d => ['renew', 'xueliu'].includes(d?.app) && !!d.docs;
function importPack(pack, name) {
  const src = pack.course; if (!src?.chapters) return toast('课程包内容不完整');
  const old = src.id && COURSES.get(src.id);
  if (old && !old.builtin && !pack._copy) return menuSheet(`已经有「${old.title}」`, [
    { icon: 'sync', label: '更新这门课', sub: '换成课程包里的内容，学习进度、笔记和书签都保留', run: () => updateFromPack(old, src) },
    { icon: 'plus', label: '另存为新课程', run: () => importPack({ ...pack, _copy: 1 }, name) }
  ]);
  const exists = COURSES.has(src.id), cid = exists || !src.id ? newId('u') : src.id, idMap = {};
  const course = { id: cid, title: src.title + (exists ? '（导入）' : ''), cat: src.cat || '我的课程', desc: src.desc || '', color: src.color || PALETTE[COURSES.size % PALETTE.length], chapters: [] };
  src.chapters.forEach((ch, ci) => {
    const chId = `${cid}c${ci + 1}`, chap = { id: chId, title: ch.title, sections: [] };
    (ch.sections || []).forEach((s, si) => { const sid = `${chId}s${si + 1}`; chap.sections.push({ id: sid, title: s.title, points: s.points || [] });
      const items = (s.items || []).map((it, k) => { const nid = exists || !it.id || ITEMS.has(it.id) ? `${sid}-p${k.toString(36)}` : it.id; idMap[it.id] = nid; return { ...stripItem(it), id: nid }; });
      if (items.length) Store.put('sec/' + sid, { items }); });
    course.chapters.push(chap);
  });
  Store.put('course/' + cid, course); addCourse(course, false);
  for (const ch of course.chapters) for (const s of ch.sections) for (const it of Store.get('sec/' + s.id)?.items || []) addItem(it, SECS.get(s.id), false);
  if (pack.progress) { const d = srsDoc(cid); for (const [oid, st] of Object.entries(pack.progress)) if (idMap[oid]) d.c[idMap[oid]] = st; saveSrs(cid); }
  coursePlan(cid); logEvent('导入课程 ' + course.title); saveState();
  toast(`已导入「${course.title}」`); Nav.tab = 'library'; Nav.stack = [{ view: 'library' }, { view: 'course', params: { id: cid } }]; render(true);
}
/* 用课程包更新已有课程：卡片 id 不变，学习记录（按卡片 id 保存）、笔记、书签自然保留 */
function updateFromPack(old, src) {
  const cid = old.id, keep = new Set();
  for (const sec of courseSecs(old)) { for (const it of sec.items) ITEMS.delete(it.id); SECS.delete(sec.id); }
  old.chapters.forEach(ch => CHAPS.delete(ch.id)); COURSES.delete(cid);
  const course = { ...(Store.get('course/' + cid) || {}), id: cid, title: src.title || old.title, cat: src.cat || old.cat, desc: src.desc || old.desc, color: old.color, chapters: [] };
  src.chapters.forEach((ch, ci) => {
    const chId = `${cid}c${ci + 1}`, chap = { id: chId, title: ch.title, sections: [] };
    (ch.sections || []).forEach((s, si) => { const sid = `${chId}s${si + 1}`; chap.sections.push({ id: sid, title: s.title, points: s.points || [] }); keep.add('sec/' + sid);
      const items = (s.items || []).map((it, k) => ({ ...stripItem(it), id: it.id && !ITEMS.has(it.id) ? it.id : `${sid}-p${k.toString(36)}` }));
      if (items.length) Store.put('sec/' + sid, { items }); else Store.drop('sec/' + sid); });
    course.chapters.push(chap);
  });
  for (const k of Store.keys('sec/' + cid + 'c')) if (!keep.has(k)) Store.drop(k);
  Store.put('course/' + cid, course); addCourse(course, false);
  for (const ch of course.chapters) for (const s of ch.sections) for (const it of Store.get('sec/' + s.id)?.items || []) addItem(it, SECS.get(s.id), false);
  logEvent('更新课程 ' + course.title); saveState();
  toast(`已更新「${course.title}」，学习进度已保留`); Nav.tab = 'library'; Nav.stack = [{ view: 'library' }, { view: 'course', params: { id: cid } }]; render(true);
}
function parseCourseDSL(text) {
  const course = { title: '', cat: '我的课程', color: '', desc: '', chapters: [] }; let ch = null, sec = null, buf = [];
  const flush = () => { if (sec && buf.length) { sec.items.push(...parseDSL(buf.join('\n'), 'tmp').items); } buf = []; };
  for (const raw of String(text).replace(/\r/g, '').split('\n')) {
    const l = raw.replace(/\s+$/, '');
    if (l.startsWith('@course')) { const p = l.slice(7).split('|').map(x => x.trim()); course.id = p[0]; course.title = p[1] || p[0]; course.color = p[2]; course.cat = p[3] || course.cat; course.desc = p[4] || ''; continue; }
    if (l.startsWith('@chapter')) { flush(); const p = l.slice(8).split('|').map(x => x.trim()); ch = { title: p[1] || p[0], sections: [] }; course.chapters.push(ch); sec = null; continue; }
    if (l.startsWith('@section')) { flush(); if (!ch) { ch = { title: '第1章', sections: [] }; course.chapters.push(ch); } sec = { title: l.slice(8).trim(), items: [] }; ch.sections.push(sec); continue; }
    if (!sec && /^::/.test(l)) { if (!ch) { ch = { title: '第1章', sections: [] }; course.chapters.push(ch); } sec = { title: ch.title, items: [] }; ch.sections.push(sec); }
    buf.push(l);
  }
  flush(); return course;
}
function importCardText(text, name) {
  if (/^@course|^@chapter/m.test(text)) {
    const c = parseCourseDSL(text); if (!c.title) c.title = name || '导入的课程';
    c.chapters.forEach(ch => ch.sections.forEach(s => s.items.forEach((it, k) => delete it.id)));
    return importPack({ course: { ...c, id: COURSES.has(c.id) ? null : c.id } });
  }
  pickSection('导入到哪一节？', sid => { const s = sheet('导入到「' + SECS.get(sid).title + '」', `<div id="ic-out"></div>`); showGenerated($('#ic-out', s.body), parseDSL(text, sid, 'i'), SECS.get(sid), false, s); });
}
function csvImportSheet(text, name) {
  const sep = text.includes('\t') ? '\t' : ',', rows = [];
  const parseLine = l => { if (sep === '\t') return l.split('\t'); const out = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
  for (const l of text.replace(/\r/g, '').split('\n')) { if (!l.trim() || l.startsWith('#')) continue; const c = parseLine(l); if (c.length >= 2 && c[0].trim()) rows.push(c); }
  if (!rows.length) return toast('没有读到内容');
  const clean = s => String(s).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\\\((.+?)\\\)/g, '$$$1$$').trim();
  pickSection(`把 ${rows.length} 行导入到哪一节？`, sid => {
    const items = rows.map((r, i) => ({ id: `${sid}-c${Date.now().toString(36)}${i.toString(36)}`, t: 'qa', q: clean(r[0]), a: clean(r[1]), x: r[2] && !/::/.test(r[2]) ? clean(r[2]) : undefined }));
    const s = sheet('导入问答卡', `<div id="ic-out"></div>`); showGenerated($('#ic-out', s.body), { items, errors: [] }, SECS.get(sid), false, s);
  });
}
