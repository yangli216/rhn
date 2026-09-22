# 门诊医嘱草稿

从当前用例选入口，避免默认读取完整统一医嘱组件：

| 用例 | 实现入口 | 验证入口 |
| --- | --- | --- |
| 连续录入检索、用法、数量、嘱托 | `OrderComposerResource.tsx`、`OrderComposerDirections.tsx`、`OrderComposerQuantity.tsx`、`OrderComposerInstruction.tsx` | `OrderComposerFields.test.tsx`、`../UnifiedOrderListEditor.test.tsx` |
| 录入时过敏／皮试提醒、免试依据 | `OrderComposerSafety.tsx`、`medicationEntry.ts` | `medicationEntry.test.ts`、`../UnifiedOrderListEditor.test.tsx` |
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
| 批量保存与兼容提交 | `persistOrderDrafts.ts` | `../DoctorWorkstation.test.tsx`、`../record/saveClinicalDraft.test.ts` |

## 状态与依赖方向

- `medicationDraft.ts`：医嘱草稿类型与输液途径判定，不依赖 React 编辑器。
- `orderDraftTypes.ts`：项目草稿、AI 审核命令、录入类别。旧组件的类型和辅助函数导出保留兼容，新代码直接从小模块导入。
- `medicationEntry.ts`：尚未加入待确认列表的当前输入及默认值，和原子更新皮试免试状态的函数；不创建第二份录入状态。
- `medicationQuantity.ts`：剂量／疗程到包装数量的预览；频次必须来自结构化规则，不根据代码或名称猜测。
- `dispensableOptions.ts`、`administrationGroups.ts`、`orderEntries.ts` 为独立模型逻辑，不运行时依赖 React 编辑器；包装解析原有机构、有效期、整包装／拆零选择规则保持不变。
- `orderPresentation.ts`、`OrderRowDecorations.tsx`、`orderEditorControls.ts` 分别负责文字显示、行标识和连续录入焦点辅助，不承担提交职责。
- `../../../shared/clinical/frequencySemantics.ts`：与 Java ClinicalFrequencySemantics 对齐，双方测试读取 backend/src/test/resources/contracts/clinical-frequency-semantics.json。
- `persistOrderDrafts.ts`：医嘱保存编排；保留已有批量接口和旧客户端兼容路径。本轮未删除兼容行为。
- `../UnifiedOrderListEditor.tsx`：保留连续录入状态、组方会话、目录选择／当前条目校验与加入草稿。跨区联动仍在这里协调；已保存和待确认列表的呈现进入对应 List 组件。
- `OrderComposer*` 是受控字段组件，只接收各自的输入字段、字典选项和回调，不拥有草稿副本，不接收完整工作站控制器。原 DOM 层级、ID 和回车流保持一致，草药确认阻止键盘事件向外重复提交。
- `SavedOrderList` 与 `DraftOrderList` 用同一个 composer 插槽在指定组尾呈现录入区；位置由 `findGroupingComposerTarget` 决定。草稿药品保存后的输液会话同步仍回调父组件；整方修改仅回传整方字段，不传入整个录入状态 setter。
- `useDraftRowInteractions` 只管理交互和计时器。每个行编辑器负责自己的验证和单次保存保护，不能把失焦保存误当作向后端提交医嘱。
- `useAiOrderReview` 仍以命令 ID 驱动一次目录核对；完成时检查最新的就诊、忙碌和只读状态，卸载／换诊取消旧结果。只加入待确认草稿，正式开立仍由已有上层流程处理。
- `quantityManuallySet` 标记显式总量，同组频次变化不覆盖它。新模块不得运行时导入 UnifiedOrderListEditor 或 PrescriptionListEditor。

小时和分钟需要换算到日，周按 7 天；PRN、ONCE、CALENDAR、缺失／无效规则不提供固定日频次。自动预览失败返回 null，新开立时需明确填写数量；已有草稿的未知频次不参与比例重算。
药房使用已保存的 `frequencyRule` 快照，不能用当前目录替换历史规则或从 QD/TID 猜测数值。

每日平均次数不等于具体日期范围内的执行计划；精确排程属于后端 ClinicalFrequencySchedule。本轮没有扩展执行计划，也没有全面重写既有规格文字解析和单位换算。
验证：根目录 `./scripts/verify-scope.sh frequency`。修改处方提交协议时，还需扩大相应后端医嘱／处方主流程验证。

同时涉及医生工作站集成时运行 `./scripts/verify-scope.sh round1`（门诊草稿 + 频次组合范围）。后续拆分重点是主组件中的目录选择、当前条目校验／构建及组方会话；优先建立纯逻辑边界，避免整体迁入巨型 hook。
