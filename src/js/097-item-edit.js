/* ============ 手动新建 / 编辑知识点和题目 ============ */
/* 知识点和题目是课程章节下的内容：在小节页、学习时的卡片菜单里新建、编辑、删除，或移到同一门课的其他小节（保留复习进度）。
   内置课程的卡片只能改内容（以修正的形式保存，不改原文件），不能移动。 */
const EDIT_TYPES = ['kp', 'choice', 'multi', 'tf', 'cloze', 'qa', 'think'];
function itemEditSheet({ it = null, sid = '', type = 'kp', p = null } = {}) {
  const sec = SECS.get(it ? it.sec : sid); if (!sec) return; const c = COURSES.get(sec.course);
  const f = it
    ? { t: it.t, title: it.title || '', q: it.q || '', d: it.d || '', o: [...(it.o || [])], ans: new Set([].concat(it.t === 'choice' || it.t === 'multi' ? it.a : [])), tf: it.t === 'tf' ? !!it.a : true, qa: it.t === 'qa' ? it.a || '' : '', steps: (it.st || []).join('\n'), concl: it.t === 'think' ? it.a || '' : '', x: it.x || '', sid: it.sec, imp: it.imp || 0 }
    : { t: EDIT_TYPES.includes(type) ? type : 'kp', title: '', q: '', d: '', o: ['', '', '', ''], ans: new Set(), tf: true, qa: '', steps: '', concl: '', x: '', sid: sec.id, imp: 0 };
  if (f.o.length < 2) f.o = ['', ''];
  const body = h(`<div style="display:flex;flex-direction:column;gap:14px"></div>`);
  const ta = (id, label, val, rows, ph = '') => `<label class="field"><span>${label}</span><textarea class="inp" id="${id}" rows="${rows}" placeholder="${esc(ph)}">${esc(val)}</textarea></label>`;
  const draw = () => {
    const t = f.t, isChoice = t === 'choice' || t === 'multi';
    body.innerHTML = `<div class="chips wrapc">${EDIT_TYPES.map(k => `<button class="chip" data-ty="${k}" aria-pressed="${t === k}">${TYPE_LABEL[k]}</button>`).join('')}</div>
      <label class="field"><span>标题</span><input class="inp" id="ie-title" maxlength="80" value="${esc(f.title)}" placeholder="${t === 'kp' ? '如：遗忘曲线' : '可不填'}"></label>
      ${ta('ie-q', t === 'kp' ? '要点' : t === 'cloze' ? '内容（用 {{答案}} 标出要填的地方）' : '题干', f.q, t === 'kp' ? 5 : 3, t === 'cloze' ? '记忆的稳定性 {{S}} 越大，遗忘越慢' : t === 'kp' ? '- 支持 Markdown、公式、作图' : '')}
      ${t === 'kp' ? ta('ie-d', '详解', f.d, 5) : ''}
      ${isChoice ? `<div class="field"><span>选项（点字母标出正确答案）</span><div class="oped">${f.o.map((o, i) => `<div class="oprow"><button class="opk ${f.ans.has(i) ? 'on' : ''}" data-ok="${i}" aria-label="设为正确答案">${String.fromCharCode(65 + i)}</button><input class="inp" data-o="${i}" value="${esc(o)}">${f.o.length > 2 ? `<button class="ibtn" data-rmo="${i}" aria-label="删除选项">${ico('x')}</button>` : ''}</div>`).join('')}</div>${f.o.length < 6 ? `<button class="btn ghost sm" data-addo style="align-self:flex-start">${ico('plus')}选项</button>` : ''}</div>` : ''}
      ${t === 'tf' ? `<div class="field"><span>答案</span><div class="seg" role="group"><button data-tf="1" aria-pressed="${f.tf}">${ico('check')}对</button><button data-tf="0" aria-pressed="${!f.tf}">${ico('x')}错</button></div></div>` : ''}
      ${t === 'qa' ? ta('ie-a', '参考答案', f.qa, 4) : ''}
      ${t === 'think' ? ta('ie-st', '提示（一行一步）', f.steps, 4) + ta('ie-c', '结论', f.concl, 3) : ''}
      ${t !== 'kp' ? ta('ie-x', '解析', f.x, 3) : ''}
      <label class="field"><span>所在小节</span><select class="inp" id="ie-sec" ${it?.builtin ? 'disabled' : ''}>${c.chapters.map(ch => `<optgroup label="${esc(ch.title)}">${ch.sections.map(s => `<option value="${s.id}" ${s.id === f.sid ? 'selected' : ''}>${esc(s.title)}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <div class="acts">${it ? `<button class="btn danger" data-del>${ico(it.builtin ? 'eyeoff' : 'trash')}${it.builtin ? '不再显示' : '删除'}</button>` : ''}<button class="btn pri" data-save>${ico('check')}保存</button></div>`;
  };
  const val = id => $('#' + id, body)?.value;
  const read = () => {
    f.title = val('ie-title').trim(); f.q = val('ie-q'); f.sid = val('ie-sec') || f.sid;
    if ($('#ie-d', body)) f.d = val('ie-d'); if ($('#ie-a', body)) f.qa = val('ie-a'); if ($('#ie-x', body)) f.x = val('ie-x');
    if ($('#ie-st', body)) { f.steps = val('ie-st'); f.concl = val('ie-c'); }
    $$('[data-o]', body).forEach(i => { f.o[+i.dataset.o] = i.value; });
  };
  /* 表单 → 卡片字段；不合格返回错误提示 */
  const build = () => {
    const t = f.t, q = f.q.trim(), out = { t, title: f.title || undefined, q, d: '', x: t === 'kp' ? '' : f.x.trim(), o: undefined, a: undefined, st: undefined, pr: t === 'kp' ? undefined : 1, imp: f.imp || undefined };
    if (!q) return t === 'kp' ? '写一下要点' : '写一下题干';
    if (t === 'kp') { out.d = f.d.trim(); if (!out.title) out.title = plain(q).slice(0, 16); }
    else if (t === 'choice' || t === 'multi') {
      const keep = f.o.map((o, i) => [o.trim(), f.ans.has(i)]).filter(x => x[0]);
      if (keep.length < 2) return '至少两个选项'; const right = keep.map((x, i) => x[1] ? i : -1).filter(i => i >= 0);
      if (!right.length) return '点字母标出正确答案';
      out.o = keep.map(x => x[0]); if (t === 'multi' || right.length > 1) { out.t = 'multi'; out.a = right; } else out.a = right[0];
    } else if (t === 'tf') out.a = f.tf;
    else if (t === 'cloze') { if (!q.includes('{{')) return '用 {{答案}} 标出要填的地方'; }
    else if (t === 'qa') { out.a = f.qa.trim(); if (!out.a) return '写一下参考答案'; }
    else if (t === 'think') { out.st = f.steps.split('\n').map(x => x.trim()).filter(Boolean); out.a = f.concl.trim() || undefined; }
    return out;
  };
  body.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ty) { read(); const was = f.t; f.t = b.dataset.ty; if (was === 'choice' && f.t === 'multi' || was === 'multi' && f.t === 'choice') { if (f.t === 'choice' && f.ans.size > 1) f.ans = new Set([[...f.ans][0]]); } draw(); }
    else if (b.dataset.ok) { read(); const i = +b.dataset.ok; if (f.t === 'multi') f.ans.has(i) ? f.ans.delete(i) : f.ans.add(i); else f.ans = new Set([i]); Motion.haptic?.(); draw(); }
    else if (b.dataset.rmo) { read(); const i = +b.dataset.rmo; f.o.splice(i, 1); f.ans = new Set([...f.ans].filter(x => x !== i).map(x => x > i ? x - 1 : x)); draw(); }
    else if (b.hasAttribute('data-addo')) { read(); f.o.push(''); draw(); $(`[data-o="${f.o.length - 1}"]`, body)?.focus(); }
    else if (b.dataset.tf) { read(); f.tf = b.dataset.tf === '1'; draw(); }
    else if (b.hasAttribute('data-del')) {
      if (!await confirmBox(it.builtin ? '不再显示这张卡片' : '删除这张卡片', it.builtin ? '可以在设置里恢复。' : '删除后不能恢复，复习记录也会一起删除。', it.builtin ? '不再显示' : '删除', true)) return;
      removeItem(it); saveState(); s.close(); if (p) $(`[data-pk="${p.pk}"]`)?.remove(); else refresh(); toast(it.builtin ? '已隐藏' : '已删除');
    } else if (b.hasAttribute('data-save')) {
      read(); const fields = build(); if (typeof fields === 'string') return toast(fields);
      if (!it) { const nid = `${f.sid}-m${Date.now().toString(36)}`; saveItems(f.sid, [{ id: nid, ...fields }]); logEvent(`新建${TYPE_LABEL[fields.t]}：${plain(fields.title || fields.q).slice(0, 20)}`); }
      else if (it.builtin) patchItem(it, fields);
      else if (f.sid !== it.sec) { // 移到同一门课的其他小节：保留复习进度、笔记、收藏
        const st = clone(getSt(it)), id = it.id; removeItem(it); saveItems(f.sid, [{ id, ...fields }]);
        if (st) { setSt(ITEMS.get(id), st); saveSrs(c.id); }
      } else saveItems(it.sec, [{ id: it.id, ...fields }]);
      saveState(); s.close(); toast('已保存');
      if (p && it && f.sid === p.it.sec && ITEMS.get(it.id) === p.it) { Object.assign(p, { phase: p.it.t === 'kp' || p.g != null ? 'back' : 'front', picks: new Set(), rev: new Set(), step: 0 }); rerender(p); }
      else if (!p) refresh();
    }
  };
  draw();
  const s = sheet(it ? '编辑' + TYPE_LABEL[it.t] : '新建', body);
  if (!it) setTimeout(() => $('#ie-q', body)?.focus(), 300);
}

