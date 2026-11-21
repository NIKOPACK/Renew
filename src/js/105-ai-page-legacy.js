/* ============ AI 页 ============ */
const chat = { turns: lsGet('chat') || [] };
function progressText() {
  const p = plan(), t = todayStats(), out = [`今天 ${dayKey()}；每天复习上限 ${p.maxReview}；今日已新学 ${t.n}、复习 ${t.r}；连续打卡 ${streak()} 天。`];
  const last = Object.keys(S().stats).sort().slice(-7).map(k => `${k.slice(5)}:${S().stats[k].n}+${S().stats[k].r}`).join(' ');
  if (last) out.push('最近每天(新学+复习)：' + last);
  for (const c of shownCourses()) {
    const cp = coursePlan(c.id), cs = courseStats(c);
    out.push(`\n[课程 ${c.id}] ${c.title}（${c.cat}）| ${cp.on ? '在学' : '未加入计划'} | 每天 ${cp.pace} | 目标 ${cp.target || '无'} | 已学 ${cs.learned}/${cs.items}`);
    for (const ch of c.chapters) for (const sec of ch.sections) { const st = secStatus(sec), pr = secProg(sec), wr = secItems(sec).filter(x => getSt(x)?.lapses).length; out.push(`${sec.id} ${chapShort(ch)} ${sec.title} | ${SEC_LABEL[st]} | 已学 ${pr.kpd + pr.qd}/${pr.kp + pr.q}${wr ? ` | 错 ${wr}` : ''}`); }
  }
  return out.join('\n');
}
const SYNC_RULES = `你是学习 App 里的学习规划助手。App 里有多门课程，每门课分章、节，每节包含知识点卡和练习题，按 FSRS 记忆曲线复习。用户会说明他在别处（教材、网课、其他 App）的进度、学习感受或想要的计划调整。

只输出一个 JSON 对象：{"reply":"给用户的中文回复，150 字以内，可以给具体建议","actions":[...]}
可用 action（只在用户明确提出或强烈暗示时给出；不确定就在 reply 里追问，actions 留空）：
- {"op":"upto","section":"ds3s2"}  用户在别处已经学到这一节（含之前所有未学小节），都标为"别处已学"并进入复习
- {"op":"status","sections":["ds2s1"],"to":"external"}  to 取值：external=别处已学；todo=未学；skip=暂不学
- {"op":"pace","course":"ds","value":15}  这门课每天新学数量（知识点和练习都算）
- {"op":"target","course":"ds","value":"2027-06-30"}  这门课的目标完成日期
- {"op":"active","courses":["ds","co"]}  加入今日流程的课程（其他课程移出）
- {"op":"maxReview","value":200}
- {"op":"generate","section":"ds5s3","focus":"线索二叉树"}  建议为某节补充内容（用户确认后才生成）
section 和 course 的 id 必须来自下方数据。`;
function pickSection(title, cb) {
  const body = h(`<div style="display:flex;flex-direction:column;gap:12px"></div>`);
  body.innerHTML = shownCourses().map(c => `<details class="card chap" style="--c:${c.color}"><summary><span class="no">${esc(c.title[0])}</span><span class="grow"><div class="t">${esc(c.title)}</div><div class="m">${courseSecs(c).length} 节</div></span>${ico('down', 'chev')}</summary><div class="list">${courseSecs(c).map(s => `<button class="li" data-ps="${s.id}"><span class="sti" data-s="${secStatus(s)}"></span><span class="grow"><div class="t">${esc(s.title)}</div><div class="m">${esc(CHAPS.get(s.chap).title)} · ${secItems(s).length} 个内容</div></span></button>`).join('')}</div></details>`).join('');
  const s = sheet(title, body);
  $$('[data-ps]', body).forEach(b => b.onclick = () => { s.close(); cb(b.dataset.ps); });
}
function weakSheet() {
  const rows = [...SECS.values()].map(sec => ({ sec, n: secItems(sec).reduce((a, it) => a + (getSt(it)?.lapses || 0), 0) })).filter(x => x.n).sort((a, b) => b.n - a.n).slice(0, 8);
  if (!rows.length) return sheet('薄弱点补强', `<div class="empty">${ico('target')}<b style="color:var(--ink)">还没有错题记录</b><span>学习一段时间后，这里会列出遗忘最多的小节。</span></div>`);
  menuSheet('遗忘最多的小节', rows.map(({ sec, n }) => ({ icon: 'target', label: sec.title, sub: `${COURSES.get(sec.course).title} · 累计遗忘 ${n} 次`, run: () => genSheet({ sid: sec.id, kpN: 2, qN: 5, weak: true }) })));
}
function describeAction(a) {
  const sn = id => SECS.get(id)?.title || id, cn = id => COURSES.get(id)?.title || id;
  if (a.op === 'upto') return `「${cn(SECS.get(a.section)?.course)}」已学到 ${sn(a.section)}，之前未学的进入复习`;
  if (a.op === 'status') return `把 ${(a.sections || []).map(sn).join('、')} 标为「${SEC_LABEL[a.to] || a.to}」`;
  if (a.op === 'pace') return `「${cn(a.course)}」每天新学 ${a.value} 个`;
  if (a.op === 'target') return `「${cn(a.course)}」目标日期 ${a.value}`;
  if (a.op === 'active') return `今日流程只学：${(a.courses || []).map(cn).join('、')}`;
  if (a.op === 'maxReview') return `每天复习上限 ${a.value}`;
  if (a.op === 'generate') return `为 ${sn(a.section)} 生成内容${a.focus ? '（侧重：' + a.focus + '）' : ''}`;
  return JSON.stringify(a);
}
