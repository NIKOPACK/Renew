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
  id: 'claude', aiConfigurable: true, notify: null, byoClaude: false, builtinAI: 'claude.ai 内置 Claude',
  aiNeed: '在 claude.ai 中打开本页，或在「设置 → AI 服务」里填写自己的 API Key', aiNeedShort: '需要设置 AI 服务',
  cloudLabel: '已同步到 claude.ai', cloudSub: '换设备打开同一链接即可继续',
  get cloudNote() { return window.claude ? '云端存储不可用，进度只保存在这台设备上。' : ''; },
  async init() {}, started() {},
  ...WebDocs,
  cloudDb: () => capUse('db'),
  cloudFiles: () => capUse('assets'),
  async cloudBlob(id) { const r = await fetch('/_blob/' + id); if (!r.ok) throw new Error('文件读取失败（' + r.status + '）'); return r.blob(); },
  blobs: IdbBlobs,
  aiConfig: AIConfig, imgConfig: ImgConfig,
  /* 默认用 claude.ai 内置的 Claude；用户填了自己的 Key 就直连该服务（受浏览器安全策略限制，部分服务可能连不上） */
  async ai() { const cfg = await AIConfig.get(); return cfg?.key && cfg.provider !== 'builtin' ? AIClient.create(cfg) : capUse('sample'); },
  async save(name, blob) {
    const dl = await capUse('downloads', 3000); if (!dl) return null;
    try { await dl.save({ filename: name, data: blob }); return true; } catch (e) { return ['declined', 'rate_limited'].includes(e?.code) ? false : null; }
  },
  haptic: webHaptic
};
