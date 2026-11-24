/* ============ Markdown + 公式 ============ */
function tex(src, display) {
  if (window.katex) { try { return katex.renderToString(src, { output: 'htmlAndMathml', displayMode: display, throwOnError: false, strict: false }); } catch {} }
  return `<code class="tex">${esc(src)}</code>`;
}
const CALLOUT = { analogy: ['打个比方', 'spark'], key: ['重点', 'star'], example: ['例题', 'pen'], warn: ['易错', 'alert'], exam: ['怎么考', 'target'], tip: ['记忆', 'bulb'], why: ['为什么', 'chat'], note: ['补充', 'list'] };
function callout(ty, ttl, body) { const k = CALLOUT[ty] ? ty : 'note', [l, ic] = CALLOUT[k]; return `<div class="co co-${k}"><div class="coh">${ico(ic)}<span>${esc(ttl.trim() || l)}</span></div><div class="cob md">${md(body.trim())}</div></div>`; }
function md(src, opt = {}) {
  const slots = [], put = html => `\u0000${slots.push(html) - 1}\u0000`;
  let s = String(src ?? '').replace(/\r/g, '');
  { const fences = s.match(/^[ \t>]*```/gm) || []; if (fences.length % 2) { const i = s.lastIndexOf('```'), lang = (s.slice(i + 3).match(/^(\w+)/) || [])[1]; if (lang && Viz.has(lang)) s = s.slice(0, i) + '\n' + put('<div class="viz-wait"><span class="spin"></span>正在画图…</div>') + '\n'; } }
  s = s.replace(/^>[ \t]*\[!(\w+)\][ \t]*(.*)\n?((?:^>.*(?:\n|$))*)/gm, (_, ty, ttl, body) => '\n' + put(callout(ty, ttl, body.replace(/^>[ \t]?/gm, ''))) + '\n');
  s = s.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, lang, code) => '\n' + put(Viz.has(lang.trim()) ? Viz.render(lang.trim(), code) : `<pre class="${lang.trim() === 'diagram' ? 'fig' : ''}"><code>${esc(code.replace(/\n$/, ''))}</code></pre>`) + '\n');
  let cz = 0;
  s = s.replace(/\{\{([\s\S]+?)\}\}/g, (_, a) => opt.cloze ? put(`<span class="cz${opt.revealAll || opt.revealed?.has(cz) ? ' on' : ''}" data-act="cz" data-i="${cz++}"><span class="cza">${md(a, { inline: true })}</span></span>`) : put(`<mark>${md(a, { inline: true })}</mark>`));
  s = s.replace(/`([^`\n]+)`/g, (_, c) => put(`<code>${esc(c)}</code>`));
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => '\n' + put(`<div class="mblock">${tex(t.trim(), true)}</div>`) + '\n');
  s = s.replace(/\$([^\$\n]+?)\$/g, (_, t) => put(tex(t, false)));
  s = esc(s);
  const inl = t => t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/==([^=]+)==/g, '<mark>$1</mark>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  let html;
  if (opt.inline) html = inl(s).replace(/\n/g, '<br>');
  else {
    const lines = s.split('\n'), out = []; let i = 0;
    const isSep = l => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
    const cells = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(x => inl(x.trim()));
    const ul = /^\s*[-*]\s+/, ol = /^\s*\d+[.)]\s+/, slot = l => /^\u0000\d+\u0000$/.test(l.trim());
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) { i++; continue; }
      if (slot(l)) { out.push(l.trim()); i++; continue; }
      if (l.trim().startsWith('|') && i + 1 < lines.length && isSep(lines[i + 1])) {
        const head = cells(l); i += 2; const rows = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
        out.push(`<div class="tbl"><table><thead><tr>${head.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      if (ul.test(l) || ol.test(l)) {
        const ordered = ol.test(l) && !ul.test(l), re = ordered ? ol : ul, items = [];
        while (i < lines.length && (re.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
          const ln = lines[i], last = items[items.length - 1];
          if (re.test(ln) && !(/^\s{2,}/.test(ln) && items.length)) items.push({ t: ln.replace(re, ''), sub: [] });
          else if (/^\s{2,}(?:[-*]|\d+[.)])\s+/.test(ln)) last.sub.push(ln.trim().replace(/^(?:[-*]|\d+[.)])\s+/, ''));
          else if (last.sub.length) last.sub[last.sub.length - 1] += '<br>' + ln.trim(); else last.t += '<br>' + ln.trim();
          i++;
        }
        out.push(`<${ordered ? 'ol' : 'ul'}>${items.map(x => `<li>${inl(x.t)}${x.sub.length ? `<ul class="sub">${x.sub.map(y => `<li>${inl(y)}</li>`).join('')}</ul>` : ''}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
        continue;
      }
      if (/^#{1,4}\s/.test(l)) { out.push(`<h4>${inl(l.replace(/^#+\s/, ''))}</h4>`); i++; continue; }
      if (/^&gt;\s?/.test(l)) { const q = []; while (i < lines.length && /^&gt;\s?/.test(lines[i])) q.push(lines[i++].replace(/^&gt;\s?/, '')); out.push(`<blockquote>${inl(q.join('<br>'))}</blockquote>`); continue; }
      const p = []; while (i < lines.length && lines[i].trim() && !slot(lines[i]) && !(ul.test(lines[i]) || ol.test(lines[i])) && !lines[i].trim().startsWith('|')) p.push(lines[i++]);
      if (!p.length) { out.push(`<p>${inl(lines[i++])}</p>`); continue; }
      out.push(`<p>${inl(p.join('<br>'))}</p>`);
    }
    html = out.join('');
  }
  for (let k = 0; k < 3 && html.includes('\u0000'); k++) html = html.replace(/\u0000(\d+)\u0000/g, (_, n) => slots[n]);
  return html;
}
const plain = s => String(s || '').split('\n').map(l => l.replace(/^\s*>\s*\[!\w+\]\s*/, '').replace(/^\s*(?:[-*]|\d+[.)]|#{1,4}|>)\s+/, '').replace(/^\s*\|?[\s:|-]+\|?\s*$/, '')).join(' ')
  .replace(/```[\s\S]*?```/g, ' ').replace(/\$\$?([^$]+)\$\$?/g, '$1').replace(/\\(?:mathrm|text|operatorname)\{([^}]*)\}/g, '$1').replace(/\\([a-zA-Z]+)/g, '$1').replace(/[{}]/g, '')
  .replace(/\*\*/g, '').replace(/`|==(?=\S)|\|/g, ' ').replace(/\s+/g, ' ').trim();
