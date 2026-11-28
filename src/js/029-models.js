/* ============ 按你的记录拟合的模型：FSRS 参数个性化、PFA 答对预测 ============ */
/* 两者都只在本机拟合，并用留出数据检验：比默认模型更准才启用，否则保持默认。 */
const MODEL_MIN = { fsrs: 400, pfa: 300 };
const bce = (y, p) => { p = Math.min(1 - 1e-4, Math.max(1e-4, p)); return -(y * Math.log(p) + (1 - y) * Math.log(1 - p)); };
const hashSplit = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 5 === 0; }; // 约 20% 的卡片留作检验

/* ---- FSRS：用完整记录下来的卡片（第一次作答就在记录里）重放评分，比较预测的回忆概率与实际 ---- */
function fsrsHistories() {
  const by = new Map();
  for (const r of attAll()) { if (!r.id || !r.g || r.m === 'paper' && r.k) continue; const l = by.get(r.id); l ? l.push(r) : by.set(r.id, [r]); }
  const out = [];
  for (const [id, l] of by) if (l[0].r == null && l.length >= 2) out.push({ id, l }); // 第一次作答时还没有记忆状态 = 从头记录
  return out;
}
/* 重放一组卡片，返回平均对数损失和预测次数；只评估隔天以上的复习（当天重做不算预测） */
function fsrsLoss(hs, w) {
  let ll = 0, n = 0;
  for (const { l } of hs) {
    let st = null;
    for (const r of l) {
      if (st && dayKey(r.t) !== dayKey(st.last)) { ll += bce(r.g > 1 ? 1 : 0, retr(Math.max(0, (r.t - st.last) / DAY), st.s)); n++; }
      st = schedule(st, r.g, r.t, w);
    }
  }
  return { ll: n ? ll / n : null, n };
}
/* 坐标搜索：在对数尺度上调整初始稳定度、稳定度增长和遗忘后稳定度这几个最影响间隔的参数 */
const FIT_IDX = [0, 1, 2, 3, 8, 11];
function fitFsrs() {
  const hs = fsrsHistories(), train = hs.filter(h => !hashSplit(h.id)), test = hs.filter(h => hashSplit(h.id));
  const base = fsrsLoss(hs, W); if (base.n < MODEL_MIN.fsrs) return { ok: false, n: base.n, need: MODEL_MIN.fsrs };
  const reg = c => FIT_IDX.reduce((s, i) => s + Math.log(c[i] / W[i]) ** 2, 0) * .004; // 轻微拉向默认参数，防止数据少时过拟合
  const obj = c => { const v = fsrsLoss(train, c).ll; return v == null ? Infinity : v + reg(c); };
  let w = [...W], best = obj(w);
  const STEPS = [.5, .7, .85, 1.18, 1.4, 2], LIM = { 0: [.05, 30], 1: [.1, 60], 2: [.2, 120], 3: [.5, 365], 8: [.3, 3.5], 11: [.3, 6] };
  for (let pass = 0; pass < 3; pass++) for (const i of FIT_IDX) for (const k of STEPS) {
    const c = [...w]; c[i] = Math.min(LIM[i][1], Math.max(LIM[i][0], w[i] * k)); if (i < 4) for (let j = 1; j < 4; j++) c[j] = Math.max(c[j], c[j - 1]); // 初始稳定度保持递增
    const v = obj(c); if (v < best - 1e-6) { best = v; w = c; }
  }
  const t0 = fsrsLoss(test, W), t1 = fsrsLoss(test, w);
  const better = t0.n >= 60 && t1.ll < t0.ll * .99;
  return { ok: better, n: base.n, testN: t0.n, ll0: t0.ll, ll1: t1.ll, w: better ? w.map(x => +x.toFixed(4)) : null };
}

