# 门诊病历与草稿边界

从用例选入口，不需要每次读取完整 DoctorWorkstation。根入口只负责队列、导航和兼容导出；患者会话/草稿协调在 `../workstation/PatientWorkspace.tsx`，转诊在 `../referrals/ReferralCoordination.tsx`，诊毕在 `EncounterCompletionDialog.tsx`，过敏在 `AllergySafetyPanel.tsx`，病历 UI 在 `ClinicalRecordPanel.tsx`，临床模板（病历模板、诊疗方案、医嘱组套）的统一带入抽屉在 `../templates/TemplateLibraryDrawer.tsx`，打印及历史分别在 `../printing/`、`../history/`。

患者会话由 `useContextSession` 随患者/上下文身份及 API 会话生成；异步失效和草稿保存仍复用既有协调器。相同模板/历史身份的查询刷新保留医生勾选，身份变化再初始化。上述边界的组合回归仍由 `DoctorWorkstation.test.tsx` 覆盖，不能仅测纯函数推断工作流正常：

| 修改内容 | 入口 | 定向测试 |
| --- | --- | --- |
| 诊断搜索、主次、排序、移除 | `DiagnosisPanel.tsx` | `DiagnosisPanel.test.tsx` |
| 生命体征输入、分诊／历史引用 | `ClinicalVitalsFields.tsx` | `ClinicalVitalsFields.test.tsx` |
| 结构化字段、病历阅读视图 | `StructuredNoteFields.tsx` | `../DoctorWorkstation.test.tsx` |
| 病历区模板入口：“套用模板”（以 `purpose=RECORD` 打开统一模板抽屉）、“存为模板”、段落合并规则 | `NoteTemplateBar.tsx`（入口、保存、`mergeNoteTemplateContent`）、`../templates/noteTemplateSaveInput.ts` | `NoteTemplateBar.test.tsx`、`../templates/noteTemplateSaveInput.test.ts`、`../DoctorNoteTemplate.test.ts`、`../DoctorWorkstation.test.tsx` |
| 统一模板抽屉：按用途（`RECORD`/`ORDERS`/`DIAGNOSIS`）过滤，病历／诊断／医嘱三区预览、重复与失效行、统一回执；页签与名称固定为“诊疗方案、医嘱组套、病历模板”，范围叫法“我的／科室／全院”；医嘱组套含新 `ORDER_SET` 模板与旧主数据组合（只读，标注“全院 · 由医务科维护”），`initialOrderSet` 由医嘱检索选中新组套时预选 | `../templates/TemplateLibraryDrawer.tsx`、`../templates/templateLibrary.ts`、`../templates/orderSetTemplate.ts`、`../templates/TemplatePreviewParts.tsx`；开关与用途由 `../workstation/PatientWorkspace.tsx` 持有，`ClinicalRecordPanel.tsx` 经 `planTemplateDrawerHost` 门户挂载 | `../templates/TemplateLibraryDrawer.test.tsx`、`../templates/templateLibrary.test.ts`、`../DoctorWorkstation.test.tsx` |
| 临床模板库维护页（`/outpatient/plan-templates`）：诊疗方案／医嘱组套／病历模板三类页签，新建先选类型（`NewTemplateTypeDialog`）；医嘱组套详情、编辑（`ManualClinicalTemplateDialog` 的 `ORDER_SET` 模式，隐藏诊断、任务、病历关联，行级默认勾选与项目执行科室）、复制为我的、停用；主数据旧组合只读 | `../templates/OutpatientPlanTemplatesWorkspace.tsx`、`NewTemplateTypeDialog.tsx`、`OrderSetTemplateDetail.tsx`、`ManualClinicalTemplateDialog.tsx`、`PlanTemplateClinicalEditor.tsx`（`mode="ORDER_SET"`）、`orderSetTemplate.ts`（错误编码提示按 `code`） | `../templates/OrderSetTemplatesWorkspace.test.tsx`、`../templates/OutpatientPlanTemplatesWorkspace.test.tsx`、`../templates/ManualClinicalTemplateDialog.test.tsx` |
| AI 上下文、采纳防串患者、撤销 | `clinicalAiDraftContext.ts`、`useClinicalAiDraft.ts`、`useAiPlanApplication.ts` | `useClinicalAiDraft.test.tsx`、`useAiPlanApplication.test.tsx`、`../ai/ClinicalAiPlanAdoption.test.tsx` |
| 校验、内容投影、保存顺序／重试 | `clinicalRecordDraft.ts`、`saveClinicalDraft.ts` | `saveClinicalDraft.test.ts`、`../DoctorNoteTemplate.test.ts` |
| 签署、更正、签署并诊毕／打印 | `clinicalDocumentWorkflow.ts`、`useClinicalDocumentSession.ts` | `clinicalDocumentWorkflow.test.ts`、`useClinicalDocumentSession.test.tsx` |
| 保存回执核实、保存期间上下文变化 | `clinicalRecordReceipt.ts`、`useClinicalDraftSession.ts` | `clinicalRecordReceipt.test.ts`、`useClinicalDraftSession.test.tsx` |
| 诊毕、诊间收款与结算单 | `completeEncounter.ts`、`completionFacts.ts`、`completionBillingWrites.ts`、`EncounterCompletionDialog.tsx` | `completeEncounter.test.ts`、`completionFacts.test.ts`、`completionBillingWrites.test.ts` |
| 行内来源与变量标记 | `recordAnnotations.ts`、`AnnotatedRecordField.tsx` | `recordAnnotations.test.ts`、`../DoctorWorkstation.test.tsx` |
| 诊断身份与管理提示 | `diagnosisIdentity.ts`、`diagnosisManagementEvidence.ts` | `diagnosisManagementEvidence.test.ts`、`DiagnosisPanel.test.tsx` |
| 病历完整性、文字矛盾与反馈 | 标题栏 `RecordQualityControl.tsx` 的数量角标和按需浮层、`RecordQualityReview.tsx`、`useRecordQualityDecision.ts`；正文不保留核查区域，保存回执由 ClinicalRecordPanel 对接 | `useRecordQualityDecision.test.tsx`、后端 `RecordQualityDecisionTest` |
| 主诉扩写病历 | `../ai/recordExpansion.ts`、`../ai/RecordExpansionTrigger.tsx` | `../ai/recordExpansion.test.tsx`、后端 `ClinicalAiModelModeTest` |

