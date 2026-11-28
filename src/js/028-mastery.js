/* ============ 学情模型：本机统计，不用大模型 ============ */
/* 掌握度：取题目「当天第一次作答」，按时间衰减加权（半衰期 30 天），用 Beta 分布估计答对概率并给出 80% 区间。
   自评的作答（问答、填空、思考题）按半权计入；知识点卡只计入记忆，不计入掌握度。
   一道题关联了知识点（it.kps）时计入对应知识点，否则只计入所在小节。小节总是汇总本节所有题目。 */
const MASTERY = { half: 30, minN: 3, weakHi: .6, goodLo: .75, goodMem: .85, z: .1 };
const M_LABEL = { good: '已掌握', mid: '巩固中', weak: '薄弱', none: '数据不足' };
const M_COLOR = { good: 'var(--good)', mid: 'var(--accent)', weak: 'var(--bad)', none: 'var(--fill)' };

/* --- Beta 分布分位数（正则化不完全 Beta 函数 + 二分） --- */
function lnGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, .1208650973866179e-2, -.5395239384953e-5];
  let y = x, t = x + 5.5; t -= (x + .5) * Math.log(t); let s = 1.000000000190015;
  for (const v of c) s += v / ++y;
  return -t + Math.log(2.5066282746310005 * s / x);
}
function betaCF(a, b, x) {
  const EPS = 3e-12, FP = 1e-300; let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FP) d = FP; d = 1 / d; let hh = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP; d = 1 / d; hh *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP; d = 1 / d;
    const del = d * c; hh *= del; if (Math.abs(del - 1) < EPS) break;
  }
  return hh;
}
function betaCdf(x, a, b) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betaCF(a, b, x) / a : 1 - bt * betaCF(b, a, 1 - x) / b;
}
function betaQ(p, a, b) { let lo = 0, hi = 1; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; betaCdf(m, a, b) < p ? lo = m : hi = m; } return (lo + hi) / 2; }

