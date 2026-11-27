/* ============ 碎片听学：离线语音朗读卡片与详解（Web Speech API） ============ */
const Speech = {
  get ok() { return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'; },
  cur: null, auto: false,
  isCard(id) { return this.cur === 'card:' + id; },
  clean(s) {
    return plain(String(s || '').replace(/\{\{([\s\S]+?)\}\}/g, '$1'))
      .replace(/https?:\/\/\S+/g, '链接').replace(/\s+/g, ' ').trim();
  },
  cardText(p) {
    const it = p.it, parts = [];
    if (it.title) parts.push(it.title);
    const q = it.t === 'cloze' && p.phase !== 'back'
      ? plain(String(it.q || '').replace(/\{\{([\s\S]+?)\}\}/g, '空白'))
      : this.clean(it.q);
    if (q) parts.push(q);
    if ((it.t === 'choice' || it.t === 'multi') && it.o?.length) {
      parts.push(it.o.map((o, i) => `${String.fromCharCode(65 + i)}，${this.clean(o)}`).join('；'));
    }
    if (p.phase === 'back') {
      if (it.t === 'qa' || it.t === 'think') { if (it.a) parts.push('参考答案：' + this.clean(it.a)); }
      else if (ansText(it)) parts.push('答案：' + ansText(it));
      if (it.x) parts.push('解答：' + this.clean(it.x));
    }
    return parts.filter(Boolean).join('。');
  },
  syncUI() {
    $$('[data-speak]').forEach(b => { b.classList.toggle('on', this.auto); b.classList.toggle('speaking', !!this.cur); });
    $$('[data-d="speak"]').forEach(b => b.classList.toggle('speaking', !!(this.cur && this.cur.startsWith('detail:'))));
  },
  stop(keepAuto = false) {
    if (!keepAuto) this.auto = false;
    this.cur = null;
    if (this.ok) try { speechSynthesis.cancel(); } catch {}
    this.syncUI();
  },
  speak(key, text) {
    if (!this.ok || !text) return;
    try { speechSynthesis.cancel(); } catch {}
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN'; u.rate = 1.05;
    this.cur = key;
    u.onend = u.onerror = () => { if (this.cur === key) { this.cur = null; this.syncUI(); } };
    this.syncUI();
    try { speechSynthesis.speak(u); } catch { this.cur = null; this.syncUI(); }
  },
  readCard(p) { this.speak('card:' + p.it.id, this.cardText(p)); },
  toggleCard(p) {
    if (!this.ok) return toast('当前环境不支持语音朗读');
    if (this.isCard(p.it.id)) return this.stop();
    this.readCard(p);
  },
  toggleDetail(it, k) {
    if (!this.ok) return toast('当前环境不支持语音朗读');
    const key = `detail:${it.id}:${k}`;
    if (this.cur === key) return this.stop();
    this.speak(key, [it.title, this.clean(it[k])].filter(Boolean).join('。'));
  },
  toggleSession() {
    if (!this.ok) return toast('当前环境不支持语音朗读');
    if (this.auto || this.cur) return this.stop();
    this.auto = true;
    const el = currentPost(), p = el && Feed.posts.get(el.dataset.pk);
    if (p) this.readCard(p); else this.syncUI();
  }
};
