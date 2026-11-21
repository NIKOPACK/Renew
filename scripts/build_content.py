#!/usr/bin/env python3
"""把课程源文本（*.txt，课程 DSL）编译成 App 读取的 JSON。

用法：python3 scripts/build_content.py 输出目录 内容目录 [内容目录 ...]
      （npm run build 会自动调用：输出到 build/data，内容目录为 content/ 加上环境变量 RENEW_CONTENT 中的目录）

DSL（完整说明见 docs/content-format.md）:
  @course ds | 数据结构 | #138a8a | 分类 | 简介
  @course ds                               （单独一行：在另一个文件里续写同一门课）
  @chapter ds1 | 第1章 绪论
  @section 1.1 数据结构的基本概念        （节 id 自动为 ds1s1、ds1s2…）
  ::kp 标题 ★★          知识点：先写「要点」，单独一行 --- 之后写「详解」
  ::choice / ::multi       选择题：选项行 "A. xxx"，答案行 "= B" / "= AC"
  ::tf                     判断题："= 对" / "= 错"
  ::qa                     问答：题目 --- 答案
  ::cloze                  填空：正文里用 {{答案}} 挖空
  ::think                  思考/计算题：">> 步骤"，"= 结论"
  ?? 之后的行都是详细解答
"""
import json, re, glob, os

def h36(s):
    h = 5381
    for ch in s.encode('utf8'):
        h = ((h * 33) ^ ch) & 0xffffffff
    n, out = h, ''
    chars = '0123456789abcdefghijklmnopqrstuvwxyz'
    while n:
        n, r = divmod(n, 36); out = chars[r] + out
    return out or '0'

OPT = re.compile(r'^([A-F])[.．、]\s*(.*)$')
TYPES = ('kp', 'choice', 'multi', 'tf', 'qa', 'cloze', 'think')

def finish(card, ids, where):
    t = card['t']; lines = card.pop('_lines')
    body, opts, ans, expl, steps, second = [], [], None, [], [], []
    mode = 'body'; fence = False
    for ln in lines:
        if ln.strip().startswith('```'): fence = not fence
        if mode == 'expl':
            expl.append(ln); continue
        if not fence and ln.startswith('??'):
            mode = 'expl'; rest = ln[2:].strip()
            if rest: expl.append(rest)
            continue
        if t in ('qa', 'kp') and not fence and ln.strip() == '---' and mode == 'body':
            mode = 'second'; continue
        if mode == 'second':
            second.append(ln); continue
        m = OPT.match(ln) if not fence else None
        if t in ('choice', 'multi') and m:
            opts.append(m.group(2)); continue
        if not fence and (ln.startswith('= ') or ln == '='):
            ans = ln[1:].strip(); continue
        if t == 'think' and not fence and ln.startswith('>>'):
            steps.append(ln[2:].strip()); continue
        if ans is not None and t == 'think':
            ans += '\n' + ln; continue
        body.append(ln)
    q = '\n'.join(body).strip()
    out = {'id': None, 't': t}
    if card.get('title'): out['title'] = card['title']
    if card.get('imp'): out['imp'] = card['imp']
    out['q'] = q
    if t == 'kp':
        if not q: raise ValueError(f'{where}: 知识点缺要点 {card.get("title")}')
        d = '\n'.join(second).strip()
        if d: out['d'] = d
    elif t in ('choice', 'multi'):
        if not opts or not ans: raise ValueError(f'{where}: 选择题缺选项或答案: {q[:30]}')
        idx = [ord(c) - 65 for c in ans.replace(' ', '') if 'A' <= c <= 'F']
        out['o'] = opts
        if t == 'multi' or len(idx) > 1:
            out['t'] = 'multi'; out['a'] = idx
        else:
            out['a'] = idx[0]
        if any(i >= len(opts) for i in idx): raise ValueError(f'{where}: 答案越界 {q[:30]}')
    elif t == 'tf':
        if ans not in ('对', '错'): raise ValueError(f'{where}: 判断题答案应为 对/错: {q[:30]}')
        out['a'] = ans == '对'
    elif t == 'qa':
        out['a'] = '\n'.join(second).strip()
        if not out['a']: raise ValueError(f'{where}: 问答缺答案: {q[:30]}')
    elif t == 'cloze':
        if '{{' not in q: raise ValueError(f'{where}: 填空缺 {{}}: {q[:30]}')
    elif t == 'think':
        out['st'] = steps
        if ans: out['a'] = ans.strip()
    if t != 'kp' and not expl:
        raise ValueError(f'{where}: 题目缺少解答: {q[:30]}')
    if expl: out['x'] = '\n'.join(expl).strip()
    key = where + t + (card.get('title') or q.split('\n')[0])
    cid = where + '-' + h36(key)
    n = 2
    while cid in ids:
        cid = where + '-' + h36(key) + str(n); n += 1
    ids.add(cid); out['id'] = cid
    return out

