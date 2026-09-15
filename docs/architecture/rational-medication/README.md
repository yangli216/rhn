# RHN 合理用药平台总体方案

- 状态：设计基线，待按实施路线图逐步落地
- 日期：2026-09-15
- 架构基线：[RHN 2.0 模块架构](../RHN2.0模块架构.md)
- 配套决策：[ADR-006 物理模块化与依赖倒置](../架构决策-006-物理模块化与依赖倒置.md)
- 约束决策：[ADR-007 合理用药临床语义与 AI 规则治理](../架构决策-007-合理用药临床语义与AI规则治理.md)
- 实施计划：[合理用药实施路线图](实施路线图.md)
- QMED-1 实现与协作契约：[接口与验收](QMED-1接口与验收.md)（内部 SHADOW 评价基础，尚未接管临床门禁）

## 1. 建设目标

RHN 不把“合理用药”建设成一个孤立的审方功能，而是建设为临床质量平台的首个完整业务切片，形成可复用的“标准化临床数据 + 药学知识 + 规则 + 证据 + 评价 + 反馈”能力。

最终目标：

```text
权威医学知识
      ↓
AI 知识工程
      ↓
标准化药学知识
      ↓
版本化合理用药规则
      ↓
确定性规则执行
      ↓
医生用药安全检查 / 药师审方 / 事后质控
      ↓
真实业务反馈
      ↓
规则持续优化
```

AI 的定位是“药学知识工程师”，不是“生产环境临床决策者”。AI 可以抽取、标准化、生成候选规则、发现冲突和生成测试用例；生产环境中的 `PASS / WARN / REQUIRE_OVERRIDE / BLOCK` 必须由确定性、版本化、可测试的规则执行。

## 2. 能力边界

### 2.1 医生开药安全检查

医生开药阶段提供两层检查：

1. 编辑阶段的轻量预检：明显过敏、明显禁忌、基本输入异常等高价值低噪声检查。
2. 处方提交前的完整处方检查：相互作用、重复治疗、总日剂量、联合用药、抗菌药限制等需要查看整张处方的规则。

正式合理用药评价的输入必须是“完整处方 + 全部 MedicationRequest + 患者必要临床上下文”，不能把逐药品检查当作最终安全结论。

### 2.2 药师处方审核

药师审方继续由 `rhn-clinical / pharmacy` 拥有，现有 `PharmacyReview` 是权威人工审方流程，不迁入 `rhn-quality`。

`rhn-quality` 向药师提供：

- 系统检查 Finding；
- 风险严重程度；
- 证据与规则版本；
- 医生确认/覆盖理由；
- 本次安全评价版本。

药师继续完成 `PASS / REJECT / INTERVENE / OVERRIDE` 等专业业务决策。

### 2.3 处方事后质控

处方提交、发药完成后，通过 Outbox 事件异步执行深度质控，用于：

- 抗菌药使用评价；
- 不合理处方统计；
- 高风险处方分析；
- 医生覆盖行为分析；
- 药师干预效果分析；
- 规则价值和告警疲劳分析。

同步检查强调快速、确定、可靠；异步评价可以更深、更复杂，并允许 AI 参与解释和辅助分析。

### 2.4 药学知识与规则库

长期价值最高的资产不是规则引擎代码本身，而是：

```text
药品知识
+ 成分与药理分类
+ 剂量与用法知识
+ 相互作用与禁忌知识
+ 指南/说明书/法规证据
+ 规则版本
+ 规则测试
+ 医生和药师反馈数据
```

## 3. 模块职责

### 3.1 rhn-platform

负责基础主数据与临床标准概念，包括：

- Medication / MedicationProduct / Ingredient；
- DosageForm；
- Route；
- Frequency；
- Clinical Unit / Package Unit；
- 机构药品目录、启停、价格、库存关联和本地映射。

核心问题是“这个数据是什么、它的标准语义是什么”。

### 3.2 rhn-quality

负责合理用药知识、规则和评价结果，建议按以下方向演进：

