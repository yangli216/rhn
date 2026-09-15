# Architecture 2.0 验证记录

- 日期：2026-09-15
- 修改前基线：`dd96353`（从 HEAD 导出独立临时目录对照，未修改统计工作区）
- 方案：[RHN 2.0 模块架构](RHN2.0模块架构.md)

## 结果

| 检查 | 结果 |
|---|---|
| 原始架构测试 | 修改前 22 项中循环依赖检查失败；依赖倒置后全部通过 |
| 最终模块门禁与打包 | `mvn -Dtest=ArchitectureTest,ModuleCatalogTest package` 成功，27 项检查全部通过 |
| 全量回归 | `mvn verify` 执行 390 项：362 通过、28 失败、0 错误、0 跳过；全量门禁仍为失败状态 |
| 全量失败对照 | 28 项失败全部在独立的修改前 HEAD 上复现，用例名称及失败断言逐项完全相同 |
| 可执行制品 | rhn-app 包含 10 个 RHN 依赖 Jar，单 Spring Boot 入口，迁移资源完整装配 |
| 新制品启动 | 临时端口 18127、test profile、独立随机 H2；健康检查 UP |
| 原制品对照启动 | 临时端口 18128、test profile、另一个随机 H2；健康检查 UP |
| 新旧接口契约 | 两个运行制品均为 543 个路径，完整 OpenAPI JSON 结构逐项一致，包括 operationId 和 schemas |
| 仓库接口快照 | 提交的 docs/api/openapi.json 为 504 个路径，已滞后于修改前运行版本；此次未改写接口快照 |
| 运维/维护脚本 | Oracle 启动脚本及两个表结构维护脚本语法检查通过；制品路径、源码枚举路径已适配 |
| 持久化资源与前端 | 既有 Flyway 迁移、配置、测试 profile 和前端代码未修改 |
| 文件移动核对 | 1,146 个既有生产源文件仅移动目录且内容完全一致；其余改动为接口归属、Port/Adapter 和边界修复 |

## 尚未解决的既有回归失败

未通过跳过测试、放宽断言或改变业务规则来掩盖这些失败。本轮架构基线可以继续作为开发基础，但全量 CI 尚不能宣称通过；以下问题和滞后的接口快照需要后续独立收口。

| 用例类 | 失败数 | 修改前后相同的失败表现 |
|---|---:|---|
| HypertensionCareSliceTest | 4 | 预期 200，实际 400 |
| MedicalOperationsMasterDataTest | 3 | 预期 200/400，实际 403 |
| RhnPhysicalSchemaGovernanceTest | 1 | 迁移后的实际物理表目录与治理目录不一致 |
| InpatientAdmissionFlowTest | 1 | 预期 201，实际 400 |
| BasicDataCenterFoundationTest | 13 | 预期 200/201/400，实际 403 |
| OutpatientVerticalSliceTest | 3 | 预期 201，实际 403 |
| OrderFrequencyManagementTest | 3 | 预期 201，实际 403 |

上述统计不代表失败根因已全部修复或诊断完成，只证明本次模块迁移没有改变这些用例的失败结果。批量打印、结构化统计、药房及其他通过的业务回归均包含在 362 项通过结果内。

## 环境与清理

最终检查：主工作区 `8080/actuator/health` 为 UP、前端 5173 返回 200；统计工作区 `18086/actuator/health` 为 UP、前端 15176 返回 200。确认两个持续运行后端均使用 oracle-local。原有持续服务进程予以保留，新制品仅在隔离环境验证，未替换持续服务的运行版本。

已按记录的精确 PID 关闭本任务的两个临时制品进程，确认 18127、18128 不再监听。未使用全局进程终止，也未提交或推送 Git。

完整日志、全量测试报告、失败断言对照、两份运行 OpenAPI 和环境状态保存在本地忽略目录 `artifacts/architecture-2.0/`，包括 `full-regression-summary.json`、`baseline-comparison.json`、`runtime-baseline-comparison.json` 和 `persistent-services.json`。
