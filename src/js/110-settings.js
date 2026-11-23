/* ============ 设置 ============ */
function typoControls() {
  const p = P(), R = (k, label, min, max, step, fmt) => `<div class="field"><span>${label}</span><div class="range"><input type="range" id="t-${k}" min="${min}" max="${max}" step="${step}" value="${p[k]}"><output id="o-${k}">${fmt(p[k])}</output></div></div>`;
  const pct = v => Math.round(v * 100) + '%';
  return R('fs', '正文字号', 13, 26, 1, v => v + 'px') + R('lh', '行距', 1.3, 2.2, .05, v => (+v).toFixed(2)) + R('math', '公式大小', .7, 1.6, .05, pct) + R('code', '代码大小', .6, 1.2, .02, pct) + R('tbl', '表格大小', .65, 1.15, .01, pct) + R('pgap', '段落间距', .2, 1.4, .05, v => (+v).toFixed(2)) + R('pad', '卡片内边距', 12, 28, 1, v => v + 'px') +
    `<div class="field"><span>正文字体</span><div class="seg" id="t-font">${Object.entries(FONTS).map(([k, f]) => `<button data-f="${k}" aria-pressed="${p.font === k}">${f.label}</button>`).join('')}</div></div>
     <label class="row small" style="color:var(--ink-2)"><input type="checkbox" id="t-wrap" ${p.wrapCode ? 'checked' : ''} style="accent-color:var(--accent)"> 长代码换行</label>`;
}
function bindTypo(root) {
  const p = P(), fmt = { fs: v => v + 'px', lh: v => (+v).toFixed(2), pgap: v => (+v).toFixed(2), pad: v => v + 'px' };
  $$('input[type=range]', root).forEach(inp => { inp.oninput = () => { const k = inp.id.slice(2); p[k] = +inp.value; $('#o-' + k, root).textContent = fmt[k]?.(p[k]) ?? Math.round(p[k] * 100) + '%'; applyPrefs(); }; inp.onchange = savePrefs; });
  $$('#t-font button', root).forEach(b => b.onclick = () => { p.font = b.dataset.f; $$('#t-font button', root).forEach(x => x.setAttribute('aria-pressed', x === b)); applyPrefs(); savePrefs(); });
  $('#t-wrap', root).onchange = e => { p.wrapCode = e.target.checked; applyPrefs(); savePrefs(); };
}
const SAMPLE = '**香农定理**：$C = W\\log_2(1 + S/N)$，其中 $W$ 为带宽。\n$$\\mathrm{EAT} = 0.9\\times120 + 0.1\\times220 = 130\\ \\text{ns}$$\n| 算法 | 平均时间 | 稳定 |\n|---|---|---|\n| 快速排序 | $O(n\\log n)$ | 否 |\n| 归并排序 | $O(n\\log n)$ | 是 |\n```\nwhile (x < n/2) x = 2 * x;\n```';
function typoSheet() {
  const body = h(`<div style="display:flex;flex-direction:column;gap:14px">${typoControls()}</div>`);
  sheet('阅读排版', body); bindTypo(body);
}
async function exportData() {
  const text = JSON.stringify({ app: 'renew', v: 2, at: new Date().toISOString(), docs: Store.docs }), name = `温新备份-${dayKey()}.json`;
  await Files.save(name, text, 'application/json');
}
function importData(pre) {
  const body = h(`<div style="display:flex;flex-direction:column;gap:12px"><input type="file" accept=".json,application/json" class="inp" id="ip-f"><textarea class="inp" id="ip-t" placeholder="或者粘贴备份内容"></textarea><button class="btn pri" id="ip-go">导入并覆盖当前数据</button></div>`);
  const s = sheet('导入备份', body);
  if (pre?.docs) $('#ip-t', body).value = JSON.stringify(pre);
  $('#ip-f', body).onchange = async e => { $('#ip-t', body).value = await e.target.files[0].text(); };
  $('#ip-go', body).onclick = async () => {
    let data; try { data = JSON.parse($('#ip-t', body).value); } catch { return toast('内容不是有效的备份'); }
    if (!data?.docs?.['app/state']) return toast('没有找到学习数据');
    if (!await confirmBox('导入备份', '会用备份覆盖当前的进度和设置。', '导入', true)) return;
    for (const [k, val] of Object.entries(data.docs)) if (DOC_RE.test(k)) Store.put(k, val);
    Store.flushAll(); s.close(); toast('已导入，正在重新载入'); setTimeout(() => location.reload(), 900);
  };
}
