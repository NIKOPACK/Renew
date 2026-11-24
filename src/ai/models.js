/* ============ 选择模型（参考 Claude App）：模型列表 + 思考强度 + 服务设置 ============ */
/* 常用模型带一句话说明；能拿到服务商的模型列表时，其余模型收进「更多模型」。
   思考强度只对支持 effort 的 Claude 模型生效，请求里写在 output_config.effort。 */
const MODEL_INFO = {
  claude: [
    ['claude-opus-5-5', '适用于复杂工作与日常任务'],
    ['claude-sonnet-5-5', '处理简单任务效率最高'],
    ['claude-fable-5-2', '应对最艰巨的挑战', '费用更高'],
    ['claude-haiku-5-5', '快速解答的最佳选择']
  ],
  deepseek: [['deepseek-chat', '日常对话与写作，速度快'], ['deepseek-reasoner', '先思考再回答，适合推理和难题']],
  qwen: [['qwen-max', '能力最强'], ['qwen-plus', '效果与速度均衡'], ['qwen-turbo', '速度最快、费用最低'], ['qwen-vl-max', '能看图、读照片']],
  kimi: [['moonshot-v1-8k', '短对话，费用最低'], ['moonshot-v1-32k', '适合大多数对话'], ['moonshot-v1-128k', '能读很长的资料']],
  glm: [['glm-4-flash', '免费，速度快'], ['glm-4-air', '性价比高'], ['glm-4-plus', '能力更强'], ['glm-4v-plus', '能看图、读照片']],
  openai: [], custom: []
};
const EFFORTS = [['low', '低', '回答最快'], ['medium', '中', '速度与质量均衡'], ['high', '高', '想得更仔细'], ['xhigh', '超高', '适合复杂推理和长任务'], ['max', '最高', '不计时间和用量']];
const EFFORT_RE = /^claude-(opus-5|sonnet-5|fable-5|mythos-5|haiku-5|opus-4-[78])/;
const effortDefault = m => /^claude-(opus-5-5|haiku-5-5)/.test(m) ? 'medium' : 'high';
const effortOf = cfg => cfg?.kind === 'anthropic' && EFFORT_RE.test(cfg.model || '') ? (cfg.effort || effortDefault(cfg.model)) : '';
const effortName = e => (EFFORTS.find(x => x[0] === e) || [])[1] || '';
/* 能看图的模型（换模型时自动打开「识别图片」） */
const visionGuess = (cfg, m) => cfg.kind === 'anthropic' || /vl|vision|4o|gpt-4\.1|gpt-5|glm-4v|-v\d/i.test(m) ? true : MODEL_INFO[cfg.provider]?.some(([id]) => id === m) ? false : cfg.vision;
const MODEL_LISTS = new Map();

/* 输入框里的模型按钮：模型名 + 思考强度 */
function modelChipHTML() {
  const cfg = AI.fn?.cfg, eff = effortOf(cfg);
  return `<span>${esc(modelLabel())}</span>${eff ? `<em>${effortName(eff)}</em>` : ''}${ico('down')}`;
}
const refreshModelChips = () => $$('.cmod').forEach(b => b.innerHTML = modelChipHTML());

