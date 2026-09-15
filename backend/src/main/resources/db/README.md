# 数据库基线

本目录保存最终结构、标准元数据和开发样例。V1.0–V1.42 的过程迁移可从 Git 提交 `0634c88` 查看，不再维护重复的历史 SQL。

| 位置 | 用途 |
| --- | --- |
| `migration/B1_42_1__rhn_schema_and_metadata.sql` | PostgreSQL 最终结构与标准元数据，294 张表 |
| `oracle/B1_42_1__rhn_schema_and_metadata.sql` | Oracle 对等基线，保留其 CLOB、数字与 UTC 唯一索引语义 |
| `h2/V1_42_2__h2_clob_types.sql` | 仅 H2 的长文本类型适配 |
| `local/V1_42_3__development_hospital.sql`、`oracle-local/` 同名脚本 | 演示机构、人员、药品、库存和打印设备，按主键防止重复插入 |
| 两个方言的 `V1_43_0__physical_catalog_comments.sql` | 补齐既有表的业务粒度与字段注释 |
| `seeds/` | 可选国家基药导入来源，不在任何默认 Flyway 扫描路径中 |

标准元数据保留正式字典、术语、参数和受控打印定义；开发脚本只维护可复用的医院样例，不保存验收过程中产生的患者、就诊、截图或运行记录。测试专用场景由测试代码创建，不写进生产基线。

空库会执行 B 基线；已有 Flyway 历史的库会跳过 B 文件。不要改写已发布的基线、重复应用旧 V1 脚本，或清空 Flyway 历史后对非空库重新初始化。下一次结构变化使用高于 `1.43.0` 的配对 PostgreSQL/Oracle 迁移。

已有且完整执行到 V1.42 的 Oracle 开发库继续保留原历史，沿用 `oracle-local` 的历史兼容配置，只执行新的 V 迁移。更旧的库，以及严格校验已移除历史文件的 PostgreSQL 开发库，使用空 Schema 重建；本轮不提供历史业务数据的升级转换。日常启动不自动删库。

后端自动化测试固定使用 `test` 与随机 H2；两套持久人工验证服务使用 `oracle-local`。验证 SQL 方言时使用单独创建的临时数据库/Schema，执行完删除该精确对象，不触碰人工验证 Schema。

疾病数据生成器输出到忽略的 `artifacts/generated-disease/`，须核对现有标识和标准版本后再形成新迁移。物理目录在 `docs/foundation/rhn-physical-schema-map.json` 中维护，完整一致性由 `RhnPhysicalSchemaGovernanceTest` 检查。