/* ============ 调整顺序：小节里的知识点和题目、课程「卡片」分支里的卡片 ============ */
/* 小节的顺序存在 sec/<小节id> 文档的 order 里（内置课程也可以调，不改原文件）；没列出的内容（如之后新加的）排在后面 */
function applySecOrder(sec) {
  const o = Store.get('sec/' + sec.id)?.order; if (!Array.isArray(o) || !o.length) return;
  const idx = new Map(o.map((id, i) => [String(id), i])), at = it => idx.has(it.id) ? idx.get(it.id) : 1e9;
  sec.items.sort((a, b) => at(a) - at(b));
}
/* 通用的排序弹层：groups = [{ title, list: [{ id, label, sub }] }]，保存时回调每组新的 id 顺序 */
function orderSheet(title, groups, save) {
  const G = groups.filter(g => g.list.length).map(g => ({ ...g, list: [...g.list] }));
  if (!G.some(g => g.list.length > 1)) return toast('内容少于两项，不用排序');
  const body = h(`<div style="display:flex;flex-direction:column;gap:14px"></div>`);
  const draw = () => {
    body.innerHTML = G.map((g, gi) => `${g.title ? `<div class="gh"><b>${esc(g.title)}</b><span>${g.list.length}</span></div>` : ''}<div class="group">${g.list.map((x, i) => `<div class="rowi ordrow"><span class="ordn num">${i + 1}</span><span class="grow"><div class="t">${esc(x.label)}</div>${x.sub ? `<div class="m">${esc(x.sub)}</div>` : ''}</span><button class="ibtn" data-mv="${gi}:${i}:-1" ${i ? '' : 'disabled'} aria-label="上移">${ico('down', 'up')}</button><button class="ibtn" data-mv="${gi}:${i}:1" ${i < g.list.length - 1 ? '' : 'disabled'} aria-label="下移">${ico('down')}</button></div>`).join('')}</div>`).join('') +
      `<button class="btn pri block" data-osave>${ico('check')}保存顺序</button>`;
  };
  body.onclick = e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.mv) { const [gi, i, d] = b.dataset.mv.split(':').map(Number), l = G[gi].list; [l[i], l[i + d]] = [l[i + d], l[i]]; Motion.haptic?.(); draw(); const nb = $(`[data-mv="${gi}:${i + d}:${d}"]`, body); (nb && !nb.disabled ? nb : $(`[data-mv="${gi}:${i + d}:${-d}"]`, body))?.focus(); }
    else if (b.hasAttribute('data-osave')) { save(G.map(g => g.list.map(x => x.id))); s.close(); toast('顺序已保存'); }
  };
  draw(); const s = sheet(title, body);
}
const itemLabel = it => plain(it.title || it.q).slice(0, 40) || TYPE_LABEL[it.t];
function secOrderSheet(sid) {
  const sec = SECS.get(sid); if (!sec) return;
  const kps = learnItems(sec), qs = practiceItems(sec); // 按学习步骤分组：学习（知识点和随堂题）、练习
  orderSheet('调整顺序', [{ title: '学习', list: kps.map(it => ({ id: it.id, label: itemLabel(it), sub: it.t === 'kp' ? '' : TYPE_LABEL[it.t] })) }, { title: '练习', list: qs.map(it => ({ id: it.id, label: itemLabel(it), sub: TYPE_LABEL[it.t] })) }], groups => {
    const shown = kps.length && qs.length ? groups.flat() : groups[0] || [], hidden = sec.items.filter(it => !visible(it)).map(it => it.id);
    const path = 'sec/' + sid, doc = Store.get(path) || { items: [] }; doc.order = [...shown, ...hidden]; Store.put(path, doc);
    applySecOrder(sec); refresh();
  });
}
function cardOrderSheet(cid, after) {
  const cs = courseCards(cid);
  orderSheet('调整卡片顺序', [{ list: cs.map(c => ({ id: c.id, label: c.title || plain(c.body || c.prompt).slice(0, 30) || HC_TYPES[c.type][1], sub: HC_TYPES[c.type][1] })) }], ([ids]) => {
    const H = homeCfg(), mine = ids.map(id => H.cards.find(c => c.id === id)).filter(Boolean); let k = 0;
    H.cards = H.cards.map(c => c.course === cid ? mine[k++] || c : c); saveState(); after?.();
  });
}
