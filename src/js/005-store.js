/* ============ 存储：本机持久化 + 可选云端（均由 Platform 提供） ============ */
const LS = 'xl:';
const lsGet = k => { try { return JSON.parse(localStorage.getItem(LS + k)); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch {} };
const lsDel = k => { try { localStorage.removeItem(LS + k); } catch {} };
const DOC_RE = /^(app|srs|sec|course|mat|job)\//;
const Store = {
  db: null, mode: 'local', docs: {}, timers: {}, busy: {}, again: {}, note: '',
  async init() {
    Object.assign(this.docs, await Platform.loadDocs());
    this.db = await Platform.cloudDb();
    if (!this.db) { this.note = Platform.cloudNote || ''; return; }
    try {
      const r = await Promise.race([this.loadCloud(), sleep(10000).then(() => 'timeout')]);
      this.mode = 'cloud'; if (r === 'timeout') this.note = '云端暂时连不上，先显示本机缓存。';
    } catch { this.db = null; this.note = '云端存储不可用，进度只保存在这台设备上。'; }
  },
  async loadCloud() {
    const db = this.db, cols = ['srs', 'sec', 'course', 'mat', 'job'];
    const [st, pr, ...snaps] = await Promise.all([db.doc('app/state').get(), db.doc('app/prefs').get(), ...cols.map(c => db.collection(c).get())]);
    const seen = new Set();
    const merge = (path, snap) => {
      seen.add(path);
      if (!snap.exists) { if (this.docs[path]) this.queue(path); return; }
      const cloud = snap.data(), local = this.docs[path];
      if (local && (local._t || 0) > (cloud._t || 0)) this.queue(path);
      else { this.docs[path] = clone(cloud); Platform.writeDoc(path, cloud); }
    };
    merge('app/state', st); merge('app/prefs', pr);
    cols.forEach((c, i) => snaps[i].docs.forEach(d => merge(c + '/' + d.id, d)));
    for (const k of Object.keys(this.docs)) if (!seen.has(k) && DOC_RE.test(k)) this.queue(k);
    this.saveKeys();
  },
  saveKeys() { Platform.saveKeys(Object.keys(this.docs)); },
  keys(prefix) { return Object.keys(this.docs).filter(k => k.startsWith(prefix)); },
  get(p) { return this.docs[p]; },
  put(p, obj) { obj._t = Date.now(); this.docs[p] = obj; Platform.writeDoc(p, obj); this.saveKeys(); if (this.db) this.queue(p); },
  drop(p) { delete this.docs[p]; Platform.dropDoc(p); this.saveKeys(); if (this.db) this.db.doc(p).delete().catch(() => {}); },
  queue(p, wait = 1200) { clearTimeout(this.timers[p]); this.timers[p] = setTimeout(() => this.flush(p), wait); },
  async flush(p) {
    if (!this.db || !this.docs[p]) return;
    if (this.busy[p]) { this.again[p] = true; return; }
    this.busy[p] = true;
    try { await this.db.doc(p).set(clone(this.docs[p])); }
    catch (e) {
      const c = e && e.code;
      if (c === 'unavailable') { await sleep(1500 + Math.random() * 2000); try { await this.db.doc(p).set(clone(this.docs[p])); } catch {} }
      else if (c === 'quota_exceeded') toast('云端存储已满，请在设置中导出备份后清理自建内容。');
      else if (['invalid_argument', 'revoked', 'not_granted'].includes(c)) { this.db = null; this.mode = 'local'; toast('没有写入权限，进度只保存在这台设备上。'); }
    } finally { this.busy[p] = false; if (this.again[p]) { this.again[p] = false; this.flush(p); } }
  },
  flushAll() { for (const p of Object.keys(this.timers)) { clearTimeout(this.timers[p]); this.flush(p); } this.timers = {}; Platform.flush?.(); }
};
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Store.flushAll(); });
