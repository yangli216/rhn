# 迭代入口索引

先定位本次用例，再读取直接相关实现；本文件只负责导航，不复制 API 或业务规则。
后端模块归属、公开边界和允许依赖以 [module-catalog.json](../../backend/src/main/resources/architecture/module-catalog.json) 为准。

| 用例 | 前端入口 | 后端入口，相对各模块 src/main/java/com/rhn | 验证入口 |
| --- | --- | --- | --- |
| 门诊病历、诊断、草稿保存 | [record/README](../../frontend/src/features/outpatient/record/README.md)、DoctorWorkstation.tsx | rhn-clinical/outpatient/encounter/EncounterService.java | `./scripts/verify-scope.sh outpatient-draft` |
| 频次、医嘱行编辑／分组、AI 医嘱草稿 | [frequencySemantics](../../frontend/src/shared/clinical/frequencySemantics.ts)、[orders/README](../../frontend/src/features/outpatient/orders/README.md) | rhn-platform/platform/masterdata/api/ClinicalFrequencySemantics.java；application/OrderFrequencyService.java | `./scripts/verify-scope.sh frequency`；涉及工作站集成用 `round1` |
| 药房审方、发药、退药 | features/pharmacy/PharmacyWorkspace.tsx、medicationDisplay.ts | rhn-clinical/pharmacy/application/PharmacyApplicationService.java、DispenseApplicationService.java | PharmacyWorkspace.test.tsx；业务链路需另外选相关后端测试 |
| 主数据、药品目录 | features/settings/BasicDataManagement.tsx、OperationalMasterDataPanel.tsx；shared/api/masterDataApi.ts | rhn-platform/platform/masterdata/application/MasterDataApplicationService.java | backend/src/test/java/com/rhn/ 下按具体业务检索；本轮 scope 不覆盖整个主数据模块 |
| 合理用药知识建设 | features/quality/MedicationKnowledgeDrafts.tsx、MedicationWorkbench.tsx | rhn-quality/quality/medication/application/ | [领域说明](../architecture/rational-medication/README.md)及对应 MedicationKnowledge*Test |
| 工作上下文、导航、页签 | app/AppShell.tsx | rhn-platform/platform/ 下对应 portal/security/organization 契约 | app/AppShellContext.test.ts；权限变更扩大后端验证 |
| 住院医嘱、护理、药品供应 | features/inpatient/ | rhn-clinical/inpatient/；pharmacy/ | `./scripts/verify-inpatient-main-flow.sh` |

前端路径默认相对 frontend/src；表内未列出的模块用定向符号搜索定位，不能把任一 scope 当作全项目验证。

## 检索与输出

- 先 `rg --files` 找路径，再 `rg -n` 定位符号，最后读取必要片段。
- 常规实现搜索限制在相关 src 目录，排除 generated.ts、构建产物；契约任务按 schema 名定位生成类型。
- OpenAPI、药品目录和物理表映射是权威数据／生成资产，保留在仓库，避免为普通 UI 改动整文件读取。
- 用 `./scripts/verify-scope.sh round1 --list` 查看实际测试和构建命令；无数据库的频次契约测试共享同一 JSON 样例。
- 验证脚本将完整日志存入忽略的 .runtime/verification，仅输出摘要／失败末尾；需要时再读完整文件。
- 公开 API、迁移、权限、库存、收费或公共框架变化要扩大测试，CI 完整验证继续保留。
- 工作区变更先看范围；不把其他任务的未提交修改当成本次成果，不自动 commit/push。

## 本轮之后的边界

当前已分离草稿模型、保存协调、医嘱持久化和频次解释；病历 UI 与 AI 采纳按 [record/README](../../frontend/src/features/outpatient/record/README.md) 选入口。医嘱已拆出连续录入字段、已开立／待确认列表、行编辑、草药整方、输液组规则、包装解析和 AI 目录核对，按 [orders/README](../../frontend/src/features/outpatient/orders/README.md) 选入口。跨区草稿协调仍在工作站；统一医嘱的当前条目校验／构建、目录选择与组方会话，以及药房大组件待后续拆分。
进一步重构的证据见 [2026-09-21 审计](../architecture/代码坏味道与AI迭代成本审计-2026-09-21.md)；不需要每次实现都重读完整审计。
