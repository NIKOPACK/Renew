/* ============ 新建课程 ============ */
function outlineToText(o) { return o.chapters.map(ch => `# ${ch.title}\n` + ch.sections.map(s => `## ${s.title}\n` + (s.points || []).map(p => `- ${p}`).join('\n')).join('\n')).join('\n\n'); }
function parseOutline(text) {
  const chapters = []; let ch = null, sec = null;
  for (const raw of String(text).split('\n')) {
    const l = raw.trim(); if (!l) continue;
    if (/^#\s/.test(l)) { ch = { title: l.replace(/^#\s+/, ''), sections: [] }; chapters.push(ch); sec = null; }
    else if (/^##\s/.test(l)) { if (!ch) { ch = { title: '第1章', sections: [] }; chapters.push(ch); } sec = { title: l.replace(/^##\s+/, ''), points: [] }; ch.sections.push(sec); }
    else if (/^[-*]\s/.test(l)) { if (!sec) { if (!ch) { ch = { title: '第1章', sections: [] }; chapters.push(ch); } sec = { title: ch.title, points: [] }; ch.sections.push(sec); } sec.points.push(l.replace(/^[-*]\s+/, '')); }
    else { if (!ch) { ch = { title: l, sections: [] }; chapters.push(ch); } else { sec = { title: l, points: [] }; ch.sections.push(sec); } }
  }
  chapters.forEach(c => { if (!c.sections.length) c.sections.push({ title: c.title, points: [] }); });
  return chapters;
}
const PALETTE = ['#8a4fb8', '#c0483f', '#2f7f9e', '#6f8a1e', '#b0681f', '#46609c', '#b0447a', '#2e8b6e'];
function newCourseSheet() {
  const cats = [...new Set(shownCourses().map(c => c.cat))];
  const body = h(`<div style="display:flex;flex-direction:column;gap:14px">
    <label class="field"><span>课程名称</span><input class="inp" id="nc-t" placeholder="如：线性代数"></label>
    <label class="field"><span>分类</span><input class="inp" id="nc-c" list="nc-cats" placeholder="如：考研数学"><datalist id="nc-cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
    <label class="field"><span>学习目标</span><input class="inp" id="nc-g" placeholder="可选"></label>
    <div id="nc-mat"></div>
    <div class="acts"><button class="btn pri" id="nc-ai">${ico('wand')}AI 规划目录</button><button class="btn" id="nc-man">${ico('edit')}手动填写</button></div><div id="nc-out"></div></div>`);
  const s = sheet('新建课程', body), getMat = materialPicker($('#nc-mat', body));
  $('.field>span', $('#nc-mat', body)).textContent = '目录 / 教材';
  const step2 = (o) => {
    body.innerHTML = `<p class="small" style="margin:0"><code># 章</code>　<code>## 节</code>　<code>- 知识点</code></p>
      <label class="field"><span>课程名称</span><input class="inp" id="o-t" value="${esc(o.title || '')}"></label>
      <label class="field"><span>分类</span><input class="inp" id="o-c" value="${esc(o.cat || '我的课程')}"></label>
      <label class="field"><span>简介</span><input class="inp" id="o-d" value="${esc(o.desc || '')}"></label>
      <label class="field"><span>目录</span><textarea class="inp" id="o-x" style="min-height:300px;font-family:var(--mono);font-size:13px">${esc(outlineToText(o))}</textarea></label>
      <button class="btn pri block" id="o-ok">${ico('check')}创建课程</button>`;
    $('#o-ok', body).onclick = () => {
      const title = $('#o-t', body).value.trim(), chs = parseOutline($('#o-x', body).value);
      if (!title) return toast('先填课程名称'); // 目录可以是空的：只放卡片的课程
      const id = 'u' + Date.now().toString(36);
      const course = { id, title, cat: $('#o-c', body).value.trim() || '我的课程', desc: $('#o-d', body).value.trim(), color: PALETTE[COURSES.size % PALETTE.length],
        chapters: chs.map((ch, i) => ({ id: `${id}c${i + 1}`, title: ch.title, sections: ch.sections.map((x, j) => ({ id: `${id}c${i + 1}s${j + 1}`, title: x.title, points: x.points })) })) };
      Store.put('course/' + id, course); addCourse(course, false); coursePlan(id); saveState(); logEvent('新建课程 ' + title);
      s.close(); Nav.tab = 'library'; Nav.stack = [{ view: 'library' }, { view: 'course', params: { id } }]; render(true);
      toast(chs.length ? `已创建「${title}」，${courseSecs(COURSES.get(id)).length} 个小节` : `已创建「${title}」`);
    };
  };
  $('#nc-man', body).onclick = () => step2({ title: $('#nc-t', body).value.trim(), cat: $('#nc-c', body).value.trim(), chapters: [{ title: '第1章 ', sections: [{ title: '1.1 ', points: [] }] }] });
  $('#nc-ai', body).onclick = async () => {
    let m; try { m = await getMat(); } catch (e) { return toast(e.message || '资料读取失败'); }
    const title = $('#nc-t', body).value.trim(), cat = $('#nc-c', body).value.trim(), goal = $('#nc-g', body).value.trim();
    const prompt = `为手机刷卡学习 App 规划一门课程的目录。按教材原有顺序组织；每节的粒度适合 10~20 分钟学完；每节列出 2~6 个需要掌握的知识点（名词短语）。
只输出 JSON：{"title":"课程名","cat":"分类","desc":"一句话简介","chapters":[{"title":"第1章 xxx","sections":[{"title":"1.1 xxx","points":["知识点1","知识点2"]}]}]}
课程名称（用户填写，可能为空）：${title}
分类（可能为空）：${cat}
学习目标：${goal || '未说明'}
${m.images.length ? '目录或教材见附带图片。' : ''}${m.text ? `资料：\n"""\n${m.text.slice(0, 40000)}\n"""` : m.images.length ? '' : '没有提供资料，请按该科目的标准教材体系规划。'}`;
    if (!AI.ok) return copyText(prompt, '提示词已复制。拿到目录后可以点「手动填写」粘贴进去。');
    const out = $('#nc-out', body); out.innerHTML = '<div class="prog"><span class="spin"></span>AI 正在规划目录…</div>';
    try {
      const r = await AI.fn.json(prompt, { ...(m.images.length ? { images: m.images } : {}), cache: false });
      if (!Array.isArray(r?.chapters) || !r.chapters.length) throw { code: 'invalid_json' };
      step2({ title: title || r.title, cat: cat || r.cat, desc: r.desc, chapters: r.chapters.map(ch => ({ title: String(ch.title), sections: (ch.sections || []).map(x => ({ title: String(x.title), points: (x.points || []).map(String) })) })) });
    } catch (e) { out.innerHTML = `<p class="small" style="color:var(--bad)">${esc(AI.err(e))}</p>`; }
  };
}
function editOutlineSheet(c) {
  const body = h(`<div style="display:flex;flex-direction:column;gap:12px"><p class="small" style="margin:0">同名的章节会保留已有内容和进度；新增的小节需要再生成内容。</p><label class="field"><span>课程名称</span><input class="inp" id="eo-t" value="${esc(c.title)}"></label><label class="field"><span>分类</span><input class="inp" id="eo-c" value="${esc(c.cat)}"></label><textarea class="inp" id="eo-x" style="min-height:320px;font-family:var(--mono);font-size:13px">${esc(outlineToText({ chapters: c.chapters.map(ch => ({ title: ch.title, sections: ch.sections })) }))}</textarea><button class="btn pri block" id="eo-ok">保存</button></div>`);
  const s = sheet('编辑目录', body);
  $('#eo-ok', body).onclick = () => {
    const chs = parseOutline($('#eo-x', body).value), stamp = Date.now().toString(36);
    const doc = { id: c.id, title: $('#eo-t', body).value.trim() || c.title, cat: $('#eo-c', body).value.trim() || c.cat, desc: c.desc, color: c.color,
      chapters: chs.map((ch, i) => { const old = c.chapters.find(x => x.title === ch.title); const cid = old?.id || `${c.id}c${stamp}${i}`;
        return { id: cid, title: ch.title, sections: ch.sections.map((x, j) => { const os = old?.sections.find(y => y.title === x.title) || courseSecs(c).find(y => y.title === x.title); return { id: os?.id || `${cid}s${stamp}${j}`, title: x.title, points: x.points }; }) }; }) };
    Store.put('course/' + c.id, doc);
    for (const ch of c.chapters) { CHAPS.delete(ch.id); for (const sec of ch.sections) { SECS.delete(sec.id); for (const it of sec.items) ITEMS.delete(it.id); } }
    COURSES.delete(c.id); addCourse(doc, false);
    for (const k of Store.keys('sec/')) { const sec = SECS.get(k.slice(4)); if (sec && sec.course === c.id) for (const it of Store.get(k).items || []) addItem(it, sec, false); }
    s.close(); refresh(); toast('目录已更新');
  };
}
async function deleteCourse(c) {
  if (!await confirmBox('删除课程', `会删除「${c.title}」的全部内容和学习记录，不能撤销。`, '删除', true)) return;
  for (const sec of courseSecs(c)) { Store.drop('sec/' + sec.id); for (const it of sec.items) ITEMS.delete(it.id); SECS.delete(sec.id); delete S().sec[sec.id]; }
  c.chapters.forEach(ch => CHAPS.delete(ch.id)); Store.drop('course/' + c.id); Store.drop('srs/' + c.id); Notes.of(c.id).forEach(n => Notes.del(n)); { const H = homeCfg(); H.cards = H.cards.filter(x => x.course !== c.id); delete H.range[c.id]; } COURSES.delete(c.id); delete plan().courses[c.id];
  saveState(); go('library', {}, { tab: true }); toast('已删除');
}
