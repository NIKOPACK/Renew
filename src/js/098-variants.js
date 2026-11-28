/* ============ 盲解验证与举一反三 ============ */
/* 模型不看给定答案独立解 3 次：多数一致才采用；答案是一个数时，还要求给出算式，用作图模块的安全求值器复核 */
const normAns = s => String(s ?? '').replace(/[\s，,。.；;：:、（）()【】\[\]"'“”‘’$\\]/g, '').replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).toLowerCase();
const asNum = s => { const t = String(s ?? '').trim().replace(/[，,]/g, '').replace(/\s+/g, ''); return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?%?$/i.test(t) ? parseFloat(t) / (t.endsWith('%') ? 100 : 1) : null; };
const numEq = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
/* 把各题型的答案统一成可比较的键 */
function ansKey(t, a) {
  if (a == null || a === '') return null;
  if (t === 'choice' || t === 'multi') {
    const xs = typeof a === 'number' ? [a] : Array.isArray(a) ? a : String(a).toUpperCase().match(/[A-F]/g)?.map(c => c.charCodeAt(0) - 65);
    if (!xs?.length) return null; return (t === 'choice' ? xs.slice(0, 1) : [...new Set(xs)].sort((x, y) => x - y)).join(',');
  }
  if (t === 'tf') { if (typeof a === 'boolean') return String(a); const s = String(a); return /^(对|正确|true|t|√|✓|是)$/i.test(s.trim()) ? 'true' : /^(错|错误|false|f|×|✗|否)$/i.test(s.trim()) ? 'false' : null; }
  const n = asNum(a); return n != null ? 'n:' + n : normAns(a) || null;
}
const keyEq = (x, y) => x != null && y != null && (x === y || (x.startsWith('n:') && y.startsWith('n:') && numEq(+x.slice(2), +y.slice(2))));
function solvePrompt(it) {
  return `独立解答下面这道题。不要参考任何给定答案，自己一步一步算。
${it.t === 'choice' ? '答案写一个选项字母。' : it.t === 'multi' ? '答案写所有正确选项的字母，如 AC。' : it.t === 'tf' ? '答案写「对」或「错」。' : '答案尽量简短；如果答案是一个数，只写这个数，并在 expr 里写出算出它的算式（只用数字、+ - * / ^ ( ) 和 sqrt ln log sin cos 等函数）。'}
只输出 JSON：{"answer":"","expr":"","x":"简短解答（Markdown，公式用 $...$）"}

题目：
${it.q}${it.o ? '\n' + it.o.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n') : ''}`;
}
async function solveBlind(it, n = 3, signal) {
  const runs = await Promise.allSettled(Array.from({ length: n }, () => AI.fn.json(solvePrompt(it), { signal, cache: false })));
  const votes = [];
  for (const r of runs) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    const j = r.value, k = ansKey(it.t, j.answer); if (!k) continue;
    if (k.startsWith('n:') && j.expr) { try { const v = Viz.compile(String(j.expr))(0); if (!isFinite(v) || !numEq(v, +k.slice(2))) continue; } catch { /* 算式写不对不算否决，只是不加分 */ } }
    votes.push({ k, raw: j.answer, x: String(j.x || '').trim() });
  }
  const groups = []; for (const v of votes) { const g = groups.find(g => keyEq(g.k, v.k)); g ? g.list.push(v) : groups.push({ k: v.k, list: [v] }); }
  groups.sort((a, b) => b.list.length - a.list.length);
  const best = groups[0];
  return { key: best?.k ?? null, agree: best?.list.length || 0, n, raw: best?.list[0].raw, x: best?.list.find(v => v.x)?.x || '' };
}
/* 卡片自己的答案键 */
const itemKey = it => it.t === 'qa' || it.t === 'think' ? ansKey('qa', it.a) : ansKey(it.t, it.a);

/* ---- 举一反三：针对错题的知识点和错因出变式题，盲解答案与给定答案一致才保留 ---- */
function variantPrompt(it) {
  const lw = lastWrong(it.id), z = lw?.cause && CAUSE[lw.cause], sec = SECS.get(it.sec), kps = kpsOf(it).map(id => ITEMS.get(id)?.title).filter(Boolean);
  return `你是「${COURSES.get(it.course).title}」的老师。学生做错了下面这道题${z ? `，错因是「${z.l}」${lw.why ? `：${lw.why}` : ''}` : ''}。请出 2 道考查同一知识点${kps.length ? `（${kps.join('、')}）` : ''}的变式题，换数据、换情境或换问法，专门针对这个错误，难度相当。
要求：
- 只用 choice、multi、tf 题型，或答案是一个数的计算题（用 qa 类型，答案只写这个数）。
- 每道题必须只有一个确定的正确答案；选择题的干扰项要对应常见错误，并在 ?? 后逐个说明。
- 不要和原题重复。
${DSL_SPEC}

小节：${sec.title}
原题：
${itemToDSL(it)}${lw?.ans !== undefined ? `\n学生的作答：${ansShow(it, lw.ans)}` : ''}`;
}
function variantSheet(ids) {
  const its = [...new Set(ids)].map(id => ITEMS.get(id)).filter(Boolean); if (!its.length) return toast('没有错题');
  if (!AI.require()) return;
  const body = h(`<div style="display:flex;flex-direction:column;gap:12px"><div class="menu" id="vs-list">${its.map(it => `<button data-v="${it.id}" disabled><span class="tico soft" style="--c:var(--warn)">${tileIco('repeat')}</span><span class="grow">${esc(plain(it.title || it.q).slice(0, 30))}<small>${ico('clock')}</small></span></button>`).join('')}</div><div class="acts"><button class="btn pri" id="vs-go">${ico('repeat')}出题并验证</button><button class="btn" id="vs-stop" hidden>${ico('stop', '', 'fill')}停止</button><button class="btn pri" id="vs-play" hidden>${ico('play', '', 'fill')}现在练</button></div></div>`);
  const s = sheet('举一反三', body); let ctl = null, stopped = false; const kept = [];
  s.onclose = () => { stopped = true; ctl?.abort(); };
  $('#vs-stop', body).onclick = () => { stopped = true; ctl?.abort(); };
  $('#vs-play', body).onclick = () => { s.close(); go('session', { kind: 'items', ids: kept, lab: '举一反三' }); };
  $('#vs-go', body).onclick = async () => {
    $('#vs-go', body).hidden = true; $('#vs-stop', body).hidden = false;
    for (const it of its) {
      if (stopped) break; const row = $(`[data-v="${it.id}"] small`, body); row.innerHTML = '<span class="spin" style="width:14px;height:14px;border-width:2px"></span> 出题';
      ctl = new AbortController();
      try {
        const { text } = await AI.fn(variantPrompt(it), { signal: ctl.signal, cache: false });
        const cands = parseDSL(text, it.sec, 'v').items.filter(c => ['choice', 'multi', 'tf'].includes(c.t) || (c.t === 'qa' && asNum(c.a) != null)).slice(0, 3);
        let ok = 0, bad = 0; const good = [];
        for (const c of cands) {
          if (stopped) break; row.innerHTML = `<span class="spin" style="width:14px;height:14px;border-width:2px"></span> ${ico('check')}${ok} ${ico('x')}${bad}`;
          const r = await solveBlind(c, 3, ctl.signal);
          if (r.agree >= 2 && keyEq(r.key, itemKey(c))) { ok++; good.push({ ...c, pr: 1, src: 'variant', of: it.id, ...(it.kps?.length ? { kps: it.kps, kpsBy: 'auto' } : {}), ...(c.x ? {} : r.x ? { x: r.x } : {}) }); } else bad++;
        }
        if (good.length) { saveItems(it.sec, good); kept.push(...good.map(g => ITEMS.get(g.id)?.id || g.id)); }
        row.innerHTML = `${ico('check')}<b class="num">${ok}</b>${bad ? ` · ${ico('x')}<span class="num">${bad}</span> 答案不一致已丢弃` : ''}`;
      } catch (e) { row.textContent = AI.err(e); if (['cancelled', 'not_granted', 'no_key', 'auth'].includes(e?.code)) break; }
    }
    $('#vs-stop', body).hidden = true; if (kept.length) { $('#vs-play', body).hidden = false; logEvent(`变式题 ${kept.length} 道`); saveState(); } else toast('没有通过验证的变式题');
  };
}
