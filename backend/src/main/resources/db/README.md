# 数据库脚本规范与基线

数据库迁移已于 2026-10-14 第二次压平为 **1.128.0 单一全量基线**（上一次为 1.84.0）。基线只用于空库；已有数据库保留已执行的历史，不会被改写。

## 目录分层结构

| 目录/文件 | 方言与适用环境 | 用途与说明 |
| --- | --- | --- |
| `migration/B1_128_0__rhn_schema_and_metadata.sql` | PostgreSQL / H2 | 截至 1.128.0 的全量表结构、约束、索引及标准平台元数据（字典、参数、打印模板、术语目录等） |
| `oracle/B1_128_0__rhn_schema_and_metadata.sql` | Oracle | Oracle 对等全量基线，保留 CLOB、数字精度、函数索引及 Oracle 语义 |
| `local/V1_128_1__development_hospital.sql` | PostgreSQL / H2 | 开发与演示医院样例及基础数据，显式列名插入与更新 |
| `oracle-local/V1_128_1__development_hospital.sql` | Oracle | Oracle 对等的开发样例及基础数据 |
| `h2/V1_128_2__h2_compatibility.sql` | H2 专有 | 测试库的 CLOB/JSON 类型兼容调整 |

## 生成与验证

基线由 `scripts/schema-squash/SquashMigrations.java` 生成，禁止手改：

- `migration/`、`oracle/`、`h2/` 按版本顺序拼接原迁移，文件头记录每个来源及 sha256。
- 开发数据原本与后续迁移交错执行、且使用按位置插入，不能直接拼接。工具在 H2 上分别以“原迁移＋开发数据”和“原迁移”建库，按主键逐表求差（新增、修改、删除），以显式列名输出两种方言；仅随建库时间变化的时间戳列不计入差异，开发数据固定的时间戳保留。
- 工具随后用新文件重建 H2 库，结构与每一行都须与原迁移一致：测试 profile（含开发数据）342 张表、57,344 行；生产空库路径 56,888 行，均一致。

**Oracle 空库演练已通过（2026-10-14）**：在 Oracle 19c 19.22 的独立临时 schema 上执行 `oracle` 与 `oracle-local` 全部 6 个迁移至 `1.129.3`，Flyway 校验通过，再次迁移无变更；342 张业务表、57,436 行与同版本 H2 逐表行数一致。50 项数据检查通过，无无效对象、禁用或未验证约束；配套后端以 `oracle-local` 在临时端口启动且健康检查 UP。演练发现原 Oracle 历史遗漏公共 `V1_103_0` 的 2 条别名及 2 条搜索记录，已在空库基线补齐 Oracle 对等内容。临时 schema 和进程已清理，现有开发 schema 与 8080/5173 服务未替换。证据：工作区 `.runtime/verification/oracle-rehearsal/20261014T104452Z/result.json`；完整说明见 [走查记录](../../../../../docs/foundation/基础数据与字典走查-2026-10-14.md)。实际重建须使用演练版本的脚本、后端和前端；逐表行数检查不等于逐字段内容或人工业务验收。

## 环境与 Profile 配置映射

1. **测试隔离（自动化测试）**：Profile `test`，随机隔离 H2 内存库；Flyway 路径 `classpath:db/migration,classpath:db/local,classpath:db/h2`，执行 B1_128_0 → V1_128_1 → V1_128_2。
2. **本地开发与人工验证（持久化 Oracle）**：Profile `oracle-local`，Flyway 路径 `classpath:db/oracle,classpath:db/oracle-local`，`validate-on-migrate: false` 与 `out-of-order: true`。已有库继续执行 1.128.2 之后的新迁移。
3. **后续增量迁移规范**：新变更一律使用高于 1.128.2 的版本号（如 `V1_129_0__<description>.sql`），并保持 `migration/` 与 `oracle/` 双目录同版本对齐。基础数据生成脚本（ICD-10、基本药物、基层医疗服务）只输出到 `.runtime/generated/` 供核对，变更须另建新版本迁移，不得改写已发布文件。
