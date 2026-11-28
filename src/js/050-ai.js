/* ============ AI ============ */
const AI = {
  fn: null, ready: false, limits: null, an: null, anLimits: null,
  async init() {
    try { this.fn = await Platform.ai(); } catch { this.fn = null; }
    this.limits = this.fn ? await this.fn.limits().catch(() => null) : null;
    /* 分析模型（录题识别、盲解、错因、知识点、报告、变式题）：单独设置了就用它，否则用对话模型 */
    try { const c = await Platform.anConfig?.get(); if (typeof AN_CFG !== 'undefined') AN_CFG = c; this.an = c?.key && c.model ? AIClient.create(c) : null; } catch { this.an = null; }
    this.anLimits = this.an ? await this.an.limits().catch(() => null) : null;
    this.ready = true;
  },
  get A() { return this.an || this.fn; },
  /* 需要看图时：分析模型不能看图而对话模型能，就退回对话模型 */
  pick(images) { if (!images || !this.an || this.anLimits?.images) return { fn: this.A, lim: this.an ? this.anLimits : this.limits }; return { fn: this.fn, lim: this.limits }; },
  async reload() { this.ready = false; await this.init(); },
  get ok() { return !!this.fn; },
  get need() { return Platform.aiNeed; },
  /* 需要 AI 时调用：可用返回 true；否则引导用户去配置（App）或给出提示（网页） */
  require() { if (this.fn) return true; if (Platform.aiConfigurable && typeof aiConfigSheet === 'function') aiConfigSheet(); else toast(Platform.aiNeed); return false; },
  err(e) {
    const m = { not_granted: '你没有允许这个页面使用 Claude，可以在页面的权限菜单里重新打开。', rate_limited: '请求有点频繁，等一会儿再试。', prompt_too_large: '资料太长，请减少页数或分几次生成。', session_expired: '登录已过期，刷新页面后再试。', images_unavailable: '当前环境不能发送图片，请改用文字。', image_rejected: '有图片无法识别，请换成 JPG/PNG。', invalid_json: 'AI 返回的格式不对，请再试一次。', cancelled: '已停止。' };
    const own = { no_key: '还没有填写 AI 服务的 API Key。', auth: 'API Key 无效或没有权限，请在「设置 → AI 服务」里检查。', quota: '账户余额或额度不足，请到服务商后台充值。', network: '连不上 AI 服务，请检查网络或接口地址。', overloaded: 'AI 服务繁忙，请稍后再试。', refusal: '模型拒绝回答这个请求，换个说法再试。', truncated: '回答太长被截断了，请缩小范围再试。', bad_request: '请求被 AI 服务拒绝' + (e?.detail ? '：' + String(e.detail).slice(0, 120) : '。'), no_model: '还没有选择模型，请在「设置 → AI 服务」里选择。' };
    return own[e?.code] || m[e?.code] || (['sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(e?.code) ? 'AI 功能在当前环境不可用。' : 'AI 这次没有给出结果，请稍后再试。');
  }
};
/* 给 AI 的作图说明：App 会把这些代码块画成图（见 032-viz.js），禁止用字符拼图 */
const VIZ_SPEC = `能用图表达的内容先画图，少用文字：数据结构的形态与指针变化、算法每一步的状态、流程与状态转换、层次与组成关系、时序交互、函数与数据的变化趋势，都直接画出来；图后只用一两句话点出要注意的地方，不要再用文字把图里已经表达的内容复述一遍。多个对象的属性对比用 Markdown 表格。
用下面的作图代码块画图，App 会画成可缩放的矢量图。不要用字符、空格、竖线、箭头符号拼画示意图。
1) 函数图像、数据折线、柱状图 —— \`\`\`plot
x 0..10 横轴名            （范围与轴名）
y 0..100 纵轴名
f 100*exp(-x/2) | 曲线名   （函数，变量用 x；支持 + - * / ^ 和 sin cos tan exp ln log log2 sqrt abs min max floor ceil pi e）
f 100*exp(-(x-3)/6) @3..10 （@a..b 限定定义域；不写名字时接着上一条画成同一条曲线，可画分段函数）
p (1,1) (2,2) (3,4) 名称   （数据点连线；s 开头为阶梯线）
h 8 ssthresh              （水平参考线；v 9 超时 为竖直参考线；xt off / yt off 隐藏刻度，grid off 去掉网格）
t (5,60) 文字             （在坐标处标注）
bar O(1):1 | O(n):8 | O(n²):64   （柱状图，单独使用）
2) 流程图、状态图、有向图、无向带权图 —— \`\`\`graph
dir TB                    （TB 从上到下，LR 从左到右）
A(开始) -> B[处理] -> C{判断?}    （[方框] (圆角) ((圆)) {菱形}；节点后加 * 表示高亮）
C -> D[是的分支] : 是            （冒号后是边上的文字或权值）
A -- B : 4                （-- 无向边；全是无向边时自动画成环形；-.-> 虚线；<-> 双向）
3) 树、二叉树、哈夫曼树 —— \`\`\`tree
A                         （每行一个结点，缩进两格表示孩子）
  B
    D
    -                     （- 表示空孩子，用来区分二叉树的左右）
  C *                     （结尾 * 高亮）
  <1> E                   （<文字> 写在连向该结点的边上，如哈夫曼编码 0/1）
4) 数组、链表、栈、指令格式、指针 —— \`\`\`cells
arr[名称]: 3 | 1 | 4 | 1 | 5 *   （一行格子；* 高亮；>> 后写右侧注释）
idx: auto                 （上一行格子的下标，或写 idx: 0 | 1 | 2）
list: 1 | 2 | 3 | NULL    （链表，格子之间画箭头）
ptr: 0=slow | 2=fast      （指向上一行第 i 个格子的指针，从 0 开始数）
arr[指令]: OP@4 | A1@4 | A2@8 >> 共 16 位   （@n 表示宽度占比，如位数）
stack: c | b | a          （栈，第一个是栈顶）
col: 参数 n => [ebp+8] | 返回地址 => [ebp+4]   （竖排格子，=> 后写右侧说明，如存储层次、栈帧）
arr[模式]: ~ | a | b      （~ 是空白占位，用来错位对齐，如字符串匹配、流水线）
text: 说明文字
5) 协议交互、时序 —— \`\`\`seq
客户端 -> 服务器 : SYN, seq=x      （--> 为虚线）
--- 连接建立 ---                  （分隔线）
note 客户端 : TIME-WAIT            （在某一方下方标注）
优先用上面的写法；写成 Mermaid 的 flowchart / sequenceDiagram 也能显示。图要简洁：结点文字尽量短，一张图只讲一件事。
进阶交互：
- 分步演进：展示算法执行、指针移动、树旋转或协议状态变化时，可在同一个代码块内用单独一行 \`=== 第 1 步说明\` 分隔多个画面，App 会渲染为可逐步切换的分步图示（不要竖排画多张重复图）。
- 图内挖空：需要让学生主动回忆图中的关键节点、状态或字段时，把对应文字写成 \`{{答案}}\`，App 会盖上遮罩，点按即可翻开。`;
const DSL_SPEC = `输出格式（纯文本，不要 JSON，不要用代码块包裹全文）。每张卡片以 "::类型" 开头一行：
::kp 标题 ★★          知识点：先写「要点」（3~6 行，分点），然后单独一行 ---，再写「详解」；★ 个数(0-3)表示重要程度
::choice              单选题：题干；每行一个选项 "A. ..."；一行 "= B"；然后 "?? 详细解答"
::multi               多选题：同上，答案行如 "= AC"
::tf                  判断题：命题；"= 对" 或 "= 错"；"?? 详细解答"
::qa                  问答题：问题；单独一行 "---"；答案；"?? 补充解答"
::cloze               填空题：正文中用 {{答案}} 挖空；"?? 详细解答"
::think 标题           思考/计算题：题目；每行 ">> 第 n 步提示"；一行 "= 结论"；"?? 详细解答"
详解里可以使用提示块（每行以 > 开头），类型：analogy 打个比方、example 例题、warn 易错、exam 怎么考、tip 记忆口诀、why 为什么、key 重点。例如：
> [!analogy] 打个比方
> 顺序表像电影院的一排座位……
${VIZ_SPEC}
编排：知识点卡按讲解顺序排列，每 1~2 张知识点卡后可以紧跟 1 道「随堂小测」（简单题）；最后单独一行 @practice，其后是本节练习题。
示例：
::kp 顺序表的特点 ★★
- **随机访问**：按位查找 $O(1)$
- 插入删除平均移动约一半元素
---
顺序表用一组地址连续的存储单元存放元素……（讲清原理、举例、指出易错点）
::choice
在顺序表中按序号访问元素的时间复杂度是（ ）
A. $O(1)$
B. $O(n)$
C. $O(\\log n)$
D. $O(n^2)$
= A
?? **答案 A。** 顺序表可以通过首地址和序号直接计算出元素地址……（逐个说明干扰项错在哪里）`;
function genPrompt({ course, chap, sec, kpN, qN, focus, material, existing, weak, hasImages }) {
  return `你是「${course.title}」（分类：${course.cat}）的资深教师，正在为手机刷卡学习 App 制作一小节的学习内容。
章节：${chap.title}
小节：${sec.title}
${sec.points?.length ? '本节计划覆盖的知识点：' + sec.points.join('；') + '\n' : ''}
要求：
0. 图优先：能用图讲清楚的（结构、过程、步骤、状态变化、对比），在详解里画图代替大段文字，图后只写一两句提示。
1. 知识点卡（kp）每张讲一个主题。「要点」是必须记住的结论，3~6 行，分点；「详解」要生动、完整：先用 > [!analogy] 打比方或直观解释，再讲清原理和推导，配一个 > [!example] 例子；数据结构、流程、曲线等适合看图的内容用作图代码块（plot / graph / tree / cells）画出来，最后用 > [!warn] 写易错点、> [!exam] 写常见考法，有好记的口诀就加 > [!tip]。
2. 练习题以理解和记忆为主。每道题都要在 ?? 后写出详细解答：先给答案，再逐步说明理由；选择题要说明每个干扰项错在哪里。计算量大的题改写为 think 类型，用 2~4 步 ">>" 提示思路。
3. 编排：知识点卡按讲解顺序排列，每 1~2 张知识点卡后紧跟 1 道随堂小测（简单的选择、判断或填空）；然后单独一行 @practice，后面是本节练习。知识点卡约 ${kpN} 张，本节练习约 ${qN} 道，题型多样，覆盖本节所有考点。
4. 公式用 LaTeX（行内 $...$，独立一行 $$...$$）；可以用 **加粗**、列表、表格（不超过 4 列）；代码用 \`\`\` 包裹并尽量简短。
5. 用自己的话准确表述，不大段照抄原文；拿不准的内容不要写。${focus ? `\n6. 侧重：${focus}` : ''}
${existing ? `\n本节已有内容（不要重复）：${existing}\n` : ''}${weak ? `\n学生在下面这些卡片上反复出错，请换个角度讲解相关知识并出新题：\n${weak}\n` : ''}
${DSL_SPEC}

${hasImages ? '教材内容见附带的图片（书页照片或截图），请先识别再整理。\n' : ''}${material ? `教材内容：\n"""\n${material}\n"""` : (hasImages ? '' : '没有提供教材原文，请依据该课程的标准知识体系编写。')}`;
}
