/* ============ 工具 ============ */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const h = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
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
let toastTimer;
function toast(msg) { $$('.toast').forEach(x => x.remove()); const t = h(`<div class="toast" role="status">${esc(msg)}</div>`); document.body.append(t); clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 2600); }
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.append(s); }); }

/* 图标 */
const IC = {
  home: '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>',
  book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/><path d="M9 7h6"/>',
  review: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
  spark: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  back: '<path d="m15 18-6-6 6-6"/>', chev: '<path d="m9 18 6-6-6-6"/>', down: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>', plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M17 7 7 17M7 7l10 10"/>',
  more: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
  flame: '<path d="M12 21c3.9 0 6.5-2.6 6.5-6.4 0-3-1.8-5.3-3.4-7-.4 1.7-1.3 2.8-2.5 3.2-.3-2.6-1.6-5.3-4-7.8.2 2.8-1.3 4.9-2.8 6.7C4.6 11.4 5.5 12.9 5.5 14.6 5.5 18.4 8.1 21 12 21Z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16.2v.3"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>', layers: '<path d="M12 3 2.5 8 12 13l9.5-5z"/><path d="m2.5 12.5 9.5 5 9.5-5"/>',
  pen: '<path d="M12 20h8.5"/><path d="M16.2 3.8a2 2 0 0 1 2.9 2.9L7.5 18.3 3.5 19.5l1.2-4z"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h12.5l-2 4.2 2 4.3H5"/>', sync: '<path d="M20.5 12a8.5 8.5 0 0 1-15 5.4L3.5 15"/><path d="M3.5 20v-5h5"/><path d="M3.5 12a8.5 8.5 0 0 1 15-5.4l2 2.4"/><path d="M20.5 4v5h-5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
  upload: '<path d="M12 15.5V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 15.5v3A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5v-3"/>',
  camera: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.5"/>',
  chat: '<path d="M20.5 11.5a8 8 0 0 1-11.7 7.1L4 19.8l1.3-4.4a8 8 0 1 1 15.2-3.9Z"/>', wand: '<path d="m14.5 4.5 5 5L8 21l-5-5z"/><path d="m11.5 7.5 5 5"/><path d="M19 2v3M20.5 3.5h-3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7"/><path d="M9 7V4.5h6V7"/>',
  eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 5.2A9.5 9.5 0 0 1 12 5c5 0 8.5 4.5 9.5 7a13 13 0 0 1-2.6 3.7M6.3 6.6A13 13 0 0 0 2.5 12c1 2.5 4.5 7 9.5 7a9 9 0 0 0 4.4-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>', list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>',
  send: '<path d="M4 12 20 4l-6 16-2.5-6.5z"/>', file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  download: '<path d="M12 4v11.5M7.5 11 12 15.5 16.5 11"/><path d="M4 16v2.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V16"/>',
  aa: '<path d="M3.5 18 8 6l4.5 12M5.2 13.5h5.6"/><path d="M14.5 12.5c.6-1 1.7-1.5 3-1.5 1.8 0 3 1 3 2.8V18M20.5 15c-.6-.4-1.5-.6-2.6-.6-1.7 0-3.1.7-3.1 2s1 2 2.4 2c1.5 0 2.7-.9 3.3-2"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
  folder: '<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M3.5 11h17"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>', doc: '<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5A.5.5 0 0 1 6.5 20V4a.5.5 0 0 1 .5-.5Z"/><path d="M9.5 11h6M9.5 14.5h6M9.5 18h3.5"/>'
};
const ico = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ''}</svg>`;
function ring(p, size, w, color, track = true) {
  const r = 18 - w / 2 - .5, C = 2 * Math.PI * r, v = Math.max(0, Math.min(1, p)) * C;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 36 36" aria-hidden="true">${track ? `<circle class="rt" cx="18" cy="18" r="${r}" stroke-width="${w}"/>` : ''}${v > 0.01 ? `<circle cx="18" cy="18" r="${r}" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${v} ${C}" transform="rotate(-90 18 18)"/>` : ''}</svg>`;
}