## 关键约束速查

改动前先确认不违反下列约束；完整说明见 [门诊病历与草稿事实边界](../../../../../docs/architecture/门诊病历草稿事实边界.md)。

- **保存不是原子事务**：病历先于医嘱，两次 HTTP 请求；失败保留本地草稿与命令编码重试，提示远端可能已保存，不宣称已回滚。
- **回执核实后才前进**：病历、医嘱、签署、诊毕和收款都须核对服务端回执后才清空草稿或继续下一步；患者、API 会话、权限、编辑状态变化后的迟到回执不写入当前页面。
- **签署看证据，不看状态字符串**：已签署须有当前版本的作者、时间、签署含义及证据引用。
- **诊毕不被费用阻塞**：签署／诊毕准入只核对临床资料；费用接口失败、未结清不阻塞，也不把未确认金额显示为零或已结清。
- **诊断身份**：以概念 ID，或编码体系＋诊断域＋编码区分；不补默认体系，跨体系同码不合并；管理规则未确认时显示待核对。
- **病历与方案分开**：病历不含自由文本诊疗计划；病历模板提供文书段落，诊疗方案提供结构化诊断与医嘱，在统一模板抽屉的病历／诊断／医嘱三区分别勾选后带入（病历区“套用模板”只是以 `RECORD` 用途打开该抽屉，不再有独立选择弹层）。
- **AI 采纳不覆盖医生**：只填空白字段或按语义绑定更新，手工修改冲突用行内标记；未确认的模板／AI 预设不作为本次推理事实。
- **模块边界**：新模块不得运行时导入 `DoctorWorkstation`；模型逻辑不依赖 UI。

## 验证

- 根目录 `./scripts/verify-scope.sh outpatient-draft`（先加 `--list` 查看命令）；跨医生站工作流用 `round1`。
- 验收重点：主要诊断、结构化必填、切换患者、失败重试、AI 采纳与撤销、签署及完成就诊。
