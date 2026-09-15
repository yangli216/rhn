# QMED-1：安全评价基础与对接契约

- 实现范围：Quality Foundation，内部旁路评价；未接管处方提交。
- 接口版本：`qmed-prescription-v1`。
- 引擎版本：`qmed-engine-1`。
- 固定规则集：`qmed-foundation-shadow-v1`。
- 关联：[总体方案](README.md)、[实施路线图](实施路线图.md)、[ADR-007](../架构决策-007-合理用药临床语义与AI规则治理.md)。

## 1. 当前可运行链路

```text
Clinical PrescriptionSafetyEvaluationDirectory.evaluateShadow(encounterId, prescriptionId)
  → Clinical 访问权限校验与完整处方快照装配
  → Clinical 定义的 MedicationSafetyPort
  → Quality MedicationSafetyAdapter
  → 读取固定规则集的不可变规则版本与证据
  → 强类型 Java 规则执行及动作聚合
  → 独立事务写入 Evaluation + Findings
  → 返回 SHADOW 评价结果
```

这是内部 Spring API，没有新增 HTTP 接口、前端安全面板或自动触发器。现有处方创建、提交、库存冻结、药师审核与过敏/抗菌药/皮试校验保持原有行为。后续接入点应调用 `PrescriptionSafetyEvaluationDirectory`，不要由浏览器自行构造快照。

`MedicationSafetyPort.find(prescriptionId, evaluationId)` 只读取当前租户且当前机构/科室可访问的历史结果，不重读最新药品主数据。

## 2. 与 QMED-0 的职责分工

| 内容 | 负责侧 | 当前约定 |
|---|---|---|
| 药品、成分、剂量单位、途径、频次标准语义 | Platform / QMED-0 | QMED-1 不新增或改写主数据模型 |
| 处方身份、完整条目及访问校验 | Clinical | 从自身 Repository 装配，不暴露 Entity |
| 临床语义发布版本 | QMED-0 | 现有快照统一标记 `LEGACY`，不把乐观锁 revision 伪装成语义版本 |
| 标准化及单位换算 | QMED-0 的公开能力 | 本规则不做剂量比较，也不解析显示文本换算 |
| 规则、执行记录、证据与评价 | Quality / QMED-1 | 只消费公开快照，独立持久化 |

### V1 输入

处方层：`schemaVersion / tenantId / prescriptionId / prescriptionRevision / encounterId / residentId / organizationId / departmentId / prescriptionStatus`。

每条药品请求：

- `medicationRequestId / revision / medicationId / productId / parentRequestId / status`；
- `semanticStatus = LEGACY`；
- 剂量、剂量单位、疗程和疗程单位；
- 途径 ID、编码、执行类型、解析状态；
- 频次 ID、编码以及已保存的 `frequencyRuleSnapshot`；
- 已保存的 `medicationSnapshot / itemAttributeSnapshot / standardMappingSnapshot`。

`medicationId` 指通用药概念，`productId` 对应现有 `catalogItemId`。包含整张处方的全部 MedicationRequest，包括已撤销条目；规则按状态决定适用范围。缺少 `medicationId` 可以表达为 null，运行时明确返回缺失输入，不猜测名称或产品对应关系。

QMED-0 提供成分、强度/单位、途径与频次的不可变版本后，应协调扩展快照契约和装配器，并同步升级 schema、hash 回归及依赖规则。V1 没有通用患者事实接口，不能据此开启年龄、肾功能等高级规则。

### inputHash

SHA-256 覆盖整个 V1 快照，包括处方状态、条目 revision 和已保存的嵌套快照文本。条目按请求 ID 排序，剂量与疗程数值去除无意义的小数尾零。嵌套 JSON 字符串按已保存文本原样参与哈希，不把原始 JSON 重排视为等价。

同一输入重复运行的业务结论、命中条目、规则版本相同；每次运行仍生成新的评价 ID、Finding ID 与时间。处方 revision 不随每次条目变化而递增，因此不得只靠处方 revision 判断旧评价是否有效。V1 不提供 submit 授权；QMED-3 仍须在最终门禁重新核验输入。

## 3. 首条规则语义

- 规范版本：`qmed-duplicate-spec-1`。变更本节执行语义时必须新增规则版本和执行定义版本。
- 规则编码：`QMED.EXACT_GENERIC_DUPLICATE`，版本 `1`。
- 执行定义：`java:exact-generic-duplicate:1`。
- 范围：同一处方内所有 `DRAFT / ACTIVE` 药品请求；`CANCELLED` 不参与命中。
- 条件：至少两条有效请求的 `medicationId` 相同。
- 每个重复通用药产生一条 Finding，包含排序后的全部相关请求 ID。
- 不以厂家产品 ID 区分通用药；不推断同成分或同治疗类别重复。
- 同组、不同组、分次开立均保留为待核对信号，不自动认定不合理，也不自动豁免。
- 严重程度 `LOW`，动作 `WARN`，覆盖策略元数据 `ACKNOWLEDGE`，评价模式固定为 `SHADOW`。
- 无有效条目、缺少有效条目的通用药标识时，结果为 `UNAVAILABLE`；不假定无风险。

证据为本项目工程规范，保存明确的来源、版本、原文摘录和 `SHADOW_ONLY; NOT_CLINICAL_EVIDENCE` 使用范围。它只验证确定性的重复识别链路，**不是药学证据，不具备生产阻断资格**。生产启用需另行完成临床证据、审核和 Shadow 验收。

