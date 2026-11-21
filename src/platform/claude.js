/* ============ 平台：claude.ai Artifact（云端数据库、文件区、Claude、下载均由 claude.ai 提供） ============ */
const APP_VERSION = '__VERSION__';
const VENDOR = {
  pdf: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  pdfWorker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
  mammoth: 'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js'
};
const capUse = (name, ms = 11000) => (window.claude && typeof claude.use === 'function')
  ? Promise.race([claude.use(name), sleep(ms).then(() => null)]).catch(() => null) : Promise.resolve(null);
const Platform = {
  id: 'claude', aiConfigurable: false, notify: null,
  aiNeed: '需要在 claude.ai 中打开本页才能使用 AI', aiNeedShort: '需要在 claude.ai 中打开',
  cloudLabel: '已同步到 claude.ai', cloudSub: '换设备打开同一链接即可继续',
  get cloudNote() { return window.claude ? '云端存储不可用，进度只保存在这台设备上。' : ''; },
  async init() {}, started() {},
  ...WebDocs,
  cloudDb: () => capUse('db'),
  cloudFiles: () => capUse('assets'),
  async cloudBlob(id) { const r = await fetch('/_blob/' + id); if (!r.ok) throw new Error('文件读取失败（' + r.status + '）'); return r.blob(); },
  blobs: IdbBlobs,
  ai: () => capUse('sample'),
  async save(name, blob) {
    const dl = await capUse('downloads', 3000); if (!dl) return null;
    try { await dl.save({ filename: name, data: blob }); return true; } catch (e) { return ['declined', 'rate_limited'].includes(e?.code) ? false : null; }
  },
  haptic: webHaptic
};