/* ---- PFA：按小节，答对概率 = σ(小节难度 + γ·ln(1+之前答对次数) + ρ·ln(1+之前答错次数)) ---- */
function pfaRows(cid) {
  const cnt = new Map(), rows = [];
  for (const r of attAll()) {
    if (r.ok === undefined || !r.first || r.c !== cid || r.self) continue;
    const sid = r.id ? ITEMS.get(r.id)?.sec : r.s; if (!sid || !SECS.has(sid)) continue;
    const c = cnt.get(sid) || { s: 0, f: 0, ev: [] };
    for (let k = 0; k < (r.k || 1); k++) { rows.push({ sid, y: r.ok ? 1 : 0, s: c.s, f: c.f, t: r.t, ev: c.ev.slice() }); r.ok ? c.s++ : c.f++; c.ev.push([r.t, r.ok ? 1 : 0]); }
    cnt.set(sid, c);
  }
  return rows;
}
const sigm = z => 1 / (1 + Math.exp(-z));
function pfaFit(rows, iters = 400) {
  const b = new Map(); let g = 0, rho = 0; const lr = .1, L2 = .05;
  for (let it = 0; it < iters; it++) {
    const gb = new Map(); let gg = 0, gr = 0;
    for (const x of rows) { const p = sigm((b.get(x.sid) || 0) + g * Math.log1p(x.s) + rho * Math.log1p(x.f)), e = p - x.y; gb.set(x.sid, (gb.get(x.sid) || 0) + e); gg += e * Math.log1p(x.s); gr += e * Math.log1p(x.f); }
    const n = rows.length || 1;
    for (const [k, v] of gb) b.set(k, (b.get(k) || 0) - lr * (v / n * 20 + L2 * (b.get(k) || 0)));
    g -= lr * gg / n * 5; rho -= lr * gr / n * 5;
  }
  return { b, g, rho, p: x => sigm((b.get(x.sid) || 0) + g * Math.log1p(x.s) + rho * Math.log1p(x.f)) };
}
/* 基线：学情页用的 Beta 掌握度（同样的半衰期），按时间顺序只用之前的作答 */
const betaPred = x => { let a = 1, bb = 1; for (const [t, ok] of x.ev) { const w = Math.pow(.5, Math.max(0, x.t - t) / DAY / MASTERY.half); ok ? a += w : bb += w; } return a / (a + bb); };
function fitPfa(cid) {
  const rows = pfaRows(cid); if (rows.length < MODEL_MIN.pfa) return { ok: false, n: rows.length, need: MODEL_MIN.pfa };
  const cut = Math.floor(rows.length * .8), train = rows.slice(0, cut), test = rows.slice(cut), m = pfaFit(train);
  const ll1 = test.reduce((s, x) => s + bce(x.y, m.p(x)), 0) / test.length, ll0 = test.reduce((s, x) => s + bce(x.y, betaPred(x)), 0) / test.length;
  const ok = ll1 < ll0 * .98;
  return { ok, n: rows.length, testN: test.length, ll0, ll1, ...(ok ? { b: Object.fromEntries([...m.b].map(([k, v]) => [k, +v.toFixed(4)])), g: +m.g.toFixed(4), rho: +m.rho.toFixed(4) } : {}) };
}
/* 学情页打开时调用：每 7 天或作答增加 20% 以上时重新拟合，结果存在学习计划里 */
function refreshModels(force) {
  const pl = plan(), fit = pl.fit ||= {}, n = attAll().length, now = Date.now();
  if (!force && fit.at && now - fit.at < 7 * DAY && n < (fit.n || 0) * 1.2) return fit;
  const f = fitFsrs();
  fit.fsrs = { ok: f.ok, n: f.n, need: f.need, testN: f.testN, ll0: f.ll0, ll1: f.ll1 };
  if (f.ok && !pl.fsrsOff) pl.fsrsW = f.w; else delete pl.fsrsW;
  fit.pfa = {}; for (const c of shownCourses()) { const p = fitPfa(c.id); if (p.n) fit.pfa[c.id] = p; }
  fit.at = now; fit.n = n; saveState(); return fit;
}
/* PFA 启用时：预测这一节下一题答对的概率（用于给薄弱点排序） */
function pfaNext(cid, sid) {
  const m = plan().fit?.pfa?.[cid]; if (!m?.ok || !m.b) return null;
  let s = 0, f = 0; for (const r of attAll()) if (r.first && r.ok !== undefined && !r.self && r.c === cid && (r.id ? ITEMS.get(r.id)?.sec : r.s) === sid) r.ok ? s += r.k || 1 : f += r.k || 1;
  return sigm((m.b[sid] || 0) + m.g * Math.log1p(s) + m.rho * Math.log1p(f));
}
