# 门诊医嘱草稿

检验检查默认执行科室由服务端 `ServiceExecutionDepartmentPolicy` 计算；本 README 只负责定位，详细事实边界见 [门诊医嘱草稿事实边界](../../../../../docs/architecture/门诊医嘱草稿事实边界.md)。

从当前用例选入口，避免默认读取完整统一医嘱组件：

| 用例 | 实现入口 | 验证入口 |
| --- | --- | --- |
| 连续录入检索、用法、数量、嘱托 | `OrderComposerResource.tsx`、`OrderComposerDirections.tsx`、`OrderComposerQuantity.tsx`、`OrderComposerInstruction.tsx` | `OrderComposerFields.test.tsx`、`../UnifiedOrderListEditor.test.tsx` |
| 录入时过敏／皮试提醒、免试依据 | `OrderComposerSafety.tsx`、`medicationEntry.ts`、`skinTestHistory.tsx` | `skinTestHistory.test.tsx`、`medicationEntry.test.ts`、`../UnifiedOrderListEditor.test.tsx` |
| 已开立单据、打印／撤销、单据编辑插槽 | `SavedOrderList.tsx` | `../UnifiedOrderListEditor.test.tsx` |
| 待确认分类、整方更新、编辑行切换 | `DraftOrderList.tsx` | `../UnifiedOrderListEditor.test.tsx` |
| 药品／项目待确认行编辑 | `MedicationDraftEditRow.tsx`、`ServiceDraftEditRow.tsx` | `../UnifiedOrderListEditor.test.tsx` |
| 失焦保存、滚动／弹层保护、快捷键 | `useDraftRowInteractions.ts` | `useDraftRowInteractions.test.tsx` |
| 输液组识别、标签、组内同步 | `administrationGroups.ts` | `orderEntries.test.ts`、`medicationQuantity.test.ts` |
| 已开立单据排序、草稿同组相邻、录入框组尾定位 | `orderEntries.ts` | `orderEntries.test.ts` |
| 草药整方设置、单味剂量／特殊煎法 | `HerbalFormulaHeaderBar.tsx`、`HerbalPrescriptionMatrix.tsx`、`herbalInstructions.ts` | `../UnifiedOrderListEditor.test.tsx` |
| 已开立／待确认展示行、单据表头 | `OrderReadRows.tsx`、`OrderDraftRows.tsx`、`OrderDocumentGroupHeader.tsx` | `../UnifiedOrderListEditor.test.tsx` |
| AI 建议实时目录核对、转待确认草稿 | `useAiOrderReview.ts` | `useAiOrderReview.test.tsx`、`../UnifiedOrderListEditor.test.tsx` |
| 可发药产品、包装与有效价格 | `dispensableOptions.ts` | `../PrescriptionPackaging.test.ts` |
| 频次和数量预览 | `medicationQuantity.ts`、共享 `frequencySemantics.ts` | `medicationQuantity.test.ts`、共享契约测试 |
| 分方预览事实、失败拦截与重试 | `usePrescriptionSplitPreview.ts`、`../DoctorWorkstation.tsx` | `usePrescriptionSplitPreview.test.tsx`、`../DoctorWorkstation.test.tsx` |
| 整批保存与回执核实 | `persistOrderDrafts.ts` | `persistOrderDrafts.test.ts`、`../DoctorWorkstation.test.tsx`、`../record/saveClinicalDraft.test.ts` |
| 历史处方续方与当前目录核对 | `../ai/historicalPrescriptionImport.ts`、`../ai/HistoryPrescriptionReference.tsx` | 同名测试、`../DoctorWorkstation.test.tsx` |
| 临床模板回执、选择与异步带入 | `../templates/templateApplicationReceipt.ts`、`useTemplateApplication.ts`、`historicalPlanSelection.ts` | 同名测试、`../DoctorWorkstation.test.tsx` |
| 临床模板的当前产品、价格、库存与执行科室 | `../templates/resolveTemplateOrders.ts`、`orderExecutionDepartment.ts` | `resolveTemplateOrders.test.ts`、`resolveTemplateOrders.api.test.ts`、`../DoctorWorkstation.test.tsx` |

## 状态与依赖方向

