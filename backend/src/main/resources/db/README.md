# 数据库脚本规范与基线

本项目数据库迁移脚本已全面压平重整为 **1.84.0 单一全量基线**，消除了历史冗余与版本碎片。

## 目录分层结构

| 目录/文件 | 方言与适用环境 | 用途与说明 |
| --- | --- | --- |
| `migration/B1_84_0__rhn_schema_and_metadata.sql` | PostgreSQL / H2 | 截至 1.84.0 的全量表结构（DDL）、唯一约束、索引及标准平台元数据（字典、参数、打印模板等）单一基线 |
| `oracle/B1_84_0__rhn_schema_and_metadata.sql` | Oracle | Oracle 对等全量基线，保留 CLOB、数字精度、UTC 函数唯一索引及 Oracle 语义 |
| `local/V1_84_1__development_hospital.sql` | PostgreSQL / H2 | 开发与演示环境医院样例数据（机构、科室、人员、药品字典样例），按主键幂等插入 |
| `oracle-local/V1_84_1__development_hospital.sql` | Oracle | Oracle 开发与演示环境医院样例数据，幂等插入 |
| `h2/V1_84_2__h2_clob_types.sql` | H2 专有适配 | H2 内存数据库测试专用的 CLOB/JSON 类型兼容适配 |

## 环境与 Profile 配置映射

1. **测试隔离（自动化测试）**：
   - Profile：`test`（配置见 `backend/src/test/resources/application-test.yml`）
   - 数据源：随机隔离 H2 内存库（`jdbc:h2:mem:rhn-${random.uuid}`）
   - Flyway 扫描路径：`classpath:db/migration,classpath:db/local,classpath:db/h2`
   - 单次构建执行 3 个干净脚本（B1_84_0 -> V1_84_1 -> V1_84_2），快速初始化。

2. **本地开发与人工验证（持久化 Oracle）**：
   - Profile：`oracle-local`（配置见 `backend/src/main/resources/application-oracle-local.yml`）
   - 数据源：本地持久化 Oracle 实例（端口 1521，服务端口 8080）
   - Flyway 扫描路径：`classpath:db/oracle,classpath:db/oracle-local`
   - 具备 `validate-on-migrate: false` 与 `out-of-order: true` 容错。

3. **后续增量迁移规范**：
   - 自 1.84.0 之后的新增业务变更，一律使用新版本号递增：如 `V1_85_0__<description>.sql`。
   - 每次新增表结构与元数据变更，必须保持 `migration/` 与 `oracle/` 双目录同版本对齐。
