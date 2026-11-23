/* ============ 内置作图：函数图像、流程图/关系图、树、数组与链表 ============ */
/* Markdown 代码块的语言名决定图的种类，渲染成跟随主题配色的 SVG（离线可用，不执行任何外部代码）：
   ```plot   函数曲线、数据折线、柱状图、参考线
   ```graph  流程图、有向图、无向带权图（自动分层布局；全是无向边时环形布局）
   ```tree   树、二叉树（缩进表示父子，- 表示空孩子）
   ```cells  数组、链表、栈、指令格式、指针标注
   语法见 docs/content-format.md。解析出错时退回显示源文本。 */
const Viz = (() => {
  let uid = 0;
  const FS = 13;
  const cjk = c => /[⺀-鿿豈-﫿＀-￯　-〿]/.test(c);
  const tw = (s, fs = FS) => [...String(s)].reduce((w, c) => w + (cjk(c) ? fs : /[A-Z0-9mwMW@%]/.test(c) ? fs * .64 : fs * .55), 0);
  const X = s => esc(s);
  const r1 = n => Math.round(n * 10) / 10;
  const COLORS = ['var(--accent)', 'var(--bad)', 'var(--good)', 'var(--warn)', '#8a4fd0', '#1f7fbf'];
  const svg = (w, h, body, cls) => `<svg class="vz ${cls}" viewBox="-8 -6 ${r1(w + 16)} ${r1(h + 12)}" width="${r1(w + 16)}" height="${r1(h + 12)}" style="max-width:100%;height:auto" role="img" xmlns="http://www.w3.org/2000/svg" font-size="${FS}">${body}</svg>`;
  const arrowDef = id => `<defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1L10 5L0 9z" fill="var(--ink-2)"/></marker></defs>`;
  const label = (x, y, s, o = {}) => `<text x="${r1(x)}" y="${r1(y)}" text-anchor="${o.a || 'middle'}" dominant-baseline="${o.b || 'central'}"${o.cls ? ` class="${o.cls}"` : ''}${o.fs ? ` font-size="${o.fs}"` : ''}${o.fill ? ` fill="${o.fill}"` : ''}>${X(s)}</text>`;

  /* ---------- 安全的表达式解析（不使用 eval） ---------- */
  const FN = { sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, exp: Math.exp, ln: Math.log, log: Math.log10, lg: Math.log10, log2: Math.log2, log10: Math.log10, sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, min: Math.min, max: Math.max, pow: Math.pow, sign: Math.sign };
  const CONST = { pi: Math.PI, e: Math.E };
  function compile(src) {
    const t = String(src).replace(/×|·/g, '*').replace(/÷/g, '/').replace(/π/g, 'pi').replace(/\*\*/g, '^').match(/\d*\.?\d+(?:e[+-]?\d+)?|[a-zA-Z_]\w*|[-+*/^(),]/g) || [];
    let i = 0; const peek = () => t[i], next = () => t[i++];
    const need = c => { if (next() !== c) throw new Error('表达式有误：' + src); };
    const startsPrimary = c => c && (c === '(' || /^[a-zA-Z_\d.]/.test(c));
    function expr() { let a = term(); while (peek() === '+' || peek() === '-') { const op = next(), b = term(), l = a; a = op === '+' ? x => l(x) + b(x) : x => l(x) - b(x); } return a; }
    function term() { let a = unary(); for (;;) { if (peek() === '*' || peek() === '/') { const op = next(), b = unary(), l = a; a = op === '*' ? x => l(x) * b(x) : x => l(x) / b(x); } else if (startsPrimary(peek())) { const b = unary(), l = a; a = x => l(x) * b(x); } else return a; } }
    function unary() { if (peek() === '-') { next(); const a = unary(); return x => -a(x); } if (peek() === '+') { next(); return unary(); } return power(); }
    function power() { const a = primary(); if (peek() === '^') { next(); const b = unary(); return x => Math.pow(a(x), b(x)); } return a; }
    function primary() {
      const c = next(); if (c == null) throw new Error('表达式不完整：' + src);
      if (c === '(') { const a = expr(); need(')'); return a; }
      if (/^[\d.]/.test(c)) { const v = parseFloat(c); return () => v; }
      if (c === 'x' || c === 'n' || c === 't') return x => x;
      if (c in CONST) { const v = CONST[c]; return () => v; }
      if (c in FN) { const f = FN[c]; need('('); const args = [expr()]; while (peek() === ',') { next(); args.push(expr()); } need(')'); return x => f(...args.map(a => a(x))); }
      throw new Error('不认识的符号：' + c);
    }
    const f = expr(); if (i < t.length) throw new Error('表达式有误：' + src); return f;
  }
  const num = s => { const v = compile(s)(0); if (!isFinite(v)) throw new Error('数值有误：' + s); return v; };
  function ticks(a, b, n = 5) {
    const span = b - a || 1, raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p, step = (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
    const out = []; for (let v = Math.ceil(a / step - 1e-9) * step; v <= b + 1e-9; v += step) out.push(+v.toFixed(10)); return out;
  }
  const fmtN = v => Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-3 && v) ? v.toExponential(0) : String(+v.toFixed(3));

  /* ---------- plot ---------- */
  function plot(src) {
    const series = [], refs = [], notes = []; let xr, yr, xl = '', yl = '', bars = null, grid = true, xt = null, yt = true;
    for (const raw of src.split('\n')) {
      const line = raw.trim(); if (!line || line.startsWith('#')) continue;
      const m = line.match(/^(\w+)\s*[:：]?\s*(.*)$/); if (!m) continue; const [, k, rest] = m;
      if (k === 'x' || k === 'y') { const r = rest.match(/^(\S+?)\s*\.\.\s*(\S+)\s*(.*)$/); if (!r) throw new Error('范围写法：x 0..10 标签'); const v = [num(r[1]), num(r[2])]; if (k === 'x') { xr = v; xl = r[3]; } else { yr = v; yl = r[3]; } }
      else if (k === 'f') { const q = rest.includes('|') ? rest.split('|') : (rest.match(/^(.+?)\s+([^\x00-\x7f].*)$/) || [, rest, '']).slice(1); let ex = q[0], dom = null; const dm = ex.match(/@\s*(\S+?)\s*\.\.\s*(\S+)\s*$/); if (dm) { dom = [num(dm[1]), num(dm[2])]; ex = ex.slice(0, dm.index); } const name = (q[1] || '').trim(), prev = series[series.length - 1]; series.push({ kind: 'f', fn: compile(ex), dom, name, cont: !!(dom && !name && prev && prev.kind === 'f' && prev.dom) }); }
      else if (k === 'p' || k === 's') { const pts = [...rest.matchAll(/\(?\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)?/g)].map(q => [+q[1], +q[2]]); const name = rest.replace(/\(?\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\)?/g, '').trim(); series.push({ kind: k, pts, name }); }
      else if (k === 'h' || k === 'v') { const [a, ...nm] = rest.split(/\s+/); refs.push({ k, v: num(a), name: nm.join(' ') }); }
      else if (k === 't') { const q = rest.match(/^\(?\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)?\s+(.+)$/); if (q) notes.push({ x: +q[1], y: +q[2], s: q[3] }); }
      else if (k === 'bar') { bars = rest.split(/[|，]|\s+(?![^(]*\))/).map(x => x.trim()).filter(Boolean).map(x => { const i = Math.max(x.lastIndexOf(':'), x.lastIndexOf('：')); if (i < 1) throw new Error('柱状图写法：bar 名称:数值 | 名称:数值'); return { l: x.slice(0, i).trim(), v: num(x.slice(i + 1)) }; }); }
      else if (k === 'xt') xt = /^(off|no|0)$/i.test(rest) ? [] : rest.split(/\s*[|，,]\s*/);
      else if (k === 'grid') grid = !/^(off|no|0)$/i.test(rest);
      else if (k === 'yt') yt = !/^(off|no|0)$/i.test(rest);
    }
    const W = 340, H = 220, L = 44, R = 14, T = yl || bars ? 30 : 16, B = 38, pw = W - L - R, ph = H - T - B, id = 'vz' + (++uid);
    if (bars) {
      const max = Math.max(...bars.map(b => b.v), 0), [y0, y1] = yr || [0, max * 1.12 || 1], bw = pw / bars.length;
      const Y = v => T + ph - (v - y0) / (y1 - y0) * ph;
      let g = ticks(y0, y1).map(v => `<line x1="${L}" x2="${W - R}" y1="${r1(Y(v))}" y2="${r1(Y(v))}" class="vz-grid"/>${label(L - 6, Y(v), fmtN(v), { a: 'end', cls: 'vz-tk' })}`).join('');
      g += bars.map((b, i) => { const x = L + i * bw + bw * .18, w = bw * .64; return `<rect x="${r1(x)}" y="${r1(Y(b.v))}" width="${r1(w)}" height="${r1(Y(y0) - Y(b.v))}" rx="3" fill="${COLORS[0]}" opacity=".85"/>${label(x + w / 2, Y(b.v) - 8, fmtN(b.v), { cls: 'vz-tk' })}${label(x + w / 2, T + ph + 14, b.l, { cls: 'vz-tk' })}`; }).join('');
      g += `<line x1="${L}" x2="${W - R}" y1="${T + ph}" y2="${T + ph}" class="vz-ax"/>` + (yl ? label(L, 10, yl, { a: 'start', cls: 'vz-lb' }) : '');
      return svg(W, H, g, 'vz-plot');
    }
    let xs = []; series.forEach(s => s.pts && s.pts.forEach(p => xs.push(p[0]))); refs.filter(r => r.k === 'v').forEach(r => xs.push(r.v));
    const [x0, x1] = xr || (xs.length ? [Math.min(...xs), Math.max(...xs)] : [0, 10]);
    const samp = s => { const out = [], [a, b] = s.dom || [x0, x1]; for (let i = 0; i <= 240; i++) { const x = a + (b - a) * i / 240; let y; try { y = s.fn(x); } catch { y = NaN; } out.push([x, y]); } return out; };
    series.forEach(s => { if (s.kind === 'f') s.pts = samp(s); });
    let ys = []; series.forEach(s => s.pts.forEach(p => isFinite(p[1]) && ys.push(p[1]))); refs.filter(r => r.k === 'h').forEach(r => ys.push(r.v));
    let [y0, y1] = yr || (ys.length ? [Math.min(...ys), Math.max(...ys)] : [0, 10]);
    if (!yr) { const pad = (y1 - y0) * .08 || 1; y0 = y0 >= 0 && y0 - pad < 0 ? 0 : y0 - pad; y1 += pad; }
    const Xp = x => L + (x - x0) / (x1 - x0 || 1) * pw, Yp = y => T + ph - (y - y0) / (y1 - y0 || 1) * ph;
    let g = `<defs><clipPath id="${id}c"><rect x="${L}" y="${T}" width="${pw}" height="${ph}"/></clipPath></defs>`;
    const xtk = ticks(x0, x1, 6), ytk = ticks(y0, y1, 5);
    if (grid) g += ytk.map(v => `<line x1="${L}" x2="${W - R}" y1="${r1(Yp(v))}" y2="${r1(Yp(v))}" class="vz-grid"/>`).join('') + xtk.map(v => `<line y1="${T}" y2="${T + ph}" x1="${r1(Xp(v))}" x2="${r1(Xp(v))}" class="vz-grid"/>`).join('');
    const ax = Math.min(Math.max(0, y0), y1), ay = Math.min(Math.max(0, x0), x1);
    g += `<line x1="${L}" x2="${W - R + 4}" y1="${r1(Yp(ax))}" y2="${r1(Yp(ax))}" class="vz-ax" marker-end="url(#${id}a)"/><line x1="${r1(Xp(ay))}" x2="${r1(Xp(ay))}" y1="${T + ph}" y2="${T - 6}" class="vz-ax" marker-end="url(#${id}a)"/>`;
    g += (xt && !xt.length ? [] : xt ? xt.map((s, i) => label(Xp(x0 + i * (x1 - x0) / Math.max(1, xt.length - 1)), T + ph + 13, s, { cls: 'vz-tk' })) : xtk.map(v => label(Xp(v), T + ph + 13, fmtN(v), { cls: 'vz-tk' }))).join('');
    if (yt) g += ytk.map(v => label(L - 6, Yp(v), fmtN(v), { a: 'end', cls: 'vz-tk' })).join('');
    if (xl) g += label(W - R, H - 6, xl, { a: 'end', cls: 'vz-lb' });
    if (yl) g += label(L - 2, 10, yl, { a: 'start', cls: 'vz-lb' });
    let vi = 0; refs.forEach(r => { const vy = T + 8 + (r.k === 'v' ? (vi++ % 2) * 15 : 0); g += r.k === 'h' ? `<line x1="${L}" x2="${W - R}" y1="${r1(Yp(r.v))}" y2="${r1(Yp(r.v))}" class="vz-ref"/>${r.name ? label(W - R - 2, Yp(r.v) - 8, r.name, { a: 'end', cls: 'vz-tk' }) : ''}` : `<line y1="${T}" y2="${T + ph}" x1="${r1(Xp(r.v))}" x2="${r1(Xp(r.v))}" class="vz-ref"/>${r.name ? label(Xp(r.v) + 4, vy, r.name, { a: 'start', cls: 'vz-tk', fs: 11 }) : ''}`; });
    let leg = '', ly = T + 4, ci = -1, lw = 0;
    series.forEach(s => {
      if (!s.cont) ci++; const c = COLORS[ci % COLORS.length]; let d = '', pen = false;
      const pts = s.kind === 's' ? s.pts.flatMap((p, j) => j ? [[p[0], s.pts[j - 1][1]], p] : [p]) : s.pts;
      for (const [x, y] of pts) { if (!isFinite(y) || Math.abs(y) > 1e9) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${r1(Xp(x))} ${r1(Yp(y))}`; pen = true; }
      g += `<path d="${d}" fill="none" stroke="${c}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#${id}c)"/>`;
      if (s.kind === 'p') g += s.pts.map(([x, y]) => `<circle cx="${r1(Xp(x))}" cy="${r1(Yp(y))}" r="3" fill="${c}"/>`).join('');
      if (s.name) { lw = Math.max(lw, tw(s.name, 12) + 30); leg += `<line x1="${W - R - 8 - tw(s.name, 12) - 20}" x2="${W - R - 8 - tw(s.name, 12) - 6}" y1="${ly}" y2="${ly}" stroke="${c}" stroke-width="2.6" stroke-linecap="round"/>${label(W - R - 6, ly, s.name, { a: 'end', fs: 12 })}`; ly += 17; }
    });
    notes.forEach(n => g += label(Xp(n.x), Yp(n.y), n.s, { cls: 'vz-note', fs: 12 }));
    if (leg) { // 图例放到曲线和标注最少的角落
      const bh = ly - T + 2, dense = s => { const q = (s.kind === 's' ? s.pts.flatMap((p, j) => j ? [[p[0], s.pts[j - 1][1]], p] : [p]) : s.pts).filter(p => isFinite(p[1])).map(p => [Xp(p[0]), Yp(p[1])]); return q.flatMap((p, j) => j ? Array.from({ length: 8 }, (_, k) => [q[j - 1][0] + (p[0] - q[j - 1][0]) * (k + 1) / 8, q[j - 1][1] + (p[1] - q[j - 1][1]) * (k + 1) / 8]) : [p]); }, pts = series.flatMap(dense).concat(refs.filter(r => r.k === 'v').map(r => [Xp(r.v) + 20, T + 10]), notes.flatMap(n => [[Xp(n.x) - 8, Yp(n.y)], [Xp(n.x) + 8, Yp(n.y)]]));
      const spots = [T - 6, T + ph * .3, T + ph * .55, T + ph - bh - 12].flatMap(y => [[W - R - lw - 6, y], [L + 8, y]]);
      const cnt = ([x, y]) => pts.filter(([px, py]) => px >= x - 4 && px <= x + lw + 10 && py >= y - 4 && py <= y + bh + 4).length;
      const [bx, by] = spots.reduce((b, s) => cnt(s) < cnt(b) ? s : b), dx = bx - (W - R - lw - 6), dy = by - (T - 6);
      leg = `<g transform="translate(${r1(dx)} ${r1(dy)})"><rect x="${r1(W - R - lw - 6)}" y="${T - 6}" width="${r1(lw + 6)}" height="${bh}" rx="6" class="vz-leg"/>${leg}</g>`;
    }
    return svg(W, H, arrowDef(id + 'a') + g + leg, 'vz-plot');
  }

  /* ---------- graph ---------- */
  function parseNode(tok, nodes) {
    const m = tok.trim().match(/^([^\s\[\(\{]+)\s*(\(\((.*)\)\)|\[(.*)\]|\((.*)\)|\{(.*)\})?\s*(\*)?$/);
    if (!m) throw new Error('节点写法有误：' + tok);
    const id = m[1], n = nodes.get(id) || { id, label: id, shape: 'box', order: nodes.size };
    if (m[3] != null) Object.assign(n, { label: m[3], shape: 'circle' }); else if (m[4] != null) Object.assign(n, { label: m[4], shape: 'box' }); else if (m[5] != null) Object.assign(n, { label: m[5], shape: 'round' }); else if (m[6] != null) Object.assign(n, { label: m[6], shape: 'diamond' });
    if (m[7]) n.hl = true;
    nodes.set(id, n); return id;
  }
  function graph(src) {
    const nodes = new Map(), edges = []; let dir = 'TB', layout = '';
    for (const raw of src.split('\n')) {
      const line = raw.replace(/\s+#.*$/, '').trim(); if (!line || line.startsWith('#')) continue;
      let m;
      if ((m = line.match(/^dir(?:ection)?\s*[:：]?\s*(LR|TB|RL|BT)$/i))) { dir = m[1].toUpperCase(); continue; }
      if ((m = line.match(/^layout\s*[:：]?\s*(\w+)$/i))) { layout = m[1].toLowerCase(); continue; }
      let lab = ''; const lm = line.match(/^(.*?)\s*[:：]\s*([^:：\]\)\}]*)$/);
      const body = lm && /(-\.?->|<->|--|->)/.test(lm[1]) ? (lab = lm[2].trim(), lm[1]) : line;
      const parts = body.split(/\s*(<->|-\.->|->|--)\s*/);
      if (parts.length === 1) { parseNode(parts[0], nodes); continue; }
      for (let i = 0; i + 2 < parts.length; i += 2) {
        const a = parseNode(parts[i], nodes), op = parts[i + 1], b = parseNode(parts[i + 2], nodes);
        edges.push({ a, b, dir: op !== '--', both: op === '<->', dash: op === '-.->', label: lab });
      }
    }
    if (!nodes.size) throw new Error('没有节点');
    const N = [...nodes.values()], PAD = 12;
    N.forEach(n => { const w = tw(n.label); n.w = n.shape === 'circle' ? Math.max(34, w + 14) : n.shape === 'diamond' ? Math.max(70, w * 1.5 + 24) : Math.max(40, w + 2 * PAD); n.h = n.shape === 'circle' ? n.w : n.shape === 'diamond' ? Math.max(42, n.w * .5) : 34; });
    const undirected = edges.length && edges.every(e => !e.dir);
    if (layout === 'circle' || (undirected && layout !== 'layer')) {
      const k = N.length, maxW = Math.max(...N.map(n => n.w)), R = Math.max(78, (k * (maxW + 56)) / (2 * Math.PI));
      N.forEach((n, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / k; n.x = R + maxW / 2 + 10 + R * Math.cos(a); n.y = R + 30 + R * Math.sin(a); });
    } else {
      // 分层：沿 DFS 求最长路径分层（回边不参与），跨层的边在中间各层放占位点，把中间层的结点推开
      const out = new Map(N.map(n => [n.id, []])), back = new Set(), seen = new Map();
      edges.forEach((e, i) => out.get(e.a).push(i));
      const dfs = v => { seen.set(v, 1); for (const i of out.get(v)) { const w = edges[i].b; if (seen.get(w) === 1) back.add(i); else if (!seen.get(w)) dfs(w); } seen.set(v, 2); };
      N.forEach(n => { if (!seen.get(n.id)) dfs(n.id); });
      const rank = new Map(N.map(n => [n.id, 0]));
      back.forEach(i => edges[i].back = true);
      for (let it = 0; it < N.length; it++) edges.forEach((e, i) => { if (!back.has(i) && e.a !== e.b && rank.get(e.b) < rank.get(e.a) + 1) rank.set(e.b, rank.get(e.a) + 1); });
      const horiz = dir === 'LR' || dir === 'RL';
      const all = [...N], segs = [];
      edges.forEach(e => {
        e.span = Math.abs(rank.get(e.b) - rank.get(e.a)); e.via = [];
        if (e.a === e.b) return;
        const ra = rank.get(e.a), rb = rank.get(e.b), st = rb > ra ? 1 : -1;
        let prev = e.a;
        for (let r = ra + st; r !== rb && e.span > 1; r += st) {
          const lw = e.label && r === ra + st * Math.floor(e.span / 2) ? tw(e.label, 12) + 14 : 0;
          const d = { id: '\u0000' + all.length, dummy: true, w: horiz ? 12 : Math.max(16, lw), h: horiz ? Math.max(14, lw ? 20 : 0) : 12, lab: !!lw };
          rank.set(d.id, r); all.push(d); e.via.push(d); segs.push([prev, d.id]); prev = d.id;
        }
        if (e.span >= 1) segs.push([prev, e.b]);
      });
      const layers = []; all.forEach(n => (layers[rank.get(n.id)] ||= []).push(n));
      const pos = new Map(); const setPos = () => layers.forEach(l => l.forEach((n, i) => pos.set(n.id, i)));
      setPos();
      for (let pass = 0; pass < 6; pass++) layers.forEach((l, r) => { const up = pass % 2 === 0, rr = up ? r - 1 : r + 1; if (rr < 0 || rr >= layers.length) return;
        const nb = n => segs.filter(([u, v]) => (u === n.id && rank.get(v) === rr) || (v === n.id && rank.get(u) === rr)).map(([u, v]) => pos.get(u === n.id ? v : u));
        l.forEach(n => { const v = nb(n); n.bc = v.length ? v.reduce((a, b) => a + b, 0) / v.length : pos.get(n.id); }); l.sort((a, b) => a.bc - b.bc); setPos(); });
      const labW = Math.max(0, ...edges.filter(e => e.label && e.span <= 1).map(e => tw(e.label, 12) + 24)), GAPR = horiz ? Math.max(64, labW) : Math.max(58, edges.some(e => e.label && e.span <= 1) ? 64 : 0), GAPI = horiz ? 22 : 26;
      let off = 0; const span = l => l.reduce((s, n) => s + (horiz ? n.h : n.w), 0) + l.reduce((s, n, i) => s + (i ? (n.dummy || l[i - 1].dummy ? 14 : GAPI) : 0), 0), maxSpan = Math.max(...layers.map(span));
      layers.forEach(l => { const th = Math.max(...l.map(n => horiz ? n.w : n.h)); let c = (maxSpan - span(l)) / 2; l.forEach((n, i) => { if (i) c += n.dummy || l[i - 1].dummy ? 14 : GAPI; const s = horiz ? n.h : n.w; if (horiz) { n.x = off + th / 2; n.y = c + s / 2; } else { n.y = off + th / 2; n.x = c + s / 2; } c += s; }); off += th + GAPR; });
      if (dir === 'RL' || dir === 'BT') { const mx = Math.max(...all.map(n => horiz ? n.x : n.y)); all.forEach(n => horiz ? (n.x = mx - n.x) : (n.y = mx - n.y)); }
    }
    const id = 'vz' + (++uid), bx = [Math.min(...N.map(n => n.x - n.w / 2)), Math.max(...N.map(n => n.x + n.w / 2))], by = [Math.min(...N.map(n => n.y - n.h / 2)), Math.max(...N.map(n => n.y + n.h / 2))];
    const grow = (x, y) => { bx[0] = Math.min(bx[0], x); bx[1] = Math.max(bx[1], x); by[0] = Math.min(by[0], y); by[1] = Math.max(by[1], y); };
    const border = (n, dx, dy) => { // 从中心沿 (dx,dy) 方向到边框的距离比例
      if (!dx && !dy) return 0; const hw = n.w / 2, hh = n.h / 2;
      if (n.shape === 'circle' || n.shape === 'round') { const t = 1 / Math.sqrt((dx * dx) / (hw * hw) + (dy * dy) / (hh * hh)); return n.shape === 'round' ? Math.min(t, Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9))) : t; }
      if (n.shape === 'diamond') return 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
      return Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
    };
    let ge = '', gl = '', side = 0;
    const pairs = new Map(); edges.forEach(e => { const k = [e.a, e.b].sort().join('\u0000'); e.pi = pairs.get(k) || 0; pairs.set(k, e.pi + 1); });
    edges.forEach(e => {
      const A = nodes.get(e.a), Bn = nodes.get(e.b);
      if (A === Bn) { const x = A.x + A.w / 2, y = A.y; ge += `<path d="M${r1(x)} ${r1(y - 6)}c22 -18 22 30 0 12" class="vz-edge" fill="none"${e.dir ? ` marker-end="url(#${id})"` : ''}/>`; if (e.label) gl += pill(x + 24 + (tw(e.label, 12) + 10) / 2, y, e.label); return; }
      if (e.via && e.via.length) {
        const pts = [A, ...e.via, Bn].map(n => [n.x, n.y]);
        const ta = border(A, pts[1][0] - A.x, pts[1][1] - A.y), k = pts.length - 2, tb = border(Bn, pts[k][0] - Bn.x, pts[k][1] - Bn.y);
        pts[0] = [A.x + (pts[1][0] - A.x) * ta, A.y + (pts[1][1] - A.y) * ta]; pts[k + 1] = [Bn.x + (pts[k][0] - Bn.x) * tb, Bn.y + (pts[k][1] - Bn.y) * tb];
        let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
        for (let i = 1; i < pts.length - 1; i++) { const [x, y] = pts[i], [nx, ny] = pts[i + 1], mx = i === pts.length - 2 ? nx : (x + nx) / 2, my = i === pts.length - 2 ? ny : (y + ny) / 2; d += `Q${r1(x)} ${r1(y)} ${r1(mx)} ${r1(my)}`; grow(x, y); }
        ge += `<path d="${d}" class="vz-edge${e.dash ? ' dash' : ''}" fill="none"${e.dir ? ` marker-end="url(#${id})"` : ''}${e.both ? ` marker-start="url(#${id})"` : ''}/>`;
        if (e.label) { const L = e.via.find(v => v.lab) || e.via[Math.floor(e.via.length / 2)]; gl += pill(L.x, L.y, e.label); }
        return;
      }
      const dx = Bn.x - A.x, dy = Bn.y - A.y, ta = border(A, dx, dy), tb = border(Bn, -dx, -dy);
      const x1 = A.x + dx * ta, y1 = A.y + dy * ta, x2 = Bn.x - dx * tb, y2 = Bn.y - dy * tb;
      const cnt = pairs.get([e.a, e.b].sort().join('\u0000')), bend = cnt > 1 ? (e.pi - (cnt - 1) / 2) * 36 * (e.a < e.b ? 1 : -1) : e.back ? (side++ % 2 ? -1 : 1) * 34 : 0;
      const mx = (x1 + x2) / 2 - dy / Math.hypot(dx, dy) * bend, my = (y1 + y2) / 2 + dx / Math.hypot(dx, dy) * bend; grow(mx, my);
      ge += `<path d="M${r1(x1)} ${r1(y1)}Q${r1(mx)} ${r1(my)} ${r1(x2)} ${r1(y2)}" class="vz-edge${e.dash ? ' dash' : ''}" fill="none"${e.dir ? ` marker-end="url(#${id})"` : ''}${e.both ? ` marker-start="url(#${id})"` : ''}/>`;
      if (e.label) gl += pill(mx, my, e.label);
    });
    function pill(x, y, s) { const w = tw(s, 12) + 10; grow(x - w / 2, y - 10); grow(x + w / 2, y + 10); return `<rect x="${r1(x - w / 2)}" y="${r1(y - 9)}" width="${r1(w)}" height="18" rx="9" class="vz-pill"/>${label(x, y, s, { fs: 12, cls: 'vz-el' })}`; }
    const gn = N.map(n => {
      const cls = 'vz-node' + (n.hl ? ' hl' : ''), x = n.x - n.w / 2, y = n.y - n.h / 2;
      const shape = n.shape === 'circle' ? `<circle cx="${r1(n.x)}" cy="${r1(n.y)}" r="${r1(n.w / 2)}" class="${cls}"/>` : n.shape === 'diamond' ? `<path d="M${r1(n.x)} ${r1(y)}L${r1(n.x + n.w / 2)} ${r1(n.y)}L${r1(n.x)} ${r1(y + n.h)}L${r1(x)} ${r1(n.y)}z" class="${cls}"/>` : `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(n.w)}" height="${r1(n.h)}" rx="${n.shape === 'round' ? n.h / 2 : 7}" class="${cls}"/>`;
      return shape + label(n.x, n.y + .5, n.label);
    }).join('');
    const ox = 10 - bx[0], oy = 10 - by[0];
    return svg(bx[1] - bx[0] + 20, by[1] - by[0] + 20, arrowDef(id) + `<g transform="translate(${r1(ox)} ${r1(oy)})">` + ge + gn + gl + '</g>', 'vz-graph');
  }

  /* ---------- tree ---------- */
  function tree(src) {
    const lines = src.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
    const root = { kids: [], depth: -1 }, stack = [{ n: root, ind: -1 }];
    for (const l of lines) {
      const ind = l.match(/^\s*/)[0].replace(/\t/g, '  ').length; let t = l.trim(), el = '';
      const em = t.match(/^<([^>]*)>\s*(.*)$/); if (em) { el = em[1]; t = em[2]; }
      const hl = /\s\*$/.test(t) || t.endsWith(' *'); t = t.replace(/\s\*$/, '');
      while (stack.length > 1 && stack[stack.length - 1].ind >= ind) stack.pop();
      const parent = stack[stack.length - 1].n, n = { label: t, empty: t === '-' || t === '∅', hl, el, kids: [], depth: parent.depth + 1 };
      parent.kids.push(n); stack.push({ n, ind });
    }
    const roots = root.kids; if (!roots.length) throw new Error('树是空的');
    const all = []; const walk = n => { all.push(n); n.kids.forEach(walk); }; roots.forEach(walk);
    const maxLab = Math.max(...all.filter(n => !n.empty).map(n => tw(n.label)));
    const circle = maxLab <= 26, NW = circle ? 34 : maxLab + 20, NH = circle ? 34 : 30, GX = circle ? 12 : 14, GY = 52;
    let slot = 0; const place = n => { if (!n.kids.length) { n.x = slot++ * (NW + GX); return; } n.kids.forEach(place); n.x = (n.kids[0].x + n.kids[n.kids.length - 1].x) / 2; };
    roots.forEach(r => { place(r); slot += .5; });
    // 二叉树只有一个孩子时，按 - 占位区分左右：已由占位节点占位实现
    const id = 'vz' + (++uid); let ge = '', gn = '';
    all.forEach(n => { n.cx = n.x + NW / 2 + 10; n.cy = n.depth * (NH + GY) + NH / 2 + 10; });
    all.forEach(n => n.kids.forEach(k => { if (k.empty) return; const dx = k.cx - n.cx, dy = k.cy - n.cy, d = Math.hypot(dx, dy), s = circle ? NW / 2 : NH / 2 + 2;
      ge += `<line x1="${r1(n.cx + dx / d * s)}" y1="${r1(n.cy + dy / d * s)}" x2="${r1(k.cx - dx / d * s)}" y2="${r1(k.cy - dy / d * s)}" class="vz-edge"/>`;
      if (k.el) gn += label((n.cx + k.cx) / 2 + (dx < 0 ? -8 : dx > 0 ? 8 : 10), (n.cy + k.cy) / 2, k.el, { fs: 12, cls: 'vz-el' }); }));
    all.forEach(n => { if (n.empty) return; const cls = 'vz-node' + (n.hl ? ' hl' : '');
      gn += (circle ? `<circle cx="${r1(n.cx)}" cy="${r1(n.cy)}" r="${NW / 2}" class="${cls}"/>` : `<rect x="${r1(n.cx - NW / 2)}" y="${r1(n.cy - NH / 2)}" width="${NW}" height="${NH}" rx="8" class="${cls}"/>`) + label(n.cx, n.cy + .5, n.label); });
    const W = Math.max(...all.map(n => n.cx)) + NW / 2 + 10, H = Math.max(...all.map(n => n.cy)) + NH / 2 + 10;
    return svg(W, H, ge + gn, 'vz-tree');
  }

  /* ---------- cells ---------- */
  function cells(src) {
    const rows = []; let last = null;
    const splitCells = s => s.split('|').map(x => x.trim()).filter((x, i, a) => x !== '' || (i > 0 && i < a.length - 1));
    const cell = c => { const w = c.match(/^(.*?)@(\d+(?:\.\d+)?)$/); let t = (w ? w[1] : c).trim(), note = ''; const n = t.match(/^(.*?)\s*=>\s*(.*)$/); if (n) { t = n[1]; note = n[2]; } return { t: t.replace(/\s\*$/, ''), hl: /\s\*$/.test(t), w: w ? +w[2] : 0, note }; };
    for (const raw of src.split('\n')) {
      const line = raw.trim(); if (!line || line.startsWith('#')) continue;
      const m = line.match(/^(arr|list|stack|col|idx|ptr|text)\s*(?:\[([^\]]*)\])?\s*[:：]?\s*(.*)$/); if (!m) throw new Error('cells 每行以 arr / list / stack / col / idx / ptr / text 开头');
      let [, k, title, rest] = m; let note = ''; const nm = rest.match(/^(.*?)\s*>>\s*(.*)$/); if (nm) { rest = nm[1]; note = nm[2]; }
      if (['arr', 'list', 'stack', 'col'].includes(k)) { last = { k, title: (title || '').trim(), note, cells: splitCells(rest).map(cell), idx: null, ptr: [] }; rows.push(last); }
      else if (k === 'idx' && last) last.idx = /^auto$/i.test(rest) || !rest ? last.cells.map((_, i) => String(i)) : splitCells(rest).length > 1 ? splitCells(rest) : rest.split(/\s+/);
      else if (k === 'ptr' && last) last.ptr.push(...splitCells(rest).flatMap(p => p.split(/[;；]/)).map(p => p.trim().match(/^(\d+)\s*[=＝:：]\s*(.+)$/)).filter(Boolean).map(p => ({ i: +p[1], s: p[2] })));
      else if (k === 'text') { rows.push({ k: 'text', t: rest }); last = null; }
    }
    if (!rows.length) throw new Error('没有内容');
    const id = 'vz' + (++uid); let g = '', y = 10, W = 0; const CH = 34;
    const titleW = Math.max(0, ...rows.filter(r => r.title).map(r => tw(r.title, 12) + 12));
    // 带 @ 宽度的格子全图共用一个单位宽度，各行按位数对齐；太窄的格子缩小字号
    const need = rows.flatMap(r => (r.cells || []).filter(c => c.w && c.t !== '~').map(c => (tw(c.t) + 10) / c.w));
    const rowW = Math.max(1, ...rows.map(r => (r.cells || []).reduce((s, c) => s + (c.w || 0), 0))), unit = need.length ? Math.min(Math.max(...need, 34), 380 / rowW) : 0;
    const fit = (t, w) => { const n = tw(t); return n > w - 6 ? Math.max(8.5, FS * (w - 6) / n) : 0; };
    const txt = (x, y, t, w) => { const f = fit(t, w); return label(x, y, t, f ? { fs: r1(f) } : {}); };
    rows.forEach((r, ri) => {
      if (r.k === 'text') { g += label(10, y + 9, r.t, { a: 'start', cls: 'vz-tk' }); y += 24; W = Math.max(W, 20 + tw(r.t, 12)); return; }
      if (r.k === 'stack' || r.k === 'col') {
        const cw = Math.max(70, ...r.cells.map(c => tw(c.t) + 24)), x = 10 + titleW, y0 = y;
        if (r.title) g += label(10 + titleW - 10, y + CH / 2, r.title, { a: 'end', cls: 'vz-tk' });
        let nw = 0;
        r.cells.forEach((c, i) => { g += `<rect x="${x}" y="${y}" width="${cw}" height="${CH}" class="vz-cell${c.hl ? ' hl' : ''}"/>` + label(x + cw / 2, y + CH / 2 + .5, c.t);
          const n = c.note || (r.k === 'stack' && i === 0 ? '← 栈顶' : ''); if (n) { g += label(x + cw + 10, y + CH / 2, n, { a: 'start', cls: 'vz-tk' }); nw = Math.max(nw, tw(n, 12) + 16); } y += CH; });
        if (r.k === 'stack') g += `<path d="M${x - 6} ${y0 - 6}V${y + 4}H${x + cw + 6}V${y0 - 6}" fill="none" class="vz-ax"/>`;
        W = Math.max(W, x + cw + nw + 10); y += 16; return;
      }
      const list = r.k === 'list';
      const ws = r.cells.map(c => c.w ? c.w * unit : Math.max(list ? 44 : 34, tw(c.t) + 18)), GAP = list ? 30 : 0;
      let x = 10 + titleW; const xs = [];
      if (r.title) g += label(10 + titleW - 10, y + CH / 2, r.title, { a: 'end', cls: 'vz-tk' });
      r.cells.forEach((c, i) => { xs.push(x); const nul = list && /^(null|nil|∧|\^|∅)$/i.test(c.t);
        if (c.t === '~') { x += ws[i] + GAP; return; }
        if (nul) g += label(x + 4, y + CH / 2, c.t === '^' ? '∧' : c.t, { a: 'start', cls: 'vz-tk' });
        else { g += `<rect x="${r1(x)}" y="${y}" width="${r1(ws[i])}" height="${CH}" rx="${list ? 6 : 0}" class="vz-cell${c.hl ? ' hl' : ''}"/>` + txt(x + ws[i] / 2, y + CH / 2 + .5, c.t, ws[i]);
          if (list && i < r.cells.length - 1) g += `<line x1="${r1(x + ws[i])}" y1="${y + CH / 2}" x2="${r1(x + ws[i] + GAP - 2)}" y2="${y + CH / 2}" class="vz-edge" marker-end="url(#${id})"/>`; }
        x += ws[i] + GAP; });
      if (r.note) g += label(x - GAP + 12, y + CH / 2, r.note, { a: 'start', cls: 'vz-tk' });
      W = Math.max(W, x - GAP + (r.note ? tw(r.note, 12) + 20 : 10));
      y += CH;
      if (r.idx) { r.idx.forEach((s, i) => { if (xs[i] != null && s) g += label(xs[i] + ws[i] / 2, y + 10, s, { cls: 'vz-tk', fs: 11 }); }); y += 18; }
      if (r.ptr.length) { const by = y + 4; r.ptr.forEach(p => { if (xs[p.i] == null) return; const cx = xs[p.i] + ws[p.i] / 2; g += `<line x1="${r1(cx)}" y1="${by + 20}" x2="${r1(cx)}" y2="${by + 2}" class="vz-ptr" marker-end="url(#${id}p)"/>` + label(cx, by + 30, p.s, { cls: 'vz-pl', fs: 12 }); W = Math.max(W, cx + tw(p.s, 12) / 2 + 10); }); y += 42; }
      // 连续的、没有标题注释的格子行紧贴在一起（如 IP 首部），否则留出间距
      const nx = rows[ri + 1], tight = nx && nx.k === r.k && !r.title && !nx.title && !r.note && !r.idx && !r.ptr.length;
      if (!tight) y += 12;
    });
    const defs = arrowDef(id) + `<defs><marker id="${id}p" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1L10 5L0 9z" fill="var(--accent)"/></marker></defs>`;
    return svg(W + 10, y, defs + g, 'vz-cells');
  }


  /* ---------- seq：时序图 ---------- */
  function seq(src) {
    const parts = [], steps = [];
    const P = n => { n = n.trim(); if (!parts.includes(n)) parts.push(n); return parts.indexOf(n); };
    for (const raw of src.split('\n')) {
      const line = raw.trim(); if (!line || line.startsWith('#')) continue; let m;
      if ((m = line.match(/^(?:participant|参与者)\s+(.+)$/))) { P(m[1]); continue; }
      if ((m = line.match(/^-{2,}\s*(.*?)\s*-*$/))) { steps.push({ k: 'div', s: m[1] }); continue; }
      if ((m = line.match(/^note\s+([^:：]+)[:：]\s*(.+)$/i))) { steps.push({ k: 'note', p: P(m[1]), s: m[2] }); continue; }
      if ((m = line.match(/^(.+?)\s*(-->|->)\s*(.+?)\s*(?:[:：]\s*(.*))?$/))) { steps.push({ k: 'msg', a: P(m[1]), b: P(m[3]), dash: m[2] === '-->', s: m[4] || '' }); continue; }
      throw new Error('时序图每行写成：甲 -> 乙 : 消息');
    }
    if (!parts.length) throw new Error('没有参与者');
    const gap = Math.max(110, ...steps.filter(s => s.k === 'msg' && s.a !== s.b).map(s => (tw(s.s, 12) + 30) / Math.abs(s.a - s.b)), ...parts.map(p => tw(p) + 30));
    const cx = i => 12 + Math.max(tw(parts[0]) + 24, 60) / 2 + i * gap, id = 'vz' + (++uid);
    let y = 44, g = '';
    const body = steps.map(st => {
      let out = '';
      if (st.k === 'msg') {
        const x1 = cx(st.a), x2 = cx(st.b);
        if (st.a === st.b) { out = `<path d="M${r1(x1)} ${y}h30v18h-30" fill="none" class="vz-edge" marker-end="url(#${id})"/>` + label(x1 + 36, y + 9, st.s, { a: 'start', fs: 12 }); y += 34; return out; }
        out = label((x1 + x2) / 2, y - 8, st.s, { fs: 12 }) + `<line x1="${r1(x1)}" y1="${y}" x2="${r1(x2 + (x2 > x1 ? -2 : 2))}" y2="${y}" class="vz-edge${st.dash ? ' dash' : ''}" marker-end="url(#${id})"/>`; y += 34; return out;
      }
      if (st.k === 'note') { const w = tw(st.s, 12) + 14; out = `<rect x="${r1(cx(st.p) - w / 2)}" y="${y - 12}" width="${r1(w)}" height="22" rx="6" class="vz-pill"/>` + label(cx(st.p), y - 1, st.s, { fs: 12 }); y += 30; return out; }
      const x0 = cx(0) - 30, x1 = cx(parts.length - 1) + 30;
      out = `<line x1="${r1(x0)}" x2="${r1(x1)}" y1="${y - 4}" y2="${y - 4}" class="vz-ref"/>` + (st.s ? `<rect x="${r1((x0 + x1) / 2 - tw(st.s, 12) / 2 - 8)}" y="${y - 14}" width="${r1(tw(st.s, 12) + 16)}" height="20" rx="10" class="vz-pill"/>` + label((x0 + x1) / 2, y - 4, st.s, { fs: 12, cls: 'vz-el' }) : ''); y += 28; return out;
    }).join('');
    const H = y + 6;
    parts.forEach((p, i) => { const w = Math.max(tw(p) + 24, 60); g += `<line x1="${r1(cx(i))}" x2="${r1(cx(i))}" y1="30" y2="${H - 4}" class="vz-life"/><rect x="${r1(cx(i) - w / 2)}" y="4" width="${r1(w)}" height="26" rx="7" class="vz-node"/>` + label(cx(i), 17.5, p); });
    const W = cx(parts.length - 1) + Math.max(tw(parts[parts.length - 1]) + 24, 60) / 2 + 12 + Math.max(0, ...steps.filter(s => s.k === 'msg' && s.a === s.b).map(s => tw(s.s, 12) + 40));
    return svg(W, H, arrowDef(id) + g + body, 'vz-seq');
  }

  /* ---------- 兼容 Mermaid：AI 常写的流程图、时序图、饼图，转换成内置写法 ---------- */
  function fromMermaid(src) {
    const lines = src.split('\n').map(l => l.replace(/%%.*$/, '').replace(/;\s*$/, '').trim()).filter(Boolean);
    const head = lines[0] || '';
    const unq = s => s.replace(/^["'`]|["'`]$/g, '').replace(/<br\s*\/?>/gi, ' ');
    if (/^sequenceDiagram/i.test(head)) {
      const alias = {}, out = [];
      for (const l of lines.slice(1)) { let m;
        if ((m = l.match(/^(?:participant|actor)\s+(\S+)(?:\s+as\s+(.+))?$/i))) { alias[m[1]] = unq(m[2] || m[1]); out.push('participant ' + alias[m[1]]); continue; }
        const A = n => alias[n.trim()] || unq(n.trim());
        if ((m = l.match(/^note\s+(?:over|left of|right of)\s+([^:,]+)(?:,[^:]+)?\s*:\s*(.+)$/i))) { out.push(`note ${A(m[1])} : ${m[2]}`); continue; }
        if ((m = l.match(/^(alt|else|opt|loop|par|critical|break|rect)\b\s*(.*)$/i))) { if (m[2] && !/^rgb/.test(m[2])) out.push(`--- ${m[2]} ---`); continue; }
        if (/^(end|activate|deactivate|autonumber|title)\b/i.test(l)) continue;
        if ((m = l.match(/^(.+?)\s*(-->>|->>|-->|->|--x|-x|--\)|-\))\s*[+-]?\s*(.+?)\s*:\s*(.*)$/))) { out.push(`${A(m[1])} ${m[2].startsWith('--') ? '-->' : '->'} ${A(m[3])} : ${m[4]}`); continue; }
      }
      return { lang: 'seq', code: out.join('\n') };
    }
    if (/^pie\b/i.test(head)) {
      const parts = lines.slice(1).map(l => l.match(/^["']?(.+?)["']?\s*:\s*([\d.]+)$/)).filter(Boolean).map(m => `${m[1]}:${m[2]}`);
      const t = (head.match(/title\s+(.+)$/) || lines.find(l => /^title\s/.test(l))?.match(/^title\s+(.+)$/) || [])[1] || '';
      return { lang: 'plot', code: `bar ${parts.join(' | ')}${t ? `\ny 0..${Math.max(...parts.map(p => +p.split(':').pop())) * 1.15} ${t}` : ''}` };
    }
    const dm = head.match(/^(?:graph|flowchart)\s*(TD|TB|LR|RL|BT)?/i), out = [];
    if (dm) out.push('dir ' + ((dm[1] || 'TB').toUpperCase() === 'TD' ? 'TB' : (dm[1] || 'TB').toUpperCase()));
    for (let l of dm ? lines.slice(1) : lines) {
      if (/^(classDef|class|style|linkStyle|subgraph|end|direction|click)\b/i.test(l)) continue;
      l = l.replace(/:::\w+/g, '');
      let lab = '';
      l = l.replace(/(<?)(--|==|-\.)\s*([^-=>.|][^>|]*?)\s*(-->|==>|\.->)/, (_, lt, a, t) => { lab = unq(t.trim()); return lt ? ' <-> ' : a === '-.' ? ' -.-> ' : ' -> '; });
      l = l.replace(/(<?-{2,3}>|<?={2,3}>|-\.+->|-{3,}|<-->)\s*\|([^|]*)\|/g, (_, a, t) => { lab = unq(t.trim()); return a; });
      l = l.replace(/<-{2,3}>|<={2,3}>/g, '<->').replace(/-\.+->/g, '-.->').replace(/={2,3}>/g, '->').replace(/-{2,3}>/g, '->').replace(/-{3,}/g, '--');
      l = l.replace(/\(\[([^\]]*)\]\)/g, '($1)').replace(/\[\[([^\]]*)\]\]/g, '[$1]').replace(/\[\(([^)]*)\)\]/g, '[$1]').replace(/\{\{([^}]*)\}\}/g, '{$1}').replace(/(\w)>([^\]>]*)\]/g, '$1[$2]').replace(/\[\/([^\]]*)\/\]/g, '[$1]').replace(/\[\\([^\]]*)\\\]/g, '[$1]');
      l = l.replace(/([\[\(\{])\s*"([^"]*)"\s*([\]\)\}])/g, '$1$2$3').replace(/&\s*/g, '');
      out.push(lab ? `${l} : ${lab}` : l);
    }
    return { lang: 'graph', code: out.join('\n') };
  }
  const looksMermaid = (lang, src) => lang === 'mermaid' || (lang === 'graph' && /^\s*(graph|flowchart)\s*(TD|TB|LR|RL|BT)?\s*;?\s*$/im.test(src.split('\n').find(l => l.trim()) || '')) || (lang === 'graph' && /-->|==>/.test(src)) || (lang === 'seq' && /->>|^\s*sequenceDiagram/m.test(src));

  const KINDS = { plot, graph, tree, cells, seq };
  return {
    has: lang => lang in KINDS || lang === 'mermaid',
    render(lang, code) {
      try {
        if (looksMermaid(lang, code)) ({ lang, code } = fromMermaid(code));
        if (!(lang in KINDS)) throw new Error('暂不支持这种图');
        return `<figure class="viz" title="点开放大查看">${KINDS[lang](code)}<span class="vz-zoom" aria-hidden="true">${ico('grow')}</span></figure>`;
      }
      catch (e) { return `<pre class="fig"><code>${esc(code)}</code></pre><p class="small" style="color:var(--bad)">图示无法绘制：${esc(e.message || e)}</p>`; }
    },
    compile
  };
})();
