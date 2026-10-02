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

- `DiagnosisPanel` 持有搜索、弹层、拖拽等临时状态；诊断数组由父编辑器持有。常用诊疗方案入口位于医生站最右侧工具栏，方案池以宽抽屉呈现；`ClinicalRecordPanel` 通过 portal 将共享诊断和医嘱草稿接入抽屉，避免复制或上移整套草稿状态。
- `ClinicalVitalsFields` 持有参考来源查询和反馈状态；使用父编辑器的同一个 react-hook-form 实例，引用缺失字段时保留医生现值。卸载时清理反馈计时器。
- `StructuredNoteFields` 只负责呈现；`NoteTemplateBar` 负责模板查询和操作，通过回调修改父草稿。
- `useClinicalAiDraft` 负责上下文订阅、采纳校验和撤销控制；父编辑器持有用于未保存判断的撤销快照。医嘱方案通过回调交给原有协调流程。
- 新模块不得运行时导入 `DoctorWorkstation`；模型不依赖 UI。新增同类行为直接进入对应模块，避免重新堆回工作站。

- `clinicalRecordDraft.ts`：病历 schema、结构化表单检查、诊断排序／指纹、提交内容投影。纯函数，不读网络、不依赖工作站 UI。
- `saveClinicalDraft.ts`：一个编辑器一个实例；按病历 → 医嘱草稿顺序保存。相同就诊和病历内容失败重试复用病历 commandCode，全部成功后才清除。
- `../orders/persistOrderDrafts.ts`：批量处方接口与现有兼容逻辑、服务申请的保存顺序。
- `../DoctorWorkstation.tsx` 的 `ClinicalRecordPanel`：保留共享草稿、保存／签署／修订协调、历史带入、AI 流式字段显示、保存后的 query 失效。跨区流程变更仍需读此入口并跑集成测试。

病历模板与诊疗方案共用工作台的模板化操作体验，但不合并存储模型：病历模板提供主诉、现病史等文书段落，诊疗方案提供诊断、药品、检查检验和治疗任务。二者分别调入当前草稿并由医生确认，避免文书内容直接生成可执行医嘱。

跨 HTTP 请求的保存并非数据库原子事务。病历 commandCode 只保护病历命令；本轮没有改变处方／服务申请部分成功后的重试协议，不应宣称整个组合保存已 exactly-once。

原 DoctorWorkstation 的辅助函数导出暂保留兼容；新测试／调用优先使用上述小模块。
验证：根目录 `./scripts/verify-scope.sh outpatient-draft`；先查看命令可加 `--list`。
验收重点：主要诊断、结构化必填、切换患者、失败重试、AI 采纳与撤销、签署及完成就诊。

AI 共写入口先按问诊要点检索当前医生可见的整体诊疗方案。命中时先展示方案选择，医生进入原有临床模板面板核对配套病历、诊断、药品与诊疗项目；不采用或无匹配时才进入原有病历生成与逐项采纳流程。医嘱列表不再承载整体方案推荐。匹配阶段不持久化建议或临床草稿；输入变化会使待选方案失效。

## 通用病历与结构化方案引用

病历书写字段为主诉、现病史、既往史、查体、过敏史补充、用药史、健康宣教和随访复诊。辅助检查结果不再作为当前编辑区的独立输入项，历史数据继续保留。生命体征沿用现有结构化录入。诊断与诊疗计划只引用诊断/医嘱工作区，病历、模板、历史带入及 AI 采纳均不提供自由文本诊疗计划编辑；旧版 treatmentPlan 留作历史数据兼容，新保存不采纳客户端文字计划。

AI 建方的 noteTemplateContent 只提供上述书写框架和建议；不预填未知患者事实。保存时创建配套病历模板并通过 noteTemplateId 关联既有方案，使用时仍分别带入病历与结构化诊断/医嘱草稿。宣教和随访的编辑内容以配套病历模板为准。新增字段使用既有 JSON 内容存储，无需改变物理表。

`ClinicalRecordReferences` 使用当前诊断与医嘱草稿及同一就诊的已保存医嘱，明确区分待保存草稿、已保存草稿和已开立内容，并排除取消医嘱。引用区域无文本输入控件。

病历采用连续文书显示：段落标题加粗、正文自然换行，编辑使用共享 FormField 的 document 外观。AI 建方使用内容区抽屉；对话作为辅助栏，病历书写与结构化诊疗方案左右并列，以 WorkspacePane 分别管理正文滚动，头部与保存操作固定。

AI 建方的病历内容按 noteTemplateContent 字段顺序流式预览。预览仅投影白名单书写字段，支持未闭合字符串和 JSON 转义；生成期间只读，完整响应后才替换可保存草稿，连接失败保留上一份草稿。后端提示词优先输出病历采集框架，再输出结构化诊疗条目，不编造未提供的患者事实。

流式阶段也遵守书写归属：EDUCATION/FOLLOW_UP 只投影到左侧宣教与随访，不进入右侧清单。右侧结构化条目在九个病历字符串字段闭合后显示；提前到达的诊疗条目只缓存，避免由模型 JSON 字段顺序决定界面显示顺序。

病历正文标签与生命体征标签共用 `--doctor-record-label-width`，标签右对齐、内容区起点一致，随字号档位缩放。
