/* ============ 卡片文本格式解析 ============ */
const TYPES = ['kp', 'choice', 'multi', 'tf', 'qa', 'cloze', 'think'];
const TYPE_LABEL = { kp: '知识点', choice: '单选题', multi: '多选题', tf: '判断题', qa: '问答题', cloze: '填空题', think: '思考题' };
function parseDSL(text, sid, tag = 'g') {
  let src = String(text).replace(/\r/g, '').replace(/^\s*```[a-z]*\n/i, '').replace(/\n```\s*$/, '');
  const items = [], errors = []; let cur = null, prMode = false, sawPr = false; const stamp = Date.now().toString(36);
  const close = () => {
    if (!cur) return; let mode = 'body', fence = false;
    const body = [], opts = [], expl = [], steps = [], second = []; let ans = null;
    for (const ln of cur.lines) {
      if (/^\s*```/.test(ln)) fence = !fence;
      if (mode === 'expl') { expl.push(ln); continue; }
      if (!fence && ln.startsWith('??')) { mode = 'expl'; const r = ln.slice(2).trim(); if (r) expl.push(r); continue; }
      if ((cur.t === 'qa' || cur.t === 'kp') && !fence && ln.trim() === '---' && mode === 'body') { mode = 'second'; continue; }
      if (mode === 'second') { second.push(ln); continue; }
      const m = !fence && /^([A-F])[.．、]\s*(.*)$/.exec(ln);
      if ((cur.t === 'choice' || cur.t === 'multi') && m) { opts.push(m[2]); continue; }
      if (!fence && (ln.startsWith('= ') || ln === '=')) { ans = ln.slice(1).trim(); continue; }
      if (cur.t === 'think' && !fence && ln.startsWith('>>')) { steps.push(ln.slice(2).trim()); continue; }
      if (ans != null && cur.t === 'think') { ans += '\n' + ln; continue; }
      body.push(ln);
    }
    const it = { t: cur.t, q: body.join('\n').trim() };
    if (cur.title) it.title = cur.title; if (cur.imp) it.imp = cur.imp;
    try {
      if (it.t === 'kp') { if (!it.q) throw '缺少要点'; const d = second.join('\n').trim(); if (d) it.d = d; if (!it.title) it.title = plain(it.q).slice(0, 16); }
      else if (it.t === 'choice' || it.t === 'multi') {
        const idx = [...(ans || '').toUpperCase()].filter(x => x >= 'A' && x <= 'F').map(x => x.charCodeAt(0) - 65);
        if (opts.length < 2 || !idx.length || idx.some(i => i >= opts.length)) throw '选择题缺少选项或答案';
        it.o = opts; if (it.t === 'multi' || idx.length > 1) { it.t = 'multi'; it.a = idx; } else it.a = idx[0];
      } else if (it.t === 'tf') { if (!/^(对|错|正确|错误|true|false)$/i.test(ans || '')) throw '判断题答案应为 对/错'; it.a = /^(对|正确|true)$/i.test(ans); }
      else if (it.t === 'qa') { it.a = second.join('\n').trim(); if (!it.a) throw '问答缺答案'; }
      else if (it.t === 'cloze') { if (!it.q.includes('{{')) throw '填空缺少 {{ }}'; }
      else if (it.t === 'think') { it.st = steps; if (ans) it.a = ans.trim(); }
      if (!it.q) throw '缺少题干';
      if (expl.length) it.x = expl.join('\n').trim();
      if (prMode && it.t !== 'kp') it.pr = 1;
      it.id = `${sid}-${tag}${stamp}${items.length.toString(36)}`; items.push(it);
    } catch (e) { errors.push(`${TYPE_LABEL[cur.t] || cur.t}「${(cur.title || body[0] || '').slice(0, 20)}」：${e}`); }
    cur = null;
  };
  for (const raw of src.split('\n')) {
    const ln = raw.replace(/\s+$/, '');
    if (ln.startsWith('@')) { close(); if (/^@practice/.test(ln)) { prMode = true; sawPr = true; } continue; }
    const m = /^::\s*([a-z]+)\s*(.*)$/.exec(ln);
    if (m) {
      close(); let t = m[1]; if (t === 'note') t = 'kp';
      if (!TYPES.includes(t)) { errors.push('未知类型 ' + m[1]); continue; }
      cur = { t, title: m[2].replace(/★/g, '').trim(), imp: (m[2].match(/★/g) || []).length, lines: [] }; continue;
    }
    if (cur) cur.lines.push(ln);
  }
  close();
  if (!sawPr) items.forEach(it => { if (it.t !== 'kp') it.pr = 1; });
  return { items, errors };
}
function itemToDSL(it) {
  const L = [`::${it.t}${it.title ? ' ' + it.title : ''}${it.imp ? ' ' + '★'.repeat(it.imp) : ''}`];
  if (it.q) L.push(it.q);
  if (it.t === 'kp' && it.d) L.push('---', it.d);
  if (it.t === 'choice' || it.t === 'multi') { it.o.forEach((o, i) => L.push(`${String.fromCharCode(65 + i)}. ${o}`)); L.push('= ' + [].concat(it.a).map(i => String.fromCharCode(65 + i)).join('')); }
  if (it.t === 'tf') L.push('= ' + (it.a ? '对' : '错'));
  if (it.t === 'qa') L.push('---', it.a);
  if (it.t === 'think') { (it.st || []).forEach(s => L.push('>> ' + s)); if (it.a) L.push('= ' + it.a); }
  if (it.x) L.push('?? ' + it.x);
  return L.join('\n');
}
function ansText(it) {
  if (it.t === 'choice' || it.t === 'multi') return [].concat(it.a).map(i => String.fromCharCode(65 + i)).join('');
  if (it.t === 'tf') return it.a ? '对' : '错'; return '';
}
