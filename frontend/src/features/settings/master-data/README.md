# 主数据维护边界

`BasicDataManagement.tsx` 负责分类、查询与当前机构协调，保留旧导出以兼容已有消费者。新代码直接引用具体职责，避免将对话框和类型重新堆回根入口。

| 用例 | 入口 |
| --- | --- |
| 疾病术语、管理方案与成员规则 | DiseaseMaintenance.tsx |
| 诊疗项目和类型扩展属性 | ServiceMaintenance.tsx、AttributeMaintenance.tsx |
| 药品知识、厂家产品展示与轻量详情 | MedicationPresentation.tsx |
| 药品录入及标准目录创建 | MedicationMaintenance.tsx |
| 产品、包装与转换 | ProductMaintenance.tsx |
| 机构启用、能力与价格 | CatalogLifecycleDialog.tsx |
| 标准映射、导入批次 | StandardMappingDialog.tsx、MasterDataImportDialog.tsx |
| 表单/表格适配与公共类型 | masterDataShared.tsx（禁止反向依赖业务维护单元） |
| 检验检查规格、标本、规则和试算 | ../operations/ClinicalServiceConfiguration.tsx、SpecimenConfigurationDialog.tsx、ExaminationRules.tsx、LaboratoryTubeSimulator.tsx、ExaminationChargeSimulator.tsx |
| 组合/组套、耗材、单位、频次 | ../operations/ItemGroupDialog.tsx、SupplyDialog.tsx、UnitMaintenance.tsx、FrequencyMaintenance.tsx |

只读主数据查询使用当前机构、业务日期、状态与有效期；不能只根据项目名称或硬编码科室 ID 判断可开立性。价格/启用/包装变更继续携带当前版本和变更原因，保存后刷新相应缓存；布局拆分不改变这些行为。

后端仍由 `MasterDataApplicationService` 协调写事务、版本核对、目录/语义投影。字典、给药途径/频次及抗菌药/皮试校验集中在 `CatalogCommandValidation`，该单元不持有仓储或写事务。不要把校验下沉到 UI 后取消服务端检查。

运行 `./scripts/verify-scope.sh master-data --list` 查看范围；实际运行去掉 `--list`。改动契约、迁移或价格需扩大相关验证，公共 UI 交互另测其消费者。上述调用从仓库根目录执行。
