// 生成界面图标集 src/js/001-icons.js（来源：Phosphor Icons，MIT 许可，https://phosphoricons.com）
// 用法：node scripts/make_icon_set.mjs        需要 devDependency @phosphor-icons/core
// 每个图标保存三种形态：r 线框（默认）、f 实心（选中的标签等）、b 双色图标的浅色底层（与线框叠加）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = path.join(ROOT, 'node_modules/@phosphor-icons/core/assets');
// App 内的图标名 → Phosphor 图标名（带 :bold 的使用粗体线框，保证小尺寸下清晰）
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
  image: 'image', notebook: 'notebook', quote: 'quotes', imgadd: 'image-square', link: 'link-simple', eye: 'eye', listck: 'list-checks', textx: 'text-align-left', grow: 'arrows-out-simple', sum: 'list-magnifying-glass',
  // 课程封面的学科图标
  tree: 'tree-structure', cpu: 'cpu', terminal: 'terminal-window', network: 'network', globe: 'globe-hemisphere-east',
  brain: 'brain', fn: 'function', sigma: 'sigma', translate: 'translate', atom: 'atom', flask: 'flask', dna: 'dna',
  scroll: 'scroll', scales: 'scales', chart: 'chart-line-up', code: 'code', music: 'music-notes', palette: 'palette',
  nib: 'pen-nib', bookopen: 'book-open-text', student: 'student'
};
const inner = f => fs.readFileSync(f, 'utf8').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
const out = {};
for (const [name, spec] of Object.entries(MAP)) {
  const [ph, weight = 'regular'] = spec.split(':');
  const r = inner(path.join(A, weight, `${ph}${weight === 'regular' ? '' : '-' + weight}.svg`));
  const f = inner(path.join(A, 'fill', `${ph}-fill.svg`));
  const duo = inner(path.join(A, 'duotone', `${ph}-duotone.svg`));
  const b = (duo.match(/<[^>]+opacity="0\.2"[^>]*\/>/g) || []).map(x => x.replace(/\s*opacity="0\.2"/, '')).join('');
  out[name] = { r, f, ...(b ? { b } : {}) };
}
const js = `/* ============ 图标（Phosphor Icons，MIT 许可，由 scripts/make_icon_set.mjs 生成，请勿手改） ============ */
const IC = ${JSON.stringify(out)};
/* ico(名称, 额外类名, 形态)：形态 '' 线框，'fill' 实心，'duo' 双色 */
const ico = (n, cls = '', w = '') => {
  const d = IC[n]; if (!d) return '';
  const body = w === 'fill' ? d.f : (w === 'duo' && d.b ? d.b.replace(/\\/>/g, ' opacity=".24"/>') : '') + d.r;
  return \`<svg class="ic \${cls}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">\${body}</svg>\`;
};
`;
fs.writeFileSync(path.join(ROOT, 'src/js/001-icons.js'), js);
console.log(`icons: ${Object.keys(out).length}, ${(js.length / 1024).toFixed(1)} KB`);
