// 温新 Renew 的 Bombadil 属性测试规范
// 运行：npx bombadil browser test --headless --no-sandbox --time-limit=5m --exit-on-violation http://localhost:8780 bombadil/spec.ts
import { always, eventually, now } from "@antithesishq/bombadil";
import { extract } from "@antithesishq/bombadil/browser";
export * from "@antithesishq/bombadil/browser/defaults";

// 主视图 #view 是否存在且有内容（启动时的「正在载入」也算内容）
const viewEmpty = extract((s) => {
  const v = s.document.querySelector("#view");
  if (!v) return true;
  return v.children.length === 0;
});

// 页面切换时的快照层（旧页面）数量
const ghostCount = extract((s) => s.document.querySelectorAll(".navghost").length);

// 最老的快照层已经存在了多少毫秒。快速连续切页时快照层会一个接一个地替换，计数一直是 1，
// 所以按元素计时：第一次看到某个快照层时在它身上记下时间（只是 data 属性，不影响 App）
const oldestGhostAgeMs = extract((s) => {
  const t = s.window.performance.now();
  let max = 0;
  s.document.querySelectorAll<HTMLElement>(".navghost").forEach((g) => {
    if (!g.dataset.bombadilSeen) g.dataset.bombadilSeen = String(t);
    max = Math.max(max, t - Number(g.dataset.bombadilSeen));
  });
  return Math.round(max);
});

// 旧页面快照层里是否有元素持有焦点（本次发现的 bug 的根源）
const focusInGhost = extract((s) => {
  const a = s.document.activeElement;
  return !!(a && a.closest && a.closest(".navghost"));
});

// 底栏中标为当前页的按钮数量（页面不显示底栏时为 null）
const currentTabs = extract((s) => {
  const bar = s.document.querySelector(".tabbar");
  if (!bar) return null;
  return bar.querySelectorAll("[aria-current]").length;
});

// 主视图和弹层中可见文字里出现的 JS 泄漏值
const leakedText = extract((s) => {
  const roots = [s.document.querySelector("#view"), ...Array.from(s.document.querySelectorAll(".sheet"))];
  const bad = /\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b/;
  for (const r of roots) {
    if (!r) continue;
    const t = (r as HTMLElement).innerText || "";
    const m = t.match(bad);
    if (m) {
      const i = m.index ?? 0;
      return t.slice(Math.max(0, i - 30), i + 30);
    }
  }
  return null;
});

// 进度百分比必须在 0–100 之间：逐个文本节点找「数字%」（不拼接，避免相邻节点的数字连在一起）
// 设置页的字号、行距等滑块比例可以超过 100%，跳过带滑块的设置行（.field 里有 input[type=range]）
const badPercent = extract((s) => {
  const v = s.document.querySelector("#view");
  if (!v) return null;
  const w = s.document.createTreeWalker(v, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const field = n.parentElement?.closest(".field");
    if (field && field.querySelector("input[type=range]")) continue;
    for (const m of (n.nodeValue || "").match(/-?\d+(?:\.\d+)?\s*%/g) || []) {
      const x = parseFloat(m);
      if (!(x >= 0 && x <= 100)) return m;
    }
  }
  return null;
});

// 加载转圈：主视图里的 .loading
const loading = extract((s) => s.document.querySelector("#view .loading") !== null);

// —— 属性 ——

// 快照层不能获得焦点
export const noFocusInLeavingPage = always(() => focusInGhost.current === false);

// 同一时刻最多一个快照层，且在 2 秒内消失
export const atMostOneGhost = always(() => ghostCount.current <= 1);
export const ghostGoesAway = always(() => oldestGhostAgeMs.current < 2000);

// 主视图不会长时间空白
export const viewNotBlank = always(
  now(() => viewEmpty.current).implies(eventually(() => !viewEmpty.current).within(3, "seconds")),
);

// 加载状态 10 秒内结束
export const loadingFinishes = always(
  now(() => loading.current).implies(eventually(() => !loading.current).within(10, "seconds")),
);

// 底栏最多一个当前页
export const oneCurrentTab = always(() => currentTabs.current === null || currentTabs.current <= 1);

// 不显示 undefined / NaN / [object Object] / null
export const noLeakedJsValues = always(() => leakedText.current === null);

// 百分比合法
export const percentInRange = always(() => badPercent.current === null);

// DOM 节点总数有上限：页面切换会一次性增加几千个节点（图标是 SVG），所以不用按时间窗口算增长，
// 而是限制总量，抓的是弹层、快照层、监听的元素在反复操作中不断累积的情况
const domNodes = extract((s) => s.document.getElementsByTagName("*").length);
export const domNodesBounded = always(() => domNodes.current < 25000);
