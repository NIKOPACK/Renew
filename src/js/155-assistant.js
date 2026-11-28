/* ============ AI 助手（v6：ChatGPT 式对话 + Claude Code 式工具调用与确认） ============ */
const Chat = {
  list: (lsGet('chats') || []).map(c => ({ ...c, msgs: (c.msgs || []).map(m => ({ ...m, parts: (m.parts || []).map(p => p.st === 'pending' || p.st === 'run' ? { ...p, st: p.type === 'perm' ? 'expired' : 'err' } : p) })) })),
  cur: null, busy: false, ctl: null, resolvers: new Map(),
  save() { this.list.sort((a, b) => b.t - a.t); this.list = this.list.slice(0, 40); lsSet('chats', this.list.map(c => ({ ...c, msgs: c.msgs.map(m => ({ ...m, parts: m.parts?.map(({ resolve, ...p }) => p) })) }))); },
  get() { return this.list.find(c => c.id === this.cur) || null; }
};
const SUGGEST = [
  ['同步进度', '我在书上已经学到了数据结构第 3 章'],
  ['调整计划', '我想在 6 月底前学完数据结构，帮我调整每天的量'],
  ['找薄弱点', '看看我最近哪里错得多，该怎么补'],
  ['今天怎么学', '今天只有半小时，帮我安排一下']
];
function overviewText() {
  const t = todayStats(), L = [`今天 ${dayKey()}（星期${WEEK[new Date(Date.now() - CUT).getDay()]}）。今日已新学 ${t.n}、复习 ${t.r}；待复习 ${Math.min(dueItems().length, reviewLeft())}；错题 ${wrongItems().length}；连续打卡 ${streak()} 天；每天复习上限 ${plan().maxReview}。`, '课程：'];
  for (const c of shownCourses()) { const cp = coursePlan(c.id), s = courseStats(c), nx = nextSection(c); const ins = courseInsight(c); L.push(`- ${c.id}「${c.title}」（${c.cat}）${cp.on ? '在学' : '未加入今日任务'}，每天 ${cp.pace}，目标 ${cp.target || '未设'}，已学 ${s.learned}/${s.items}，完成小节 ${s.secDone}/${s.secs}，下一节 ${nx ? nx.id + ' ' + nx.title : '无'}，今日新学 ${t.c[c.id] || 0}；学情（按小节）：已掌握 ${ins.cnt.good}、巩固中 ${ins.cnt.mid}、薄弱 ${ins.cnt.weak}、数据不足 ${ins.cnt.none}`); }
  return L.join('\n');
}
const AI_RULES = `你是「温新」学习 App 里的 AI 助手，可以像 Claude Code 一样调用工具查看和修改用户的学习数据。
App 结构：课程 → 章 → 节；每节有知识点卡和练习题；学过的内容按 FSRS 记忆曲线安排复习。
规则：
- 用中文回答，像聊天一样简洁直接，不寒暄、不复述问题；需要时用短列表。
- 不要编造数据。需要小节 id、卡片内容、错题情况时先调用工具查。
- 用户说在别处（书上、网课）学到某一章某一节时：先 get_course_outline 找到对应小节 id，再调用 mark_learned_upto。
- 修改数据的工具会先请用户确认；用户拒绝就尊重，不要重复请求。
- 分析学习情况时，用 get_mastery、get_error_causes、get_attempts 读取本机算好的掌握度和作答记录，引用其中的数字，不要自己估计；「数据不足」的不要下结论。
- 用户发来题目或试卷的照片、说要录错题时，调用 import_questions。
- 建议用户去学某节、复习、看错题或练薄弱点时，调用 add_buttons 放上对应按钮。
- 讲解知识时，能用图说明的先画图，文字只补充图里没有的，不要长篇描述。
${VIZ_SPEC}`;
function aiTools(msg, redraw) {
  const line = label => { const p = { type: 'tool', label, st: 'run' }; msg.parts.push(p); redraw(); return p; };
  const done = (p, res, st = 'done') => { p.st = st; if (res) p.res = res; redraw(); };
  const perm = (label, detail, signal) => new Promise(res => {
    const p = { type: 'perm', id: newId('p'), label, detail, st: 'pending' }; msg.parts.push(p);
    const fin = v => { if (p.st !== 'pending') return; p.st = v ? 'allowed' : 'denied'; Chat.resolvers.delete(p.id); redraw(); Chat.save(); res(v); };
    Chat.resolvers.set(p.id, fin); signal?.addEventListener('abort', () => fin(false)); redraw();
  });
  const secLine = s => { const p = secProg(s); return `${s.id} | ${s.title} | ${SEC_LABEL[secStatus(s)]} | ${p.kpd + p.qd}/${p.kp + p.q}`; };
  return [
    { name: 'get_course_outline', description: '获取一门课程的全部章节和小节，每行：小节id | 标题 | 状态 | 已学/总数。用于把用户说的"第几章第几节"对应到小节 id。', inputSchema: { type: 'object', properties: { course_id: { type: 'string', description: '课程 id，如 ds' } }, required: ['course_id'] },
      execute: ({ course_id }) => { const c = COURSES.get(String(course_id)); const l = line(`查看目录 · ${c?.title || course_id}`); if (!c) { done(l, '没有这门课', 'err'); throw new Error('没有这门课程，可用的 id：' + shownCourses().map(x => x.id).join(',')); } done(l, `${courseSecs(c).length} 节`); return c.chapters.map(ch => `## ${ch.title}\n` + ch.sections.map(secLine).join('\n')).join('\n'); } },
    { name: 'search_cards', description: '在所有课程的知识点和题目中搜索关键词，返回最多 8 条：卡片id | 课程 | 小节 | 类型 | 标题。', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      execute: ({ query }) => { const q = String(query || '').toLowerCase(), l = line(`搜索 · ${query}`), out = []; for (const it of ITEMS.values()) { if (!visible(it)) continue; if (((it.title || '') + it.q + (it.d || '') + (it.x || '')).toLowerCase().includes(q)) out.push(`${it.id} | ${COURSES.get(it.course).title} | ${SECS.get(it.sec).title} | ${TYPE_LABEL[it.t]} | ${plain(it.title || it.q).slice(0, 40)}`); if (out.length >= 8) break; } done(l, `${out.length} 条`); return out.length ? out.join('\n') : '没有找到'; } },
    { name: 'get_card', description: '读取一张卡片的完整内容（要点、详解、选项、答案、解答）和用户的掌握情况（复习次数、遗忘次数、下次复习时间）。', inputSchema: { type: 'object', properties: { card_id: { type: 'string' } }, required: ['card_id'] },
      execute: ({ card_id }) => { const it = ITEMS.get(String(card_id)); const l = line('读取卡片'); if (!it) { done(l, '', 'err'); throw new Error('没有这张卡片'); } const s = getSt(it); done(l, plain(it.title || it.q).slice(0, 16)); return itemToDSL(it) + `\n\n掌握情况：${s ? `复习 ${s.reps} 次，遗忘 ${s.lapses || 0} 次，下次 ${dayKey(s.due)}` : '还没学'}${S().notes?.[it.id] ? `\n用户笔记：${S().notes[it.id]}` : ''}`; } },
    { name: 'get_weak_points', description: '获取所有课程的薄弱点（按本机作答记录算出的掌握度，含答对/作答次数和区间），以及最近答错的 10 张卡片。用于分析薄弱点。',
      execute: () => { const l = line('分析薄弱点'); const ws = shownCourses().flatMap(c => courseInsight(c).weak.map(x => ({ c, x }))).slice(0, 10); const wr = wrongItems().slice(0, 10); done(l, `${ws.length} 处`); return `薄弱点（id | 课程 | 名称 | 答对/作答 | 掌握度估计 [80%区间]）：\n${ws.map(({ c, x }) => `${x.it ? 'k:' + x.it.id : 's:' + x.sec.id} | ${c.title} | ${weakTitle(x)} | ${x.ok}/${x.raw} | ${Math.round(x.p * 100)}% [${Math.round(x.lo * 100)}%, ${Math.round(x.hi * 100)}%]`).join('\n') || '暂无（或数据不足）'}\n\n最近答错：\n${wr.map(it => { const lw = lastWrong(it.id); return `${it.id} | ${SECS.get(it.sec).title} | ${plain(it.title || it.q).slice(0, 30)}${lw?.cause ? ' | 错因 ' + CAUSE[lw.cause].l : ''}`; }).join('\n') || '暂无'}`; } },
    { name: 'get_mastery', description: '获取一门课每个小节（及已关联题目的知识点）的掌握情况：状态（已掌握/巩固中/薄弱/数据不足）、答对/作答次数、掌握度估计与 80% 区间、记忆强度。数字由本机按作答记录计算。', inputSchema: { type: 'object', properties: { course_id: { type: 'string' } }, required: ['course_id'] },
      execute: ({ course_id }) => { const c = COURSES.get(String(course_id)); const l = line(`查看学情 · ${c?.title || course_id}`); if (!c) { done(l, '', 'err'); throw new Error('没有这门课程'); } const ins = courseInsight(c), pc = v => v == null ? '—' : Math.round(v * 100) + '%', row = (id, t, x) => `${id} | ${t} | ${M_LABEL[x.st]} | ${x.ok}/${x.raw} | ${x.st === 'none' ? '—' : `${pc(x.p)} [${pc(x.lo)}, ${pc(x.hi)}]`} | 记忆 ${pc(x.mem)}`; done(l, `${ins.rows.length} 节`); return `共 ${ins.n} 次作答。\n小节（id | 标题 | 状态 | 答对/作答 | 掌握度 [区间] | 记忆）：\n${ins.rows.map(x => row(x.sec.id, x.sec.title, x)).join('\n') || '暂无'}${ins.kps.length ? `\n\n知识点：\n${ins.kps.map(x => row(x.it.id, x.it.title || '', x)).join('\n')}` : ''}`; } },
    { name: 'get_error_causes', description: '获取错题的错因分布（概念、方法、遗忘、审题、计算、粗心），每类附最多 3 道代表题和误概念描述。可选 course_id。', inputSchema: { type: 'object', properties: { course_id: { type: 'string' } } },
      execute: ({ course_id }) => { const cid = COURSES.has(String(course_id)) ? String(course_id) : '', l = line('查看错因'), cc = causeCounts(cid); done(l); return CAUSES.map(([k, lab]) => `${lab}：${cc[k].all} 道（你确认 ${cc[k].me}）${cc[k].ids.slice(0, 3).map(id => { const it = ITEMS.get(id), lw = lastWrong(id); return `\n  - ${id} ${plain(it.title || it.q).slice(0, 30)}${lw?.why ? '（' + lw.why + '）' : ''}`; }).join('')}`).join('\n') + `\n未标错因：${wrongItems().filter(it => (!cid || it.course === cid) && !lastWrong(it.id)?.cause).length} 道`; } },
    { name: 'get_attempts', description: '获取一张卡片的全部作答记录：时间、对错、作答内容、用时、作答前预测的回忆概率、错因。', inputSchema: { type: 'object', properties: { card_id: { type: 'string' } }, required: ['card_id'] },
      execute: ({ card_id }) => { const it = ITEMS.get(String(card_id)); const l = line('查看作答记录'); if (!it) { done(l, '', 'err'); throw new Error('没有这张卡片'); } const xs = attOf(it.id); done(l, `${xs.length} 次`); return xs.length ? xs.map(r => `${new Date(r.t).toLocaleString()} | ${r.ok == null ? '评分 ' + r.g : r.ok ? '对' : '错'}${r.self ? '（自评）' : ''}${r.ans !== undefined ? ' | 作答 ' + ansShow(it, r.ans) : ''}${r.ms ? ' | ' + Math.round(r.ms / 1000) + '秒' : ''}${r.r != null ? ' | 预测 ' + Math.round(r.r * 100) + '%' : ''}${r.cause ? ' | 错因 ' + CAUSE[r.cause].l + (r.why ? '：' + r.why : '') : ''}${r.m === 'paper' ? ' | 纸上' : ''}`).join('\n') : '还没有作答记录'; } },
    { name: 'import_questions', description: '把用户这条消息里附带的题目照片录入题库：打开录题确认页，逐题识别后由用户核对再入库。可选 course_id。会先请用户确认。', inputSchema: { type: 'object', properties: { course_id: { type: 'string' } } },
      execute: async ({ course_id }, { signal }) => {
        const um = [...(Chat.get()?.msgs || [])].reverse().find(m => m.role === 'user' && m._att?.length), imgs = um ? attPayload(um._att).images : [];
        if (!imgs.length) return '这条消息里没有图片。请用户点输入框的 + 拍照或选图片后再说一次，或者到「记录」页点录题按钮。';
        if (!await perm('录入题目', `识别 ${imgs.length} 张图片中的题目，核对后入库`, signal)) return '用户拒绝了';
        const cid = COURSES.has(String(course_id)) ? String(course_id) : activeCourses()[0]?.id || '_new';
        setTimeout(() => startCapture({ course: cid, scope: 'all', imgs, text: '' }), 50); return '已打开录题确认页';
      } },
    { name: 'set_error_cause', description: '修改一道错题最近一次答错的错因（concept 概念、method 方法、forget 遗忘、read 审题、calc 计算、slip 粗心）。会先请用户确认。', inputSchema: { type: 'object', properties: { card_id: { type: 'string' }, cause: { type: 'string', enum: CAUSES.map(c => c[0]) }, note: { type: 'string', description: '具体的误概念，30 字以内' } }, required: ['card_id', 'cause'] },
      execute: async ({ card_id, cause, note }, { signal }) => { const it = ITEMS.get(String(card_id)), lw = it && lastWrong(it.id); if (!lw) throw new Error('这张卡片没有答错记录'); if (!CAUSE[cause]) throw new Error('错因不对'); if (!await perm('修改错因', `${plain(it.title || it.q).slice(0, 20)} → ${CAUSE[cause].l}${note ? '：' + note : ''}`, signal)) return '用户拒绝了'; setCause(lw, cause, 'me', note ? String(note).slice(0, 40) : undefined); return '已修改'; } },
    { name: 'get_daily_stats', description: '最近 N 天（默认 14）每天的新学数、复习数、正确数、错误数、学习分钟数，以及是否打卡。', inputSchema: { type: 'object', properties: { days: { type: 'number' } } },
      execute: ({ days }) => { const n = Math.max(1, Math.min(60, +days || 14)), l = line(`查看最近 ${n} 天`), out = []; for (let i = n - 1; i >= 0; i--) { const k = addDays(dayKey(), -i), s = S().stats[k]; out.push(`${k} 新${s?.n || 0} 复${s?.r || 0} 对${s?.ok || 0} 错${s?.bad || 0} ${Math.round((s?.sec || 0) / 60)}分钟${S().checkins[k] ? ' 已打卡' : ''}`); } done(l); return out.join('\n'); } },
    { name: 'mark_learned_upto', description: '用户已在别处学到某一节时调用：把该课程从开头到这一节（含）所有未学的小节标为"别处已学"，内容分散进入之后几天的复习。会先请用户确认，返回执行结果。', inputSchema: { type: 'object', properties: { section_id: { type: 'string' } }, required: ['section_id'] },
      execute: async ({ section_id }, { signal }) => {
        const sec = SECS.get(String(section_id)); if (!sec) throw new Error('没有这个小节 id，请先用 get_course_outline 查');
        const c = COURSES.get(sec.course), all = courseSecs(c), upto = all.slice(0, all.indexOf(sec) + 1).filter(s => ['todo', 'learning'].includes(secStatus(s)));
        const k = upto.reduce((a, s) => a + secItems(s).filter(it => !getSt(it)).length, 0);
        if (!upto.length) return '这些小节都已学过或已标记，无需操作';
        if (!await perm('标记学习进度', `「${c.title}」从开头到「${sec.title}」共 ${upto.length} 节标为别处已学，${k} 个内容分散进入复习`, signal)) return '用户拒绝了';
        const n = setUpto(sec.id); logEvent(`AI：${c.title} 学到 ${sec.title}`); saveState(); return `已完成：${upto.length} 节，${n} 个内容进入复习`;
      } },
    { name: 'set_section_status', description: '修改若干小节的状态：external=别处已学（进入复习），todo=恢复为未学，skip=暂不学。会先请用户确认。', inputSchema: { type: 'object', properties: { section_ids: { type: 'array', items: { type: 'string' } }, status: { type: 'string', enum: ['external', 'todo', 'skip'] } }, required: ['section_ids', 'status'] },
      execute: async ({ section_ids, status }, { signal }) => {
        const ids = [].concat(section_ids || []).map(String).filter(id => SECS.has(id)), to = String(status); if (!ids.length || !['external', 'todo', 'skip'].includes(to)) throw new Error('参数不对');
        if (!await perm('修改小节状态', `${ids.map(id => SECS.get(id).title).join('、')} → ${SEC_LABEL[to]}`, signal)) return '用户拒绝了';
        const b = { n: 0 }; ids.forEach(id => setSecStatus(id, to, b)); saveState(); logEvent('AI：修改小节状态 ' + ids.join(',')); return `已完成${b.n ? `，${b.n} 个内容进入复习` : ''}`;
      } },
    { name: 'update_plan', description: '修改一门课的学习计划，只传要改的字段：daily_new 每天新学数量（知识点和题目都算），target_date 目标完成日期 YYYY-MM-DD，active 是否加入今日任务。会先请用户确认。', inputSchema: { type: 'object', properties: { course_id: { type: 'string' }, daily_new: { type: 'number' }, target_date: { type: 'string' }, active: { type: 'boolean' } }, required: ['course_id'] },
      execute: async (a, { signal }) => {
        const c = COURSES.get(String(a.course_id)); if (!c) throw new Error('没有这门课程'); const cp = coursePlan(c.id), ch = [];
        if (a.daily_new != null && +a.daily_new >= 0) ch.push(['pace', Math.round(+a.daily_new), `每天 ${cp.pace} → ${Math.round(+a.daily_new)} 个`]);
        if (a.target_date && /^\d{4}-\d{2}-\d{2}$/.test(String(a.target_date))) ch.push(['target', String(a.target_date), `目标 ${cp.target || '未设'} → ${a.target_date}`]);
        if (typeof a.active === 'boolean') ch.push(['on', a.active, a.active ? '加入今日任务' : '移出今日任务']);
        if (!ch.length) throw new Error('没有需要修改的字段');
        if (!await perm(`调整「${c.title}」的计划`, ch.map(x => x[2]).join('；'), signal)) return '用户拒绝了';
        ch.forEach(([k, v]) => cp[k] = v); saveState(); logEvent(`AI：调整 ${c.title} 计划`); return '已更新：' + ch.map(x => x[2]).join('；');
      } },
    { name: 'set_daily_review_limit', description: '修改每天复习数量上限。会先请用户确认。', inputSchema: { type: 'object', properties: { value: { type: 'number' } }, required: ['value'] },
      execute: async ({ value }, { signal }) => { const v = Math.round(+value); if (!(v > 0)) throw new Error('数值不对'); if (!await perm('调整复习上限', `每天 ${plan().maxReview} → ${v} 个`, signal)) return '用户拒绝了'; plan().maxReview = v; saveState(); return '已更新'; } },
    { name: 'add_buttons', description: '在回复下方放 1~3 个快捷按钮：open_section（打开小节，需 section_id）、start_review（开始复习，可选 course_id）、wrong_book（错题本）、generate（为小节生成内容，需 section_id）、practice（练一组题，需 card_ids）、insight（学情页，可选 course_id）。label 是按钮文字（10 字以内）。', inputSchema: { type: 'object', properties: { buttons: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: ['open_section', 'start_review', 'wrong_book', 'generate', 'practice', 'insight'] }, section_id: { type: 'string' }, course_id: { type: 'string' }, card_ids: { type: 'array', items: { type: 'string' } }, label: { type: 'string' } }, required: ['type'] } } }, required: ['buttons'] },
      execute: ({ buttons }) => { msg.buttons = [].concat(buttons || []).filter(b => b && ['open_section', 'start_review', 'wrong_book', 'generate', 'practice', 'insight'].includes(b.type) && (!['open_section', 'generate'].includes(b.type) || SECS.has(String(b.section_id))) && (b.type !== 'practice' || [].concat(b.card_ids || []).some(id => ITEMS.has(String(id))))).slice(0, 3).map(b => ({ type: b.type, sid: b.section_id ? String(b.section_id) : undefined, cid: COURSES.has(String(b.course_id)) ? String(b.course_id) : undefined, ids: b.type === 'practice' ? [].concat(b.card_ids).map(String).filter(id => ITEMS.has(id)).slice(0, 30) : undefined, label: String(b.label || '').slice(0, 14) })); redraw(); return '已添加'; } }
  ];
}
function fallbackAction(a) {
  if (a.op === 'upto' && SECS.has(a.section)) return () => { const n = setUpto(a.section); saveState(); return `${n} 个内容进入复习`; };
  if (a.op === 'status' && Array.isArray(a.sections)) return () => { const b = { n: 0 }; a.sections.filter(id => SECS.has(id)).forEach(id => setSecStatus(id, a.to, b)); saveState(); return '已完成'; };
  if (a.op === 'pace' && COURSES.has(a.course)) return () => { coursePlan(a.course).pace = Math.round(+a.value); saveState(); return '已更新'; };
  if (a.op === 'target' && COURSES.has(a.course) && /^\d{4}-\d{2}-\d{2}$/.test(a.value)) return () => { coursePlan(a.course).target = a.value; saveState(); return '已更新'; };
  if (a.op === 'active' && Array.isArray(a.courses)) return () => { for (const c of COURSES.values()) coursePlan(c.id).on = a.courses.includes(c.id); saveState(); return '已更新'; };
  if (a.op === 'maxReview' && +a.value > 0) return () => { plan().maxReview = Math.round(+a.value); saveState(); return '已更新'; };
  return null;
}
function historySheet() {
  const body = h(`<div style="display:flex;flex-direction:column;gap:12px"></div>`);
  const draw = () => {
    body.innerHTML = `<button class="btn soft block" id="hs-new">${ico('edit')}新对话</button>` + (Chat.list.length ? `<div class="menu">${Chat.list.map(c => `<button data-open="${c.id}" class="${c.id === Chat.cur ? 'cur' : ''}"><span class="grow">${esc(c.title)}<small>${new Date(c.t).toLocaleDateString()} · ${c.msgs.filter(m => m.role === 'user').length} 条</small></span><span class="ibtn" data-del="${c.id}" role="button" aria-label="删除" style="color:var(--ink-3)">${ico('trash')}</span></button>`).join('')}</div>` : `<div class="empty">${tileIco('chat')}<span>还没有对话</span></div>`);
    $('#hs-new', body).onclick = () => { s.close(); Chat.cur = null; refresh(); };
    $$('[data-open]', body).forEach(b => b.onclick = e => { if (e.target.closest('[data-del]')) return; s.close(); Chat.cur = b.dataset.open; refresh(); });
    $$('[data-del]', body).forEach(b => b.onclick = e => { e.stopPropagation(); Chat.list = Chat.list.filter(c => c.id !== b.dataset.del); if (Chat.cur === b.dataset.del) Chat.cur = null; Chat.save(); draw(); refresh(); });
  };
  const s = sheet('对话', body); draw();
}
async function aiSend(text, att = []) {
  if (Chat.busy || (!text.trim() && !att.length)) return;
  if (!AI.ok) { if (Platform.aiConfigurable) { AI.require(); return; } copyText(`${AI_RULES}\n\n${overviewText()}\n\n用户：${text}`, AI.need + '。已复制问题，可以粘贴到任意 AI'); return; }
  let c = Chat.get();
  const isNew = !c || !c.msgs.length;
  if (!c) { c = { id: newId('c'), title: (text || att[0]?.title || att[0]?.name || '附件').slice(0, 18), t: Date.now(), msgs: [], ctx: chatCtx() }; Chat.list.unshift(c); Chat.cur = c.id; }
  c.t = Date.now();
  const history = c.msgs.filter(m => m.text || m.att).slice(-12).map(m => ({ role: m.role, content: m.role === 'user' ? (m.text || '请看附件') + (m.ctx || '') : m.text + ((m.parts || []).filter(p => p.type === 'perm').map(p => `\n[${p.label}：${p.st === 'allowed' ? '已执行' : '用户拒绝'}]`).join('')) }));
  const pay = attPayload(att), um = { role: 'user', text, ...(att.length ? { att: attMeta(att), ctx: pay.text.slice(0, 4000) } : {}) };
  Object.defineProperty(um, '_att', { value: att, enumerable: false }); // 原图只留在内存里，重新生成时再用
  c.msgs.push(um);
  const msg = { role: 'assistant', parts: [], text: '', streaming: true }; c.msgs.push(msg);
  Chat.busy = true; Chat.ctl = new AbortController();
  const v = $('#view'); if (Nav.stack[Nav.stack.length - 1]?.view !== 'ai') go('ai', {}, { tab: true }); else if (isNew) render(false); else { drawMsgs(true); v._sync?.(); }
  let raf = 0; const redraw = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; drawMsgs(); }); };
  const cc = COURSES.get(c.ctx), ctxTxt = cc ? `\n\n用户选择聚焦课程「${cc.title}」（${cc.id}），目录：\n` + cc.chapters.map(ch => ch.title + '\n' + ch.sections.map(x => { const q = secProg(x); return `${x.id} ${x.title} | ${SEC_LABEL[secStatus(x)]} | ${q.kpd + q.qd}/${q.kp + q.q}`; }).join('\n')).join('\n') : '';
  const input = [{ role: 'user', content: `${AI_RULES}\n\n当前学习概况：\n${overviewText()}${ctxTxt}` }, ...history, { role: 'user', content: (text || '请看附件') + pay.text }], imgs = pay.images.length ? { images: pay.images } : {};
  try {
    if (AI.limits?.tools) {
      const { text: out } = await AI.fn(input, { signal: Chat.ctl.signal, ...imgs, tools: aiTools(msg, redraw), onText: ({ text }) => { msg.text = text; redraw(); } });
      msg.text = out;
    } else {
      const r = await AI.fn.json([{ role: 'user', content: SYNC_RULES + '\n\n学习数据：\n' + progressText() }, ...history, { role: 'user', content: (text || '请看附件') + pay.text }], { signal: Chat.ctl.signal, ...imgs, cache: false });
      msg.text = String(r?.reply || '好的。');
      for (const a of (Array.isArray(r?.actions) ? r.actions : [])) {
        if (a?.op === 'generate' && SECS.has(a.section)) { (msg.buttons ||= []).push({ type: 'generate', sid: a.section, label: '生成内容' }); continue; }
        const run = fallbackAction(a); if (!run) continue;
        const p = { type: 'perm', id: newId('p'), label: '修改学习数据', detail: describeAction(a), st: 'pending' }; msg.parts.push(p);
        Chat.resolvers.set(p.id, ok => { if (p.st !== 'pending') return; if (ok) { p.res = run(); p.st = 'allowed'; logEvent('AI 调整：' + describeAction(a)); } else p.st = 'denied'; Chat.resolvers.delete(p.id); Chat.save(); drawMsgs(); });
      }
    }
  } catch (e) {
    if (e?.code === 'cancelled') msg.text = (e.text || msg.text || '') + (msg.text || e.text ? '' : '*已停止*');
    else msg.text = (e?.text || msg.text || '') + `\n\n> ${AI.err(e)}`;
  }
  msg.streaming = false; Chat.busy = false; Chat.ctl = null;
  msg.parts.forEach(p => { if (p.st === 'run') p.st = 'done'; });
  Chat.save(); drawMsgs(); $('#view')._sync?.();
}
