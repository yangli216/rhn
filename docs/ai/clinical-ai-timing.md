# 医生站 AI 辅诊耗时日志

使用相同 `correlationId` 关联同一轮请求，日志仅记录数值和状态，不记录患者正文、提示词、密钥或服务地址。

- `clinical_ai_generation_timing`：整轮及上下文、主生成、医嘱匹配、保存耗时；`firstDeltaMs` 是整轮开始到首个内容片段的时间。
- `clinical_ai_model_timing`：单次主生成或方案检索模型调用；按实际 `requestKind` 区分，记录 token、供应商提供的 reasoning token 和 `firstContentMs`。非流式首内容时间为 `-1`。旧的 `CATALOG_TREATMENT` 模型选择不代表现行院内医嘱匹配链路。
- `clinical_ai_treatment_timing`：现行统一目录匹配，记录 `intentCount`、`candidateCount`、`deterministicCount`、`ambiguousCount`、`pendingCount`、`catalogLookupMs`、`totalMs`。当前两个耗时值覆盖同一匹配区间（包含可选 Jev 核查），不能相加，也不能从其差值推断数据库查找与决策分别花了多久。
- `clinical_ai_decision_timing`：现行可选 Jev 语义核查。统一 resolver 先匹配院内目录；有候选但未确定的项目才通过 `TreatmentCatalogDecisionService` 核查。`MODE_DISABLED`、`SCENE_DISABLED`、`CONFIGURATION_INCOMPLETE`、`CANDIDATE_SCOPE_INVALID`、`SHADOW`、`UNCONFIRMED_MATCH`、`DECISION_FAILED`、`APPLIED` 是决策服务的状态；推荐服务只将结果投影为待核对资料，仍需医生确认，不能从 `APPLIED` 推断已开立医嘱。无待核对候选时不会出现这条计时。

当前入口：`backend/rhn-intelligence/.../application/ClinicalAssistantApplicationService.java`（总协调）、`ClinicalAiContextAssembler.java`（服务端证据/指纹）、`ClinicalTreatmentRecommendationService.java`（医嘱匹配）。上下文 hash 包含患者事实、过敏、文书版本、历史报告和可见方案；拆分职责不会省略这些失效条件。

`completionTokensPerSecond` 为供应商报告的输出 token 数除以该次调用总耗时，包含首内容等待时间，表示整次调用的平均吞吐，并非纯解码速度。供应商未提供 token 用量时，相关计数和速度为 `-1`，不能按零计算或通过字数猜测。重复累计 usage 帧保留最后一次报告的计数。`outputChars` 是收到的内容字符串长度，不等同于 token 数。

整轮、主模型、医嘱匹配及其内部模型调用是包含关系，分析总耗时不能重复相加。非流式请求无法测量首片段时间；浏览器网络与渲染耗时也不在这些后端日志中。

逐项目匹配日志 `clinical_ai_catalog_match` 与生成计时共用 correlationId：rawType/effectiveType、name/specification/query、机构/科室/业务日期、outcome、候选 ID/规格及规格/产品/库存拒绝数量。字段限制长度并清除控制字符，不记录完整提示词、病历、患者身份和异常消息。`SPECIFICATION_REVIEW`、`AMBIGUOUS`、`NO_ORDERABLE_SERVICE`、`MEDICATION_NOT_FOUND`、`MEDICATION_UNAVAILABLE` 与 `CATALOG_ERROR` 分别表示规格核对、目录歧义、无可开立项目、未找到药品定义、药品暂不可开及目录读取失败；库存目录已经过滤的项目只能定位到机构采用/路由/库存综合不可用，不能据此单独断言无库存。
