# RHN 物理表命名映射

完整表、字段、逻辑名和中文注释统一维护在 [rhn-physical-schema-map.json](rhn-physical-schema-map.json)，避免重复维护一份易过期的 Markdown 表格。

物理表采用 `RHN_<DOMAIN>_<ENTITY_ABBR>`，标识符最多 30 字符。逻辑名采用 `domain.entity`；标识字段使用 `ID_`，状态字段使用 `SD_`。表注释说明“一行代表”的业务粒度，字段注释说明业务含义。

当前目录覆盖 294 张表。`AN` 是既有统计分析持久化表的命名空间，`OP` 是既有预检分诊表的命名空间；与原有 `ANL` 指标采样域、`VIS` 就诊域分别登记，保留现有数据库和两个工作区的兼容性。

新增或修改表时，同时更新 PostgreSQL、Oracle 迁移及这份 JSON；存在 H2 长文本类型差异时更新 H2 兼容迁移。`RhnPhysicalSchemaGovernanceTest` 验证完整表/字段集合、名称与注释一致性，`ArchitectureTest` 验证代码模块边界。

数据库初始化与历史迁移处理见 [数据库基线](../../backend/src/main/resources/db/README.md)。