```text
com.rhn.quality.medication
├── knowledge
│   ├── DrugInteraction
│   ├── DoseConstraint
│   ├── Contraindication
│   ├── Indication
│   ├── PopulationRestriction
│   └── MedicationKnowledgeGraph
├── rule
│   ├── RuleDefinition
│   ├── RuleVersion
│   ├── RuleSet
│   ├── MedicationSafetyRule
│   ├── MedicationSafetyEngine
│   ├── RuleRegistry
│   └── DecisionAggregator
├── evaluation
│   ├── MedicationSafetyEvaluation
│   ├── MedicationSafetyFinding
│   ├── Evidence
│   └── Override
└── infrastructure
```

核心问题是“这个药在当前患者、当前处方上下文中是否安全/合理，为什么”。

### 3.3 rhn-intelligence

负责 AI 知识工程能力，例如 `MedicationKnowledgeAgent`：

- 文档导入与解析；
- 药品/成分/剂量/特殊人群知识抽取；
- 术语对齐；
- Candidate Rule 生成；
- Evidence 定位；
- AI Critic 复核；
- 冲突检测；
- 测试用例生成；
- 规则解释和维护建议。

依赖方向保持 `rhn-intelligence -> rhn-quality API`。生产合理用药运行时不得依赖 AI 在线可用。

### 3.4 rhn-clinical

Clinical 拥有处方、MedicationRequest 和医生工作流。Clinical 定义消费 Port，由 Quality 提供 Adapter；Clinical 不直接依赖 Quality 内部实现。

示意：

```java
public interface MedicationSafetyPort {
    MedicationSafetyDecision evaluate(PrescriptionSafetyRequest request);
}
```

这遵循 RHN 2.0 已确定的“调用方定义 Port、提供方实现 Adapter”的依赖倒置方式。

## 4. Medication Semantic Baseline

在批量建设合理用药规则前，必须先建立药品临床语义基线。首批至少治理七类数据：

1. 药品；
2. 成分；
3. 规格/强度；
4. 临床剂量单位；
5. 包装单位；
6. 给药途径；
7. 给药频次。

所有会参与临床规则计算的数据，必须具备：

```text
Stable ID
+ Canonical Semantic
+ Version
+ Effective Period
+ Source
+ Status
+ Runtime Snapshot
```

### 4.1 药品三层模型

建议统一为：

```text
Ingredient
    ↓
Medication
    ↓
Medication Product
```

- `Ingredient`：阿莫西林、克拉维酸等成分；
- `Medication`：临床可用药物概念，包含成分、规格、剂型等；
- `MedicationProduct`：厂家、批准文号、包装等具体产品。

合理用药知识优先绑定 `Ingredient / Medication`；库存、价格、厂家主要绑定 `MedicationProduct`。换厂家不应导致通用药理规则重建。

### 4.2 Frequency 从“字典”升级为临床术语

频次不能只保存 `code/name`。例如：

```text
BID
semanticType = TIMES_PER_DAY
timesPerDay = 2
```

```text
Q8H
semanticType = INTERVAL
interval = 8
intervalUnit = HOUR
```

```text
PRN
semanticType = AS_NEEDED
```

只有这样，规则引擎才能稳定计算单次剂量、日剂量和间隔要求。

### 4.3 Route 标准化

Route 需要至少包含：

```text
code
standardCode
display
category
administrationClass
systemic/local
injectable
version
status
```

以支持“仅口服”“禁止静脉”“注射剂限制”等规则。

### 4.4 临床剂量单位与包装单位分离

临床剂量单位：`mg / g / μg / mL / IU / mmol / mg/kg / mg/kg/day` 等，要求有维度、规范单位和换算关系。

包装单位：片、粒、袋、支、瓶、盒等，用于库存和发药。

禁止使用字符串猜测进行剂量比较；进入安全引擎前必须完成标准化和单位换算。

## 5. 动态维护治理

现有动态维护入口保留，但从“直接 CRUD”升级为“受治理的 Authoring”。

```text
Authoring
   ↓
Validation
   ↓
Versioning
   ↓
Approval
   ↓
Publish
   ↓
Runtime Snapshot
```

### 5.1 数据分级

| 等级 | 数据示例 | 管理策略 |
|---|---|---|
| S0 标准语义 | 单位、频次语义、途径语义、成分、标准药品概念 | 强治理、版本发布 |
| S1 临床知识 | 最大剂量、禁忌、相互作用、特殊人群限制 | Quality 规则/知识版本管理 |
| S2 机构业务配置 | 药品启停、发药药房、价格、库存 | 允许动态配置 |
| S3 显示/映射 | 本院码、别名、显示名称、排序 | 灵活动态维护 |

