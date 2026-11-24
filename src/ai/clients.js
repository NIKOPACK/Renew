/* ============ AI 客户端：用户自带 API Key，直连模型服务 ============ */
/* 对外接口与 claude.ai 的 sample 能力一致，核心代码无需区分：
   fn(input, { signal, onText, tools, images })  -> { text }
   fn.json(input, opts)                          -> 解析后的 JSON
   fn.limits()                                   -> { tools, images }
   input 可以是字符串，或 [{ role, content }] 消息数组；tools 为 [{ name, description, inputSchema, execute(args, { signal }) }]。
   错误统一抛出 { code, detail?, text? }，code 见 AI.err。 */
const AI_PRESETS = {
  deepseek: { label: 'DeepSeek', region: 'cn', kind: 'openai', base: 'https://api.deepseek.com', model: 'deepseek-chat', vision: false, site: 'platform.deepseek.com' },
  qwen: { label: '通义千问', region: 'cn', kind: 'openai', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', vision: false, site: 'bailian.console.aliyun.com' },
  kimi: { label: 'Kimi', region: 'cn', kind: 'openai', base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-32k', vision: false, site: 'platform.moonshot.cn' },
  glm: { label: '智谱 GLM', region: 'cn', kind: 'openai', base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', vision: false, site: 'open.bigmodel.cn' },
  claude: { label: 'Claude', region: 'global', kind: 'anthropic', base: '', model: 'claude-opus-5-5', vision: true, site: 'platform.claude.com' },
  openai: { label: 'OpenAI', region: 'global', kind: 'openai', base: 'https://api.openai.com/v1', model: '', vision: true, site: 'platform.openai.com' },
  custom: { label: '自定义', region: '', kind: 'openai', base: '', model: '', vision: false, site: '' }
};
/* 这些 Claude 模型支持服务端拒答兜底（refusal 时自动换模型重试） */
const CLAUDE_FALLBACK = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-1', 'claude-fable-5-2']);
const AIErr = (code, extra = {}) => Object.assign(new Error(code), { code }, extra);
const imgPart = async blob => ({ type: blob.type || 'image/jpeg', data: await blobToB64(blob) });
function normInput(input) {
  const msgs = typeof input === 'string' ? [{ role: 'user', content: input }] : input.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content ?? '') }));
  // 两种接口都要求 user/assistant 交替：合并相邻的同角色消息
  const out = []; for (const m of msgs) { const last = out[out.length - 1]; if (last && last.role === m.role) last.content += '\n\n' + m.content; else out.push({ ...m }); }
  if (out[0]?.role !== 'user') out.unshift({ role: 'user', content: '（继续）' });
  return out;
}
/* 简单校验工具参数（必填字段与基本类型），防止截断或格式错误的输入被执行 */
function badArgs(schema, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return '参数不是对象';
  for (const k of schema?.required || []) if (input[k] === undefined) return '缺少参数 ' + k;
  for (const [k, sp] of Object.entries(schema?.properties || {})) {
    const v = input[k]; if (v === undefined || !sp.type) continue;
    const ok = { string: typeof v === 'string', number: typeof v === 'number', integer: Number.isInteger(v), boolean: typeof v === 'boolean', array: Array.isArray(v), object: typeof v === 'object' && !Array.isArray(v) }[sp.type];
    if (ok === false) return `参数 ${k} 应为 ${sp.type}`;
  }
  return '';
}
async function runTool(tools, name, args, signal) {
  const t = tools.find(x => x.name === name); if (!t) return { err: true, out: '没有这个工具：' + name };
  const bad = badArgs(t.inputSchema, args); if (bad) return { err: true, out: JSON.stringify({ INVALID_JSON: bad }) };
  try { const r = await t.execute(args, { signal }); return { err: false, out: typeof r === 'string' ? r : JSON.stringify(r ?? '') }; }
  catch (e) { return { err: true, out: String(e?.message || e) }; }
}
function parseJSONText(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const i = t.search(/[[{]/); if (i < 0) throw AIErr('invalid_json'); t = t.slice(i);
  // 从末尾逐个尝试右括号，去掉模型在 JSON 后面多写的文字
  for (let end = t.length; end > 0;) {
    try { return JSON.parse(t.slice(0, end)); } catch {}
    const n = Math.max(t.lastIndexOf('}', end - 2), t.lastIndexOf(']', end - 2)); if (n < 0) break; end = n + 1;
  }
  throw AIErr('invalid_json');
}
const JSON_HINT = '\n\n只输出一个 JSON，不要任何解释文字，不要用代码块包裹。';

/* ---------------- Claude：Anthropic 官方 SDK（浏览器版，按需加载） ---------------- */
async function anthropicClient(cfg) {
  if (!window.Anthropic) await loadScript(VENDOR.anthropic);
  // 用户自己的 Key 只保存在本机并直接发往 Anthropic，所以允许在客户端使用
  return new Anthropic({ apiKey: cfg.key, dangerouslyAllowBrowser: true, ...(cfg.base ? { baseURL: cfg.base } : {}), maxRetries: 2 });
}
function anthropicErr(e, text) {
  const A = window.Anthropic;
  if (!A) return AIErr('network');
  if (e instanceof A.APIUserAbortError) return AIErr('cancelled', { text });
  if (e instanceof A.APIConnectionError) return AIErr('network', { text });
  if (e instanceof A.AuthenticationError || e instanceof A.PermissionDeniedError) return AIErr('auth', { text });
  if (e instanceof A.RateLimitError) return AIErr('rate_limited', { text });
  if (e instanceof A.BadRequestError) return AIErr('bad_request', { detail: e.message, text });
  if (e instanceof A.APIError) return AIErr(e.status === 402 ? 'quota' : e.status >= 500 ? 'overloaded' : 'bad_request', { detail: e.message, text });
  return null;
}
async function anthropicRun(cfg, input, opts = {}) {
  const client = await anthropicClient(cfg), signal = opts.signal;
  const msgs = normInput(input).map(m => ({ role: m.role, content: [{ type: 'text', text: m.content }] }));
  if (opts.images?.length) { const last = msgs.filter(m => m.role === 'user').pop(); const imgs = await Promise.all(opts.images.map(imgPart)); last.content.unshift(...imgs.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.type, data: i.data } }))); }
  const tools = opts.tools || [], defs = tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema, eager_input_streaming: true }));
  let text = '', parseRetries = 0;
  for (let turn = 0; turn < 16; turn++) {
    // 思考强度（effort）：只发给支持它的 Claude 模型
    const params = { model: cfg.model, max_tokens: 64000, messages: msgs, ...(defs.length ? { tools: defs } : {}), ...(cfg.effort && /^claude-(opus-5|sonnet-5|fable-5|mythos-5|haiku-5|opus-4-[78])/.test(cfg.model) ? { output_config: { effort: cfg.effort } } : {}) };
    const stream = CLAUDE_FALLBACK.has(cfg.model)
      ? client.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, { signal })
      : client.messages.stream(params, { signal });
    if (text && !/\n$/.test(text)) text += '\n\n';
    const before = text;
    stream.on('text', d => { text += d; opts.onText?.({ text, delta: d }); });
    let msg;
    try { msg = await stream.finalMessage(); parseRetries = 0; }
    catch (e) {
      const m = anthropicErr(e, text); if (m) throw m;
      if (signal?.aborted) throw AIErr('cancelled', { text });
      if (parseRetries++ < 2) { text = before; continue; } // 工具参数无法解析：重发本轮
      throw AIErr('network', { text });
    }
    if (msg.stop_reason === 'refusal') throw AIErr('refusal', { text });
    if (msg.stop_reason === 'pause_turn') { msgs.push({ role: 'assistant', content: msg.content }); continue; }
    const uses = msg.content.filter(b => b.type === 'tool_use');
    if (!uses.length) break;
    if (msg.stop_reason === 'max_tokens') throw AIErr('truncated', { text });
    msgs.push({ role: 'assistant', content: msg.content });
    const results = [];
    for (const u of uses) { const r = await runTool(tools, u.name, u.input, signal); results.push({ type: 'tool_result', tool_use_id: u.id, content: r.out, ...(r.err ? { is_error: true } : {}) }); }
    msgs.push({ role: 'user', content: results });
  }
  return { text };
}
async function anthropicModels(cfg) {
  const client = await anthropicClient(cfg), ids = [];
  try { for await (const m of client.models.list()) ids.push(m.id); } catch (e) { throw anthropicErr(e) || AIErr('network'); }
  return ids;
}

