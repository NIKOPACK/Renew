/* ============ 偏好设置 ============ */
const FONTS = {
  system: { label: '系统默认', css: 'var(--ui)' },
  sans: { label: '思源黑体', css: '"Noto Sans SC",var(--ui)', href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700;800&display=swap' },
  serif: { label: '思源宋体', css: '"Noto Serif SC","Songti SC",serif', href: 'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700;800&display=swap' }
};
function applyPrefs() {
  const p = P(), r = document.documentElement, st = r.style;
  st.setProperty('--fs', p.fs + 'px'); st.setProperty('--lh', p.lh); st.setProperty('--math', p.math); st.setProperty('--code', p.code);
  st.setProperty('--tbl', p.tbl); st.setProperty('--pgap', p.pgap + 'em'); st.setProperty('--pad', p.pad + 'px');
  const f = FONTS[p.font] || FONTS.system; st.setProperty('--font-body', f.css);
  if (f.href && !document.querySelector(`link[href="${f.href}"]`)) document.head.append(h(`<link rel="stylesheet" href="${f.href}">`));
  if (p.theme === 'auto') delete r.dataset.skin; else r.dataset.skin = p.theme;
  r.classList.toggle('nomotion', p.motion === false);
  Platform.onTheme?.();
  document.body.classList.toggle('snap', p.feed === 'snap');
  document.body.classList.toggle('wrapcode', !!p.wrapCode);
}
