/* ============ 复习提醒（仅在 Platform.notify 可用时出现，App 中使用系统本地通知） ============ */
const Reminder = {
  cfg() { return P().remind || { on: false, h: 20, m: 30 }; },
  /* 未来 7 天每天提醒时刻的待复习数量：到期时间早于当天结束的卡片（假设期间没有复习，是上限估计） */
  plan() {
    const { h, m } = this.cfg(), now = Date.now(), out = [], dues = [];
    for (const it of ITEMS.values()) {
      if (!visible(it) || S().hiddenCourses[it.course] || S().sec[it.sec] === 'skip') continue;
      const s = getSt(it); if (s) dues.push(s.due);
    }
    const cap = plan().maxReview, active = activeCourses().length;
    for (let i = 0; i < 7; i++) {
      const at = new Date(); at.setDate(at.getDate() + i); at.setHours(h, m, 0, 0);
      if (at.getTime() <= now + 60000) continue;
      const end = new Date(at); end.setHours(23, 59, 59, 999);
      const n = Math.min(cap, dues.filter(d => d <= end.getTime()).length);
      if (n) out.push({ id: 7000 + i, at, title: `今天有 ${n} 张卡片待复习`, body: `约 ${Math.max(1, Math.round(n * .4))} 分钟，趁记忆还新鲜复习一下。` });
      else if (active) out.push({ id: 7000 + i, at, title: '今天还没学习', body: '花 10 分钟学一节，保持节奏。' });
    }
    return out;
  },
  async sync() {
    if (!Platform.notify) return;
    try { await Platform.notify.cancelAll(); if (this.cfg().on) await Platform.notify.schedule(this.plan()); } catch {}
  },
  async set(patch) {
    const c = { ...this.cfg(), ...patch };
    if (patch.on && !(await Platform.notify.permission())) { toast('没有通知权限，请在系统设置里允许温新发送通知'); c.on = false; }
    P().remind = c; savePrefs(); await this.sync();
    return c.on;
  }
};
function reminderGroup() {
  const c = Reminder.cfg(), t = `${String(c.h).padStart(2, '0')}:${String(c.m).padStart(2, '0')}`;
  return `<div class="gh"><b>提醒</b></div><div class="group">
    <div class="rowi"><span class="grow"><div class="t">每日复习提醒</div><div class="m">按到期卡片数量提醒你复习</div></span><button class="toggle" role="switch" id="s-rem" aria-checked="${!!c.on}" aria-label="每日复习提醒"></button></div>
    ${c.on ? `<label class="rowi"><span class="grow"><div class="t">提醒时间</div></span><input class="inp" type="time" id="s-remt" value="${t}" style="width:auto;min-height:36px;padding:4px 10px"></label>` : ''}
  </div>`;
}
function bindReminderGroup(v) {
  $('#s-rem', v)?.addEventListener('click', async () => { await Reminder.set({ on: !Reminder.cfg().on }); refresh(); });
  $('#s-remt', v)?.addEventListener('change', e => { const [h, m] = e.target.value.split(':').map(Number); if (h >= 0) Reminder.set({ h, m: m || 0 }).then(() => toast(`每天 ${e.target.value} 提醒`)); });
}