async function modelSheet() {
  const cfg = await Platform.aiConfig.get(), builtin = usesBuiltin(cfg);
  if (!builtin && !cfg?.key) return aiConfigSheet();
  const body = h(`<div class="msel"><div class="group mlist" id="ms-l"></div><div id="ms-more"></div>
    <div class="group" id="ms-opt" style="margin-top:14px"></div></div>`);
  const s = sheet('选择模型', body);
  let fetched = MODEL_LISTS.get(cfg?.provider) || null, open = false;
  const row = (id, desc, badge, cur) => `<button class="rowi mrow" data-m="${esc(id)}"><span class="grow"><div class="t">${esc(prettyModel(id))}${badge ? `<span class="mbadge">${esc(badge)}</span>` : ''}</div>${desc ? `<div class="m">${esc(desc)}</div>` : ''}</span>${cur ? ico('check', 'mck') : ''}</button>`;
  const draw = () => {
    if (builtin) {
      $('#ms-l', body).innerHTML = `<div class="rowi mrow"><span class="grow"><div class="t">Claude</div><div class="m">由 claude.ai 提供，不需要 API Key</div></span>${ico('check', 'mck')}</div>`;
    } else {
      const info = MODEL_INFO[cfg.provider] || [];
      const main = info.slice(); // 常用模型总是列出；服务商返回的其余模型放进「更多模型」
      if (cfg.model && !main.some(([id]) => id === cfg.model)) main.unshift([cfg.model, '']);
      $('#ms-l', body).innerHTML = main.map(([id, d, b]) => row(id, d, b, id === cfg.model)).join('');
      const rest = (fetched || []).filter(id => !main.some(([x]) => x === id));
      $('#ms-more', body).innerHTML = rest.length ? `<button class="mmore" id="ms-tg">${open ? '收起' : `更多模型 · ${rest.length}`}${ico('down', open ? 'up' : '')}</button>${open ? `<div class="group mlist">${rest.map(id => row(id, '', '', false)).join('')}</div>` : ''}` : fetched === null ? '<div class="small mload"><span class="spin"></span></div>' : '';
      $('#ms-tg', body)?.addEventListener('click', () => { open = !open; draw(); });
    }
    const eff = effortOf(AI.fn?.cfg), ip = IMG_CFG && IMG_PRESETS[IMG_CFG.provider];
    $('#ms-opt', body).innerHTML = (eff ? `<button class="rowi" id="ms-eff"><span class="grow t">思考强度</span><span class="r">${effortName(eff)}</span>${ico('chev', 'chev')}</button>` : '')
      + `<button class="rowi" id="ms-svc"><span class="grow t">AI 服务</span><span class="r">${esc(builtin ? 'claude.ai 内置' : AI_PRESETS[cfg.provider]?.label || cfg.provider)}</span>${ico('chev', 'chev')}</button>`
      + `<button class="rowi" id="ms-img"><span class="grow t">图片模型</span><span class="r">${esc(ImageClient.ok(IMG_CFG) ? ip?.label || IMG_CFG.provider : '未设置')}</span>${ico('chev', 'chev')}</button>`;
    $('#ms-eff', body)?.addEventListener('click', () => effortSheet(cfg, draw));
    $('#ms-svc', body).onclick = () => { s.close(); aiConfigSheet(); };
    $('#ms-img', body).onclick = () => { s.close(); imgConfigSheet(); };
  };
  body.addEventListener('click', async e => {
    const b = e.target.closest('[data-m]'); if (!b || builtin) return;
    const m = b.dataset.m; if (m === cfg.model) return s.close();
    const c = { ...cfg, model: m, vision: visionGuess(cfg, m) }; if (c.effort && !EFFORT_RE.test(m)) delete c.effort;
    await Platform.aiConfig.set(c); AI_CFG = c; await AI.reload(); Motion.haptic(); refreshModelChips(); s.close();
  });
  draw();
  if (!builtin && fetched === null) {
    try { fetched = await AIClient.models(cfg); } catch { fetched = []; }
    MODEL_LISTS.set(cfg.provider, fetched); if (body.isConnected) draw();
  }
  IMG_CFG ||= await Platform.imgConfig.get(); if (body.isConnected) draw();
}
function effortSheet(cfg, done) {
  const cur = effortOf(cfg), def = effortDefault(cfg.model);
  const body = h(`<div class="group mlist">${EFFORTS.map(([k, l, d]) => `<button class="rowi mrow" data-e="${k}"><span class="grow"><div class="t">${l}${k === def ? '<span class="mbadge">默认</span>' : ''}</div><div class="m">${d}</div></span>${k === cur ? ico('check', 'mck') : ''}</button>`).join('')}</div>`);
  const s = sheet('思考强度', body);
  body.onclick = async e => {
    const b = e.target.closest('[data-e]'); if (!b) return;
    cfg.effort = b.dataset.e; await Platform.aiConfig.set(cfg); AI_CFG = cfg; await AI.reload(); Motion.haptic(); refreshModelChips(); s.close(); done();
  };
}
