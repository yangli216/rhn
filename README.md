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
- 架构：Maven 多模块单体、领域事件、模块拥有数据、API 契约隔离；11 个子工程由 `rhn-app` 装配为一个部署包

目标模块图、当前归属和后续公卫/照护/质控接入规则见 [RHN 2.0 模块架构](docs/architecture/RHN2.0模块架构.md)。模块登记以 [Module Catalog](backend/src/main/resources/architecture/module-catalog.json) 为准，新增包、依赖方向和跨模块持久化访问均纳入自动门禁。

## 本地启动

### PostgreSQL 独立验证环境

已有 PostgreSQL 时，可为本项目创建独立普通用户和同名数据库，将连接信息保存在 Git 忽略的 `.env.postgres.local`（文件权限建议 `600`）：

```dotenv
RHN_DB_URL=jdbc:postgresql://localhost:5432/rhn_pg_test
RHN_DB_USER=rhn_pg_test
RHN_DB_PASSWORD=替换为本地密码
```

使用 JDK 21+ 执行 `./scripts/run-postgres-local.sh`，默认后端端口为 `18087`，可用 `RHN_SERVER_PORT` 覆盖。`postgres-local` 会通过 Flyway 初始化表结构和演示数据，保留 Hibernate 表结构校验，并使用内存会话及在线状态，无需 Redis。默认演示账号为 `doctor` / `rhn-dev-2026`，可通过 `RHN_DEV_USERNAME` / `RHN_DEV_PASSWORD` 覆盖。

前端在 `frontend` 目录执行 `RHN_FRONTEND_PORT=15177 RHN_API_TARGET=http://127.0.0.1:18087 npm run dev`。验证地址为 `http://localhost:15177`，后端健康检查为 `http://localhost:18087/actuator/health`。这套环境独立于下述 Oracle 人工验证端口；自动化后端测试仍使用 `test` profile 的随机 H2 数据库。

PostgreSQL 专属迁移通过临时 `text` domain 兼容历史 `clob` 声明，随后将所有相关列转为原生 `text` 并删除临时 domain；专属 Hibernate 方言以字符串读写文本，避免默认 `@Lob` 映射为 PostgreSQL OID。共享迁移 `V1_41_0` 的布尔值已由 `0` 修正为 `false`。若旧持久化环境已经执行原版该迁移，升级前需核对 Flyway checksum 差异并按迁移管理流程处理；启动脚本不会自动 repair。Oracle 独立迁移未改动。

### Oracle 人工验证环境

两套长期人工验证环境均使用 `oracle-local`。主工作区使用后端 `8080` / 前端 `5173`，统计工作区使用后端 `18086` / 前端 `15176`。已运行的服务请保留；需要恢复主工作区后端时，在项目根目录执行：

```bash
RHN_SERVER_PORT=8080 ./scripts/run-oracle-local.sh
```

统计工作区在自身根目录执行 `RHN_SERVER_PORT=18086 ./scripts/run-oracle-local.sh`（需要统计试验开关时使用 `./scripts/run-analytics-preview.sh`）。脚本读取忽略的 `.env.oracle.local`，构建全部模块并使用内容哈希命名的运行副本。

多模块构建入口仍为 `backend/pom.xml`，可执行制品位于 `backend/rhn-app/target/rhn-application-0.1.0-SNAPSHOT.jar`。需要直接使用 Spring Boot 开发运行命令时，先安装当前反应堆依赖，再指定应用模块：

```bash
cd backend
mvn -DskipTests install
mvn -pl rhn-app spring-boot:run -Dspring-boot.run.profiles=oracle-local -Dspring-boot.run.arguments=--server.port=8080
```

上述方式需提前设置 Oracle 连接环境变量。本地开发账号为 `doctor` / `rhn-dev-2026`。

启动前端：

```bash
cd frontend
npm install
npm run dev
```

