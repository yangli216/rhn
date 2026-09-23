# 分页实现走查（2026-09-22）

## 结论

当前仍存在假分页，分为两类：

1. 前端接口返回数组，页面用 `filter/slice` 后展示分页控件。
2. 后端接口虽然返回 `content/totalElements/totalPages`，但先把符合条件的全量数据查入 JVM，再用 `subList` 分页。

因此，页面上看到的页码并不都代表数据库只返回了当前页。高频业务和可持续增长的数据集仍需要改成数据库分页。

## 已确认的前端全量数组分页

| 优先级 | 页面 | 证据 | 当前问题 |
| --- | --- | --- | --- |
| P0 | 收费查询 | `frontend/src/features/billing/BillingQueryWorkspace.tsx:67-118`；调用 `settlementRecords(500)` 后本地过滤和 `slice` | 只取最近 500 条，超过上限后历史记录不会出现在后续页，筛选统计也只基于这 500 条；这是数据正确性问题 |
| P1 | 门诊流转看板 | `frontend/src/features/outpatient/OutpatientFlowWorkspace.tsx:55-75` | `/api/outpatient-flow` 返回完整 `visits`，页面再按状态过滤和切页 |
| P1 | 药房发药查询 | `frontend/src/features/pharmacy/PharmacyWorkspace.tsx:324-374`、`1194-1353` | `/api/pharmacy/inbox` 返回完整数组，页面本地过滤、排序和分页；发药记录会随业务增长 |
| P1 | 追溯码台账 | `frontend/src/features/pharmacy/TraceCodeManagement.tsx:29-70` | `traceCodes` 返回数组，查询结果和全库指标均为全量拉取，页面本地 `slice` |
| P1 | 拆零包装台账 | `frontend/src/features/pharmacy/InventoryAccuracyManagement.tsx:25-55` | `openPackages` 返回数组，页面本地 `slice` |
| P1 | 组织架构·人员目录 | `frontend/src/features/settings/OrganizationPersonnelManagement.tsx:185-199` | `/api/platform/practitioners` 返回全量人员，页面本地过滤和 `slice` |
| P1 | 参数管理 | `frontend/src/features/settings/ParameterManagement.tsx:56-63`、`190-193` | 定义目录接口返回数组，页面本地分页；同时还额外请求一次全量列表计算分类数量 |
| P1 | 字典管理 | `frontend/src/features/settings/DictionaryManagement.tsx:38-41`、`187-190` | 字典目录接口返回数组，页面本地过滤和分页 |
| P2 | 动态分析功能库 | `frontend/src/features/analytics/DynamicAnalysisLibrary.tsx:264-266`；后端 `AnalysisPageService.saved` 返回全量当前用户功能 | 用户功能数量通常较小，但接口没有分页契约，增长后仍会变成全量传输 |

## 已确认的后端 JVM 内存分页

| 优先级 | 接口/页面 | 证据 | 当前问题 |
| --- | --- | --- | --- |
| P1 | 挂号查询 `/api/outpatient/reception/page` | `backend/rhn-clinical/src/main/java/com/rhn/outpatient/scheduling/RegistrationApplicationService.java:439-565` | Repository 先返回 `List<PatientRegistration>`，过滤、排序、统计和 `subList` 均在 JVM 中完成 |
| P1 | 就诊查询 `/api/outpatient/encounters/page` | `backend/rhn-clinical/src/main/java/com/rhn/outpatient/encounter/EncounterService.java:762-918` | 先加载日期范围全部就诊及关联诊断，再内存过滤和 `subList`；日期范围放大时内存和关联查询都会放大 |
| P1 | 药品标准建设就绪度 | `backend/rhn-platform/src/main/java/com/rhn/platform/masterdata/application/MedicationStandardReadinessService.java:30-86` | 明确加载全租户活动药品、构造完整评估结果后再过滤和 `subList`；分页只是响应层分页 |
| P2 | 在线用户 `/api/presence/users` | `backend/rhn-platform/src/main/java/com/rhn/platform/realtime/application/PresenceService.java:67-96` | 从实时连接注册表聚合全部可见连接后再排序和 `subList`；当前数据集受在线连接规模限制，但仍非数据源分页 |
| P2 | 标准药品参考目录搜索 | `backend/rhn-platform/src/main/java/com/rhn/platform/masterdata/application/StandardMedicationCatalogService.java:72-94` | 目录是进程内不可变快照，搜索在内存中过滤后分页；这是固定参考数据的特例，不应作为业务表分页模式复制 |

## 已核实为数据库分页的代表性接口

以下页面已经把页码和页大小传给后端，并由 Repository 使用 `Pageable/PageRequest` 查询，暂不列为假分页：居民中心、门诊分诊、标准目录选择、知识草稿/旁路观察/研判历史、标准目录版本、药品影响报告、库存余额和库存流水、队列工作台等。

标准修订历史也是真分页：`MedicationStandardRevisionService` 使用 `historyPage` 查询 `ClinicalSemanticHistory.historyPage`。修订影响清单和知识上线材料中的逐条观察是一次性冻结的快照，在弹窗内切片只用于阅读快照，不是主列表查询；如果快照规模可能增长，应另行提供按页读取接口。

## 兼容路径风险

`frontend/src/shared/api/schedulingApi.ts:279-327` 的 `receptionPage` 在 `/page` 请求失败时，会退回 `/queue` 并在浏览器内过滤、切页。当前后端已有 `/page`，正常部署不会触发，但这个 fallback 会把接口部署不完整静默降级为假分页，建议改为显式错误或仅允许开发环境使用。

## 建议的修复顺序

1. 先改收费查询，去掉 `limit=500`，让日期、场景、结算类型、关键字和分页参数一起进入后端查询，并让汇总使用同一查询口径。
2. 再改挂号和就诊查询的后端 `List + subList`，把可检索字段下沉到数据库查询；关联姓名、诊断等跨表检索需要投影或受控的查询条件。
3. 改药房发药查询、追溯码、拆零包装和门诊流转看板为 `PageView` 接口，前端只渲染 `content`，指标使用服务端汇总。
4. 最后处理人员目录、参数目录、字典目录和动态分析功能库，统一使用 `content/totalElements/totalPages/page/size` 契约。

## 规则

业务列表出现分页控件时，接口必须返回当前页和总数；禁止在生产业务页面通过 `array.filter(...).slice(...)` 伪造分页，禁止后端先查全量集合再 `subList` 作为长期列表方案。只有固定模板、开发工作台、图关系局部展示和明确有界的不可变快照可以使用本地切片，并应在代码注释或契约中说明边界。