机构可以维护本地表达，但不能随意改变标准临床语义。

### 5.2 本地值映射到 Canonical Concept

例如各机构可以显示：

```text
BID
每日2次
2/日
```

但后台都映射到同一个 Canonical Frequency：

```text
frequencyConcept = BID
timesPerDay = 2
```

### 5.3 已发布语义不可原地修改

发布后禁止直接修改临床语义，只能：

```text
PUBLISHED v3
   ↓ clone
DRAFT v4
   ↓ validate
APPROVED v4
   ↓ publish
PUBLISHED v4
```

推荐统一生命周期：

```text
DRAFT → VALIDATED → APPROVED → PUBLISHED → RETIRED
```

### 5.4 语义变化检测与影响分析

维护系统必须区分：

- `DISPLAY_CHANGE`：例如“每日2次”改为“每天两次”；
- `CLINICAL_SEMANTIC_CHANGE`：例如 `timesPerDay 2 -> 3`、规格强度变化、单位换算变化。

语义变化发布前必须分析受影响对象：

- 合理用药规则；
- 医嘱模板；
- 套餐/路径；
- 活动处方；
- 规则回归测试。

AI 可以解释影响，但不能替代高风险语义变更的发布控制。

## 6. 默认值与安全知识分离

Master Data 中的：

```text
defaultDose
defaultRoute
defaultFrequency
```

只用于提升录入效率，不代表安全范围。

Quality Knowledge 中的：

```text
minimumDose
maximumSingleDose
maximumDailyDose
ageRestriction
renalAdjustment
contraindication
interaction
```

用于判断合理性。

必须从数据模型上避免“默认值 = 合理值”的隐性假设。

## 7. 规则与证据模型

每条生产规则至少需要：

```text
RuleDefinition
├── code
├── category
├── title
└── RuleVersion
    ├── condition / executable definition
    ├── severity
    ├── decision
    ├── overridePolicy
    ├── effectiveFrom / effectiveTo
    ├── ruleSetVersion
    └── Evidence[]
```

Evidence 至少记录：

```text
sourceType
sourceTitle
sourceVersion
sourceId / sourceUrl
document section / location
original evidence excerpt or normalized evidence reference
license / usage scope
```

历史 Evaluation 必须能够追溯当时实际使用的 RuleVersion 和证据。

## 8. AI Knowledge Factory

AI 不直接产生 `ACTIVE` 规则。标准流程：

```text
Source Registry
      ↓
Document Import
      ↓
AI Extractor
      ↓
Candidate Knowledge / Candidate Rule
      ↓
AI Critic
      ↓
Schema & Consistency Validation
      ↓
Human/Policy Review
      ↓
RuleVersion
      ↓
Shadow
      ↓
Publish
```

### 8.1 Source Registry

首批只从白名单来源建设规则：

- 法律法规和监管规范；
- 经核准药品说明书；
- 国家/行业临床指南；
- 药典和专业规范；
- 经治理的机构内部制度；
- 获得许可的专业数据源。

普通网页、论坛和模型自身记忆只能用于发现线索，不能直接成为生产规则依据。

Source 必须记录版本、发布日期/生效期、许可和可再分发范围。

### 8.2 Candidate Rule

AI 先输出候选结构，不直接写入生产规则。例如：

```json
{
  "candidateType": "AGE_CONTRAINDICATION",
  "medicationId": "...",
  "condition": {
    "fact": "patient.age",
    "operator": "<",
    "value": 18,
    "unit": "year"
  },
  "proposedDecision": "BLOCK",
  "evidence": {
    "source": "...",
    "section": "禁忌"
  },
  "extractionConfidence": 0.97
}
```

`extractionConfidence` 只代表 AI 对抽取正确性的置信度，不等价于医学证据等级。

### 8.3 AI Critic

Critic 专门检查常见知识工程错误：

- “慎用”误识别为“禁用”；
- 推荐剂量误识别为最大剂量；
- 日剂量和单次剂量混淆；
- 丢失年龄、肾功能、妊娠等前置条件；
- 混淆成分、通用药和具体产品；
- 来源之间存在冲突却未标记。