统计工作区默认前端地址为 <http://localhost:15176>，后端地址为 <http://localhost:18086>，健康检查为 <http://localhost:18086/actuator/health>。主工作区通过忽略的 `frontend/.env.local` 使用 <http://localhost:5173> 和 <http://localhost:8080>。前端通过 Vite 将 `/api` 和 `/actuator` 代理到此后端。`npm run dev` 和 `npm run preview` 默认使用 15176，按各工作区的 `RHN_FRONTEND_PORT` 覆盖；端口被占用时会报错，不会自动换端口。

后端可通过 `RHN_PORT` 覆盖端口；Oracle 启动脚本优先使用 `RHN_SERVER_PORT`，其次使用 `RHN_PORT`。更换后端端口时，前端需同步设置 `RHN_API_TARGET`。统计体验脚本也使用相同默认端口，支持 `RHN_ANALYTICS_PORT` 优先覆盖。

统计分析支持通用模板、字段组合、多轮 AI 修改和可视化方案编辑，操作方式及边界见 [V5：连续修改与可视化方案编辑](docs/ai/智能统计分析实施计划/V5-连续修改与可视化方案编辑.md)。

顶部“搜索模块”支持按名称或所属分类查找当前可访问的模块，快捷键为 `Ctrl / ⌘ K`，回车进入首项。统计体验入口位于左侧菜单顶部；启动前端时设置 `VITE_ANALYTICS_ENABLED=true`，后端通过 `./scripts/run-analytics-preview.sh` 启动，使用当前 Oracle 业务数据。

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
mvn -DskipTests install
mvn -pl rhn-app spring-boot:run -Dspring-boot.run.profiles=oracle-local -Dspring-boot.run.arguments=--server.port=8080
```

需要以打包制品长期运行时，在项目根目录执行 `./scripts/run-oracle-local.sh`。脚本会先确认端口未被占用，再把构建产物复制为内容哈希命名的运行副本，运行副本保存在 `.runtime/backend/`，避免后续 Maven 构建或清理影响正在运行的服务。

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

前端测试就近放置在组件或工具源码旁，使用 `*.test.ts(x)`；共享测试设置放在 `src/test/`。测试依赖属于开发依赖，测试文件参与类型检查，Vite 生产构建只沿应用入口的导入关系打包。

后端测试复用通过 `@ResetDatabaseBeforeEachTestMethod` 显式启用：在随机 H2 中逐用例恢复数据并清空字典/参数缓存，禁用后台调度，禁止并行执行；类结束仍销毁上下文。修改登录会话、实时连接、模拟外部服务状态或测试调度的用例继续保留原有上下文隔离。

前端 `check` 会同时执行 [UI 规范门禁](frontend/scripts/check-ui-standards.mjs) 与生产构建；共享组件的使用方式见 [共享 UI 使用说明](frontend/src/shared/ui/README.md)。

当前开发账号只用于本地验证。监控、备份、发布和正式安全工程按本阶段边界暂不实际推进。

本地/测试配置会启用 `development-jca` 以验证完整链路；它不是合规密码产品。默认生产配置不启用任何密码提供者，并对关键数据写入失败关闭。接入真实数据前必须通过 `RHN_CRYPTO_ACTIVE_PROVIDER` 配置经项目核验的 SM2/SM3 密码服务适配器，并完成个人证书、可信时间戳、密钥生命周期和密码应用方案评估。

前端端口可通过各工作区忽略的 `frontend/.env.local` 设置 `RHN_FRONTEND_PORT` 和 `RHN_API_TARGET`。统计分析工作区默认 `15176` / `http://localhost:18086`；原主工作区使用 `5173` / `http://localhost:8080`，并保持后端 `oracle-local` 服务运行。

## 仓库维护

保留当前设计、接口契约、标准来源和可执行测试；历史截图、阶段验收记录与一次性输出放入忽略的 `artifacts/`，过程历史通过 Git 查询。任务状态表只维护当前状态和未解决事项。数据库脚本的用途与新库初始化见 [数据库基线](backend/src/main/resources/db/README.md)。
