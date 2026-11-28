/* ============ FSRS 间隔重复 ============ */
const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const FF = 19 / 81, DEC = -0.5;
const clampD = d => Math.min(10, Math.max(1, d));
const retr = (t, s) => Math.pow(1 + FF * t / s, DEC);
const ivlDays = (s, r) => s / FF * (Math.pow(r, 1 / DEC) - 1);
function schedule(prev, g, now = Date.now()) {
  const ret = plan().retention || .9, n = prev ? { ...prev } : { reps: 0, lapses: 0 };
  delete n.ext; if (g === 1) { delete n.cl; delete n.won; } // 已移出 / 已攻克的错题，再答错才回到错题本
  if (!prev || !prev.last) { n.s = W[g - 1]; n.d = clampD(W[4] - (g - 3) * W[5]); }
  else {
    const t = Math.max(0, (now - prev.last) / DAY), r = retr(t, prev.s);
    n.d = clampD(W[7] * W[4] + (1 - W[7]) * (prev.d - W[6] * (g - 3)));
    n.s = g === 1 ? W[11] * Math.pow(prev.d, -W[12]) * (Math.pow(prev.s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14])
      : prev.s * (1 + Math.exp(W[8]) * (11 - prev.d) * Math.pow(prev.s, -W[9]) * (Math.exp((1 - r) * W[10]) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1));
    n.s = Math.max(.1, n.s);
  }
  n.reps = (prev?.reps || 0) + 1; n.last = now; n.lr = g;
  if (g === 1) { n.lapses = (prev?.lapses || 0) + 1; n.due = now + 10 * 60e3; n.ivl = 0; }
  else { const d = Math.max(1, Math.round(ivlDays(n.s, ret))); n.ivl = d; n.due = dayStart(now) + d * DAY; }
  return n;
}
const srsDoc = cid => Store.docs['srs/' + cid] ||= { c: {} };
const getSt = it => srsDoc(it.course).c[it.id] || null;
function setSt(it, st) { const d = srsDoc(it.course); if (st) d.c[it.id] = st; else delete d.c[it.id]; }
const saveSrs = cid => Store.put('srs/' + cid, srsDoc(cid));