COURSES = {}
IDS = {}
def parse(path):
    course = None; chapter = None; section = None; card = None; ids = None
    def close():
        nonlocal card
        if card:
            it = finish(card, ids, section['id'])
            if section.get('practice') and it['t'] != 'kp': it['pr'] = 1
            section['items'].append(it); card = None
    for raw in open(path, encoding='utf8'):
        ln = raw.rstrip('\n').rstrip()
        if ln.startswith('#!'): continue
        if ln.startswith('@course'):
            p = [x.strip() for x in ln[7:].split('|')]
            if p[0] in COURSES:
                course = COURSES[p[0]]
            else:
                course = {'id': p[0], 'title': p[1], 'color': p[2], 'cat': p[3], 'desc': p[4] if len(p) > 4 else '', 'chapters': []}
                COURSES[p[0]] = course
            ids = IDS.setdefault(p[0], set())
            continue
        if ln.startswith('@practice'):
            close(); section['practice'] = True; continue
        if ln.startswith('@chapter'):
            close(); p = [x.strip() for x in ln[8:].split('|')]
            chapter = {'id': p[0], 'title': p[1], 'sections': []}
            course['chapters'].append(chapter); section = None; continue
        if ln.startswith('@section'):
            close()
            section = {'id': f"{chapter['id']}s{len(chapter['sections']) + 1}", 'title': ln[8:].strip(), 'items': [], 'practice': False}
            chapter['sections'].append(section); continue
        if ln.startswith('::'):
            close()
            head = ln[2:].strip()
            t, _, title = head.partition(' ')
            if t not in TYPES: raise ValueError('未知题型 ' + t)
            imp = title.count('★'); title = title.replace('★', '').strip()
            card = {'t': t, 'title': title, 'imp': imp, '_lines': []}
            continue
        if card is not None:
            card['_lines'].append(ln)
    close()
    return course

def finalize(c):
    for ch in c['chapters']:
        for sec in ch['sections']:
            if not sec.pop('practice', False):
                for it in sec['items']:
                    if it['t'] != 'kp': it['pr'] = 1
    return c

if __name__ == '__main__':
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else 'build/data'
    dirs = sys.argv[2:] or ['content']
    os.makedirs(out, exist_ok=True)
    for old in glob.glob(os.path.join(out, '*.json')):
        os.remove(old)
    index, first = [], {}
    for d in dirs:
        for f in sorted(glob.glob(os.path.join(d, '*.txt'))):
            parse(f)
    for c in COURSES.values():
        finalize(c)
        json.dump(c, open(os.path.join(out, c['id'] + '.json'), 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
        secs = sum(len(ch['sections']) for ch in c['chapters'])
        kp = sum(1 for ch in c['chapters'] for s in ch['sections'] for i in s['items'] if i['t'] == 'kp')
        q = sum(1 for ch in c['chapters'] for s in ch['sections'] for i in s['items'] if i['t'] != 'kp')
        nod = sum(1 for ch in c['chapters'] for s in ch['sections'] for i in s['items'] if i['t'] == 'kp' and 'd' not in i)
        empty = [s['id'] for ch in c['chapters'] for s in ch['sections'] if not s['items']]
        index.append({'id': c['id'], 'title': c['title'], 'cat': c['cat'], 'color': c['color']})
        print(f"{c['id']}: {len(c['chapters'])} 章 {secs} 节, 知识点 {kp}（缺详解 {nod}）, 题目 {q}" + (f", 空节 {empty}" if empty else ''))
    # 课程顺序 = 源文件中首次出现的顺序（文件名排序），可用文件名前缀数字控制
    json.dump({'version': 2, 'courses': index}, open(os.path.join(out, 'index.json'), 'w', encoding='utf8'), ensure_ascii=False)
