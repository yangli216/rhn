# 数据库脚本分层

本目录同时保留两条明确的路径：已存在数据库的增量升级路径，以及开发阶段新库的重建路径。两条路径不混用。

## 已有数据库的升级路径

V1.0–V1.42 的过程迁移可从 Git 提交 `0634c88` 查看，不再维护重复的历史 SQL。

| 位置 | 用途 |
| --- | --- |
| `migration/B1_42_1__rhn_schema_and_metadata.sql` | PostgreSQL 最终结构与标准元数据，294 张表 |
| `oracle/B1_42_1__rhn_schema_and_metadata.sql` | Oracle 对等基线，保留其 CLOB、数字与 UTC 唯一索引语义 |
| `h2/V1_42_2__h2_clob_types.sql` | 仅 H2 的长文本类型适配 |
| `local/V1_42_3__development_hospital.sql`、`oracle-local/` 同名脚本 | 演示机构、人员、药品、库存和打印设备，按主键防止重复插入 |
| 两个方言的 `V1_43_0__physical_catalog_comments.sql` | 补齐既有表的业务粒度与字段注释 |
| `seeds/` | 可选国家基药导入来源，不在任何默认 Flyway 扫描路径中 |

标准元数据保留正式字典、术语、参数和受控打印定义；开发脚本只维护可复用的医院样例，不保存验收过程中产生的患者、就诊、截图或运行记录。测试专用场景由测试代码创建，不写进生产基线。

空库会执行 B 基线；已有 Flyway 历史的库会跳过 B 文件。不要改写已发布的基线、重复应用旧 V1 脚本，或清空 Flyway 历史后对非空库重新初始化。下一次结构变化使用高于当前版本的配对 PostgreSQL/Oracle 迁移。

其他已有且完整执行到 V1.42 的 Oracle 环境继续保留原历史，沿用 `oracle-local` 的历史兼容配置，只执行新的 V 迁移。当前 RHN Oracle 开发 Schema 已按新库重建路径移除旧数据并初始化到 `1.77.1`；更旧的库，以及严格校验已移除历史文件的 PostgreSQL 开发库，使用空 Schema 重建。本轮不提供历史业务数据的升级转换，日常启动也不自动删库。

后端自动化测试固定使用 `test` 与随机 H2；两套持久人工验证服务使用 `oracle-local`。验证 SQL 方言时使用单独创建的临时数据库/Schema，执行完删除该精确对象，不触碰人工验证 Schema。

疾病数据生成器输出到忽略的 `artifacts/generated-disease/`，须核对现有标识和标准版本后再形成新迁移。物理目录在 `docs/foundation/rhn-physical-schema-map.json` 中维护，完整一致性由 `RhnPhysicalSchemaGovernanceTest` 检查。

## 新库重建路径

本轮字段命名治理已经完成，适合在开发阶段建立一个新库：新库只装规范要求的结构、标准元数据和可复用开发样例。当前开发库已移除旧库数据；其他环境如需回退，须由数据库 owner 单独保留备份。为避免把患者、就诊、流程和审计运行数据带入新库，新增了 `db/rebuild/` 包：

| 位置 | 用途 |
| --- | --- |
| `rebuild/postgresql/B1_77_0__rhn_schema_and_standard_metadata.sql` | 截至 1.77.0 的 PostgreSQL 结构与标准元数据单一基线 |
| `rebuild/oracle/B1_77_0__rhn_schema_and_standard_metadata.sql` | Oracle 对等基线，保留 CLOB、UTC 函数索引和 Oracle 语义 |
| `rebuild/local/V1_77_1__development_hospital.sql`、`rebuild/oracle-local/` | 开发医院样例，使用最终物理字段名 |
| `rebuild/h2/V1_77_2__h2_clob_types.sql` | H2 长文本适配 |
| `rebuild/manifest.json` | 源迁移清单、哈希和数据范围 |

这些文件由 `scripts/rebuild-database.mjs` 生成，不要手工修改。修改已发布迁移后重新生成并执行 `node scripts/rebuild-database.mjs --check`。新库只能指向这组位置；已有库继续使用上面的 `migration`/`oracle` 路径，不能把重建位置混入日常 profile。

本地隔离验证可以使用 `--spring.profiles.active=rebuild`；PostgreSQL 空库使用 `rebuild-postgres`，Oracle 空 Schema 使用 `rebuild-oracle`。Oracle 目标必须先由 DBA 创建为空 Schema，本项目不会自动删除 Schema、清空表或执行 Flyway repair。

## QMED 并行开发版本冲突兼容（2026-09-17）

合并后远程 `1.43`（注释）、`1.45`（规则工作台）保持原文。本地旧同号迁移原文归档在 `db/legacy-qmed0/`，不在扫描路径中。`1.49` 补齐标准剂型，`1.50` 按对象是否存在创建语义表，`1.51` 补齐旧本地库缺失的工作台结构与注释；不删除历史、不使用 repair。已有本地 Oracle 库沿用上文 `oracle-local` 的历史兼容配置，空库和远程库按正常顺序执行。下一次迁移使用高于 `1.51.0` 的版本。

两套历史升级与数据保留由 `QmedParallelMigrationTest` 在随机 H2 中验证。详情见 [远程合并记录](../../../../../docs/architecture/rational-medication/远程合并记录-2026-09-17.md)。
