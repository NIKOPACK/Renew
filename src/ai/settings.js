/* ============ 设置 → AI 服务（独立 App / 网页版：用户自带 API Key） ============ */
let AI_CFG = null, IMG_CFG = null; // 当前配置的内存副本，供设置页同步显示
const usesBuiltin = c => Platform.builtinAI && !(c?.key && c.provider !== 'builtin');
function aiSettingsGroup() {
  const c = AI_CFG, pr = c && AI_PRESETS[c.provider], ic = IMG_CFG, ip = ic && IMG_PRESETS[ic.provider], builtin = usesBuiltin(c);
  return `<div class="gh"><b>AI 服务</b></div><div class="group icons">
    <button class="rowi" id="s-ai"><span class="tico" style="--c:${AI.ok ? 'var(--accent)' : 'var(--warn)'}">${tileIco('spark')}</span><span class="grow"><div class="t">对话模型</div><div class="m">${builtin ? esc(Platform.builtinAI) : c?.key ? esc((pr?.label || c.provider) + ' · ' + (c.model || '未选择模型')) : '未设置'}</div></span>${ico('chev', 'chev')}</button>
    <button class="rowi" id="s-img"><span class="tico" style="--c:${ImageClient.ok(ic) ? '#ff2d55' : 'var(--ink-3)'}">${tileIco('image')}</span><span class="grow"><div class="t">图片模型</div><div class="m">${ImageClient.ok(ic) ? esc((ip?.label || ic.provider) + ' · ' + ic.model) : '未设置'}</div></span>${ico('chev', 'chev')}</button>
  </div>`;
}
function bindAiSettingsGroup(v) { $('#s-ai', v)?.addEventListener('click', () => aiConfigSheet()); $('#s-img', v)?.addEventListener('click', () => imgConfigSheet()); }
async function aiConfigSheet() {
  const saved = AI_CFG || await Platform.aiConfig.get() || {};
  const st = { provider: saved.provider || (Platform.builtinAI ? 'builtin' : 'deepseek'), key: saved.key || '', model: saved.model || '', base: saved.base || '', vision: saved.vision, models: [] };
  const preset = () => AI_PRESETS[st.provider];
  const groups = [Platform.builtinAI && ['默认', ['builtin']], ['国内', ['deepseek', 'qwen', 'kimi', 'glm']], ['海外', Platform.byoClaude ? ['claude', 'openai'] : ['openai']], ['其他', ['custom']]].filter(Boolean);
  const label = id => id === 'builtin' ? 'claude.ai 内置' : AI_PRESETS[id].label;
  const body = h(`<div style="display:flex;flex-direction:column;gap:14px">
    <div class="chips aip wrapc">${groups.flatMap(([, ids]) => ids).map(id => `<button class="chip" data-p="${id}" aria-pressed="${st.provider === id}">${id === 'builtin' ? ico('spark') : ''}${label(id)}</button>`).join('')}</div>
    <div id="ai-f" style="display:flex;flex-direction:column;gap:12px"></div>
    <div id="ai-msg" class="small" style="min-height:1.2em"></div>
    <div class="acts"><button class="btn" id="ai-test">${ico('sync')}测试</button><button class="btn pri" id="ai-save">${ico('check')}保存</button></div>
    <p class="lockn">${ico('lock')}仅存本机</p>
  </div>`);
  const s = sheet('AI 服务', body), msg = t => $('#ai-msg', body).innerHTML = t;
  const draw = () => {
    $('#ai-test', body).hidden = st.provider === 'builtin';
    if (st.provider === 'builtin') { $('#ai-f', body).innerHTML = `<div class="card" style="padding:14px 16px;display:flex;gap:12px;align-items:center"><span class="tico" style="--c:var(--accent)">${tileIco('spark')}</span><div class="grow"><div class="t" style="font-weight:600">${esc(Platform.builtinAI)}</div><div class="m small" style="margin:2px 0 0">由 claude.ai 提供，不需要 API Key</div></div></div>`; return; }
    const p = preset(), custom = st.provider === 'custom';
    if (!st.model && p.model) st.model = p.model;
    if (st.vision === undefined) st.vision = p.vision;
    $('#ai-f', body).innerHTML = `
      <label class="field"><span>API Key${p.site ? `<small style="font-weight:400;color:var(--ink-2)"> · 在 ${p.site} 获取</small>` : ''}</span><input class="inp" id="ai-key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${p.kind === 'anthropic' ? 'sk-ant-…' : 'sk-…'}" value="${esc(st.key)}"></label>
      ${custom || st.provider === 'openai' || st.base ? `<label class="field"><span>接口地址</span><input class="inp" id="ai-base" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="https://…/v1" value="${esc(st.base || p.base)}"></label>` : ''}
      <label class="field"><span>模型</span><div class="row"><input class="inp grow" id="ai-model" list="ai-ml" autocapitalize="off" spellcheck="false" placeholder="模型名称" value="${esc(st.model)}"><button class="btn sm soft" id="ai-list">获取列表</button></div><datalist id="ai-ml">${st.models.map(m => `<option value="${esc(m)}">`).join('')}</datalist></label>
      <div class="rowi" style="padding:0"><span class="tico" style="--c:#0aa650">${tileIco('camera')}</span><span class="grow"><div class="t">识别图片</div></span><button class="toggle" role="switch" id="ai-vis" aria-checked="${!!st.vision}" aria-label="模型能识别图片"></button></div>`;
    $('#ai-key', body).oninput = e => st.key = e.target.value.trim();
    $('#ai-base', body)?.addEventListener('input', e => st.base = e.target.value.trim());
    $('#ai-model', body).oninput = e => st.model = e.target.value.trim();
    $('#ai-vis', body).onclick = e => { st.vision = !st.vision; e.currentTarget.setAttribute('aria-checked', st.vision); };
    $('#ai-list', body).onclick = async () => {
      if (!st.key) return msg('先填写 API Key');
      msg('<span class="spin"></span> 正在获取模型列表…');
      try { st.models = await AIClient.models(cfgOf()); msg(st.models.length ? `找到 ${st.models.length} 个模型，点模型输入框选择` : '没有获取到模型，请手动填写'); draw(); }
      catch (e) { msg(`<span style="color:var(--bad)">${esc(AI.err(e))}</span>`); }
    };
  };
  const cfgOf = () => { if (st.provider === 'builtin') return { provider: 'builtin' }; const p = preset(); return { provider: st.provider, kind: p.kind, key: st.key, model: st.model, base: st.base || p.base, vision: !!st.vision }; };
  $$('.aip [data-p]', body).forEach(b => b.onclick = () => {
    if (st.provider === b.dataset.p) return;
    st.provider = b.dataset.p; st.model = ''; st.base = ''; st.vision = undefined; st.models = [];
    if (saved.provider === st.provider) { st.key = saved.key; st.model = saved.model; st.base = saved.base || ''; st.vision = saved.vision; } else st.key = '';
    $$('.aip [data-p]', body).forEach(x => x.setAttribute('aria-pressed', x === b)); msg(''); draw();
  });
  $('#ai-test', body).onclick = async () => {
    const c = cfgOf(); if (!c.key) return msg('先填写 API Key'); if (!c.base && c.kind === 'openai') return msg('先填写接口地址');
    msg('<span class="spin"></span> 正在连接…');
    try { const t = await AIClient.test(c); msg(`<span style="color:var(--good)">连接成功</span>${t ? '：' + esc(t.slice(0, 40)) : ''}`); Motion.haptic('ok'); }
    catch (e) { msg(`<span style="color:var(--bad)">${esc(AI.err(e))}</span>`); Motion.haptic('bad'); }
  };
  $('#ai-save', body).onclick = async () => {
    const c = cfgOf(); if (c.provider !== 'builtin') { if (!c.key) return msg('先填写 API Key'); if (!c.model) return msg('先填写或选择模型'); }
    await Platform.aiConfig.set(c); AI_CFG = c; await AI.reload(); s.close(); toast('AI 服务已保存'); refresh();
  };
  draw();
  return s;
}
/* ---- 图片模型 ---- */
async function imgConfigSheet(after) {
  const saved = IMG_CFG || await Platform.imgConfig.get() || {};
  const st = { provider: saved.provider || 'glm', key: saved.key || '', model: saved.model || '', base: saved.base || '', size: saved.size || '', models: [] };
  const body = h(`<div style="display:flex;flex-direction:column;gap:14px">
    <div class="chips imp wrapc">${Object.entries(IMG_PRESETS).map(([id, p]) => `<button class="chip" data-p="${id}" aria-pressed="${st.provider === id}">${p.label}</button>`).join('')}</div>
    <div id="im-f" style="display:flex;flex-direction:column;gap:12px"></div>
    <div id="im-prev" hidden></div>
    <div id="im-msg" class="small" style="min-height:1.2em"></div>
    <div class="acts">${saved.key ? '<button class="btn ghost danger" id="im-off">停用</button>' : ''}<button class="btn" id="im-test">${ico('image')}试画</button><button class="btn pri" id="im-save">保存</button></div>
    <p class="lockn">${ico('lock')}仅存本机</p>
  </div>`);
  const s = sheet('图片模型', body), msg = t => $('#im-msg', body).innerHTML = t, preset = () => IMG_PRESETS[st.provider];
  const cfgOf = () => { const p = preset(); return { provider: st.provider, key: st.key, model: st.model, base: st.base || p.base, size: st.size || p.size }; };
  const draw = () => {
    const p = preset(); if (!st.model && p.model) st.model = p.model;
    $('#im-f', body).innerHTML = `
      <label class="field"><span>API Key${p.site ? `<small style="font-weight:400;color:var(--ink-2)"> · 在 ${p.site} 获取</small>` : ''}</span><input class="inp" id="im-key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="sk-…" value="${esc(st.key)}"></label>
      ${st.provider === 'custom' || st.base ? `<label class="field"><span>接口地址</span><input class="inp" id="im-base" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="https://…/v1" value="${esc(st.base || p.base)}"></label>` : ''}
      <label class="field"><span>模型</span><div class="row"><input class="inp grow" id="im-model" list="im-ml" autocapitalize="off" spellcheck="false" placeholder="模型名称" value="${esc(st.model)}"><button class="btn sm soft" id="im-list">获取列表</button></div><datalist id="im-ml">${st.models.map(m => `<option value="${esc(m)}">`).join('')}</datalist></label>
      <div class="field"><span>默认尺寸</span><div class="seg" id="im-size">${IMG_SIZES.map(([v, l]) => `<button data-v="${v}" aria-pressed="${(st.size || p.size) === v}">${l}</button>`).join('')}</div></div>`;
    $('#im-key', body).oninput = e => st.key = e.target.value.trim();
    $('#im-base', body)?.addEventListener('input', e => st.base = e.target.value.trim());
    $('#im-model', body).oninput = e => st.model = e.target.value.trim();
    $$('#im-size [data-v]', body).forEach(b => b.onclick = () => { st.size = b.dataset.v; $$('#im-size [data-v]', body).forEach(x => x.setAttribute('aria-pressed', x === b)); });
    $('#im-list', body).onclick = async () => {
      const c = cfgOf(); if (!c.key) return msg('先填写 API Key'); if (!c.base) return msg('先填写接口地址');
      msg('<span class="spin"></span> 正在获取模型列表…');
      try { st.models = await ImageClient.models(c); msg(st.models.length ? `找到 ${st.models.length} 个模型，点模型输入框选择` : '没有获取到模型，请手动填写'); draw(); }
      catch (e) { msg(`<span style="color:var(--bad)">${esc(AI.err(e))}</span>`); }
    };
  };
  $$('.imp [data-p]', body).forEach(b => b.onclick = () => {
    if (st.provider === b.dataset.p) return;
    st.provider = b.dataset.p; st.models = []; st.base = ''; st.size = '';
    if (saved.provider === st.provider) Object.assign(st, { key: saved.key, model: saved.model, base: saved.base || '', size: saved.size || '' }); else { st.key = ''; st.model = ''; }
    $$('.imp [data-p]', body).forEach(x => x.setAttribute('aria-pressed', x === b)); msg(''); draw();
  });
  const check = c => !c.key ? '先填写 API Key' : !c.base ? '先填写接口地址' : !c.model ? '先填写或选择模型' : '';
  $('#im-test', body).onclick = async e => {
    const c = cfgOf(), bad = check(c); if (bad) return msg(bad);
    const btn = e.currentTarget; btn.disabled = true; msg('<span class="spin"></span> 正在生成，通常需要 10~60 秒…');
    try {
      const r = await ImageClient.generate(c, '一架蓝色纸飞机飞过晨光中的书本，简洁扁平插画，柔和配色，无文字');
      const src = r.blob ? URL.createObjectURL(r.blob) : r.url, pv = $('#im-prev', body);
      pv.hidden = false; pv.innerHTML = `<img src="${esc(src)}" alt="测试图片" style="width:100%;border-radius:14px;display:block">`;
      msg(`<span style="color:var(--good)">生成成功</span>${r.blob ? '' : '（这个服务只返回临时链接，配图会保存链接）'}`); Motion.haptic('ok');
    } catch (err) { msg(`<span style="color:var(--bad)">${esc(AI.err(err))}</span>`); Motion.haptic('bad'); }
    finally { btn.disabled = false; }
  };
  $('#im-save', body).onclick = async () => {
    const c = cfgOf(), bad = check(c); if (bad) return msg(bad);
    await Platform.imgConfig.set(c); IMG_CFG = c; s.close(); toast('图片模型已保存'); if (after) after(c); else refresh();
  };
  $('#im-off', body)?.addEventListener('click', async () => { await Platform.imgConfig.set(null); IMG_CFG = null; s.close(); toast('已停用图片模型'); refresh(); });
  draw();
  return s;
}
/* 需要图片模型时调用：已配置返回配置，否则打开设置（保存后执行 after） */
async function needImg(after) { const c = IMG_CFG || await Platform.imgConfig.get(); if (ImageClient.ok(c)) { IMG_CFG = c; return c; } imgConfigSheet(after); return null; }
/* 启动时读一次配置，供设置页显示 */
Platform.aiConfig.get().then(c => { AI_CFG = c; }).catch(() => {});
Platform.imgConfig.get().then(c => { IMG_CFG = c; }).catch(() => {});
