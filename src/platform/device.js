/* ============ 平台：独立 App（Capacitor 原生壳）与普通浏览器 ============ */
/* 原生环境：学习数据和文件写入 App 私有目录（Filesystem），保存走系统分享面板，震动/通知/返回键用原生插件。
   普通浏览器：数据存 localStorage + IndexedDB，保存走浏览器下载。
   两者的 AI 都使用用户自己填写的 API Key 直连模型服务（见 ai/clients.js）。
   插件通过 Capacitor 注入的 window.Capacitor.Plugins 访问，不需要打包器。 */
const APP_VERSION = '__VERSION__';
const VENDOR = { pdf: 'vendor/pdf.min.js', pdfWorker: 'vendor/pdf.worker.min.js', mammoth: 'vendor/mammoth.browser.min.js', anthropic: 'vendor/anthropic-sdk.js' };

/* ---- 原生文件系统：学习数据每个文档一个 JSON 文件，先写临时文件再改名，避免写一半损坏 ---- */
const NativeFS = {
  D: 'DATA',
  docPath: p => 'docs/' + encodeURIComponent(p) + '.json',
  pending: new Map(), timer: 0,
  async loadDocs() {
    const fs = Plug('Filesystem'), out = {};
    let files = [];
    try { files = (await fs.readdir({ path: 'docs', directory: this.D })).files || []; }
    catch { try { await fs.mkdir({ path: 'docs', directory: this.D, recursive: true }); } catch {} }
    await Promise.all(files.map(async f => {
      const name = typeof f === 'string' ? f : f.name; if (!name.endsWith('.json')) return;
      try { const r = await fs.readFile({ path: 'docs/' + name, directory: this.D, encoding: 'utf8' }); out[decodeURIComponent(name.slice(0, -5))] = JSON.parse(r.data); } catch {}
    }));
    if (!Object.keys(out).length) Object.assign(out, await WebDocs.loadDocs()); // 首次启动：迁移浏览器里已有的数据
    return out;
  },
  writeDoc(p, o) { this.pending.set(p, JSON.stringify(o)); clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 400); },
  dropDoc(p) { this.pending.delete(p); Plug('Filesystem').deleteFile({ path: this.docPath(p), directory: this.D }).catch(() => {}); },
  saveKeys() {},
  async flush() {
    clearTimeout(this.timer); const fs = Plug('Filesystem'), jobs = [...this.pending]; this.pending.clear();
    await Promise.all(jobs.map(async ([p, data]) => {
      const to = this.docPath(p), tmp = to + '.tmp';
      try { await fs.writeFile({ path: tmp, data, directory: this.D, encoding: 'utf8', recursive: true }); await fs.rename({ from: tmp, to, directory: this.D, toDirectory: this.D }); }
      catch { try { await fs.writeFile({ path: to, data, directory: this.D, encoding: 'utf8', recursive: true }); } catch {} }
    }));
  },
  blobs: {
    async put(k, blob) { await Plug('Filesystem').writeFile({ path: 'blobs/' + k, data: await blobToB64(blob), directory: 'DATA', recursive: true }); lsSet('bt:' + k, blob.type || ''); },
    async get(k) { try { const r = await Plug('Filesystem').readFile({ path: 'blobs/' + k, directory: 'DATA' }); return b64ToBlob(r.data, lsGet('bt:' + k) || ''); } catch { return null; } },
    async del(k) { try { await Plug('Filesystem').deleteFile({ path: 'blobs/' + k, directory: 'DATA' }); } catch {} lsDel('bt:' + k); }
  }
};

const Platform = {
  id: NATIVE ? 'app' : 'web', native: NATIVE, aiConfigurable: true,
  aiNeed: '先在「设置 → AI 服务」里填写 API Key', aiNeedShort: '先设置 AI 服务',
  cloudLabel: '', cloudSub: '', cloudNote: '',
  async init() {
    if (!NATIVE) return;
    document.documentElement.classList.add('native', 'native-' + CAP.getPlatform());
  },
  started() {
    if (!NATIVE) return;
    const app = Plug('App');
    app?.addListener('backButton', () => {
      if (VizView.cur) return VizView.cur();
      const sh = $$('.sheet-wrap').filter(x => x.style.pointerEvents !== 'none').pop(); if (sh) return $('[data-close]', sh).click();
      if (Detail.cur) return Detail.cur();
      const b = $('#view [data-back]') || $('#view [data-close-s]') || $('#ch-back'); if (b) return b.click();
      if (Nav.tab !== 'today') return go('today', {}, { tab: true });
      (app.minimizeApp || app.exitApp).call(app);
    });
    app?.addListener('appStateChange', ({ isActive }) => { if (!isActive) { Store.flushAll(); Reminder.sync(); } else if (Nav.stack[Nav.stack.length - 1]?.view === 'today') refresh(); });
    this.onTheme(); Reminder.sync();
    Plug('SplashScreen')?.hide?.();
  },
  onTheme() { if (NATIVE) Plug('StatusBar')?.setStyle({ style: isDarkUI() ? 'DARK' : 'LIGHT' }).catch(() => {}); },
  ...(NATIVE ? { loadDocs: () => NativeFS.loadDocs(), writeDoc: (p, o) => NativeFS.writeDoc(p, o), dropDoc: p => NativeFS.dropDoc(p), saveKeys() {}, flush: () => NativeFS.flush(), blobs: NativeFS.blobs } : { ...WebDocs, blobs: IdbBlobs }),
  cloudDb: async () => null, cloudFiles: async () => null,
  async cloudBlob() { throw new Error('这个文件保存在 claude.ai 云端，请在 App 里重新导入原文件'); },
  aiConfig: AIConfig, imgConfig: ImgConfig, byoClaude: true,
  async ai() { const cfg = await AIConfig.get(); return cfg && cfg.key ? AIClient.create(cfg) : null; },
  async save(name, blob) {
    if (NATIVE) {
      try {
        const r = await Plug('Filesystem').writeFile({ path: 'share/' + name, data: await blobToB64(blob), directory: 'CACHE', recursive: true });
        await Plug('Share').share({ title: name, files: [r.uri] }); return true;
      } catch (e) { return /cancel/i.test(e?.message || '') ? false : null; }
    }
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); return true;
  },
  haptic(k) {
    const hp = Plug('Haptics'); if (!NATIVE || !hp) return webHaptic(k);
    if (k === 'ok' || k === 'bad') hp.notification({ type: k === 'ok' ? 'SUCCESS' : 'ERROR' }).catch(() => {}); else hp.impact({ style: 'LIGHT' }).catch(() => {});
  },
  notify: NATIVE && Plug('LocalNotifications') ? {
    async permission() { const n = Plug('LocalNotifications'); let p = await n.checkPermissions(); if (p.display !== 'granted') p = await n.requestPermissions(); return p.display === 'granted'; },
    async cancelAll() { const n = Plug('LocalNotifications'), p = await n.getPending(); if (p.notifications?.length) await n.cancel({ notifications: p.notifications.map(x => ({ id: x.id })) }); },
    async schedule(list) { if (list.length) await Plug('LocalNotifications').schedule({ notifications: list.map(x => ({ id: x.id, title: x.title, body: x.body, schedule: { at: x.at, allowWhileIdle: true } })) }); }
  } : null
};
