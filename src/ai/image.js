/* ============ 图片模型：用户自带 API Key，直连生成图片（笔记配图等） ============ */
/* 接口：ImageClient.generate(cfg, prompt, { signal, size }) -> { blob?, url? }
   支持 OpenAI 兼容的 POST {base}/images/generations（OpenAI、智谱 CogView、各类转发服务），
   以及硅基流动（参数名 image_size，返回 images[0].url）。返回 b64_json 或图片链接两种形式都能处理。 */
const IMG_PRESETS = {
  openai: { label: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-image-1', size: '1024x1024', site: 'platform.openai.com' },
  glm: { label: '智谱 CogView', base: 'https://open.bigmodel.cn/api/paas/v4', model: 'cogview-4', size: '1024x1024', site: 'open.bigmodel.cn' },
  silicon: { label: '硅基流动', base: 'https://api.siliconflow.cn/v1', model: 'Kwai-Kolors/Kolors', size: '1024x1024', sizeKey: 'image_size', site: 'cloud.siliconflow.cn' },
  custom: { label: 'OpenAI 兼容', base: '', model: '', size: '1024x1024', site: '' }
};
const IMG_SIZES = [['1024x1024', '方图'], ['1536x1024', '横图'], ['1024x1536', '竖图']];
const IMG_MODEL_RE = /image|dall|cogview|kolors|flux|stable|sdxl|\bsd\d|wan|seedream|imagen|midjourney|mj|recraft|ideogram|hunyuan|kling|qwen-image/i;

async function imgPost(cfg, body, signal) {
  const url = oaUrl(cfg, '/images/generations'), headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key };
  try {
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
    let j = null; try { j = await r.json(); } catch {}
    if (!r.ok) throw httpErr(r.status, j);
    return j;
  } catch (e) {
    if (signal?.aborted) throw AIErr('cancelled');
    if (e?.code) throw e;
    const http = Plug('CapacitorHttp'); // 浏览器跨域被拦时，App 里改走原生网络
    if (!http) throw AIErr('network', { detail: e?.message });
    const r = await http.request({ url, method: 'POST', headers, data: body, connectTimeout: 30000, readTimeout: 300000 }).catch(err => { throw AIErr('network', { detail: err?.message }); });
    if (r.status >= 400) throw httpErr(r.status, r.data);
    return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  }
}
/* 图片链接转成文件；跨域下载不了时只返回链接（服务商的临时链接通常几小时后失效） */
async function imgFetch(url) {
  try { const r = await fetch(url); if (r.ok) { const b = await r.blob(); if (b.size && /^image\//.test(b.type || 'image/')) return b; } } catch {}
  const http = Plug('CapacitorHttp');
  if (http) { try { const r = await http.request({ url, method: 'GET', responseType: 'blob' }); if (r.status < 400 && r.data) return b64ToBlob(r.data, r.headers?.['Content-Type'] || r.headers?.['content-type'] || 'image/png'); } catch {} }
  return null;
}
const ImageClient = {
  ok: cfg => !!(cfg && cfg.key && cfg.base && cfg.model),
  async generate(cfg, prompt, opts = {}) {
    if (!cfg?.key) throw AIErr('no_key'); if (!cfg.model) throw AIErr('no_model');
    const p = IMG_PRESETS[cfg.provider] || IMG_PRESETS.custom, size = opts.size || cfg.size || p.size;
    const body = { model: cfg.model, prompt, n: 1, [p.sizeKey || 'size']: size };
    if (p.sizeKey) body.batch_size = 1;
    if (/dall-e/i.test(cfg.model)) body.response_format = 'b64_json';
    const j = await imgPost(cfg, body, opts.signal), d = j?.data?.[0] || j?.images?.[0];
    if (d?.b64_json) return { blob: b64ToBlob(d.b64_json, 'image/png') };
    if (d?.url) { const blob = await imgFetch(d.url); return blob ? { blob } : { url: d.url }; }
    throw AIErr('bad_request', { detail: '服务没有返回图片' + (j?.error?.message ? '：' + j.error.message : '') });
  },
  async models(cfg) { const all = await openaiModels(cfg), m = all.filter(x => IMG_MODEL_RE.test(x)); return m.length ? m : all; }
};
