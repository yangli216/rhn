# RHN 物理表命名映射

完整表、字段、逻辑名和中文注释统一维护在 [rhn-physical-schema-map.json](rhn-physical-schema-map.json)，避免重复维护一份易过期的 Markdown 表格。

物理表采用 `RHN_<DOMAIN>_<ENTITY_ABBR>`，标识符最多 30 字符。逻辑名采用 `domain.entity`；标识字段使用 `ID_`，状态字段使用 `SD_`。表注释说明“一行代表”的业务粒度，字段注释说明业务含义。

物理字段的每个词段最多 7 个字符，完整 `REVISION` 例外。长词统一登记在 [字段缩写词典](../database/physical-column-naming.md)，不使用任意截断。1.77.0 的 [逐表改名清单](../database/column-renames-1.77.0.md) 保留旧名、新名、逻辑名和业务含义，便于评审与追溯；工作台「设计规范」可直接查看。

当前目录覆盖表数由 [自动目录索引](../database/generated/index.json) 生成，可在开发服务 `/schema-workbench.html` 查看表、字段、关系与设计规范。`AN` 是既有统计分析持久化表的命名空间，`OP` 是既有预检分诊表的命名空间；与原有 `ANL` 指标采样域、`VIS` 就诊域分别登记，保留现有数据库和两个工作区的兼容性。

新增或修改表时，同时更新 PostgreSQL、Oracle 迁移及这份 JSON；存在 H2 长文本类型差异时更新 H2 兼容迁移。`RhnPhysicalSchemaGovernanceTest` 验证完整表/字段集合、名称与注释一致性，`ArchitectureTest` 验证代码模块边界。

数据库初始化与历史迁移处理见 [数据库基线](../../backend/src/main/resources/db/README.md)。

## QMED-1 合理用药评价基础

| 领域 | 规范逻辑名 | 中文说明 | 旧物理表名 | RHN 物理表名 | 字段数 |
|---|---|---|---|---|---:|
| AUD | `aud.quality_rule_definition` | 合理用药规则定义；一行代表一条平台级规则定义 | `quality_rule_definition` | `RHN_AUD_MED_RULE` | 4 |
| AUD | `aud.quality_rule_version` | 合理用药规则版本；一行代表一条不可变规则版本及证据 | `quality_rule_version` | `RHN_AUD_MED_RULE_VER` | 12 |
| AUD | `aud.quality_evaluation` | 合理用药评价；一行代表一次完整处方的旁路安全评价 | `quality_evaluation` | `RHN_AUD_MED_EVAL` | 18 |
| AUD | `aud.quality_finding` | 合理用药风险发现；一行代表某次评价中一条规则的风险发现 | `quality_finding` | `RHN_AUD_MED_FINDING` | 11 |
| AUD | `aud.quality_override` | 合理用药风险覆盖记录；一行代表用户对一个风险发现的覆盖理由 | `quality_override` | `RHN_AUD_MED_OVERRIDE` | 7 |

## QMED-0 临床语义版本

| 逻辑表 | 物理表 | 说明 |
| --- | --- | --- |
| bd.clinical_semantic_version | RHN_BD_CLIN_SEM_VER | 不可变临床语义版本与变更记录，包含成分、成分映射、药品、频次定义/配置及运行时途径/频次快照 |

迁移：V1_45_0。语义版本使用内容哈希，记录主键仅用于维护并发检查和审计排序，不作为临床语义版本。