AI 审 AI 只是提高候选质量，不能取代发布治理。

## 9. 规则发布等级

为适配早期缺少完整药学团队的现实，规则按证据和风险分级发布。

### L1 强确定规则

来源为明确法规、明确说明书禁忌、明确剂量上限或机构强制制度。经过要求的审核后，允许使用 `BLOCK / REQUIRE_OVERRIDE`。

### L2 药学建议规则

例如相互作用、年龄慎用、重复治疗、剂量偏高等。早期以 `WARN` 为主，高风险时经过更高等级审核后才允许 `REQUIRE_OVERRIDE`。

### L3 AI 临床提示

只允许 `INFO / SUGGESTION`，不得直接 `BLOCK`。

基本原则：**系统行为越强，所需证据、验证和审核等级越高。**

## 10. 规则执行策略

第一阶段不建设通用可视化 DSL，不引入难以控制的动态脚本执行。先使用强类型 Java 规则：

```java
public interface MedicationSafetyRule {
    RuleCode code();
    List<MedicationSafetyFinding> evaluate(MedicationSafetyContext context);
}
```

优先规则：

- AllergyRule；
- DuplicateMedicationRule；
- AntimicrobialOutpatientRule；
- AntimicrobialDurationRule；
- SkinTestRule；
- MaxSingleDoseRule；
- MaxDailyDoseRule；
- AgeContraindicationRule；
- DrugInteractionRule。

积累足够真实规则后，再识别可安全配置的共性，逐步形成受限 DSL + Compiler。生产环境执行编译后的规则/AST/Predicate，而不是实时 LLM Prompt。

## 11. Safety Check 工作流

### 11.1 决策模型

统一返回：

```text
PASS
WARN
REQUIRE_OVERRIDE
BLOCK
UNAVAILABLE
```

`UNAVAILABLE` 永远不能伪装成 `PASS`。具体 fail-open / fail-closed 策略必须按规则类型和业务场景配置并验收。

严重程度和动作必须分离，例如：

```text
severity = HIGH
decision = REQUIRE_OVERRIDE
```

不能把 HIGH 自动等价为 BLOCK。

### 11.2 Finding

Finding 是核心可审计对象，至少包括：

```text
findingId
evaluationId
ruleCode
ruleVersion
category
severity
decision
message
medicationRequestIds
evidence
overridePolicy
suggestedAction
```

### 11.3 独立安全检查

建议支持显式流程：

```text
POST .../prescriptions/{id}/safety-check
        ↓
保存 Evaluation + Findings
        ↓
返回 evaluationId
        ↓
医生处理警告/覆盖
        ↓
POST .../prescriptions/{id}/submit
```

提交时校验：

- evaluationId；
- prescriptionRevision；
- inputHash；
- override 信息。

若安全检查后处方发生变化，必须重新评价。服务端 submit 仍必须做最终安全门禁，不能只相信前端曾经检查过。

### 11.4 拦截时点

正式检查位于 `PrescriptionService.submit()` 的库存冻结之前：

```text
load prescription
  ↓
load all medication requests
  ↓
medication safety final gate
  ↓
inventory freeze
  ↓
activate requests
  ↓
submit prescription
```

避免先冻结库存再因安全规则失败而补偿。

## 12. Runtime Snapshot 与审计

规则执行不能依赖“当前最新主数据”重建历史语义。

建议安全输入/处方保存必要快照：

```text
PrescriptionSafetySnapshot
├── medicationId / medicationVersion
├── ingredientIds
├── strength / strengthUnit
├── dose / doseUnit
├── routeCode / routeVersion
├── frequencyCode / frequencyVersion
├── duration
├── prescriptionRevision
└── relevant clinical fact versions
```

Evaluation 记录：

```text
ruleSetVersion
ruleVersion(s)
inputHash
input snapshot reference
facts/evidence versions
```

确保几年后仍能回答“当时为什么触发/没有触发”。

## 13. 建议持久化对象

第一阶段至少需要：

```text
quality_rule_definition
quality_rule_version
quality_evaluation
quality_finding
quality_override
```

后续增加：

```text
quality_rule_set
quality_rule_scope
quality_remediation_link
medication_knowledge_* / knowledge relation tables
knowledge_source / source_document / candidate_rule
```

