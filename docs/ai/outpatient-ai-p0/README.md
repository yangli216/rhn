# 门诊 AI P0 推进状态

本目录跟踪 `AIHIS-001` 至 `AIHIS-005`。代码完成不等于临床准入，G0/G1 必须保留真实签字和评测证据。

## 当前状态

| 任务 | 状态 | 已交付 | 下一步与责任人 |
|---|---|---|---|
| AIHIS-001 冻结试点范围 | 进行中 | 已有按机构、科室、医生比例的运行时灰度和关闭能力 | 产品、临床负责人填写试点科室、医生、病种、禁止场景和升级联系人并签字 |
| AIHIS-002 五类评测集 | 进行中 | `backend/src/test/resources/ai-evaluation/v1` 已建立五类版本化结构及首批去标识化合成负例 | 临床、药师双人标注，仲裁后将 `labelStatus` 改为 `APPROVED`；绑定真实目录 ID 并扩充到冻结样本量 |
| AIHIS-003 当前基线报告 | 受 AIHIS-002 阻塞 | `scripts/ai-evaluation/run-baseline.mjs` 可校验数据并从真实系统输出计算指标 | 测试、后端导出真实预测结果，记录模型、提示词、目录和规则版本后生成报告 |
| AIHIS-004 历史方案整改 | 开发完成，待范围验证 | 删除固定急性药词表、默认高血压、默认用法、占位包装和首项品规选择；仅复用跨两次完成就诊重复且字段完整的有效事实 | 完成 `outpatient-draft` 验证和临床负例验收 |
| AIHIS-005 可观测与降级 | 开发完成，待演练 | 已有连接/首个可见内容/总响应分层超时、连续失败熔断、供应商请求总耗时、首字耗时、token、错误分类、灰度及明确模型不可用提示 | 运维在试点配置下执行断网、首字超时、总超时和熔断恢复演练并归档证据 |

运行参数：`rhn.ai.connect-timeout`、`rhn.ai.first-visible-timeout`、`rhn.ai.request-timeout`、`rhn.ai.circuit-breaker.failure-threshold`、`rhn.ai.circuit-breaker.open-duration`。三个超时按连接、首个可见内容、完整响应依次生效；首字和连接超时会自动限制为不超过完整响应超时。

## 评测命令

只校验评测集结构：

```bash
node scripts/ai-evaluation/run-baseline.mjs --validate-only
```

使用真实系统或真实模型导出的 JSONL 结果生成基线：

```bash
node scripts/ai-evaluation/run-baseline.mjs \
  --predictions /secure/path/outpatient-ai-predictions.jsonl \
  --model MODEL_VERSION \
  --prompt-version PROMPT_VERSION \
  --catalog-version CATALOG_VERSION \
  --rule-version RULE_VERSION
```

输出默认写入忽略目录 `.runtime/ai-evaluation/baseline.json`。预测记录按用例类别提供 `rankedCandidateIds`、`status/candidateId`、`fields` 或 `blocked`，并可附带 `firstVisibleMs`、`totalMs`、`errorType`。流水线拒绝缺失用例，不生成填充结果。

## 决策门

- G0：五类数据全部完成双人标注和仲裁，真实预测无缺项，重复运行指标一致后放行。
- G1：历史方案负例全部通过，且不再出现默认诊断、默认用法、占位包装或多品规自动选择后放行。
