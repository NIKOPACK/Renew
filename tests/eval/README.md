# 学情分析评测

用标注好的测试集在真实模型上跑 App 里的同一套代码（录题识别、盲解、错因、知识点关联、学情报告），按环节统计准确率，用来比较模型、调整提示词。

```bash
EVAL_KEY=sk-... node scripts/eval-ai.mjs --provider deepseek --model deepseek-chat
EVAL_KEY=sk-ant-... node scripts/eval-ai.mjs --provider claude --model claude-opus-5-5 --vision
node scripts/eval-ai.mjs --mock          # 不调用模型，检查脚本本身
```

- `--provider` 取 `src/ai/clients.js` 里 `AI_PRESETS` 的键（deepseek、qwen、kimi、glm、claude、openai、custom），`custom` 需要 `--base`。
- `--vision`：模型能看图时才跑录题识别。
- `--only solve,cause`：只跑部分环节；`--runs 3`：报告环节重复次数。
- 结果写到 `tests/eval/results/<服务商>-<模型>-<时间>.json`，终端打印汇总。

## 指标

| 环节 | 看什么 |
|---|---|
| 盲解 | **采用的答案正确率**（3 次里至少 2 次一致才采用）、采用率、错采的题 |
| 错因 | AI 采用的判断准确率与采用率、规则推荐的准确率、最终结果；按错因分别统计 |
| 知识点 | 关联的精确率、召回率 |
| 录题 | 每个字段（题型、题干、选项、我的作答、批改、答案）的准确率；字段错误中有多少被「两次识别不一致」标了出来 |
| 报告 | 模型写的结论有多少通过校验（没有自己编数字、引用都存在） |

「精准」最看重的是**采用的结果里错了多少**：拿不准时宁可不给（采用率低一些），也不要给错的。

## 测试集

`dataset.json`：16 道有唯一答案的题、12 道标注了错因的错题、2 个小节的知识点关联、3 页练习（脚本渲染成带手写作答和红笔批改的图片，存到 `rendered/`）。

### 加入真实照片

把照片放进 `tests/eval/photos/`，再写一个 `labels.json`：

```json
[
  { "file": "作业1.jpg", "questions": [
    { "no": "1", "type": "choice", "stem": "题干", "options": ["选项A", "选项B"], "mine": "A", "mark": "wrong", "answer": "" }
  ] }
]
```

`type` 为 choice / multi / tf / qa，`mark` 为 right / wrong / 空，`answer` 是纸上印的答案（没有就空）。照片可能含个人信息，`photos/` 不要提交到公开仓库。
