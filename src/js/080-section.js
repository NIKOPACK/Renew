/* ============ 小节详情 ============ */
function statusSheet(id) {
  const sec = SECS.get(id), cur = secStatus(sec);
  menuSheet(sec.title, [
    { icon: 'layers', label: '未学 / 按计划学习', sub: '取消「别处已学」或「暂不学」', cls: ['todo', 'learning'].includes(cur) ? 'cur' : '', run: () => { setSecStatus(id, 'todo'); saveState(); refresh(); } },
    { icon: 'sync', label: '在别处已学过', sub: '未学内容直接进入复习', cls: cur === 'external' ? 'cur' : '', run: () => { const b = { n: 0 }; setSecStatus(id, 'external', b); logEvent(`${sec.title} → 别处已学`); saveState(); refresh(); toast(`${b.n} 个内容进入复习安排`); } },
    { icon: 'eyeoff', label: '暂不学习', sub: '不推送新内容，也不出现在复习中', cls: cur === 'skip' ? 'cur' : '', run: () => { setSecStatus(id, 'skip'); saveState(); refresh(); } },
    { icon: 'trash', label: '重置本节进度', cls: 'danger', run: async () => { if (await confirmBox('重置进度', `清除「${sec.title}」的全部复习记录？`, '重置', true)) { setSecStatus(id, 'reset'); saveState(); refresh(); } } }
  ]);
}
function startSection(sid) {
  const sec = SECS.get(sid); S().cur[sec.course] = sid; saveState();
  if (secStatus(sec) === 'empty') return go('section', { id: sid });
  const p = secProg(sec);
  go('session', { kind: 'section', sid, step: p.l && p.ld < p.l ? 'learn' : p.p && p.pd < p.p ? 'practice' : 'learn' });
}