## 4. 决策与失败语义

`severity` 与 `decision` 独立；支持 `PASS / WARN / REQUIRE_OVERRIDE / BLOCK / UNAVAILABLE`。

聚合顺序：

1. 已知 BLOCK 保留为 BLOCK，即使另一规则不可用；同时保留完整失败码。
2. 无 BLOCK 时，任一未完成检查或 UNAVAILABLE 使总体 UNAVAILABLE。
3. 全部检查完成后依次为 REQUIRE_OVERRIDE、WARN、PASS。

不支持的 schema/状态、规则集缺项、版本重复、实现版本不匹配、规则未生效或已失效均不得静默跳过后返回 PASS。每条执行记录包含 ruleCode、ruleVersion、outcome 和 failureCode。

PASS 仅表示当前一个旁路规则已完成且未命中，不能解释为完整合理用药检查通过。

数据库写入失败时返回 `UNAVAILABLE`、`evaluationId = null` 和 `EVALUATION_NOT_PERSISTED`，不返回可用的虚假评价编号。读取历史结果失败按基础设施异常向上传播，不返回空的通过结果。

## 5. 持久化与事务

迁移文件：`V1_44_0__qmed_safety_foundation.sql`，同时提供 PostgreSQL/H2 与 Oracle 版本。使用既有 AUD 物理域，维护 JSON 物理目录和中文注释。

| 逻辑对象 | 物理表 |
|---|---|
| RuleDefinition | RHN_AUD_MED_RULE |
| RuleVersion | RHN_AUD_MED_RULE_VER |
| Evaluation | RHN_AUD_MED_EVAL |
| Finding | RHN_AUD_MED_FINDING |
| Override | RHN_AUD_MED_OVERRIDE |

规则定义/版本为平台级只读目录，通过迁移安装。当前无机构自定义规则或修改已发布版本的 API。Evaluation 与 Finding 为追加写入，记录实际输入和证据快照；租户通过复合外键约束 Evaluation/Finding/Override 关联。目标处方只保存公开 ID 和快照，不跨模块 JOIN 临床表。

评价与所有 Finding 在 `REQUIRES_NEW` 事务中原子写入，避免随后业务事务回滚时丢失证据；任一 Finding 写入失败会回滚整个评价。此接口适用于已提交到数据库的快照，不能用作未提交新处方的生产门禁。

Override 本阶段只建立领域对象、表与关联约束，未开放接受覆盖的业务接口。QMED-3 必须结合最新评价、当前操作者、Finding 策略与处方输入验证后才能接受覆盖。

## 6. 验证命令

在项目根目录使用 Java 21：

```bash
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
  mvn -f backend/pom.xml \
  -Dtest=MedicationSafetyEngineTest,MedicationSafetyFoundationTest,PrescriptionSafetySnapshotServiceTest,ArchitectureTest,MedicationSafetyGovernanceTest,OrderFrequencyManagementTest,PrescriptionReviewStateTest,OutpatientPrescriptionInventoryFreezeIntegrationTest test
```

所有集成测试继承 `test` profile，使用随机 H2 数据库，不启动 HTTP 服务，不使用 Oracle 人工验证库。

覆盖：精确重复/不同通用药/取消条目、缺失输入、规则异常、规则集不完整、快照不可变、输入 hash、评价与证据持久化、租户与范围隔离、跨评价覆盖关联、外层事务回滚保留证据、持久化失败不返回 PASS，以及新表目录/中文注释对齐。

### 本次验证结果（2026-09-15）

- 上述命令运行 58 项检查，55 项通过；新增 QMED-1 测试 20 项全部通过。
- `ArchitectureTest` 的 26 项模块/架构门禁全部通过。
- `MedicationSafetyGovernanceTest`、`PrescriptionReviewStateTest`、`OutpatientPrescriptionInventoryFreezeIntegrationTest` 全部通过。
- `OrderFrequencyManagementTest` 的 3 项创建操作预期 201、实际 403；在未修改的 `b438962` 临时检出中单独执行同样失败，属于既有权限/测试基线问题。
- 另行执行 `RhnPhysicalSchemaGovernanceTest` 失败；在未修改的 `b438962` 也复现，原目录漏记 11 张既有表（analytics 4 张、药品分类/过敏原 5 张、分诊 1 张、库存冻结 1 张）。本次新增五张表的目录、列与中文注释由独立断言验证通过，未放宽原全库门禁。
- Oracle 提供对应 DDL，时间采用显式时区转换、文本列采用字符长度语义；本机缺少 Oracle 连接配置，未执行 Oracle 实库迁移。

两类基线问题没有在 QMED-1 中修改，以避免混入同事正在维护的主数据工作。完整基线恢复后仍应重跑对应门禁。

## 7. 后续接入

1. 与 QMED-0 对齐语义版本字段，替换明确标记为 LEGACY 的输入。
2. QMED-2 为现有过敏/抗菌药/皮试规则建立旧结果与新结果的 Shadow 差异记录，逐条迁移。
3. QMED-3 增加显式 safety-check HTTP API、医生面板、覆盖校验和库存冻结前最终门禁。
4. 后续规则版本扩展使用新的规则集与执行定义；不得直接把旁路工程规则改为生产 BLOCK。
