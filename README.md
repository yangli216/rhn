# 健域智枢 · Regional Health Nexus（RHN）

面向县域医共体的医疗与公共卫生一体化平台。当前已完成领域基础 Foundation 1.0、持续开发底座 Foundation 1.1，以及工作门户与任务协同底座 Foundation 1.2，并以一条可运行的门诊纵向切片验证基础契约。

## 当前可运行范围

- 统一门户工作台、独立居民中心与门诊接诊工作台
- 租户、机构、科室、人员与任职主数据
- 术语值域、当前值参数管理与稳定错误契约
- MPI 多标识、来源匹配、合并与可逆拆分，以及人口学、地址、联系人和保障档案
- 简易排班、共享号源、现场挂号、候诊队列、开始接诊、生命体征、诊断与完成就诊
- 不可变临床文档版本、签署、修订与归档
- 事务 Outbox、版本化领域事件与幂等健康时间轴投影
- PostgreSQL/Oracle 19c Flyway 数据基线、H2 自动化测试与模块依赖测试
- Snowflake BIGINT 主键/字符串接口、复合租户外键、框架无关执行上下文与数据库 IAM 模型
- 统一密码证据、篡改检测和临床文档完整性/签署证据（生产密码服务待接）
- 平台/租户/机构/科室/用户及附加上下文参数、父级继承、值模式、变更留痕、人工恢复和一致性缓存
- OpenAPI 契约、前端生成类型、统一请求层、路由、查询缓存、表单校验与通用交互组件
- 受信机构/科室工作上下文、资源数据范围校验和上下文切换
- 可靠 Outbox 调度重试、消费 Inbox 幂等和写请求幂等服务
- 任务工作队列、站内通知、门户聚合指标和用户工作区持久化

当前链路：

```text
居民建档/档案维护 → 简易排班 → 号源占用/挂号 → 候诊 → 接诊 → 结构化临床文档/诊断 → 完成就诊 → 健康时间轴
```

基础范围、完成定义和明确非目标见 [基础底座 1.0](docs/foundation/基础底座1.0.md) 与 [基础底座 1.1](docs/foundation/基础底座1.1.md)。业务模块接入字典和参数时统一遵循 [字典与参数接入指南](docs/foundation/字典与参数接入指南.md)，字典和值域编码遵循 [字典与术语命名规范](docs/foundation/字典与术语命名规范.md)。后续业务界面的视觉、交互、响应式、无障碍和验收要求统一遵循 [用户界面设计与开发规范](docs/用户界面设计与开发规范.md)。目标表结构的前置约束与后续门禁见 [目标表结构与基础底座对齐](docs/foundation/目标表结构与基础底座对齐.md)，认证框架决策见 [架构决策-002](docs/architecture/架构决策-002-认证与授权.md)，密码证据边界见 [架构决策-003](docs/architecture/架构决策-003-密码证据.md)，参数实现见 [参数管理设计](docs/foundation/参数管理设计.md) 与 [架构决策-004](docs/architecture/架构决策-004-分层参数配置.md)，主键规范见 [架构决策-005](docs/architecture/架构决策-005-雪花算法标识.md)。后续按 [建设路线图](docs/建设路线图.md) 接入医嘱、处方、药房、收费、照护计划和任务中心。

工作门户与任务协同的详细边界和接入规则见 [基础底座 1.2](docs/foundation/基础底座1.2.md)。居民中心与门诊接诊的职责、数据链和开发门禁见 [居民中心与门诊接诊边界](docs/foundation/居民中心与门诊接诊边界.md)。

## 技术基线

- 后端：Java 21、Spring Boot 4.1、Spring Data JPA、Spring Security、Flyway、Hutool Core、Springdoc OpenAPI
- 前端：React 19.2、TypeScript、Vite 8、React Router、TanStack Query、React Hook Form、Zod
- 数据库：PostgreSQL 17、Oracle 19c；测试使用 H2 PostgreSQL 兼容模式
- 架构：模块化单体、领域事件、模块拥有数据、API 契约隔离

## 本地启动

最快体验可直接使用隔离的内存数据库：

```bash
cd backend
mvn spring-boot:run -Dspring-boot.run.profiles=local
```

需要验证 PostgreSQL 时，先启动数据库：

```bash
docker compose up -d postgres
```

再启动后端（本地开发账号为 `doctor` / `rhn-dev-2026`）：

```bash
cd backend
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

启动前端：

```bash
cd frontend
npm install
npm run dev
```

打开 <http://localhost:5173>。前端开发环境通过 Vite 将 `/api` 代理到后端。

刷新后保持登录默认关闭。需要启用基础版本时设置 `RHN_REFRESH_LOGIN_ENABLED=true`；登录有效期默认 8 小时，
可通过 `RHN_REFRESH_LOGIN_TTL` 调整（例如 `PT4H`）。正式集群使用共享 Redis 保存登录令牌，并要求通过 HTTPS
访问；本地 `dev`、`local` 和 `oracle-local` 配置允许在 HTTP 环境验证。

需要把本地迭代数据长期保存在 Oracle 时，通过环境变量提供连接信息后启用 `oracle-local`，密码不会写入项目文件：

```bash
cd backend
export RHN_ORACLE_URL='jdbc:oracle:thin:@//数据库地址:1521/服务名'
export RHN_ORACLE_USER='应用Schema用户'
read -s RHN_ORACLE_PASSWORD
export RHN_ORACLE_PASSWORD
mvn spring-boot:run -Dspring-boot.run.profiles=oracle-local
```

需要以打包制品长期运行时，在项目根目录执行 `./scripts/run-oracle-local.sh`。脚本会先确认端口未被占用，再把构建产物复制为内容哈希命名的运行副本，避免后续 Maven 构建覆盖正在加载的 Spring Boot fat jar。

首次启动会初始化表结构和开发基础数据；以后启动只执行尚未应用的迁移，已维护的业务数据会保留。详细规则见 [Oracle 持久化开发环境](docs/foundation/Oracle持久化开发环境.md)。

## 验证

```bash
cd backend && mvn test
cd frontend && npm run check
```

门诊主流程可以使用独立门禁一键回归，数据运行在一次性 H2 数据库中，不污染 Oracle 持久化开发库：

```bash
./scripts/verify-outpatient-main-flow.sh
```

覆盖范围和完成判定见 [门诊主流程验收基线](docs/foundation/门诊主流程验收基线.md)。

前端 `check` 会同时执行 [UI 规范门禁](frontend/scripts/check-ui-standards.mjs) 与生产构建；共享组件的使用方式见 [共享 UI 使用说明](frontend/src/shared/ui/README.md)。

当前开发账号只用于本地验证。监控、备份、发布和正式安全工程按本阶段边界暂不实际推进。

本地/测试配置会启用 `development-jca` 以验证完整链路；它不是合规密码产品。默认生产配置不启用任何密码提供者，并对关键数据写入失败关闭。接入真实数据前必须通过 `RHN_CRYPTO_ACTIVE_PROVIDER` 配置经项目核验的 SM2/SM3 密码服务适配器，并完成个人证书、可信时间戳、密钥生命周期和密码应用方案评估。