/* ---------------- OpenAI 兼容接口：DeepSeek、通义千问、Kimi、智谱、OpenAI 等 ---------------- */
const oaUrl = (cfg, path) => String(cfg.base || '').replace(/\/+$/, '') + path;
function httpErr(status, body) {
  const detail = body?.error?.message || body?.message || (typeof body === 'string' ? body.slice(0, 200) : '');
  if (status === 401 || status === 403) return AIErr('auth', { detail });
  if (status === 402 || /insufficient|balance|余额|quota|arrear/i.test(detail)) return AIErr('quota', { detail });
  if (status === 429) return AIErr('rate_limited', { detail });
  if (status === 404 && /model/i.test(detail)) return AIErr('bad_request', { detail: '模型不存在：' + detail });
  if (status >= 500) return AIErr('overloaded', { detail });
  return AIErr('bad_request', { detail: detail || 'HTTP ' + status });
}
/* 一轮请求：优先浏览器 fetch 流式读取；若被跨域限制挡住且在 App 中，改用原生 HTTP（非流式） */
async function oaTurn(cfg, body, signal, onDelta) {
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key };
  let res;
  try { res = await fetch(oaUrl(cfg, '/chat/completions'), { method: 'POST', headers, body: JSON.stringify({ ...body, stream: true }), signal }); }
  catch (e) {
    if (signal?.aborted) throw AIErr('cancelled');
    const http = Plug('CapacitorHttp');
    if (!http) throw AIErr('network', { detail: e?.message });
    const r = await http.request({ url: oaUrl(cfg, '/chat/completions'), method: 'POST', headers, data: { ...body, stream: false }, connectTimeout: 30000, readTimeout: 300000 }).catch(err => { throw AIErr('network', { detail: err?.message }); });
    if (r.status >= 400) throw httpErr(r.status, r.data);
    const m = r.data?.choices?.[0]?.message || {};
    if (m.content) onDelta(m.content);
    return { calls: (m.tool_calls || []).map(c => ({ id: c.id, name: c.function?.name, args: c.function?.arguments || '{}' })) };
  }
  if (!res.ok) { let b = null; try { b = await res.json(); } catch {} throw httpErr(res.status, b); }
  if (!res.body || !/event-stream/.test(res.headers.get('content-type') || '')) {
    const j = await res.json(), m = j?.choices?.[0]?.message || {}; if (m.content) onDelta(m.content);
    return { calls: (m.tool_calls || []).map(c => ({ id: c.id, name: c.function?.name, args: c.function?.arguments || '{}' })) };
  }
  const reader = res.body.getReader(), dec = new TextDecoder(), calls = [];
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue; const data = line.slice(5).trim(); if (data === '[DONE]') continue;
        let j; try { j = JSON.parse(data); } catch { continue; }
        if (j.error) throw httpErr(400, j);
        const d = j.choices?.[0]?.delta || {};
        if (d.content) onDelta(d.content);
        for (const tc of d.tool_calls || []) {
          const k = tc.index ?? calls.length, c = calls[k] ||= { id: '', name: '', args: '' };
          if (tc.id) c.id = tc.id; if (tc.function?.name) c.name += tc.function.name; if (tc.function?.arguments) c.args += tc.function.arguments;
        }
      }
    }
  } catch (e) { if (signal?.aborted) throw AIErr('cancelled'); if (e?.code) throw e; throw AIErr('network', { detail: e?.message }); }
  return { calls: calls.filter(Boolean) };
}
async function openaiRun(cfg, input, opts = {}) {
  if (!cfg.model) throw AIErr('no_model');
  const signal = opts.signal, tools = opts.tools || [];
  const msgs = normInput(input).map(m => ({ role: m.role, content: m.content }));
  if (opts.images?.length) {
    const last = msgs.filter(m => m.role === 'user').pop(), imgs = await Promise.all(opts.images.map(imgPart));
    last.content = [...imgs.map(i => ({ type: 'image_url', image_url: { url: `data:${i.type};base64,${i.data}` } })), { type: 'text', text: last.content }];
  }
  const defs = tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
  let text = '';
  for (let turn = 0; turn < 16; turn++) {
    if (text && !/\n$/.test(text)) text += '\n\n';
    let turnText = '';
    let r;
    try { r = await oaTurn(cfg, { model: cfg.model, messages: msgs, ...(defs.length ? { tools: defs } : {}) }, signal, d => { turnText += d; text += d; opts.onText?.({ text, delta: d }); }); }
    catch (e) { if (e?.code) { e.text = text; throw e; } throw AIErr('network', { text }); }
    if (!r.calls.length) break;
    msgs.push({ role: 'assistant', content: turnText || null, tool_calls: r.calls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args } })) });
    for (const c of r.calls) {
      let args; try { args = JSON.parse(c.args || '{}'); } catch { args = null; }
      const out = args ? await runTool(tools, c.name, args, signal) : { out: JSON.stringify({ INVALID_JSON: c.args }) };
      msgs.push({ role: 'tool', tool_call_id: c.id, content: out.out });
    }
  }
  return { text };
}
async function openaiModels(cfg) {
  const headers = { Authorization: 'Bearer ' + cfg.key };
  let data;
  try { const r = await fetch(oaUrl(cfg, '/models'), { headers }); if (!r.ok) { let b = null; try { b = await r.json(); } catch {} throw httpErr(r.status, b); } data = await r.json(); }
  catch (e) {
    if (e?.code) throw e; const http = Plug('CapacitorHttp'); if (!http) throw AIErr('network', { detail: e?.message });
    const r = await http.request({ url: oaUrl(cfg, '/models'), method: 'GET', headers }); if (r.status >= 400) throw httpErr(r.status, r.data); data = r.data;
  }
  return (data?.data || []).map(m => m.id).filter(Boolean).sort();
}

const AIClient = {
  create(cfg) {
    const run = cfg.kind === 'anthropic' ? (i, o) => anthropicRun(cfg, i, o) : (i, o) => openaiRun(cfg, i, o);
    const fn = async (input, opts = {}) => { if (opts.signal?.aborted) throw AIErr('cancelled'); return run(input, opts); };
    fn.json = async (input, opts = {}) => {
      const withHint = typeof input === 'string' ? input + JSON_HINT : input.map((m, i) => i === input.length - 1 ? { ...m, content: m.content + JSON_HINT } : m);
      const { text } = await fn(withHint, { ...opts, tools: undefined }); return parseJSONText(text);
    };
    fn.limits = async () => ({ tools: { maxCount: 32 }, images: cfg.vision ? { maxCount: 8, mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] } : null });
    fn.cfg = cfg;
    return fn;
  },
  models: cfg => cfg.kind === 'anthropic' ? anthropicModels(cfg) : openaiModels(cfg),
  async test(cfg) { const { text } = await this.create(cfg)('只回复两个字：你好', {}); return text.trim(); }
};