- `medicationDraft.ts`：医嘱草稿类型与输液途径判定，不依赖 React 编辑器。
- `orderDraftTypes.ts`：项目草稿、AI 审核命令、录入类别。旧组件的类型和辅助函数导出保留兼容，新代码直接从小模块导入。
- `medicationEntry.ts`：尚未加入待确认列表的当前输入及默认值，和原子更新皮试免试状态的函数；不创建第二份录入状态。
- `medicationQuantity.ts`：剂量／疗程到包装数量的预览；频次必须来自结构化规则，不根据代码或名称猜测。
- `dispensableOptions.ts`、`administrationGroups.ts`、`orderEntries.ts` 为独立模型逻辑，不运行时依赖 React 编辑器；包装解析按当前机构、当地业务日期、真实产品单位和唯一有效价格提供整包装／拆零选项。
- `orderPresentation.ts`、`OrderRowDecorations.tsx`、`orderEditorControls.ts` 分别负责文字显示、行标识和连续录入焦点辅助，不承担提交职责。
- `../../../shared/clinical/frequencySemantics.ts`：与 Java ClinicalFrequencySemantics 对齐，双方测试读取 backend/src/test/resources/contracts/clinical-frequency-semantics.json。
- `persistOrderDrafts.ts`：医嘱整批保存与回执核实；唯一调用 `saveOrderDrafts`，不再按客户端分类分方或逐条兼容提交。
- `../UnifiedOrderListEditor.tsx`：保留连续录入状态、组方会话、目录选择／当前条目校验与加入草稿。跨区联动仍在这里协调；已保存和待确认列表的呈现进入对应 List 组件。
- `OrderComposer*` 是受控字段组件，只接收各自的输入字段、字典选项和回调，不拥有草稿副本，不接收完整工作站控制器。原 DOM 层级、ID 和回车流保持一致，草药确认阻止键盘事件向外重复提交。
- 待确认列表按类别连续展示，每类表头只出现一次；类别分组不是最终单据。药品审核预览与批量保存共用 `draftToBatchItem`（包括已选药房 ID）和后端分方引擎；检验检查当前逐项创建申请，不套用药品分方规则。
- `SavedOrderList` 与 `DraftOrderList` 用同一个 composer 插槽在指定组尾呈现录入区；位置由 `findGroupingComposerTarget` 决定。草稿药品保存后的输液会话同步仍回调父组件；整方修改仅回传整方字段，不传入整个录入状态 setter。
- `useDraftRowInteractions` 只管理交互和计时器。每个行编辑器负责自己的验证和单次保存保护，不能把失焦保存误当作向后端提交医嘱。
- `useAiOrderReview` 仍以命令 ID 驱动一次目录核对；完成时检查最新的就诊、忙碌和只读状态，卸载／换诊取消旧结果。只加入待确认草稿，正式开立仍由已有上层流程处理。
- `quantityManuallySet` 标记显式总量，同组频次变化不覆盖它。新模块不得运行时导入 UnifiedOrderListEditor 或 PrescriptionListEditor。

## 关键约束速查

改动前先确认不违反下列约束；每条的完整说明在 [事实边界](../../../../../docs/architecture/门诊医嘱草稿事实边界.md) 对应小节。

- **不猜、不补默认值**：缺失的价格、币种、数量、疗程、包装系数、单位不补零、补 1 或补人民币；不回退租户价或列表首条；无计算依据时返回空并要求医生补填（包装、价格与数量；服务销售价与单据小计）。
- **频次只用结构化规则**：PRN、ONCE、CALENDAR 等不提供固定日频次；药房使用保存的 `frequencyRule` 快照，不用当前目录或代码名称猜测（频次、数量预览与开立核查）。
- **执行去向不冒充**：不按药品类型生成西药房／中药房，不按项目名称猜科室，不把接诊科室当执行科室；缺失显示待确认（检验检查默认执行科室；执行去向展示）。
- **整批保存唯一入口**：`persistOrderDrafts` → `POST /api/encounters/{id}/order-drafts` 单事务；回执逐项核实后才清空草稿，重试沿用命令编码；病历与医嘱不是一个原子事务（整批医嘱保存与回执）。
- **外部来源整体带入**：历史续方、临床模板、组套、AI 建议须全部核对成功才带入，与当前草稿重复时整批拒绝；患者、就诊、上下文或 API 变化作废迟到结果（历史处方续方；临床模板回执与带入边界；模板抽屉的当前目录核对；组套导入与执行科室）。
- **库存路由不兜底**：按已配置路由解析药房，不遍历其他药房；冻结使用保存时的 `baseQuantity`；已开立去向读取库存预留记录（门诊库存路由事实；库存换算与释放回执）。
- **分方以后端为准**：预览与开立共用后端分方引擎，不用本地估算补单据数；预览不是开立成功凭据（分方预览与开立事实）。
- **服务申请逐项创建**：每个检验检查项目一个申请与执行任务，不自动合单；检查目的选填（频次、数量预览与开立核查）。
- **AI 目录匹配**：只采用唯一可靠匹配，多候选由医生选择，不取搜索首项；未构建的推荐在医嘱保存回执核实后丢弃（AI 目录匹配与知识库调入）。
- **模块边界**：新模块不得运行时导入 `UnifiedOrderListEditor` 或 `PrescriptionListEditor`；`OrderComposer*` 不持有草稿副本（见上方状态与依赖方向）。

## 验证

- 频次与医嘱行：根目录 `./scripts/verify-scope.sh frequency`；修改处方提交协议时扩大到后端医嘱／处方主流程验证。
- 涉及医生工作站集成：`./scripts/verify-scope.sh round1`（门诊草稿 + 频次组合范围）。
