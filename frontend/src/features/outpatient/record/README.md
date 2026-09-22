# 门诊病历与草稿边界

从用例选入口，不需要每次读取完整 DoctorWorkstation：

| 修改内容 | 入口 | 定向测试 |
| --- | --- | --- |
| 诊断搜索、主次、排序、移除 | `DiagnosisPanel.tsx` | `DiagnosisPanel.test.tsx` |
| 生命体征输入、分诊／历史引用 | `ClinicalVitalsFields.tsx` | `ClinicalVitalsFields.test.tsx` |
| 结构化字段、病历阅读视图 | `StructuredNoteFields.tsx` | `../DoctorWorkstation.test.tsx` |
| 病历模板选择、保存、段落合并 | `NoteTemplateBar.tsx` | `../DoctorNoteTemplate.test.ts`、`../DoctorWorkstation.test.tsx` |
| AI 上下文、采纳防串患者、撤销 | `clinicalAiDraftContext.ts`、`useClinicalAiDraft.ts` | `useClinicalAiDraft.test.tsx` |
| 校验、内容投影、保存顺序／重试 | `clinicalRecordDraft.ts`、`saveClinicalDraft.ts` | `saveClinicalDraft.test.ts`、`../DoctorNoteTemplate.test.ts` |

## 状态与依赖方向

- `DiagnosisPanel` 持有搜索、弹层、拖拽等临时状态；诊断数组由父编辑器持有。诊疗模板按钮通过 actions 插槽传入，面板不依赖医嘱状态或工作站实现。
- `ClinicalVitalsFields` 持有参考来源查询和反馈状态；使用父编辑器的同一个 react-hook-form 实例，引用缺失字段时保留医生现值。卸载时清理反馈计时器。
- `StructuredNoteFields` 只负责呈现；`NoteTemplateBar` 负责模板查询和操作，通过回调修改父草稿。
- `useClinicalAiDraft` 负责上下文订阅、采纳校验和撤销控制；父编辑器持有用于未保存判断的撤销快照。医嘱方案通过回调交给原有协调流程。
- 新模块不得运行时导入 `DoctorWorkstation`；模型不依赖 UI。新增同类行为直接进入对应模块，避免重新堆回工作站。

- `clinicalRecordDraft.ts`：病历 schema、结构化表单检查、诊断排序／指纹、提交内容投影。纯函数，不读网络、不依赖工作站 UI。
- `saveClinicalDraft.ts`：一个编辑器一个实例；按病历 → 医嘱草稿顺序保存。相同就诊和病历内容失败重试复用病历 commandCode，全部成功后才清除。
- `../orders/persistOrderDrafts.ts`：批量处方接口与现有兼容逻辑、服务申请的保存顺序。
- `../DoctorWorkstation.tsx` 的 `ClinicalRecordPanel`：保留共享草稿、保存／签署／修订协调、历史带入、AI 流式字段显示、保存后的 query 失效。跨区流程变更仍需读此入口并跑集成测试。

跨 HTTP 请求的保存并非数据库原子事务。病历 commandCode 只保护病历命令；本轮没有改变处方／服务申请部分成功后的重试协议，不应宣称整个组合保存已 exactly-once。

原 DoctorWorkstation 的辅助函数导出暂保留兼容；新测试／调用优先使用上述小模块。
验证：根目录 `./scripts/verify-scope.sh outpatient-draft`；先查看命令可加 `--list`。
验收重点：主要诊断、结构化必填、切换患者、失败重试、AI 采纳与撤销、签署及完成就诊。
