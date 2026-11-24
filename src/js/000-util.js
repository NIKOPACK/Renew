/* ============ 工具 ============ */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const h = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const safeColor = (c, fb = '#2f5bea') => typeof c === 'string' && HEX_COLOR_RE.test(c.trim()) ? c.trim() : fb;
const safeId = s => typeof s === 'string' && SAFE_ID_RE.test(s) ? s : '';
const isPlainObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const DAY = 864e5, CUT = 4 * 3600e3;
const pad2 = n => String(n).padStart(2, '0');
function dayKey(ts = Date.now()) { const d = new Date(ts - CUT); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function dayStart(ts = Date.now()) { const d = new Date(ts - CUT); d.setHours(0, 0, 0, 0); return d.getTime() + CUT; }
const endOfToday = () => dayStart() + DAY;
function keyToDate(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
function daysBetween(a, b) { return Math.round((keyToDate(b) - keyToDate(a)) / DAY); }
function addDays(k, n) { const d = keyToDate(k); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
const WEEK = '日一二三四五六';
function fmtIvl(ms) {
  const m = ms / 60e3; if (m < 60) return Math.max(1, Math.round(m)) + '分钟';
  const d = ms / DAY; if (d < 1) return Math.round(ms / 3600e3) + '小时';
  if (d < 30) return Math.round(d) + '天'; if (d < 365) return (d / 30).toFixed(d < 300 ? 1 : 0).replace(/\.0$/, '') + '个月';
  return (d / 365).toFixed(1).replace(/\.0$/, '') + '年';
}
/* 按天安排的复习间隔：直接显示计划的天数，不随当前时刻变化 */
function fmtDays(d) {
  if (d <= 1) return '1天'; if (d < 14) return d + '天'; if (d < 30) return Math.round(d / 7) + '周';
  if (d < 365) return (d / 30).toFixed(d < 300 ? 1 : 0).replace(/\.0$/, '') + '个月';
  return (d / 365).toFixed(1).replace(/\.0$/, '') + '年';
}
const fmtNext = st => !st.ivl ? fmtIvl(st.due - Date.now()) + '后复习' : st.ivl === 1 ? '明天复习' : fmtDays(st.ivl) + '后复习';
let toastTimer;
function toast(msg) { $$('.toast').forEach(x => x.remove()); const t = h(`<div class="toast" role="status">${esc(msg)}</div>`); document.body.append(t); clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 2600); }
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.append(s); }); }

/* 图标 */
function ring(p, size, w, color, track = true) {
  const r = 18 - w / 2 - .5, C = 2 * Math.PI * r, v = Math.max(0, Math.min(1, p)) * C;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 36 36" aria-hidden="true">${track ? `<circle class="rt" cx="18" cy="18" r="${r}" stroke-width="${w}"/>` : ''}${v > 0.01 ? `<circle cx="18" cy="18" r="${r}" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${v} ${C}" transform="rotate(-90 18 18)"/>` : ''}</svg>`;
}
