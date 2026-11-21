/* ============ 平台公共部分（网页存储、震动） ============ */
/* 各平台文件定义同一个 Platform 对象，核心代码只通过它访问存储、文件、AI、保存、震动和通知：
   init() / started()                      启动前后的钩子
   loadDocs() / writeDoc / dropDoc / saveKeys / flush   学习数据（文档）的本机持久化
   cloudDb() / cloudFiles() / cloudBlob(id)  可选的云端数据库与文件（只有 claude.ai 有）
   blobs.put/get/del                         本机文件（资料原件、页面文本）
   ai()                                      返回 AI 调用函数（与 claude.ai sample 接口一致），不可用时为 null
   save(name, blob)                          保存/分享文件：true 已保存，false 用户取消，null 不支持
   haptic(kind) / notify / onTheme()         震动、本地通知、状态栏配色
   aiConfig / imgConfig                      对话模型、图片模型的配置（API Key 只存在本机） */
const CAP = window.Capacitor, NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
const Plug = name => (CAP && CAP.Plugins && CAP.Plugins[name]) || null;
const b64ToBlob = (b64, type = '') => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type }); };
const blobToB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
/* ---- 模型配置：App 存在原生 Preferences，网页存在 localStorage（不进学习数据、不进备份、不上云） ---- */
const LocalConf = (pref, ls) => ({
  async get() {
    try { if (NATIVE) { const r = await Plug('Preferences').get({ key: pref }); return r.value ? JSON.parse(r.value) : null; } } catch {}
    return lsGet(ls);
  },
  async set(cfg) {
    if (NATIVE) { try { await Plug('Preferences').set({ key: pref, value: JSON.stringify(cfg) }); return; } catch {} }
    lsSet(ls, cfg);
  }
});
const AIConfig = LocalConf('ai', 'aicfg'), ImgConfig = LocalConf('aiimg', 'imgcfg');
const WebDocs = {
  async loadDocs() { const out = {}; for (const k of (lsGet('keys') || [])) { const v = lsGet('d:' + k); if (v) out[k] = v; } return out; },
  writeDoc(p, o) { lsSet('d:' + p, o); },
  dropDoc(p) { lsDel('d:' + p); },
  saveKeys(keys) { lsSet('keys', keys); }
};
const IdbBlobs = { put: (k, b) => IDB.put(k, b), get: k => IDB.get(k), del: k => IDB.del(k) };
const webHaptic = k => { if (navigator.vibrate) navigator.vibrate(k === 'bad' ? [16, 60, 16] : k === 'ok' ? 14 : 8); };
const isDarkUI = () => { const s = document.documentElement.dataset.skin; return s ? s === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
