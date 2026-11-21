/* ============ 文件存储：可选云端（Platform.cloudFiles），否则存本机（Platform.blobs） ============ */
const IDB = { // 网页环境的本机文件库（App 环境改用 Platform 提供的文件系统）
  db: null,
  open() { return this.db ||= new Promise((res, rej) => { try { const r = indexedDB.open('xueliu', 1) /* 早期版本的库名，保留以兼容已有数据 */; r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }); },
  async tx(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('f', mode), req = fn(t.objectStore('f')); t.oncomplete = () => res(req?.result); t.onerror = () => rej(t.error); }); },
  put(k, v) { return this.tx('readwrite', s => s.put(v, k)); }, get(k) { return this.tx('readonly', s => s.get(k)); }, del(k) { return this.tx('readwrite', s => s.delete(k)); }
};
const Files = {
  assets: null, mem: new Map(),
  async init() { try { this.assets = await Platform.cloudFiles(); } catch { this.assets = null; } },
  async put(blob, type) {
    await this.ready;
    if (this.assets) {
      try { const r = await this.assets.upload(blob, type ? { type } : undefined); return { a: r.id, size: r.sizeBytes }; }
      catch (e) { if (e?.code === 'quota_or_state') toast('云端文件空间已满，改存到本机'); }
    }
    const k = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try { await Platform.blobs.put(k, blob); return { l: k, size: blob.size }; } catch { this.mem.set(k, blob); return { m: k, size: blob.size }; }
  },
  async get(ref) {
    if (!ref) return null;
    if (ref.a) return Platform.cloudBlob(ref.a);
    if (ref.l) return (await Platform.blobs.get(ref.l)) || null;
    return this.mem.get(ref.m) || null;
  },
  async del(ref) { try { if (ref?.a) await this.assets?.delete(ref.a); else if (ref?.l) await Platform.blobs.del(ref.l); } catch {} },
  where: ref => ref?.a ? '云端' : ref?.l ? '本机' : ref?.m ? '本次打开' : '—',
  async save(name, data, type = 'text/plain') {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    let r = null; try { r = await Platform.save(name, blob); } catch { r = null; }
    if (r === true || r === false) return r;
    const url = URL.createObjectURL(blob), body = h(`<div style="display:flex;flex-direction:column;gap:12px"><p class="small" style="margin:0">当前环境不能直接保存文件。可以点下载（在普通浏览器中有效），或复制内容后自己保存。</p><a class="btn pri" href="${url}" download="${esc(name)}">${ico('download')}下载 ${esc(name)}</a>${typeof data === 'string' ? `<button class="btn" id="fs-copy">${ico('file')}复制全部内容</button>` : ''}</div>`);
    sheet('保存文件', body); $('#fs-copy', body)?.addEventListener('click', () => copyText(data, '已复制')); return false;
  }
};
const fmtSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
