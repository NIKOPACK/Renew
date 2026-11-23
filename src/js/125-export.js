/* ============ 导出 ============ */
const stripItem = it => { const o = {}; for (const k of ['id', 't', 'title', 'imp', 'q', 'd', 'o', 'a', 'x', 'st', 'pr']) if (it[k] !== undefined) o[k] = it[k]; return o; };
function coursePack(c, withProg) {
  const pack = { format: 'renew-course', v: 1, exportedAt: new Date().toISOString(), course: { id: c.id, title: c.title, cat: c.cat, color: c.color, desc: c.desc, chapters: c.chapters.map(ch => ({ id: ch.id, title: ch.title, sections: ch.sections.map(s => ({ id: s.id, title: s.title, points: s.points || [], items: secItems(s).map(stripItem) })) })) } };
  if (withProg) { pack.progress = {}; for (const s of courseSecs(c)) for (const it of secItems(s)) { const st = getSt(it); if (st) pack.progress[it.id] = st; } }
  return pack;
}
const texForAnki = s => String(s || '').replace(/\$\$([\s\S]+?)\$\$/g, '\\[$1\\]').replace(/\$([^$\n]+?)\$/g, '\\($1\\)');
function itemMD(it, n) {
  const L = [];
  if (it.t === 'kp') { L.push(`### ${it.title || '知识点'}${it.imp >= 2 ? ' ⭐' : ''}`, '', it.q, ''); if (it.d) L.push('**详解**', '', it.d, ''); return L.join('\n'); }
  L.push(`#### 练习 ${n}（${TYPE_LABEL[it.t]}）`, '', it.title && it.t === 'think' ? `**${it.title}**\n\n${it.q}` : it.q.replace(/\{\{([\s\S]+?)\}\}/g, '____'), '');
  if (it.o) L.push(it.o.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n'), '');
  if (it.t === 'think' && it.st?.length) L.push('**思路提示**', '', it.st.map((s, i) => `${i + 1}. ${s}`).join('\n'), '');
  const ans = it.t === 'qa' || it.t === 'think' ? it.a : it.t === 'cloze' ? (it.q.match(/\{\{([\s\S]+?)\}\}/g) || []).map(x => x.slice(2, -2)).join('；') : ansText(it);
  if (ans) L.push(`**答案**：${ans}`, '');
  if (it.x) L.push('**解答**', '', it.x, '');
  return L.join('\n');
}
function sectionMD(s, lvl = '##') { const kps = secKps(s), qs = secQs(s); return [`${lvl} ${s.title}`, '', ...kps.map(it => itemMD(it)), qs.length ? '### 本节练习\n' : '', ...qs.map((it, i) => itemMD(it, i + 1))].join('\n'); }
function courseMD(c) { return [`# ${c.title}`, '', c.desc ? `> ${c.desc}\n` : '', ...c.chapters.map(ch => [`# ${ch.title}`, '', ...ch.sections.map(s => sectionMD(s))].join('\n'))].join('\n'); }
function ankiTSV(c) {
  const clean = s => texForAnki(s).replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
  const rows = ['#separator:tab', '#html:true', '#tags column:3'];
  for (const s of courseSecs(c)) for (const it of secItems(s)) {
    let front, back;
    if (it.t === 'kp') { front = it.title || plain(it.q).slice(0, 30); back = it.q + (it.d ? '\n\n' + it.d : ''); }
    else { front = (it.title ? it.title + '\n' : '') + it.q.replace(/\{\{([\s\S]+?)\}\}/g, '____') + (it.o ? '\n' + it.o.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n') : ''); back = '答案：' + (it.t === 'qa' || it.t === 'think' ? it.a || '' : it.t === 'cloze' ? (it.q.match(/\{\{([\s\S]+?)\}\}/g) || []).map(x => x.slice(2, -2)).join('；') : ansText(it)) + (it.x ? '\n\n' + it.x : ''); }
    rows.push([clean(front), clean(back), `${c.title}::${s.title}`.replace(/\s+/g, '_')].join('\t'));
  }
  return rows.join('\n');
}
function courseDSL(c) { return [`@course ${c.id} | ${c.title} | ${c.color} | ${c.cat} | ${c.desc || ''}`, ...c.chapters.map(ch => [`\n@chapter ${ch.id} | ${ch.title}`, ...ch.sections.map(s => [`@section ${s.title}`, ...secItems(s).map(itemToDSL)].join('\n\n'))].join('\n'))].join('\n'); }
function exportSheet(c, sec) {
  const safe = s => s.replace(/[\\/:*?"<>|]/g, '_');
  const items = sec ? [
    { icon: 'file', label: 'Markdown', run: () => Files.save(safe(sec.title) + '.md', sectionMD(sec, '#'), 'text/markdown') },
    { icon: 'list', label: '卡片文本', run: () => Files.save(safe(sec.title) + '.txt', secItems(sec).map(itemToDSL).join('\n\n'), 'text/plain') }
  ] : [
    { icon: 'book', label: '课程包', run: () => Files.save(safe(c.title) + '.renew.json', JSON.stringify(coursePack(c, false)), 'application/json') },
    { icon: 'sync', label: '课程包（含进度）', run: () => Files.save(safe(c.title) + '-含进度.renew.json', JSON.stringify(coursePack(c, true)), 'application/json') },
    { icon: 'file', label: 'Markdown', run: () => Files.save(safe(c.title) + '.md', courseMD(c), 'text/markdown') },
    { icon: 'layers', label: 'Anki', run: () => Files.save(safe(c.title) + '-anki.txt', ankiTSV(c), 'text/plain') },
    { icon: 'list', label: '卡片文本', run: () => Files.save(safe(c.title) + '.txt', courseDSL(c), 'text/plain') }
  ];
  menuSheet('导出「' + (sec ? sec.title : c.title) + '」', items);
}