/* --- 证据汇总 --- */
const kpsOf = it => (it?.kps || []).filter(id => ITEMS.get(id)?.t === 'kp');
function newEv() { return { a: 1, b: 1, n: 0, raw: 0, ok: 0, last: 0, recent: [] }; }
function addEv(e, ok, w, t, k = 1) { if (ok) e.a += w; else e.b += w; e.n += w; e.raw += k; if (ok) e.ok += k; e.last = Math.max(e.last, t); }
/* 一次性算出所有小节与知识点的证据；作答记录有变化时缓存失效 */
function evidence() {
  const list = attAll(), now = Date.now();
  if (Att.ev && Att.ev.len === list.length && Att.ev.ver === Att.ver && now - Att.ev.at < 6e4) return Att.ev;
  const sec = new Map(), kp = new Map(), get = (m, k) => m.get(k) || (m.set(k, newEv()), m.get(k));
  for (const r of list) {
    if (r.ok === undefined || !r.first) continue;
    const it = r.id ? ITEMS.get(r.id) : null;
    if (r.id && (!it || !visible(it))) continue;
    const sid = it ? it.sec : r.s; if (!SECS.has(sid)) continue;
    const decay = Math.pow(.5, Math.max(0, now - r.t) / DAY / MASTERY.half), base = (r.self ? .5 : 1) * decay, k = r.k || 1;
    addEv(get(sec, sid), r.ok, base * k, r.t, k);
    const ks = it ? kpsOf(it) : [];
    for (const id of ks) addEv(get(kp, id), r.ok, base / ks.length, r.t, 1);
  }
  Att.ev = { len: list.length, ver: Att.ver, at: now, sec, kp };
  return Att.ev;
}
/* 记忆强度：当前回忆概率的平均值（只算学过的卡） */
function memOf(items) {
  const now = Date.now(), rs = items.map(getSt).filter(s => s && s.last && s.s).map(s => retr(Math.max(0, (now - s.last) / DAY), s.s));
  return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
}
function judge(e, mem) {
  if (!e || e.n < MASTERY.minN) return { st: 'none', p: e ? e.a / (e.a + e.b) : null, lo: null, hi: null, n: e?.n || 0, raw: e?.raw || 0, ok: e?.ok || 0, mem };
  const p = e.a / (e.a + e.b), lo = betaQ(MASTERY.z, e.a, e.b), hi = betaQ(1 - MASTERY.z, e.a, e.b);
  const st = hi < MASTERY.weakHi ? 'weak' : lo >= MASTERY.goodLo && (mem == null || mem >= MASTERY.goodMem) ? 'good' : 'mid';
  return { st, p, lo, hi, n: e.n, raw: e.raw, ok: e.ok, mem, last: e.last };
}
function secMastery(sec) { return judge(evidence().sec.get(sec.id), memOf(secItems(sec))); }
function kpMastery(it) {
  const linked = secQs(SECS.get(it.sec)).filter(q => kpsOf(q).includes(it.id));
  return judge(evidence().kp.get(it.id), memOf([it, ...linked]));
}
/* 一门课的学情：每个小节、有证据的知识点、薄弱列表、错因分布 */
function courseInsight(c) {
  const secs = courseSecs(c).filter(s => S().sec[s.id] !== 'skip'), rows = [], kps = [], cnt = { good: 0, mid: 0, weak: 0, none: 0 };
  for (const s of secs) {
    const items = secItems(s); if (!items.length) continue;
    const learned = items.some(getSt) || evidence().sec.has(s.id); if (!learned) continue;
    const m = secMastery(s); rows.push({ sec: s, ...m }); cnt[m.st]++;
    for (const k of secKps(s)) if (evidence().kp.has(k.id)) kps.push({ it: k, ...kpMastery(k) });
  }
  const weakK = kps.filter(x => x.st === 'weak'), weakSecWithKp = new Set(weakK.map(x => x.it.sec));
  const pr = x => { const v = pfaNext(c.id, x.it ? x.it.sec : x.sec.id); return v ?? x.p; }; // PFA 检验更准时按它排序
  const weak = [...weakK, ...rows.filter(x => x.st === 'weak' && !weakSecWithKp.has(x.sec.id))].sort((a, b) => pr(a) - pr(b));
  return { c, rows, kps, cnt, weak, causes: causeCounts(c.id), n: attAll().filter(r => r.c === c.id && r.ok !== undefined).reduce((s, r) => s + (r.k || 1), 0) };
}
/* 错因分布：每道题只取最近一次答错的错因（规则推荐的也算，但单独计数） */
function causeCounts(cid) {
  const out = Object.fromEntries(CAUSES.map(([k]) => [k, { me: 0, all: 0, ids: [] }])), seen = new Set(), list = attAll();
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i]; if (!r.id || r.ok !== false || seen.has(r.id) || (cid && r.c !== cid)) continue;
    const it = ITEMS.get(r.id); if (!it || !visible(it)) continue;
    const st = getSt(it); if (!st?.lapses || st.cl) continue; // 已移出错题本的不算
    seen.add(r.id); if (!r.cause || !CAUSE[r.cause]) continue;
    const o = out[r.cause]; o.all++; if (r.by !== 'rule') o.me++; o.ids.push(r.id);
  }
  return out;
}
/* 近 N 周每周的正确率（第一次作答） */
function weeklyAcc(cid, weeks = 8) {
  const now = dayStart(), out = [];
  for (let i = weeks - 1; i >= 0; i--) out.push({ from: now - (i + 1) * 7 * DAY + DAY, to: now - i * 7 * DAY + DAY, ok: 0, n: 0 });
  for (const r of attAll()) { if (r.ok === undefined || !r.first || (cid && r.c !== cid)) continue; const w = out.find(x => r.t >= x.from && r.t < x.to); if (w) { const k = r.k || 1; w.n += k; if (r.ok) w.ok += k; } }
  return out;
}
/* FSRS 预测准确度：用作答前存下的回忆概率 r 和实际结果（评分 > 1 视为记得）对比 */
function calibration(cid) {
  const xs = attAll().filter(r => r.r != null && r.first && (!cid || r.c === cid)), bins = Array.from({ length: 5 }, (_, i) => ({ lo: .5 + i * .1, n: 0, pred: 0, act: 0 }));
  let ll = 0, base = 0; const mean = xs.length ? xs.reduce((s, r) => s + (r.g > 1 ? 1 : 0), 0) / xs.length : 0;
  const clip = p => Math.min(1 - 1e-4, Math.max(1e-4, p));
  for (const r of xs) {
    const y = r.g > 1 ? 1 : 0, p = clip(r.r);
    ll -= y * Math.log(p) + (1 - y) * Math.log(1 - p); base -= y * Math.log(clip(mean)) + (1 - y) * Math.log(1 - clip(mean));
    const b = bins[Math.max(0, Math.min(4, Math.floor((r.r - .5) / .1)))]; b.n++; b.pred += r.r; b.act += y;
  }
  return { n: xs.length, ll: xs.length ? ll / xs.length : null, base: xs.length ? base / xs.length : null, bins: bins.map(b => ({ ...b, pred: b.n ? b.pred / b.n : null, act: b.n ? b.act / b.n : null })) };
}
/* 掌握度短条：均值 + 区间细线 */
function mBar(m, w = 64) {
  const pc = v => (v == null ? 0 : Math.round(v * 100)) + '%';
  return `<span class="mbar" style="--w:${w}px" title="${M_LABEL[m.st]}${m.p != null && m.st !== 'none' ? ' · ' + pc(m.p) : ''}"><i class="mb-f" style="width:${m.st === 'none' ? 0 : pc(m.p)};background:${M_COLOR[m.st]}"></i>${m.lo != null ? `<i class="mb-ci" style="left:${pc(m.lo)};width:${pc(m.hi - m.lo)}"></i>` : ''}</span>`;
}
/* 四段堆叠条 */
function mStack(cnt) {
  const tot = cnt.good + cnt.mid + cnt.weak + cnt.none; if (!tot) return '<span class="mstack z"></span>';
  return `<span class="mstack">${['good', 'mid', 'weak', 'none'].map(k => cnt[k] ? `<i style="flex:${cnt[k]};background:${M_COLOR[k]}" title="${M_LABEL[k]} ${cnt[k]}"></i>` : '').join('')}</span>`;
}
/* 小节页知识点圆点：有题目证据时按掌握度着色，否则按记忆（学过为蓝） */
function kpDot(it) {
  if (evidence().kp.has(it.id)) { const m = kpMastery(it); return 'm-' + m.st; }
  if (!getSt(it)) return '';
  const r = memOf([it]); return r != null && r < .7 ? 'm-fade' : 'h';
}
