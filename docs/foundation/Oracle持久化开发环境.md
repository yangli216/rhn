# Oracle 持久化开发环境

## 1. 定位

`oracle-local` 用于将持续迭代中的租户、机构、科室、账号、字典、参数及后续业务数据长期保存在 Oracle 19c。它替代易失的 H2 本地运行数据，但不改变领域模型、接口契约或主键规则。

当前连接凭据只通过环境变量注入，不写入 YAML、源码、迁移或文档。`.env` 已加入忽略清单；正式环境仍应改由部署平台的密钥管理能力提供凭据。

## 2. 启动

```bash
cd backend
export RHN_ORACLE_URL='jdbc:oracle:thin:@//数据库地址:1521/服务名'
export RHN_ORACLE_USER='应用Schema用户'
read -s RHN_ORACLE_PASSWORD
export RHN_ORACLE_PASSWORD
mvn spring-boot:run -Dspring-boot.run.profiles=oracle-local
```

长期运行打包制品时，推荐从项目根目录执行：

```bash
./scripts/run-oracle-local.sh
```

脚本要求同样的三个 Oracle 环境变量，并在构建前确认目标端口没有运行实例。构建完成后，脚本会按制品内容哈希复制一份不可变运行副本，再从副本启动。不得在 Java 进程直接加载 `backend/target/rhn-application-0.1.0-SNAPSHOT.jar` 时再次执行 Maven 打包；fat jar 被原位覆盖后，延迟类加载和优雅停机都可能失败。

可选使用 `RHN_DEV_USERNAME`、`RHN_DEV_PASSWORD` 覆盖本地体验账号。该账号和 `development-jca` 只用于开发验证，不得承载真实医疗数据或作为生产安全方案。

## 3. 初始化结果

首次启动由 Flyway 创建完整底座表结构，并写入一组可直接体验的持久化数据：

- 一个开发租户；
- 一个基层医疗机构和一个临床科室；
- 一个本地体验账号；
- 字典、术语、参数、人员、权限、审计、密码证据等底座表结构。

普通字典和业务参数不预置臆造值，首次启动时对应表可以为空；通过管理界面维护后即持久保存。系统枚举仍由代码统一发布，不重复落入普通字典表。

## 4. 多数据库映射规则

- 内部主键：PostgreSQL 使用 `BIGINT`，Oracle 使用 `NUMBER(19)`；接口统一返回十进制字符串。
- 布尔值：Oracle 表字段统一使用 `NUMBER(1)`，取值为 `0` 或 `1`。
- 长文本和 JSON：实体使用方言感知的长字符串映射；PostgreSQL/H2 对应 `text`，Oracle 对应 `CLOB`。
- 带时区时间：业务时间保留 `TIMESTAMP WITH TIME ZONE`；需要唯一性的时间组合在 Oracle 中对 UTC 归一值建立函数索引。
- 表结构由 Flyway 唯一管理，Hibernate 只做 `validate`，禁止在运行时自动改表。

## 5. 迁移约束

PostgreSQL 迁移位于 `db/migration`，Oracle 迁移位于 `db/oracle`，H2 的少量兼容迁移位于 `db/h2`；本地体验数据分别位于 `db/local` 和 `db/oracle-local`。后续新增表结构时必须保持 PostgreSQL 与 Oracle 两套迁移的版本号、说明、字段语义、唯一约束和外键语义一致，并在 H2 存在类型差异时补充最小兼容迁移。

已经应用到持久化数据库的迁移文件不得改写。需要调整表结构时新增更高版本迁移；应用启动会校验历史校验和，只执行尚未应用的版本。

## 6. 使用边界

- 当前 Schema 可用于长期开发迭代，不应使用自动清库作为日常启动流程。
- 测试仍默认使用隔离的 H2，避免自动化测试污染持久化数据。
- 数据库管理员权限只用于首次环境准备；应用长期运行建议收敛到自身 Schema 的最小必要权限。
- 备份、脱敏、访问审计、容灾和生产密码服务仍需在接入真实数据前单独完成。
