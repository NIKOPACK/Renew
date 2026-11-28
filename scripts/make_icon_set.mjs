// 生成界面图标集 src/js/001-icons.js（来源：Phosphor Icons，MIT 许可，https://phosphoricons.com）
// 用法：node scripts/make_icon_set.mjs        需要 devDependency @phosphor-icons/core
// 每个图标保存三种形态：r 线框（默认）、f 实心（选中的标签等）、b 双色图标的浅色底层（与线框叠加）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = path.join(ROOT, 'node_modules/@phosphor-icons/core/assets');
// App 内的图标名 → Phosphor 图标名（统一轻盈极简线框，仅极小箭头/关闭/确认使用 :bold 保持辨识度）
const MAP = {
  home: 'house', book: 'books', review: 'cards', spark: 'sparkle', gear: 'gear-six',
  back: 'caret-left:bold', chev: 'caret-right:bold', down: 'caret-down:bold', close: 'x:bold', x: 'x:bold',
  plus: 'plus', check: 'check:bold', more: 'dots-three', flame: 'fire', clock: 'clock', star: 'star',
  alert: 'warning-circle', play: 'play', layers: 'stack', pen: 'pencil-simple', flag: 'flag',
  sync: 'arrows-clockwise', calendar: 'calendar-blank', upload: 'upload-simple', camera: 'camera',
  chat: 'chat-circle-dots', wand: 'magic-wand', trash: 'trash', eyeoff: 'eye-slash', edit: 'note-pencil',
  list: 'list-bullets', bulb: 'lightbulb', target: 'target', send: 'arrow-up:bold', file: 'file',
  download: 'download-simple', aa: 'text-aa', stop: 'stop', folder: 'folder-simple', search: 'magnifying-glass',
  doc: 'file-text', bookmark: 'bookmark-simple', bookmarks: 'bookmarks-simple', minus: 'minus',
  image: 'image', notebook: 'notebook', lock: 'lock-simple', percent: 'percent', quote: 'quotes', imgadd: 'image-square', link: 'link-simple', eye: 'eye', listck: 'list-checks', textx: 'text-align-left', grow: 'arrows-out-simple', sum: 'list-magnifying-glass',
  // 课程封面的学科图标
  tree: 'tree-structure', cpu: 'cpu', terminal: 'terminal-window', network: 'network', globe: 'globe-hemisphere-east',
  brain: 'brain', fn: 'function', sigma: 'sigma', translate: 'translate', atom: 'atom', flask: 'flask', dna: 'dna',
  scroll: 'scroll', scales: 'scales', chart: 'chart-line-up', code: 'code', music: 'music-notes', palette: 'palette',
  nib: 'pen-nib', bookopen: 'book-open-text', student: 'student',
  // 对话输入框的附件
  mic: 'microphone', video: 'video', clip: 'paperclip', images: 'images', web: 'globe-simple',
  // 听学朗读与资料书本图标
  speaker: 'speaker-high', bookbm: 'book-bookmark',
  // 首页内容：自定义卡片、倒计时、置顶
  sliders: 'sliders-horizontal', hourglass: 'hourglass', pin: 'push-pin', grid: 'squares-four'
};
// 这些图标在 Phosphor duotone 中带人工底框/底圆，叠加在浅色按钮上会显得生硬，去掉底层
const NO_DUO_BG = new Set(['plus', 'minus', 'download', 'upload', 'sync', 'grow', 'close', 'x', 'check', 'send', 'back', 'chev', 'down']);
// 这些图标在 Phosphor fill 中外包了一层实心方框，用 tileIco 时保留清晰线框；其余统一采用扁平实心镂空（同 fire-fill）
const NO_TILE_FILL = new Set(['sync', 'list', 'translate', 'terminal', 'fn', 'chart', 'code', 'plus', 'minus', 'check', 'close', 'x', 'link']);
const inner = f => fs.readFileSync(f, 'utf8').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
const out = {};
for (const [name, spec] of Object.entries(MAP)) {
  const [ph, weight = 'regular'] = spec.split(':');
  const r = inner(path.join(A, weight, `${ph}${weight === 'regular' ? '' : '-' + weight}.svg`));
  const f = inner(path.join(A, 'fill', `${ph}-fill.svg`));
  const duo = inner(path.join(A, 'duotone', `${ph}-duotone.svg`));
  const b = NO_DUO_BG.has(name) ? '' : (duo.match(/<[^>]+opacity="0\.2"[^>]*\/>/g) || []).map(x => x.replace(/\s*opacity="0\.2"/, '')).join('');
  out[name] = { r, f, ...(b ? { b } : {}) };
}
const js = `/* ============ 图标（Phosphor Icons，MIT 许可，由 scripts/make_icon_set.mjs 生成，请勿手改） ============ */
const IC = ${JSON.stringify(out)};
const _NO_TILE_FILL = new Set(${JSON.stringify([...NO_TILE_FILL])});
/* ico(名称, 额外类名, 形态)：形态 '' 极简线框，'fill' 扁平实心镂空，'duo' 双色；tileIco 优先输出扁平实心镂空 */
const ico = (n, cls = '', w = '') => {
  const d = IC[n]; if (!d) return '';
  const body = w === 'fill' ? d.f : (w === 'duo' && d.b ? d.b.replace(/\\/>/g, ' opacity=".18"/>') : '') + d.r;
  return \`<svg class="ic \${cls}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">\${body}</svg>\`;
};
const tileIco = (n, cls = '') => ico(n, cls, _NO_TILE_FILL.has(n) ? '' : 'fill');
`;
fs.writeFileSync(path.join(ROOT, 'src/js/001-icons.js'), js);
console.log(`icons: ${Object.keys(out).length}, ${(js.length / 1024).toFixed(1)} KB`);
