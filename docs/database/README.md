# 表结构与业务语义工作台

开发入口：运行前端后打开 `/schema-workbench.html`。业务语义工作台提供互相跳转入口，物理结构与业务统计语义使用同一套关系图组件。

## 资料来源与职责

| 层次 | 权威来源 | 工作台能力 |
|---|---|---|
| 预期结构 | Flyway 公共迁移、local 种子及 H2 兼容脚本 | 随机 H2 完整迁移后的结构采集、字段、主外键、唯一约束、索引与检查约束；Oracle 专用脚本参与版本指纹 |
| 开发库结构 | 配置的 Oracle 开发库数据字典 | 只读快照、对照预期结构、与上次快照比较、迁移记录 |
| 命名与说明 | `docs/foundation/rhn-physical-schema-map.json` | 全库域、表、字段检索和直接代码引用 |
| 字段缩写 | `physical-column-abbreviations.json`、[规则与词典](physical-column-naming.md) | 词段不超过 7 字符；工作台规范检查给出统一缩写建议 |
| 字段改名评审 | [1.77.0 逐表清单](column-renames-1.77.0.md)、同名 JSON | 旧名、新名、逻辑名和业务含义；配对迁移与应用一起升级 |
| 业务共建 | `annotations/<物理表名>.json` | 用途、粒度、责任人、字段说明、关系依据、并发版本控制 |
| 统计语义 | `backend/rhn-analytics/src/main/resources/semantic/outpatient-ontology.v1.yaml` | 实体映射、白名单关系、维度、指标、聚合风险与受影响指标 |
| 语义建议 | `proposals/<id>.json` | 接收原语义工作台的候选建议，记录审核意见与资产来源指纹 |
| 设计规范 | 本目录设计规范及登记的来源文档 | 章节浏览、全文搜索、项目规则与上游参考区分 |

物理表进入目录不代表获得统计查询权限。新增业务关联不自动加入统计白名单；建议审核不会执行 SQL 或发布 YAML。统计执行、口径确认和授权仍由原有统计服务负责。

原统计语义页及即时探针读取运行中后端随程序包发布的资产；开发工作台读取当前工作区 YAML 的结构快照。两者维护同一个源文件，分别呈现已运行版本和待发布版本；保存评审意见不会热更新后端，修改源资产后仍需正常构建与发布。

## 开始使用

1. 后端构建至少一次：在 `backend` 执行 `mvn -DskipTests package`。采集工具复用该构建中锁定的 JDBC、Flyway、H2、Jackson 和 YAML 依赖。
2. 在前端运行 `npm run schema:refresh`，或在页面点击“刷新结构”。迁移只执行于随机 H2；Oracle 分支显式设置只读事务。
3. Oracle 凭据沿用本机 `.env.oracle.local` 或 `RHN_ORACLE_*` 环境变量，不返回浏览器、不写入生成目录。
4. 工作台 API 只存在于 Vite 开发服务器，要求回环来源、合法本机 Host、同源请求和专用请求头；生产构建不包含此 HTML 或采集 API。

没有 Oracle 连接时可先运行 `npm run schema:refresh -- --source expected`。页面会明确显示缺少实库快照；旧快照不会被失败结果覆盖。

## 空库重建与开发样例

开发阶段需要重新建立干净数据库时，先停止连接目标 Schema 的服务，再生成并核对重建包：

```sh
node scripts/rebuild-database.mjs
node scripts/rebuild-database.mjs --check
```

重建包分为结构与规范基线、开发样例、H2 类型适配三层，当前版本为 `1.77.1`。Oracle 空库启动时使用 `oracle-local,rebuild-oracle`，PostgreSQL 使用 `rebuild-postgres`，H2 使用 `rebuild`。重建包不包含清库动作，删除旧 Oracle 开发数据必须由 DBA 或明确的开发环境操作完成；应用启动只负责在空 Schema 上执行 Flyway。

现有 `db/migration`、`db/oracle`、`db/local`、`db/oracle-local`、`db/h2` 历史目录继续保留，供已经存在数据的环境增量升级。不要删除 Flyway 历史后在非空库上混用重建包；需要重建时应使用可丢弃的空 Schema，并只导入规范基础数据和开发样例。

## 开发人员与 AI 协同

- 开发人员修改业务说明或登记候选关系，保存到仓库文件；每张表独立文件，旧版本保存被拒绝并保留界面输入。
- 已确认业务关联必须有审核人、证据和有效字段映射；涉及两张租户表须保留租户条件。
- 原“业务实体数据关系网”的开发模式建议可保存至这里的评审队列，刷新页面后继续查看。审核通过仅代表意见已记录，落实变更仍须修改源 YAML 并评审发布。
- 语义 YAML 中尚未落地的实体保留“未映射”状态。比如当前处方实体尚无独立物理表，不能通过猜测表名补齐。
- 页面“AI 上下文”可按表或业务域导出 Markdown，附字段、完整关系、直接代码引用、统计指标与禁止口径。

## 命令与自动资料

```sh
cd frontend
npm run schema:refresh -- --source expected
npm run schema:check
npm run schema:context -- --table RHN_VIS_ENC
npm run schema:context -- --domain VIS
npm run schema:test
```

`generated/index.json` 为 AI 入口，各业务域 JSON 按需读取。数据由采集脚本生成，禁止手改；命名、注释继续维护原物理映射。结构资料带输入指纹，迁移、映射、采集逻辑和统计语义资产变化后显示过期，需重新采集。业务补充以 `annotations` 原文件为准，页面导出会读取最新版本。

实库与上次快照仅保存在忽略目录 `.runtime/schema-workbench`；结构快照不包含业务数据行。快照差异不是 DDL 执行计划。跨方言自动对照覆盖表、字段、常见类型、可空性、注释、主键、唯一约束和外键；默认值、函数索引、检查表达式通过原始结构详情及同库快照差异核对。

`schema:check` 校验结构覆盖、字段词段命名及语义映射等确定性错误；业务责任、说明完整性和统计关系租户条件以待审核项展示。现有统计模型的语义缺口会显式列出，不能把表结构检查成功解释为统计口径已经通过审核。维护缩写词典或改名清单后运行 `node scripts/schema-workbench/generate-naming-docs.mjs` 同步可读文档，在工作台「设计规范」查看。

CI 在后端验证完成后从随机 H2 重新采集并检查目录覆盖；前端检查同时执行工作台的数据层与交互测试。Oracle 采集使用数据字典并核对外键总数（包括引用唯一键的复合外键），不依赖 JDBC 不完整的外键列表；采集格式升级时重建同库比较基线，避免把工具升级解释为数据库变更。

## 人工验收

在 1280 / 1440 / 1920px 查看域筛选、字段搜索、关系跳转、物理/语义互相定位、规范检索；验证两窗口保存冲突、未保存离开提醒、建议刷新后保留，以及结构采集失败后的旧快照展示。默认不执行真实浏览器 QA。