具体 Flyway 命名和表结构在实施切片中按当前迁移序列确定，不在本设计文档中预占版本号。

## 14. 药物知识图谱

长期构建确定性的 Medication Knowledge Graph，典型关系包括：

```text
Medication
├── containsIngredient
├── belongsToClass
├── relatedAllergen
├── interactsWith
├── contraindicatedWith
├── indication
├── doseConstraint
└── populationRestriction
```

例如：

```text
阿莫西林克拉维酸钾
    contains → 阿莫西林
    is-a    → 青霉素类
    is-a    → β-内酰胺类
```

运行时执行图谱/规则确定性推导，不使用 LLM 临时猜测药品与过敏原、分类或相互作用关系。

## 15. 规则测试

Candidate Rule 生成时应同步产生：

- Positive Case；
- Negative Case；
- Boundary Case；
- Missing Data Case；
- Conflict Case。

规则库最终不是“规则表”，而是：

```text
Rule + Evidence + Test Cases + Expected Results + Version
```

发布新版本前必须通过结构校验、单元测试、回归测试和必要的 Shadow 对比。

## 16. 现有规则迁移

当前已有过敏、抗菌药、皮试和药师审核等能力。迁移遵循：

```text
现有实现保持生效
      +
新 Quality 规则 Shadow Run
      ↓
比较输入、输出和异常场景
      ↓
确认一致或明确差异
      ↓
逐条切换权威实现
```

禁止一次性删除旧安全检查，也禁止长期双重执行导致重复告警。

## 17. 首批规则范围

### Batch 1：使用现有数据即可落地

- 药物过敏；
- 过敏史未记录；
- 相同通用药重复；
- 抗菌药门诊权限；
- 抗菌药最大天数；
- 皮试要求；
- 最大单次/日剂量（知识就绪后）；
- 年龄禁忌（知识就绪后）。

### Batch 2：药学知识扩展

- 药理类别重复；
- Drug-Drug Interaction；
- 给药途径合理性；
- 给药频次合理性；
- 诊断-适应症；
- 疾病禁忌。

### Batch 3：依赖临床事实平台成熟度

- 肾功能剂量调整；
- 肝功能剂量调整；
- 电解质风险；
- QT 风险；
- 妊娠/哺乳；
- 实验室指标关联。

Quality 不得为实现这些规则直接访问 Diagnostics Repository/Entity/Table；需要先通过 Health Core/Clinical 公共事实 API 提供可版本化输入。

## 18. 反馈闭环

将 `QualityFinding` 与医生处置、`PharmacyReview` 和最终处方变化建立关联，形成规则效果指标：

- 触发次数；
- 医生确认率；
- 医生覆盖率；
- 修改处方率；
- 药师干预率；
- 药师认可率；
- 误报/无效告警趋势。

AI 可以基于这些数据提出规则优化建议，但只能形成新 Candidate / 新 RuleVersion，禁止生产规则自动自我修改。

## 19. 可复用方向

本方案不仅服务合理用药。核心模型应能够逐步复用到：

- 病历质控；
- 处方质控；
- 公卫档案质控；
- 诊疗规范检查；
- 临床路径检查。

最终形成 RHN 的 Clinical Quality Knowledge Platform，而不是多个彼此割裂的“规则子系统”。

## 20. 架构红线

1. 参与临床规则计算的数据必须有稳定 ID、标准语义、版本、有效期、来源和运行时快照。
2. 已发布临床语义不得原地 UPDATE，只能发布新版本。
3. 机构可以维护本地映射和业务参数，不能自由改变标准临床语义。
4. AI 内容首先进入 Candidate 状态，不能直接成为生产规则。
5. 生产安全决策不得依赖 LLM 实时判断。
6. 所有生产规则必须绑定 RuleVersion 和 Evidence。
7. Quality 不直接访问其他领域的 Repository/Entity/Table，只使用公开 API、Port、快照和事件。
8. 医生机器安全检查与药师人工审方保持两个责任边界。
9. `UNAVAILABLE` 不得等价为 `PASS`。
10. 规则严重程度与执行动作分离。
11. 安全评价基于整张处方完成，逐药品预检不能替代最终处方检查。
12. 新规则上线前必须有测试；旧规则迁移使用 Shadow 对比后逐条切换。
