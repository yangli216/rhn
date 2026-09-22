# 字段命名优化 · 1.77.0 逐表清单

范围：251 张表、893 个物理字段、292 个长词。保留逻辑字段名、Java/API 属性及枚举值。

权威清单：`column-renames-1.77.0.json`。PostgreSQL / Oracle 使用配对的 `V1_77_0__governed_column_abbreviations.sql`，原位改名；不覆盖历史迁移。

本清单仅描述目标变更，不表示 Oracle 现库已执行迁移。工作台「结构对照」显示现库是否仍使用旧名。

另补齐 1.76.0 已增加字段 `RHN_BD_MED_STD_SOURCE.CD_BINDING_CLAIM` 的目录登记与中文注释，字段含义和约束不变。

## RHN_AI_SUGGEST · ai.ai_suggestion

AI建议；一行代表一条AI建议记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_KNOWLEDGE_VER | CD_KNOW_VER | knowledge_version | knowledge版本 |
| CD_PROVIDER | CD_PRVDR | provider_code | 提供方编码 |
| DES_INVALIDATION_REASON | DES_INVLDN_REASON | invalidation_reason | invalidation原因 |
| DT_GENERATED | DT_GEND | generated_at | 生成时间 |
| DT_INVALIDATED | DT_INVLDD | invalidated_at | invalidated时间 |
| ID_PRACT_REQUESTED | ID_PRACT_REQD | requested_practitioner_id | 申请医务人员标识 |
| ID_USER_REQUESTED | ID_USER_REQD | requested_user_id | 申请用户标识 |

## RHN_AI_SUGGEST_EVT · ai.ai_suggestion_event

AI建议事件；一行代表一条AI建议事件记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |

## RHN_ANL_PRES_METRIC_SAMPLE · anl.presence_metric_sample

在线状态指标样本；一行代表一条在线状态指标样本记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| QTY_CONNECTIONS | QTY_CONNS | connections | 连接数 |
| QTY_INSTANCES | QTY_INSTS | instances | 实例数 |
| QTY_ONLINE_CONTEXTS | QTY_ONLINE_CTXS | online_contexts | 在线上下文数 |

## RHN_AN_CATALOG_VER · an.catalog_ver

一行代表分析目录的一个版本

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| JSON_DEFINITION | JSON_DEF | json_definition | 目录定义 JSON |

## RHN_AN_RUN · an.run

一行代表一次分析运行

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| SD_DELIVERY | SD_DELIV | sd_delivery | 结果交付状态 |

## RHN_AUD_CRYPTO_EVID · aud.cryptographic_evidence

密码学证据；一行代表一条密码学证据记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_CERTIFICATE_SERIAL | CD_CERT_SERIAL | certificate_serial | 证书序列号 |
| CD_OPERATION | CD_OPER | operation_code | 业务操作编码 |
| CD_PROVIDER | CD_PRVDR | provider_code | 提供方编码 |
| CERTIFICATE_ISSUER | CERT_ISSUER | certificate_issuer | 证书签发方 |
| CONTENT_DIGEST_ALGORITHM | CONTENT_DIGEST_ALGO | content_digest_algorithm | 内容摘要算法 |
| DES_VERIFICATION_MATERIAL | DES_VRFCTN_MATL | verification_material | 验证material |
| DT_RECORDED | DT_RECDD | recorded_at | 记录时间 |
| HASH_STATEMENT | HASH_STMT | statement_digest | 声明摘要 |
| ID_CORRELATION | ID_CORR | correlation_id | 关联标识 |
| ID_CRYPTO_EVID_PREVIOUS | ID_CRYPTO_EVID_PREV | previous_evidence_id | 上一证据标识 |
| JSON_STATEMENT | JSON_STMT | statement_json | 声明JSON |
| PROVIDER_ASSURANCE | PRVDR_ASSUR | provider_assurance | 提供方可信等级 |
| SD_PROTECTION_PROF | SD_PROT_PROF | protection_profile | 保护档案 |
| SD_PROTECTION_PURPOSE | SD_PROT_PURPOSE | protection_purpose | 保护用途 |
| SD_SIGN_ALGORITHM | SD_SIGN_ALGO | signature_algorithm | 签名算法 |
| SIGNATURE_VALUE | SIGNTR_VALUE | signature_value | 签名值 |
| SN_STATEMENT_VER | SN_STMT_VER | statement_version | 声明版本 |
| STATEMENT_DIGEST_ALGORITHM | STMT_DIGEST_ALGO | statement_digest_algorithm | 声明摘要算法 |
| TIMESTAMP_AUTHORITY | TS_AUTHRTY | timestamp_authority | 时间戳授权机构 |
| TIMESTAMP_TOKEN | TS_TOKEN | timestamp_token | 时间戳令牌 |

## RHN_AUD_IAM_AUTH_EVT · aud.iam_authorization_event

身份权限授权事件；一行代表一条身份权限授权事件记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |

## RHN_AUD_KNOW_FEEDBACK · aud.medication_knowledge_feedback

合理用药旁路研判记录，一行代表对一次观察追加或撤回的人工意见，不改写运行结果或发布状态

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| ID_DEPLOYMENT | ID_DEPLOY | deployment_id | 冻结发布记录标识 |
| ID_FEEDBACK | ID_FDBK | id | 不可变研判事件标识 |
| NO_REVISION | NO_REV | revision | 本次观察研判事件序号 |
| SD_OPERATION | SD_OPER | operation | 研判操作：追加意见或撤回 |

## RHN_AUD_KNOW_INTAKE · aud.medication_rule_intake

合理用药需求分析记录，一行代表一次不可变的意图分类与澄清分析，不代表药学证据或执行规则

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| ID_FEEDBACK | ID_FDBK | feedback_id | 改进需求引用的固定研判事件标识 |

## RHN_AUD_KNOW_RELEASE · aud.medication_knowledge_release

知识规则正式发布材料，一行代表一次显式启用或回退形成的固定验收记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| ID_DEPLOYMENT | ID_DEPLOY | deployment_id | 本次正式部署标识 |

## RHN_AUD_KNOW_REPLAY · aud.medication_knowledge_replay

合理用药知识处方回放记录，一行代表一个固定知识版本对一次历史审查输入的不可变回放结果

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| ID_KNOWLEDGE | ID_KNOW | knowledge_id | 知识草稿标识 |

## RHN_AUD_KNOW_RULE · aud.medication_knowledge_rule

知识衍生规则候选，一行代表一条知识规则的一次不可变编译版本，尚不代表审核或发布

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_COMPILER_VER | CD_CMPLR_VER | compiler_version | 结构化规则编译器版本 |
| ID_KNOWLEDGE | ID_KNOW | knowledge_id | 来源知识标识及规则版本链标识 |
| NO_KNOWLEDGE_VERSION | NO_KNOW_VERSION | knowledge_version | 本次编译锁定的知识版本号 |

## RHN_AUD_LOG · aud.audit_log

审计日志；一行代表一条审计日志记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |
| ID_CORRELATION | ID_CORR | correlation_id | 关联标识 |

## RHN_AUD_MED_EVAL · aud.quality_evaluation

合理用药评价；一行代表一次完整处方的旁路安全评价

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_COMPLETED | DT_CMPLD | completed_at | 评价完成时间 |
| ID_PRESCRIPTION | ID_RX | prescription_id | 目标处方标识 |
| SD_DECISION | SD_DCSN | decision | 聚合执行动作 |

## RHN_AUD_MED_FINDING · aud.quality_finding

合理用药风险发现；一行代表某次评价中一条规则的风险发现

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| JSON_EVIDENCE | JSON_EVID | evidence | 证据快照 |
| SD_DECISION | SD_DCSN | decision | 执行动作 |
| SD_OVERRIDE_POLICY | SD_OVRD_POLICY | override_policy | 覆盖策略 |
| SD_SEVERITY | SD_SEV | severity | 风险严重程度 |

## RHN_AUD_MED_GOV_RUN · aud.medication_rule_governance_run

合理用药规则运行记录，一行代表已部署规则版本对一张处方的一次自动评价

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| ID_DEPLOYMENT | ID_DEPLOY | deployment_id | 冻结发布记录标识 |
| ID_PRESCRIPTION | ID_RX | prescription_id | 处方标识 |
| SD_DECISION | SD_DCSN | decision | 评价结论 |

## RHN_AUD_MED_KNOW_DRAFT · aud.medication_knowledge_draft

合理用药知识草稿版本，一行代表一个租户下一条知识草稿的一次不可变保存版本

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| ID_KNOWLEDGE | ID_KNOW | knowledge_id | 知识草稿标识，各版本共用 |

## RHN_AUD_MED_OVERRIDE · aud.quality_override

合理用药风险覆盖记录；一行代表用户对一个风险发现的覆盖理由

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| ID_OVERRIDE | ID_OVRD | id | 覆盖记录标识 |

## RHN_AUD_MED_RULE · aud.quality_rule_definition

合理用药规则定义；一行代表一条平台级规则定义

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_CATEGORY | CD_CAT | category | 规则分类 |

## RHN_AUD_MED_RULE_VER · aud.quality_rule_version

合理用药规则版本；一行代表一条不可变规则版本及证据

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_IMPLEMENTATION | CD_IMPL | implementation | 强类型执行定义版本 |
| DT_EFFECTIVE_FROM | DT_EFF_FROM | effective_from | 生效时间 |
| DT_EFFECTIVE_TO | DT_EFF_TO | effective_to | 失效时间 |
| JSON_EVIDENCE | JSON_EVID | evidence | 不可变来源证据快照 |
| SD_DECISION | SD_DCSN | decision | 执行动作 |
| SD_OVERRIDE_POLICY | SD_OVRD_POLICY | override_policy | 覆盖策略 |
| SD_SEVERITY | SD_SEV | severity | 风险严重程度 |

## RHN_BD_ALLERGEN · bd.allergen

一行代表一个受控过敏原概念

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_ALLERGEN | CD_ALRGN | cd_allergen | 过敏原代码 |
| ID_ALLERGEN | ID_ALRGN | id_allergen | 过敏原标识 |
| NA_ALLERGEN | NA_ALRGN | na_allergen | 过敏原名称 |

## RHN_BD_CATALOG_CHG_BATCH · bd.catalog_change_batch

目录变更批次；一行代表一条目录变更批次记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DA_BUSINESS | DA_BIZ | business_date | 业务日期 |
| QTY_SUCCEEDED_ROW | QTY_SUCCDD_ROW | succeeded_rows | succeeded行数 |
| SD_OPERATION_TYPE | SD_OPER_TYPE | operation_type | 业务操作类型 |

## RHN_BD_CATALOG_ITEM · bd.catalog_item

目录项目；一行代表一条目录项目记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| FG_CHARGEABLE | FG_CHGBL | chargeable | 是否chargeable |
| FG_ORDERABLE | FG_ORDRBL | orderable | 是否orderable |

## RHN_BD_CATALOG_PRICE · bd.catalog_price

目录价格；一行代表一条目录价格记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_CURRENCY | CD_CCY | currency_code | 币种编码 |
| ID_CATALOG_PRICE_REPLACES | ID_CATALOG_PRICE_RPLCS | replaces_price_id | 替代价格标识 |

## RHN_BD_CLIN_SEM_VER · bd.clinical_semantic_version

临床语义版本；一行代表一次不可变概念版本或显示信息变更记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_IDENTITY_KEY | CD_IDTY_KEY | identity_key | 成分去重身份键；其他版本记录为空 |
| DT_RECORDED | DT_RECDD | recorded_at | 版本记录时间 |
| ID_USER_RECORDED | ID_USER_RECDD | recorded_by | 记录人标识 |
| JSON_SNAPSHOT | JSON_SNAP | snapshot | 不可变资料快照 |

## RHN_BD_CODE_SYSTEM · bd.code_system

编码体系；一行代表一条编码体系记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_CANONICAL_URI | CD_CANON_URI | canonical_uri | 规范URI |
| DA_EFFECTIVE_FROM | DA_EFF_FROM | effective_from | 生效开始日期 |
| DA_EFFECTIVE_TO | DA_EFF_TO | effective_to | 生效结束日期 |
| PUBLISHER | PUBLSHR | publisher | 发布方 |
| SD_AUTHORITY_TYPE | SD_AUTHRTY_TYPE | authority_type | 授权机构类型 |

## RHN_BD_CONCEPT · bd.concept

概念；一行代表一条概念记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DA_EFFECTIVE_FROM | DA_EFF_FROM | effective_from | 生效开始日期 |
| DA_EFFECTIVE_TO | DA_EFF_TO | effective_to | 生效结束日期 |
| ID_CONCEPT_REPLACEMENT | ID_CONCEPT_RPLCMNT | replacement_concept_id | replacement概念标识 |

## RHN_BD_CONCEPT_MAP · bd.concept_mapping

概念映射；一行代表一条概念映射记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| SD_EQUIVALENCE | SD_EQUIV | equivalence | 等价关系 |

## RHN_BD_DICT_ATTR_DEF · bd.dictionary_attribute_definition

字典属性定义；一行代表一条字典属性定义记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| FG_REQUIRED_VAL | FG_RQD_VAL | required_value | 是否应需值 |
| FG_SEARCHABLE | FG_SRCHBL | searchable | 是否searchable |
| ID_DICT_DEF_REFERENCE_DICT | ID_DICT_DEF_REF_DICT | reference_dictionary_id | 参考字典标识 |
| SD_CARDINALITY | SD_CARDNL | cardinality | 基数 |

## RHN_BD_DICT_ITEM_ATTR_VAL · bd.dictionary_item_attribute_value

字典项目属性值；一行代表一条字典项目属性值记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_DATETIME_VAL | DT_DTTM_VAL | datetime_value | datetime值 |
| ID_DICT_ITEM_REFERENCE | ID_DICT_ITEM_REF | reference_item_id | 参考项目标识 |

## RHN_BD_EXAM_SVC · bd.examination_service

检查服务；一行代表一条检查服务记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DES_PREPARATION_DESCRIPTION | DES_PREP_DESCR | preparation_description | 制剂说明 |
| FG_BODY_SITE_REQUIRED | FG_BODY_SITE_RQD | body_site_required | 是否身体部位库房应需 |
| QTY_INCLUDED_SITE | QTY_INCLD_SITE | included_site_count | included库房盘点 |
| QTY_MAX_CHARGEABLE_SITE | QTY_MAX_CHGBL_SITE | max_chargeable_site_count | 最大chargeable库房盘点 |

## RHN_BD_IMPORT_BATCH · bd.master_data_import_batch

主数据数据导入批次；一行代表一条主数据数据导入批次记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| QTY_IMPORTED_ROW | QTY_IMPRTD_ROW | imported_rows | imported行数 |

## RHN_BD_IMPORT_ROW · bd.master_data_import_row

主数据数据导入行；一行代表一条主数据数据导入行记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| JSON_NORMALIZED | JSON_NORM | normalized_json | 标准化JSON |

## RHN_BD_ITEM_ALIAS · bd.item_alias

项目别名；一行代表一条项目别名记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_MNEMONIC | CD_MNEM | mnemonic_code | mnemonic编码 |

## RHN_BD_ITEM_ATTR_DEF · bd.item_attribute_definition

项目属性定义；一行代表一条项目属性定义记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| ID_VALIDATION_RULE | ID_VLDN_RULE | validation_rule_id | validation规则标识 |
| PROJECTION_FIELD | PROJ_FIELD | projection_field | 投影字段 |
| SD_CARDINALITY | SD_CARDNL | cardinality | 基数 |
| SD_VARIABILITY | SD_VARBLTY | variability | 可变性 |
| SENSITIVITY | SENS | sensitivity | 敏感级别 |

## RHN_BD_ITEM_GRP_MEMBER · bd.item_group_member

项目分组成员；一行代表一条项目分组成员记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DES_MEMBER_DESCRIPTION | DES_MEMBER_DESCR | member_description | 成员说明 |
| FG_REQUIRED_MEMBER | FG_RQD_MEMBER | required_member | 是否应需成员 |

## RHN_BD_ITEM_TERM_MAP · bd.item_term_mapping

项目术语映射；一行代表一条项目术语映射记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DES_LIMITATION | DES_LIMIT | limitation | 限制 |
| ID_ITEM_TERM_MAP_REPLACES | ID_ITEM_TERM_MAP_RPLCS | replaces_mapping_id | 替代映射标识 |
| SD_EQUIVALENCE | SD_EQUIV | equivalence | 等价关系 |

## RHN_BD_ITEM_TYPE_ATTR · bd.item_type_attribute

项目类型属性；一行代表一条项目类型属性记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| FG_REQUIRED_VAL | FG_RQD_VAL | required_value | 是否应需值 |
| FG_SEARCHABLE | FG_SRCHBL | searchable | 是否searchable |
| JSON_REQUIRED_COND | JSON_RQD_COND | required_condition_json | 应需健康问题JSON |

## RHN_BD_LAB_SVC · bd.laboratory_service

检验服务；一行代表一条检验服务记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DES_COLLECTION_DESCRIPTION | DES_COLL_DESCR | collection_description | collection说明 |
| FG_FASTING_REQUIRED | FG_FASTING_RQD | fasting_required | 是否fasting应需 |
| QTY_REPORT_DURATION | QTY_REPORT_DUR | report_duration | 报告时长 |
| REPORT_DURATION_UNIT | REPORT_DUR_UNIT | report_duration_unit | 报告时长单位 |

## RHN_BD_MED · bd.medication

药品；一行代表一条药品记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DEFAULT_FREQUENCY | DEFAULT_FREQ | default_frequency | 默认频次 |
| DES_SKIN_TEST_INSTRUCTION | DES_SKIN_TEST_INSTR | des_skin_test_instruction | 皮试液配制与执行说明 |
| FG_ANTIMICROBIAL | FG_ANTIMIC | antimicrobial | 是否抗菌药物 |
| FG_ANTIMICROBIAL_CONSULT | FG_ANTIMIC_CONSULT | fg_antimicrobial_consult | 抗菌药是否要求会诊或审批 |
| FG_ANTIMICROBIAL_EMERGENCY | FG_ANTIMIC_EMERG | fg_antimicrobial_emergency | 抗菌药是否允许紧急使用后补审批 |
| FG_ANTIMICROBIAL_OUTPATIENT | FG_ANTIMIC_OP | fg_antimicrobial_outpatient | 抗菌药是否允许门诊常规开立 |
| FG_ESSENTIAL_DRUG | FG_ESSNTL_DRUG | essential_drug | 是否essentialdrug |
| FG_PRESCRIPTION_DRUG | FG_RX_DRUG | prescription_drug | 是否prescriptiondrug |
| FG_SKIN_TEST_REQUIRED | FG_SKIN_TEST_RQD | skin_test_required | 是否皮试检测应需 |
| PREPARATION_SPEC | PREP_SPEC | preparation_spec | 制剂规格 |
| PREPARATION_UNIT | PREP_UNIT | preparation_unit | 制剂单位 |
| QTY_ANTIMICROBIAL_MAX_DAYS | QTY_ANTIMIC_MAX_DAYS | qty_antimicrobial_max_days | 抗菌药门诊疗程上限天数 |
| QTY_STRENGTH_VAL | QTY_STRNTH_VAL | strength_value | strength值 |
| SD_ANTIMICROBIAL_LEVEL | SD_ANTIMIC_LEVEL | antimicrobial_level | 抗菌药物等级 |
| SD_SKIN_TEST_SOLUTION_MODE | SD_SKIN_TEST_SOLN_MODE | sd_skin_test_solution_mode | 药品默认皮试液配置方式 |
| STRENGTH_UNIT | STRNTH_UNIT | strength_unit | strength单位 |

## RHN_BD_MED_ALLERGEN_MAP · bd.med_allergen_map

一行代表一条药品与过敏原关联

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| ID_ALLERGEN | ID_ALRGN | id_allergen | 过敏原标识 |
| ID_MED_ALLERGEN_MAP | ID_MED_ALRGN_MAP | id_med_allergen_map | 药品过敏原映射标识 |
| SD_RELATION_TYPE | SD_REL_TYPE | sd_relation_type | 关系类型 |

## RHN_BD_MED_CLASS_MAP · bd.med_class_map

一行代表一条药品与分类概念关联

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| SOURCE_REFERENCE | SOURCE_REF | source_reference | 来源依据 |

## RHN_BD_MED_HERBAL · bd.medication_herbal

药品中药；一行代表一条药品中药记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DES_DECOCTION_DESCRIPTION | DES_DECOCT_DESCR | decoction_description | decoction说明 |
| DES_FLAVOR_DESCRIPTION | DES_FLAVOR_DESCR | flavor_description | flavor说明 |
| DES_MERIDIAN_DESCRIPTION | DES_MERID_DESCR | meridian_description | meridian说明 |
| FG_SEPARATE_DECOCTION | FG_SEPR_DECOCT | separate_decoction | 是否separatedecoction |
| ID_DICT_ITEM_MEDICINAL_PART | ID_DICT_ITEM_MEDCNL_PART | medicinal_part_item_id | medicinalpart项目标识 |
| SD_PROCESSING_METHOD | SD_PROCSG_METHOD | processing_method | processing方法 |

## RHN_BD_MED_PRODUCT · bd.medication_product

药品产品；一行代表一条药品产品记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_APPROVAL | CD_APRVL | approval_code | 审批编码 |
| DA_APPROVAL_FROM | DA_APRVL_FROM | approval_from | 审批开始日期 |
| DA_APPROVAL_TO | DA_APRVL_TO | approval_to | 审批结束日期 |
| DES_INDICATION | DES_INDIC | indication | 适应症 |
| DES_INSTRUCTION | DES_INSTR | instruction | 用法 |
| FG_TRACE_SPLIT_REQUIRED | FG_TRACE_SPLIT_RQD | trace_split_required | 是否追溯拆分应需 |
| PRODUCTION_PLACE | PROD_PLACE | production_place | 生产place |

## RHN_BD_MED_VACCINE · bd.medication_vaccine

药品疫苗；一行代表一条药品疫苗记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| FG_COLD_CHAIN_REQUIRED | FG_COLD_CHAIN_RQD | cold_chain_required | 是否coldchain应需 |
| IMMUNIZATION_SCHEDULE | IMMUN_SCHED | immunization_schedule | immunization排班 |
| QTY_MAX_TEMPERATURE | QTY_MAX_TEMP | max_temperature | 最大温度 |
| QTY_MIN_TEMPERATURE | QTY_MIN_TEMP | min_temperature | 最小温度 |
| SD_RECOMMENDED_ROUTE | SD_RECMD_ROUTE | recommended_route | recommended途径 |

## RHN_BD_MED_WESTERN · bd.medication_western

药品西药；一行代表一条药品西药记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| ACTIVE_INGREDIENT | ACTIVE_INGR | active_ingredient | 有效ingredient |
| FG_BIOLOGIC | FG_BIOL | biologic | 是否biologic |
| FG_BIOSIMILAR | FG_BIOSIM | biosimilar | 是否biosimilar |
| SD_THERAPEUTIC_CLASS | SD_THERAP_CLASS | therapeutic_class | 治疗class |

## RHN_BD_MFR · bd.manufacturer

生产厂商；一行代表一条生产厂商记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| PRODUCTION_PLACE | PROD_PLACE | production_place | 生产place |

## RHN_BD_ORDER_FREQ · bd.order_frequency

医嘱频次；一行代表一条医嘱频次记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DEFAULT_EXECUTION_TIMES | DEFAULT_EXEC_TIMES | default_execution_times | 默认执行times |
| FG_AUTOMATIC_TASK_GEN | FG_AUTO_TASK_GEN | automatic_task_generation | 是否automatic任务生成 |
| FG_EMERGENCY_APPLICABLE | FG_EMERG_APPL | emergency_applicable | 是否emergency适用 |
| FG_INP_APPLICABLE | FG_INP_APPL | inpatient_applicable | 是否住院适用 |
| FG_MED_APPLICABLE | FG_MED_APPL | medication_applicable | 是否药品适用 |
| FG_NURS_APPLICABLE | FG_NURS_APPL | nursing_applicable | 是否护理适用 |
| FG_OP_APPLICABLE | FG_OP_APPL | outpatient_applicable | 是否门诊适用 |
| FG_TREAT_APPLICABLE | FG_TREAT_APPL | treatment_applicable | 是否治疗适用 |

## RHN_BD_ORDER_FREQ_CFG · bd.order_frequency_config

医嘱频次配置；一行代表一条医嘱频次配置记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| EXECUTION_TIMES | EXEC_TIMES | execution_times | 执行times |

## RHN_BD_ORG_CATALOG_ITEM · bd.organization_catalog_item

机构目录项目；一行代表一条机构目录项目记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| FG_CHARGEABLE | FG_CHGBL | chargeable | 是否chargeable |
| FG_DISPENSABLE | FG_DISPBL | dispensable | 是否dispensable |
| FG_EXECUTABLE | FG_EXECBL | executable | 是否executable |
| FG_ORDERABLE | FG_ORDRBL | orderable | 是否orderable |
| FG_PURCHASABLE | FG_PURCHBL | purchasable | 是否purchasable |
| FG_RETURNABLE | FG_RETBL | returnable | 是否returnable |
| ID_ORG_CATALOG_ITEM_REPLACED | ID_ORG_CATALOG_ITEM_RPLCD | replaces_adoption_id | 替代采用标识 |

## RHN_BD_ORG_CONCEPT · bd.organization_concept

机构概念；一行代表一条机构概念记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| FG_FREQUENT | FG_FREQNT | frequent | 是否frequent |
| FG_SELECTABLE | FG_SELBL | selectable | 是否selectable |

## RHN_BD_SEARCH_ENTRY · bd.search_entry

基础数据检索条目；一行代表一个标准名称、别名、商品名或机构本地名称的检索投影。

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_MNEMONIC | CD_MNEM | mnemonic_code | 人工或导入助记码 |

## RHN_BD_STD_EDITION · bd.standard_catalog_edition

标准参考目录登记，一行代表一个租户保存的不可变候选版次，不改变当前运行目录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| HASH_METADATA | HASH_META | metadata_hash | 登记摘要的规范化 SHA256 指纹 |
| JSON_METADATA | JSON_META | metadata | 独立登记摘要，列表读取不加载完整目录包 |

## RHN_BD_STD_REVIEW · bd.standard_catalog_review

标准目录来源核验事件，一行代表一个租户对特定目录及来源文件版本的一次不可变核验操作

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| HASH_IDENTITY | HASH_IDTY | identity_hash | 目录标识、版本、内容指纹及来源文件指纹的组合哈希 |

## RHN_BD_SUPPLY_ITEM · bd.supply_item

供应项目；一行代表一条供应项目记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DES_INSTRUCTION | DES_INSTR | instruction | 用法 |
| DES_SCOPE_DESCRIPTION | DES_SCOPE_DESCR | scope_description | 范围说明 |
| DES_STRUCTURE_DESCRIPTION | DES_STRUCT_DESCR | structure_description | structure说明 |
| FG_INTERVENTION | FG_INTRVN | intervention | 是否intervention |
| NA_REGISTRANT | NA_REGSTR | registrant_name | registrant名称 |
| SD_MATERIAL_TYPE | SD_MATL_TYPE | material_type | material类型 |

## RHN_BD_SVC_ITEM · bd.service_item

服务项目；一行代表一条服务项目记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_MUTUAL_RECOGNITION | CD_MUTUAL_RECOG | mutual_recognition_code | mutualrecognition编码 |
| DES_ATTENTION | DES_ATTN | attention | 注意事项 |
| FG_COMBINATION_ITEM | FG_COMB_ITEM | combination_item | 是否combination项目 |
| FG_MEDICAL_TECHNOLOGY | FG_MEDICAL_TECH | medical_technology | 是否medicaltechnology |
| FG_PREGNANCY_ALERT | FG_PREG_ALERT | pregnancy_alert | 是否pregnancy预警 |
| SD_ACCOUNTING_CAT | SD_ACCTG_CAT | accounting_category | accounting分类 |
| SD_DUPLICATE_RULE | SD_DUP_RULE | duplicate_rule | duplicate规则 |

## RHN_BD_SVC_VAR · bd.service_variant

服务变体；一行代表一条服务变体记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_MUTUAL_RECOGNITION | CD_MUTUAL_RECOG | mutual_recognition_code | mutualrecognition编码 |
| FG_BODY_SITE_REQUIRED | FG_BODY_SITE_RQD | body_site_required | 是否身体部位库房应需 |

## RHN_BD_UNIT_DEF · bd.unit_definition

单位定义；一行代表一条单位定义记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DIMENSION | DIM | dimension | 维度 |

## RHN_BD_VAL_SET · bd.value_set

值集；一行代表一条值集记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DA_EFFECTIVE_FROM | DA_EFF_FROM | effective_from | 生效开始日期 |
| DA_EFFECTIVE_TO | DA_EFF_TO | effective_to | 生效结束日期 |

## RHN_BIL_CASHIER_CLOSE · bil.cashier_close

收银日结；一行代表一条收银日结记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| AMT_DIFFERENCE | AMT_DIFF | difference_amount | 差额金额 |
| AMT_EXPECTED | AMT_EXPCTD | expected_amount | 预期金额 |
| CD_CURRENCY | CD_CCY | currency_code | 币种编码 |
| CD_TERMINAL | CD_TRMNL | terminal_code | 终端编码 |
| DES_DIFFERENCE_REASON | DES_DIFF_REASON | difference_reason | 差额原因 |
| DT_CONFIRMED | DT_CNFRMD | confirmed_at | 确认时间 |
| ID_CASHIER_CLOSE_REVERSES | ID_CASHIER_CLOSE_RVRS | reverses_close_id | 冲正日结标识 |
| ID_USER_CONFIRMED | ID_USER_CNFRMD | confirmed_by | 确认人标识 |

## RHN_BIL_CASHIER_CLOSE_EVT · bil.cashier_close_event

收银日结事件；一行代表一条收银日结事件记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |

## RHN_BIL_CASHIER_CLOSE_ITEM · bil.cashier_close_item

收银日结项目；一行代表一条收银日结项目记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_CURRENCY | CD_CCY | currency_code | 币种编码 |

## RHN_BIL_CASHIER_CLOSE_LINE · bil.cashier_close_line

收银日结明细；一行代表一条收银日结明细记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| AMT_DIFFERENCE | AMT_DIFF | difference_amount | 差额金额 |
| AMT_EXPECTED | AMT_EXPCTD | expected_amount | 预期金额 |
| CD_CURRENCY | CD_CCY | currency_code | 币种编码 |

## RHN_BIL_CHARGE_ITEM · bil.charge_item

收费项目；一行代表一条收费项目记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_CURRENCY | CD_CCY | currency_code | 币种编码 |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |
| ID_CHARGE_ITEM_REVERSES | ID_CHARGE_ITEM_RVRS | reverses_charge_item_id | 冲正收费项目标识 |

## RHN_BIL_CHARGE_ITEM_COMP · bil.charge_item_component

收费项目组成；一行代表一条收费项目组成记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| AMT_COMPONENT | AMT_COMP | amount | 金额 |
| QTY_COMPONENT | QTY_COMP | quantity | 数量 |

## RHN_BIL_INVOICE · bil.invoice

发票；一行代表一条发票记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| AMT_DISCOUNT | AMT_DISC | discount_amount | discount金额 |
| CD_CURRENCY | CD_CCY | currency_code | 币种编码 |
| DES_CANCELLATION_REASON | DES_CNCLN_REASON | cancellation_reason | cancellation原因 |
| DT_CANCELLED | DT_CNCLD | cancelled_at | 取消时间 |

## RHN_BIL_INVOICE_CAT_SUM · bil.invoice_category_summary

发票分类汇总；一行代表一条发票分类汇总记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| AMT_CATEGORY | AMT_CAT | amount | 金额 |

## RHN_BIL_LEDGER_ENTRY · bil.ledger_entry

台账分录；一行代表一条台账分录记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_CURRENCY | CD_CCY | currency_code | 币种编码 |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |
| DT_RECORDED | DT_RECDD | recorded_at | 记录时间 |
| ID_LEDGER_ENTRY_REVERSES | ID_LEDGER_ENTRY_RVRS | reverses_ledger_entry_id | 冲正台账分录标识 |
| ID_USER_RECORDED | ID_USER_RECDD | recorded_by | 记录人标识 |
| SD_DIRECTION | SD_DIR | direction | 方向 |

## RHN_BIL_PAT_ACCT · bil.patient_account

患者账户；一行代表一条患者账户记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_CURRENCY | CD_CCY | currency_code | 币种编码 |

## RHN_BIL_PAY · bil.payment

支付；一行代表一条支付记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_CURRENCY | CD_CCY | currency_code | 币种编码 |
| ID_PAY_REVERSES | ID_PAY_RVRS | reverses_payment_id | 冲正支付标识 |

## RHN_BIL_PAY_EVT · bil.payment_event

支付事件；一行代表一条支付事件记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |

## RHN_BIL_PAY_ORDER · bil.payment_order

支付医嘱；一行代表一条支付医嘱记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| AMT_CAPTURED | AMT_CAPTD | captured_amount | captured金额 |
| AMT_REFUNDED | AMT_RFNDD | refunded_amount | refunded金额 |
| AMT_REQUESTED | AMT_REQD | requested_amount | 申请金额 |
| CD_CURRENCY | CD_CCY | currency_code | 币种编码 |
| CD_TERMINAL | CD_TRMNL | terminal_code | 终端编码 |
| ID_CORRELATION | ID_CORR | correlation_id | 关联标识 |
| ID_PAY_ORIGINAL | ID_PAY_ORIG | original_payment_id | 原支付标识 |
| SD_BUSINESS_SCENE | SD_BIZ_SCENE | business_scene | 业务场景 |

## RHN_BIL_RCPT · bil.receipt

票据；一行代表一条票据记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_CURRENCY | CD_CCY | currency_code | 币种编码 |
| CD_FISCAL_AUTHORITY | CD_FISCAL_AUTHRTY | fiscal_authority_code | fiscal授权机构编码 |
| CD_VERIFICATION | CD_VRFCTN | verification_code | 验证编码 |
| CONTROLLED_OBJECT_REFERENCE | CTRLD_OBJECT_REF | controlled_object_reference | 受控对象参考 |
| HASH_PAYER_IDENTITY | HASH_PAYER_IDTY | payer_identity_digest | 付款方身份摘要 |
| ID_CORRELATION | ID_CORR | correlation_id | 关联标识 |
| ID_RCPT_REVERSES | ID_RCPT_RVRS | reverses_receipt_id | 冲正票据标识 |

## RHN_BIL_RCPT_EVT · bil.receipt_event

票据事件；一行代表一条票据事件记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |

## RHN_BIL_RECON_BATCH · bil.reconciliation_batch

核对批次；一行代表一条核对批次记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| AMT_DIFFERENCE | AMT_DIFF | difference_amount | 差额金额 |
| CD_CURRENCY | CD_CCY | currency_code | 币种编码 |
| DA_BUSINESS | DA_BIZ | business_date | 业务日期 |
| DT_COMPLETED | DT_CMPLD | completed_at | 完成时间 |
| ID_USER_COMPLETED | ID_USER_CMPLD | completed_by | 完成人标识 |
| QTY_DIFFERENCE | QTY_DIFF | difference_count | 差额盘点 |

## RHN_BIL_RECON_ITEM · bil.reconciliation_item

核对项目；一行代表一条核对项目记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| AMT_DIFFERENCE | AMT_DIFF | difference_amount | 差额金额 |
| CD_CURRENCY | CD_CCY | currency_code | 币种编码 |
| DES_RESOLUTION | DES_RSLN | resolution | 处理结果 |
| DT_RESOLVED | DT_RSLVD | resolved_at | 已解决时间 |
| ID_USER_RESOLVED | ID_USER_RSLVD | resolved_by | 已解决人标识 |

## RHN_BIL_RECON_ITEM_EVT · bil.reconciliation_item_event

核对项目事件；一行代表一条核对项目事件记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |

## RHN_BIL_REG_BIL_INTENT · bil.registration_billing_intent

挂号计费意图；一行代表一条挂号计费意图记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_CURRENCY | CD_CCY | currency_code | 币种编码 |
| DT_COMPLETED | DT_CMPLD | completed_at | 完成时间 |
| QTY_COMP_ATTEMPTS | QTY_COMP_ATMPTS | completion_attempts | 完成attempts |

## RHN_BIL_STL · bil.settlement

结算；一行代表一条结算记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| AMT_DISCOUNT | AMT_DISC | discount_amount | discount金额 |
| AMT_ROUNDING | AMT_RND | rounding_amount | 舍入金额 |
| CD_CURRENCY | CD_CCY | currency_code | 币种编码 |
| CD_TERMINAL | CD_TRMNL | terminal_code | 终端编码 |
| DT_FINALIZED | DT_FNLZD | finalized_at | finalized时间 |
| ID_STL_REVERSES | ID_STL_RVRS | reverses_settlement_id | 冲正结算标识 |
| ID_USER_FINALIZED | ID_USER_FNLZD | finalized_by | finalized人标识 |
| SD_TERMINAL_SCENE | SD_TRMNL_SCENE | terminal_scene | 终端场景 |

## RHN_BIL_STL_EVT · bil.settlement_event

结算事件；一行代表一条结算事件记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |

## RHN_BIL_STL_LINE · bil.settlement_line

结算明细；一行代表一条结算明细记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| AMT_DISCOUNT | AMT_DISC | discount_amount | discount金额 |

## RHN_BIL_STL_TENDER · bil.settlement_tender

结算收款方式；一行代表一条结算收款方式记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_CURRENCY | CD_CCY | currency_code | 币种编码 |

## RHN_EX_CARE_REQ · ex.care_request

照护请求；一行代表一条照护请求记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_CURRENCY | CD_CCY | currency_code | 币种编码 |
| CD_PRIORITY | CD_PRI | priority_code | 优先级编码 |
| DA_BUSINESS | DA_BIZ | business_date | 业务日期 |
| DT_AUTHORED | DT_AUTHRD | authored_at | 开立时间 |
| DT_CANCELLED | DT_CNCLD | cancelled_at | 取消时间 |
| DT_ITEM_ATTR_RESOLVED | DT_ITEM_ATTR_RSLVD | item_attribute_resolved_at | 项目属性已解决时间 |
| ID_ORG_CATALOG_ITEM_ADOPTION | ID_ORG_CATALOG_ITEM_ADOPT | adoption_id | 采用标识 |
| ID_USER_AUTHORED | ID_USER_AUTHRD | authored_by | 开立人标识 |
| ID_USER_CANCELLED | ID_USER_CNCLD | cancelled_by | 取消人标识 |
| SN_ADOPTION_VER | SN_ADOPT_VER | adoption_revision | 采用修订 |

## RHN_EX_DIAG_EXEC_TASK · ex.diagnostic_execution_task

诊疗执行任务；一行代表一条诊疗执行任务记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DES_COLLECTION_NOTE | DES_COLL_NOTE | collection_note | collection备注 |
| DT_CANCELLED | DT_CNCLD | cancelled_at | 取消时间 |
| DT_COLLECTED | DT_COLLD | collected_at | collected时间 |
| DT_COMPLETED | DT_CMPLD | completed_at | 完成时间 |
| ID_USER_COLLECTED | ID_USER_COLLD | collected_by | collected人标识 |
| ID_USER_COMPLETED | ID_USER_CMPLD | completed_by | 完成人标识 |

## RHN_EX_DIAG_REPORT · ex.diagnostic_report

诊疗报告；一行代表一条诊疗报告记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_ENDPOINT | CD_ENDPT | endpoint_code | endpoint编码 |
| CONTENT_DIGEST_ALGORITHM | CONTENT_DIGEST_ALGO | content_digest_algorithm | 内容摘要算法 |
| DES_CONCLUSION | DES_CONCL | conclusion | 结论 |
| DT_RECEIVED | DT_RECVD | received_at | 接收时间 |
| ID_DIAG_REPORT_REPLACES | ID_DIAG_REPORT_RPLCS | replaces_report_id | 替代报告标识 |

## RHN_EX_EXAM_ATTACH_ITEM · ex.examination_attachment_item

检查附件项目；一行代表一条检查附件项目记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| FG_REQUIRED_ATTACH | FG_RQD_ATTACH | required_attachment | 是否应需附件 |
| FG_SEPARATELY_CHARGEABLE | FG_SEPRLY_CHGBL | separately_chargeable | 是否separatelychargeable |

## RHN_EX_INP_ORDER_EVT · ex.inpatient_order_event

住院医嘱事件；一行代表一条住院医嘱事件记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |

## RHN_EX_INP_ORDER_TASK · ex.inpatient_order_task

住院医嘱任务；一行代表一条住院医嘱任务记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_OCCURRENCE_NO | CD_OCC_NO | occurrence_no | occurrence编号 |
| DT_CANCELLED | DT_CNCLD | cancelled_at | 取消时间 |
| DT_COMPLETED | DT_CMPLD | completed_at | 完成时间 |
| DT_SCHEDULED | DT_SCHEDD | scheduled_at | scheduled时间 |
| ID_USER_COMPLETED | ID_USER_CMPLD | completed_by | 完成人标识 |

## RHN_EX_INP_ORDER_WF · ex.inpatient_order_workflow

住院医嘱流程；一行代表一条住院医嘱流程记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_VERIFIED | DT_VRFD | verified_at | 已验证时间 |
| ID_AUTHORED_PRACT | ID_AUTHRD_PRACT | authored_practitioner_id | 开立医务人员标识 |
| ID_USER_VERIFIED | ID_USER_VRFD | verified_by | 已验证人标识 |
| MEDICATION_BASE_UNIT | MED_BASE_UNIT | medication_base_unit | 药品基础单位 |
| MEDICATION_QUANTITY_UNIT | MED_QTY_UNIT | medication_quantity_unit | 药品数量单位 |
| SD_DURATION_TYPE | SD_DUR_TYPE | duration_type | 时长类型 |

## RHN_EX_LAB_SVC_SPEC · ex.laboratory_service_specimen

检验服务标本；一行代表一条检验服务标本记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DES_COLLECTION_DESCRIPTION | DES_COLL_DESCR | collection_description | collection说明 |
| FG_REQUIRED_SPEC | FG_RQD_SPEC | required_specimen | 是否应需标本 |
| ID_DICT_ITEM_CONTAINER | ID_DICT_ITEM_CONTNR | container_item_id | container项目标识 |
| MINIMUM_QUANTITY_UNIT | MINIMUM_QTY_UNIT | minimum_quantity_unit | minimum数量单位 |
| QTY_INCLUDED_TUBE | QTY_INCLD_TUBE | included_tube_count | included试管盘点 |

## RHN_EX_MED_REQ · ex.medication_request

药品请求；一行代表一条药品请求记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DES_MED_INSTRUCTION | DES_MED_INSTR | medication_instruction | 药品用法 |
| DOSE_FORM_SNAPSHOT | DOSE_FORM_SNAP | dose_form_snapshot | 剂量表单快照 |
| DURATION_UNIT | DUR_UNIT | duration_unit | 时长单位 |
| FG_ANTIMICROBIAL_SNAP | FG_ANTIMIC_SNAP | antimicrobial_snapshot | 是否抗菌药物快照 |
| FG_SELF_PROVIDED | FG_SELF_PRVDD | self_provided | 是否selfprovided |
| FG_SKIN_TEST_REQUIRED_SNAP | FG_SKIN_TEST_RQD_SNAP | skin_test_required_snapshot | 是否皮试检测应需快照 |
| FG_SUBSTITUTION | FG_SUBSTN | substitution_allowed | 是否substitution允许 |
| FREQUENCY_RULE_SNAPSHOT | FREQ_RULE_SNAP | frequency_rule_snapshot | 频次规则快照 |
| ID_EXEMPT_EVIDENCE_EVENT | ID_EXEMPT_EVID_EVENT | id_exempt_evidence_event | 引用的免试依据皮试事件标识 |
| MEDICATION_SNAPSHOT | MED_SNAP | medication_snapshot | 药品快照 |
| PACKAGE_FACTOR_SNAPSHOT | PACKAGE_FACTOR_SNAP | package_factor_snapshot | 包装换算系数快照 |
| PACKAGE_SPEC_SNAPSHOT | PACKAGE_SPEC_SNAP | package_spec_snapshot | 包装规格快照 |
| PREPARATION_SPEC_SNAPSHOT | PREP_SPEC_SNAP | preparation_spec_snapshot | 制剂规格快照 |
| PREPARATION_UNIT_SNAPSHOT | PREP_UNIT_SNAP | preparation_unit_snapshot | 制剂单位快照 |
| PRICE_QUANTITY_SNAP | PRICE_QTY_SNAP | price_quantity_snapshot | 价格数量快照 |
| QTY_DURATION_VAL | QTY_DUR_VAL | duration_value | 时长值 |
| SD_ANTIMICROBIAL_LEVEL_SNAP | SD_ANTIMIC_LEVEL_SNAP | antimicrobial_level_snapshot | 抗菌药物等级快照 |
| SD_ROUTE_RESOLUTION_STATUS | SD_ROUTE_RSLN_STATUS | route_resolution_status | 途径处理结果状态 |

## RHN_EX_OP_REFER_EVT · ex.outpatient_referral_event

门诊转诊事件；一行代表一条门诊转诊事件记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |

## RHN_EX_OP_REFER_REQ · ex.outpatient_referral_request

门诊转诊请求；一行代表一条门诊转诊请求记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DES_REJECTION_REASON | DES_REJCTN_REASON | rejection_reason | rejection原因 |
| DT_ACCEPTED | DT_ACPTD | accepted_at | 接受时间 |
| DT_COMPLETED | DT_CMPLD | completed_at | 完成时间 |
| DT_EXPECTED | DT_EXPCTD | expected_at | 预期时间 |
| DT_REQUESTED | DT_REQD | requested_at | 申请时间 |
| ID_USER_ACCEPTED | ID_USER_ACPTD | accepted_by | 接受人标识 |
| ID_USER_COMPLETED | ID_USER_CMPLD | completed_by | 完成人标识 |
| ID_USER_REQUESTED | ID_USER_REQD | requested_by | 申请人标识 |

## RHN_EX_REQ_GRP · ex.request_group

请求分组；一行代表一条请求分组记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_AUTHORED | DT_AUTHRD | authored_at | 开立时间 |
| DT_CANCELLED | DT_CNCLD | cancelled_at | 取消时间 |
| DT_SUBMITTED | DT_SUBMTD | submitted_at | 提交时间 |
| ID_USER_AUTHORED | ID_USER_AUTHRD | authored_by | 开立人标识 |
| ID_USER_CANCELLED | ID_USER_CNCLD | cancelled_by | 取消人标识 |
| ID_USER_SUBMITTED | ID_USER_SUBMTD | submitted_by | 提交人标识 |

## RHN_EX_SKIN_TEST_EVT · ex.skin_test_event

皮试检测事件；一行代表一条皮试检测事件记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CONCENTRATION | CONC | concentration | 浓度 |
| CONCENTRATION_UNIT | CONC_UNIT | concentration_unit | 浓度单位 |
| DES_REACTION_DESCRIPTION | DES_REACT_DESCR | reaction_description | reaction说明 |
| DT_CANCELLED | DT_CNCLD | cancelled_at | 取消时间 |
| DT_COMPLETED | DT_CMPLD | completed_at | 完成时间 |
| DT_VERIFIED | DT_VRFD | dt_verified | 双人复核时间 |
| FG_ORIGINAL_SOLUTION | FG_ORIG_SOLN | original_solution | 是否原solution |
| ID_CATALOG_ITEM_SOLUTION | ID_CATALOG_ITEM_SOLN | solution_catalog_item_id | solution目录项目标识 |
| ID_PRACT_PERFORMED | ID_PRACT_PRFRMD | performed_by_practitioner_id | performedby医务人员标识 |
| ID_PRACT_VERIFIED | ID_PRACT_VRFD | id_pract_verified | 复核护士医护人员标识 |
| ID_USER_CANCELLED | ID_USER_CNCLD | cancelled_by | 取消人标识 |
| ID_USER_PERFORMED | ID_USER_PRFRMD | performed_by_user_id | performedby用户标识 |
| ID_USER_VERIFIED | ID_USER_VRFD | id_user_verified | 复核护士用户标识 |
| NA_PRACT_VERIFIED | NA_PRACT_VRFD | na_pract_verified | 复核护士姓名 |
| NA_SOLUTION_SNAP | NA_SOLN_SNAP | solution_name_snapshot | solution名称快照 |
| QTY_FLARE_DIAMETER_MM | QTY_FLARE_DIAM_MM | flare_diameter_mm | 红斑直径毫米 |
| QTY_WHEAL_DIAMETER_MM | QTY_WHEAL_DIAM_MM | wheal_diameter_mm | 风团直径毫米 |
| SD_VERIFICATION_METHOD | SD_VRFCTN_METHOD | verification_method | 验证方法 |

## RHN_EX_SVC_REQ · ex.service_request

服务请求；一行代表一条服务请求记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DES_CLIN_DESCRIPTION | DES_CLIN_DESCR | clinical_description | 临床说明 |

## RHN_EX_TREAT_EXEC_ITEM · ex.treatment_execution_item

治疗执行项目；一行代表一条治疗执行项目记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_CANCELLED | DT_CNCLD | cancelled_at | 取消时间 |
| DURATION_UNIT | DUR_UNIT | duration_unit | 时长单位 |
| FG_FULFILL_REQUIRED | FG_FULFILL_RQD | fulfillment_required | 是否履约应需 |
| FG_SKIN_TEST_REQUIRED | FG_SKIN_TEST_RQD | skin_test_required | 是否皮试检测应需 |
| FG_STL_REQUIRED | FG_STL_RQD | settlement_required | 是否结算应需 |
| FREQUENCY_RULE_SNAPSHOT | FREQ_RULE_SNAP | frequency_rule_snapshot | 频次规则快照 |
| QTY_DURATION_VAL | QTY_DUR_VAL | duration_value | 时长值 |

## RHN_EX_TREAT_EXEC_TASK · ex.treatment_execution_task

治疗执行任务；一行代表一条治疗执行任务记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DES_ADVERSE_REACTION_DETAIL | DES_ADVERSE_REACT_DETAIL | adverse_reaction_detail | adversereaction明细 |
| DT_COMPLETED | DT_CMPLD | completed_at | 完成时间 |
| FG_ADVERSE_REACTION | FG_ADVERSE_REACT | adverse_reaction | 是否adversereaction |
| ID_USER_COMPLETED | ID_USER_CMPLD | completed_by | 完成人标识 |
| SD_VERIFICATION_METHOD | SD_VRFCTN_METHOD | verification_method | 验证方法 |

## RHN_HPL_CARE_TASK · hpl.care_task

照护任务；一行代表一条照护任务记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_ESCALATION_RULE | CD_ESCLN_RULE | escalation_rule_code | 升级规则编码 |
| SD_PRIORITY | SD_PRI | priority | 优先级 |

## RHN_HPL_CARE_TASK_EVT · hpl.care_task_event

照护任务事件；一行代表一条照护任务事件记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DES_RESULT_DESCRIPTION | DES_RESULT_DESCR | result_description | 结果说明 |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |

## RHN_HPL_COND · hpl.condition

健康问题；一行代表一条健康问题记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_ABATEMENT | DT_ABATE | abatement_at | abatement时间 |
| DT_RECORDED | DT_RECDD | recorded_at | 记录时间 |
| ID_PRACT_RECORDER | ID_PRACT_RECDR | recorder_practitioner_id | 记录人医务人员标识 |
| ID_USER_RECORDER | ID_USER_RECDR | recorder_user_id | 记录人用户标识 |
| SD_VERIFICATION_STATUS | SD_VRFCTN_STATUS | verification_status | 验证状态 |

## RHN_HPL_DISEASE_MGMT_MEMBER · hpl.disease_management_member

疾病管理成员；一行代表一条疾病管理成员记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DA_EFFECTIVE_FROM | DA_EFF_FROM | effective_from | 生效开始日期 |
| DA_EFFECTIVE_TO | DA_EFF_TO | effective_to | 生效结束日期 |
| SD_INCLUSION_MODE | SD_INCL_MODE | inclusion_mode | inclusion模式 |

## RHN_HPL_DISEASE_MGMT_PROG · hpl.disease_management_program

疾病管理方案；一行代表一条疾病管理方案记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DA_EFFECTIVE_FROM | DA_EFF_FROM | effective_from | 生效开始日期 |
| DA_EFFECTIVE_TO | DA_EFF_TO | effective_to | 生效结束日期 |
| QTY_REPORT_DEADLINE_HOURS | QTY_REPORT_DDLN_HOURS | report_deadline_hours | 报告deadlinehours |

## RHN_HPL_DISEASE_MGMT_RULE · hpl.disease_management_rule

疾病管理规则；一行代表一条疾病管理规则记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| SD_INCLUSION_MODE | SD_INCL_MODE | inclusion_mode | inclusion模式 |

## RHN_INS_CLAIM · ins.insurance_claim

医保理赔；一行代表一条医保理赔记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| AMT_PERSONAL_ACCT | AMT_PERS_ACCT | personal_account_amount | personal账户金额 |
| CD_CURRENCY | CD_CCY | currency_code | 币种编码 |
| DES_REVERSAL_REASON | DES_RVRSL_REASON | reversal_reason | reversal原因 |
| DT_REVERSED | DT_RVRSD | reversed_at | reversed时间 |
| ID_CORRELATION | ID_CORR | correlation_id | 关联标识 |
| SD_CURRENT_OPERATION | SD_CURRENT_OPER | current_operation | current业务操作 |

## RHN_INS_CLAIM_LINE · ins.insurance_claim_line

医保理赔明细；一行代表一条医保理赔明细记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| AMT_APPROVED | AMT_APRVD | approved_amount | 审批金额 |
| CD_REJECTION | CD_REJCTN | rejection_code | rejection编码 |

## RHN_INS_CLAIM_RESP · ins.insurance_claim_response

医保理赔响应；一行代表一条医保理赔响应记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| AMT_PERSONAL_ACCT | AMT_PERS_ACCT | personal_account_amount | personal账户金额 |
| DT_RESPONDED | DT_RSPND | responded_at | responded时间 |
| SD_OPERATION | SD_OPER | operation | 业务操作 |

## RHN_INT_EVT_CONSUME · int.event_consumption

事件消耗；一行代表一条事件消耗记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_PROCESSED | DT_PROCSD | processed_at | processed时间 |
| NA_CONSUMER | NA_CNSMR | consumer_name | consumer名称 |

## RHN_INT_EXT_MSG · int.external_message

外部消息；一行代表一条外部消息记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_ENDPOINT | CD_ENDPT | endpoint_code | endpoint编码 |
| DT_PROCESSED | DT_PROCSD | processed_at | processed时间 |
| DT_RECEIVED | DT_RECVD | received_at | 接收时间 |
| ID_BUSINESS_MSG | ID_BIZ_MSG | business_message_id | 业务消息标识 |
| ID_CORRELATION | ID_CORR | correlation_id | 关联标识 |
| PAYLOAD_DIGEST_ALGORITHM | PAYLOAD_DIGEST_ALGO | payload_digest_algorithm | 载荷摘要算法 |
| SD_DIRECTION | SD_DIR | direction | 方向 |

## RHN_INT_IDEMP_RECORD · int.idempotency_record

幂等记录；一行代表一条幂等记录记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_OPERATION | CD_OPER | operation_code | 业务操作编码 |
| DT_COMPLETED | DT_CMPLD | completed_at | 完成时间 |

## RHN_INT_OUTBOX_EVT · int.outbox_event

发件箱事件；一行代表一条发件箱事件记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |
| DT_RECORDED | DT_RECDD | recorded_at | 记录时间 |
| ID_AGGREGATE | ID_AGG | aggregate_id | aggregate标识 |
| ID_CAUSATION | ID_CAUS | causation_id | causation标识 |
| ID_CORRELATION | ID_CORR | correlation_id | 关联标识 |
| SD_AGGREGATE_TYPE | SD_AGG_TYPE | aggregate_type | aggregate类型 |
| SD_PUBLICATION_STATUS | SD_PUBLCN_STATUS | publication_status | publication状态 |
| SN_AGGREGATE_VER | SN_AGG_VER | aggregate_version | aggregate版本 |

## RHN_META_OP_NOTE_FORM_VER · meta.outpatient_note_form_version

门诊备注表单版本；一行代表一条门诊备注表单版本记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_SPECIALTY | CD_SPECLTY | specialty_code | specialty编码 |

## RHN_META_OP_NOTE_TMPL · meta.outpatient_note_template

门诊备注模板；一行代表一条门诊备注模板记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_SPECIALTY | CD_SPECLTY | specialty_code | specialty编码 |

## RHN_META_OP_PLAN_MED · meta.outpatient_plan_medication

门诊方案药品；一行代表一条门诊方案药品记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DES_MED_INSTRUCTION | DES_MED_INSTR | medication_instruction | 药品用法 |
| DURATION_UNIT | DUR_UNIT | duration_unit | 时长单位 |
| FG_PRICING_REQUIRED | FG_PRICING_RQD | pricing_required | 是否pricing应需 |
| FG_SELF_PROVIDED | FG_SELF_PRVDD | self_provided | 是否selfprovided |
| FG_SUBSTITUTION | FG_SUBSTN | substitution_allowed | 是否substitution允许 |
| PREPARATION_SPEC | PREP_SPEC | preparation_spec | 制剂规格 |
| QTY_DURATION_VAL | QTY_DUR_VAL | duration_value | 时长值 |

## RHN_META_OP_PLAN_SVC · meta.outpatient_plan_service

门诊方案服务；一行代表一条门诊方案服务记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DES_CLIN_DESCRIPTION | DES_CLIN_DESCR | clinical_description | 临床说明 |
| FG_PRICING_REQUIRED | FG_PRICING_RQD | pricing_required | 是否pricing应需 |

## RHN_META_PRINT_DEVICE · meta.print_device

打印设备；一行代表一个浏览器或本地打印桥输出端点

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| JSON_CAPABILITIES | JSON_CAPS | capabilities_json | 设备能力JSON |

## RHN_META_PRINT_IMPL · meta.print_implementation

打印实现注册；一行代表一个内部模板或受控外部报表实现

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| SD_RENDERER | SD_RNDR | renderer_type | 渲染器类型 |

## RHN_META_PRINT_IMPL_BIND · meta.print_implementation_binding

打印实现绑定；一行代表一条平台、租户、机构或科室级解析规则

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| SD_FALLBACK | SD_FALBK | fallback_policy | 回退策略 |

## RHN_META_PRINT_MEDIA · meta.print_media_profile

打印介质档案；一行代表一种可绑定模板的纸张或标签方案

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| GAP_HORIZONTAL_MM | GAP_HORIZ_MM | horizontal_gap_mm | 水平间隔毫米 |
| GAP_VERTICAL_MM | GAP_VERT_MM | vertical_gap_mm | 垂直间隔毫米 |
| SD_ORIENTATION | SD_ORIENT | orientation | 打印方向 |

## RHN_META_PRINT_TASK_DEF · meta.print_task_definition

标准打印任务定义；一行代表一个业务模块稳定依赖的打印任务

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_DATA_PROVIDER | CD_DATA_PRVDR | data_provider_code | 数据提供器编码 |
| JSON_PURPOSES | JSON_PURPS | purposes_json | 允许的打印用途集合 |
| SD_CATEGORY | SD_CAT | category | 打印任务分类 |

## RHN_META_PRINT_TMPL_VER · meta.print_template_version

打印模板版本；一行代表一条打印模板版本记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CONTENT_DIGEST_ALGORITHM | CONTENT_DIGEST_ALGO | content_digest_algorithm | 内容摘要算法 |

## RHN_OP_TRIAGE_REC · op.triage_rec

一行代表一次预检分诊

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DES_CHIEF_COMPLAINT | DES_CHIEF_CMPLNT | des_chief_complaint | 主诉 |
| ID_RESIDENT | ID_RESDNT | id_resident | 居民标识 |
| SD_COMPANION_TYPE | SD_CMPNON_TYPE | sd_companion_type | 陪同人类型 |
| SD_CONSCIOUSNESS | SD_CNSC | sd_consciousness | 意识状态 |
| SD_DISPOSITION | SD_DISPOS | sd_disposition | 处置方式 |
| TXT_EPIDEMIC | TXT_EPID | txt_epidemic | 流行病学史 |
| TXT_SYMPTOMS | TXT_SYMPT | txt_symptoms | 症状描述 |

## RHN_PI_PAT · pi.resident

患者；一行代表一条患者记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_DECEASED | DT_DCD | deceased_at | deceased时间 |
| FG_DECEASED | FG_DCD | deceased | 是否deceased |
| ID_NATIONAL | ID_NATL | national_id | national标识 |

## RHN_PI_PAT_ADDR · pi.resident_address

患者地址；一行代表一条患者地址记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_COMMUNITY | CD_COMM | community_code | community编码 |
| CD_DISTRICT | CD_DIST | district_code | district编码 |
| CD_PROVINCE | CD_PROV | province_code | province编码 |

## RHN_PI_PAT_DEMO_PROF · pi.resident_demographic_profile

患者人口学档案；一行代表一条患者人口学档案记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_EDUCATION | CD_EDUC | education_code | education编码 |
| CD_ETHNICITY | CD_ETHNIC | ethnicity_code | ethnicity编码 |
| CD_NATIONALITY | CD_NATLTY | nationality_code | nationality编码 |
| CD_OCCUPATION | CD_OCCUPN | occupation_code | occupation编码 |
| CD_RESIDENCY_TYPE | CD_RESDNCY_TYPE | residency_type_code | residency类型编码 |

## RHN_PI_PAT_EMPL · pi.resident_employment

患者任职；一行代表一条患者任职记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_OCCUPATION | CD_OCCUPN | occupation_code | occupation编码 |
| NA_EMPLOYER | NA_EMPLYR | employer_name | employer名称 |

## RHN_PI_PAT_IDENT · pi.resident_identifier

患者标识；一行代表一条患者标识记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| NORMALIZED_VALUE | NORM_VALUE | normalized_value | 标准化值 |

## RHN_PI_PAT_MATCH_CAND · pi.resident_match_candidate

患者匹配候选；一行代表一条患者匹配候选记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_REVIEWED | DT_RVWD | reviewed_at | reviewed时间 |
| ID_USER_REVIEWED | ID_USER_RVWD | reviewed_by | reviewed人标识 |
| SD_DECISION | SD_DCSN | decision | 决定 |

## RHN_PI_PAT_MERGE_HIST · pi.resident_merge_history

患者合并历史；一行代表一条患者合并历史记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| ID_PAT_SURVIVING | ID_PAT_SURV | surviving_resident_id | surviving患者标识 |
| MOVED_IDENTIFIER_IDS | MOVED_IDENT_IDS | moved_identifier_ids | moved标识ids |

## RHN_PI_PAT_RELATED_PERSON · pi.resident_related_person

患者关联人员；一行代表一条患者关联人员记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_RELATIONSHIP | CD_RELSHIP | relationship_code | relationship编码 |
| FG_EMERGENCY_CONTACT_FLAG | FG_EMERG_CONTACT_FLAG | emergency_contact_flag | 是否emergency联系方式flag |
| FG_GUARDIAN_FLAG | FG_GUARD_FLAG | guardian_flag | 是否guardianflag |

## RHN_PI_PAT_SPLIT_HIST · pi.resident_split_history

患者拆分历史；一行代表一条患者拆分历史记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| ID_PAT_RESTORED | ID_PAT_RSTRD | restored_resident_id | restored患者标识 |
| RESTORED_IDENTIFIER_IDS | RSTRD_IDENT_IDS | restored_identifier_ids | restored标识ids |

## RHN_SC_APPT · sc.appointment

预约；一行代表一条预约记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DES_CANCELLATION_REASON | DES_CNCLN_REASON | cancellation_reason | cancellation原因 |
| DT_CANCELLED | DT_CNCLD | cancelled_at | 取消时间 |
| DT_CONFIRMED | DT_CNFRMD | confirmed_at | 确认时间 |
| ID_APPT_RESCHEDULED_FROM | ID_APPT_RESCHD_FROM | rescheduled_from_id | rescheduled原标识 |

## RHN_SC_APPT_EVT · sc.appointment_event

预约事件；一行代表一条预约事件记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |
| ID_APPT_REPLACEMENT | ID_APPT_RPLCMNT | replacement_appointment_id | replacement预约标识 |
| ID_USER_OCCURRED | ID_USER_OCCRD | occurred_by | 发生人标识 |

## RHN_SC_PAT_REG · sc.patient_registration

患者挂号；一行代表一条患者挂号记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_COMPLETED | DT_CMPLD | completed_at | 完成时间 |
| DT_REGISTERED | DT_REGD | registered_at | registered时间 |
| ID_USER_REGISTERED | ID_USER_REGD | registered_by | registered人标识 |

## RHN_SC_QUEUE_COUNT · sc.queue_counter

队列计数器；一行代表一个服务队列在一个业务日期的发号进度

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DA_BUSINESS | DA_BIZ | business_date | 业务日期 |

## RHN_SC_QUEUE_TICKET · sc.queue_ticket

排队号票；一行代表一名患者一次进入一个服务队列

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DA_BUSINESS | DA_BIZ | business_date | 业务日期 |
| DT_COMPLETED | DT_CMPLD | completed_at | 结束时间 |
| SN_PRIORITY | SN_PRI | priority | 调度优先级 |
| SN_SEQUENCE | SN_SEQ | sequence_no | 队内原始序号 |

## RHN_SC_QUEUE_TICKET_EVT · sc.queue_ticket_event

排队号票事件；一行代表一次不可变的号票业务动作

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |
| ID_USER_OCCURRED | ID_USER_OCCRD | occurred_by | 发生人标识 |

## RHN_SC_SCHED_EXCEPT · sc.schedule_exception

排班例外；一行代表一条排班例外记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| QTY_CAPACITY | QTY_CAPCTY | capacity | 容量 |

## RHN_SC_SCHED_GEN_RUN · sc.schedule_generation_run

排班生成运行；一行代表一条排班生成运行记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_COMPLETED | DT_CMPLD | completed_at | 完成时间 |
| ID_USER_TRIGGERED | ID_USER_TRIGD | triggered_by | triggered人标识 |
| QTY_GENERATED | QTY_GEND | generated_count | 生成盘点 |

## RHN_SC_SCHED_SLOT_HOLD · sc.schedule_slot_hold

排班号源占用；一行代表一条排班号源占用记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| ID_PAT_REG_CONSUMED | ID_PAT_REG_CNSMD | consumed_registration_id | 消耗挂号标识 |

## RHN_SC_SCHED_SLOT_POOL · sc.schedule_slot_pool

排班号源池；一行代表一条排班号源池记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| QTY_OCCUPIED | QTY_OCCPD | occupied_count | occupied盘点 |

## RHN_SC_SCHED_TMPL · sc.schedule_template

排班模板；一行代表一条排班模板记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_TIMEZONE | CD_TZ | timezone_code | 时区编码 |

## RHN_SC_SCHED_TMPL_PERIOD · sc.schedule_template_period

排班模板期间；一行代表一条排班模板期间记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| QTY_DEFAULT_CAPACITY | QTY_DEFAULT_CAPCTY | default_capacity | 默认容量 |

## RHN_SC_SLOT_EVT · sc.slot_event

号源事件；一行代表一条号源事件记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |
| QTY_OCCUPIED_DELTA | QTY_OCCPD_DELTA | occupied_delta | occupied变动量 |
| SN_SEQUENCE | SN_SEQ | sequence_no | 序号编号 |

## RHN_SC_SVC_SCHED · sc.service_schedule

服务排班；一行代表一条服务排班记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_TIMEZONE | CD_TZ | timezone_code | 时区编码 |
| QTY_TOTAL_CAPACITY | QTY_TOTAL_CAPCTY | total_capacity | 总计容量 |

## RHN_SC_SVC_SCHED_EVT · sc.service_schedule_event

服务排班事件；一行代表一条服务排班事件记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |

## RHN_SUP_DISP_TASK · sup.dispense_task

发药任务；一行代表一条发药任务记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DES_PICK_DESCRIPTION | DES_PICK_DESCR | pick_description | pick说明 |
| ID_ASSIGNED_PRACT | ID_ASGND_PRACT | assigned_practitioner_id | assigned医务人员标识 |
| SD_PRIORITY | SD_PRI | priority | 优先级 |

## RHN_SUP_DISP_TASK_LINE · sup.dispense_task_line

发药任务明细；一行代表一条发药任务明细记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| BASE_QUANTITY_FACTOR | BASE_QTY_FACTOR | base_quantity_factor | 基础数量换算系数 |
| FG_TRACE_REQUIRED | FG_TRACE_RQD | trace_required | 是否追溯应需 |
| PACKAGE_SPEC_SNAPSHOT | PACKAGE_SPEC_SNAP | package_spec_snapshot | 包装规格快照 |
| QTY_DISPENSED | QTY_DSPNSD | dispensed_quantity | dispensed数量 |
| QTY_REQUESTED | QTY_REQD | requested_quantity | 申请数量 |
| QTY_RETURNED | QTY_RETD | returned_quantity | returned数量 |

## RHN_SUP_GOOD_RCPT · sup.goods_receipt

到货票据；一行代表一条到货票据记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_INSPECTED | DT_INSPTD | inspected_at | inspected时间 |
| DT_RECEIVED | DT_RECVD | received_at | 接收时间 |
| ID_USER_INSPECTED | ID_USER_INSPTD | inspected_by | inspected人标识 |
| ID_USER_RECEIVED | ID_USER_RECVD | received_by | 接收人标识 |

## RHN_SUP_GOOD_RCPT_LINE · sup.goods_receipt_line

到货票据明细；一行代表一条到货票据明细记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DA_PRODUCTION | DA_PROD | production_date | 生产日期 |
| DES_REJECTION_REASON | DES_REJCTN_REASON | rejection_reason | rejection原因 |
| ID_STOCK_BIN_DESTINATION | ID_STOCK_BIN_DEST | destination_bin_id | 目标库位标识 |
| QTY_ACCEPTED | QTY_ACPTD | accepted_quantity | 接受数量 |
| QTY_DELIVERED | QTY_DELIVD | delivered_quantity | delivered数量 |
| QTY_REJECTED | QTY_REJCTD | rejected_quantity | rejected数量 |

## RHN_SUP_INP_MED_CONSUME · sup.inpatient_med_consumption

住院用药消耗；一行代表一条住院用药消耗记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_CONSUMED | DT_CNSMD | consumed_at | 消耗时间 |
| ID_USER_CONSUMED | ID_USER_CNSMD | consumed_by | 消耗人标识 |
| QTY_CONSUMED | QTY_CNSMD | consumed_quantity | 消耗数量 |
| QTY_CONSUMED_BASE | QTY_CNSMD_BASE | consumed_base_quantity | 消耗基础数量 |
| SD_CONSUMER_TYPE | SD_CNSMR_TYPE | consumer_type | consumer类型 |

## RHN_SUP_INP_MED_SUPPLY_BATCH · sup.inpatient_med_supply_batch

住院用药供应批次；一行代表一条住院用药供应批次记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_CANCELLED | DT_CNCLD | cancelled_at | 取消时间 |
| DT_SUBMITTED | DT_SUBMTD | submitted_at | 提交时间 |
| ID_USER_CANCELLED | ID_USER_CNCLD | cancelled_by | 取消人标识 |
| ID_USER_SUBMITTED | ID_USER_SUBMTD | submitted_by | 提交人标识 |

## RHN_SUP_INP_MED_SUPPLY_GEN_RUN · sup.inpatient_med_supply_gen_run

住院用药供应生成运行；一行代表一条住院用药供应生成运行记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DA_BUSINESS | DA_BIZ | business_date | 业务日期 |
| DT_COMPLETED | DT_CMPLD | completed_at | 完成时间 |

## RHN_SUP_INP_MED_SUPPLY_LINE · sup.inpatient_med_supply_line

住院用药供应明细；一行代表一条住院用药供应明细记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_QUANTITY_UNIT | CD_QTY_UNIT | quantity_unit_code | 数量单位编码 |
| DT_CANCELLED | DT_CNCLD | cancelled_at | 取消时间 |
| DT_SUBMITTED | DT_SUBMTD | submitted_at | 提交时间 |
| ID_USER_CANCELLED | ID_USER_CNCLD | cancelled_by | 取消人标识 |
| ID_USER_SUBMITTED | ID_USER_SUBMTD | submitted_by | 提交人标识 |
| QTY_OCCURRENCE | QTY_OCC | occurrence_count | occurrence盘点 |
| QTY_REQUESTED | QTY_REQD | requested_quantity | 申请数量 |
| QTY_REQUESTED_BASE | QTY_REQD_BASE | requested_base_quantity | 申请基础数量 |

## RHN_SUP_INP_MED_SUPPLY_TASK · sup.inpatient_med_supply_task

住院用药供应任务；一行代表一条住院用药供应任务记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_QUANTITY_UNIT | CD_QTY_UNIT | quantity_unit_code | 数量单位编码 |
| DT_CANCELLED | DT_CNCLD | cancelled_at | 取消时间 |
| DT_SCHEDULED | DT_SCHEDD | scheduled_at | scheduled时间 |
| ID_USER_CANCELLED | ID_USER_CNCLD | cancelled_by | 取消人标识 |
| QTY_REQUIRED | QTY_RQD | required_quantity | 应需数量 |
| QTY_REQUIRED_BASE | QTY_RQD_BASE | required_base_quantity | 应需基础数量 |

## RHN_SUP_INV_BAL · sup.inventory_balance

库存余额；一行代表一条库存余额记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_PROJECTED | DT_PROJD | projected_at | projected时间 |
| QTY_AVAILABLE | QTY_AVAIL | quantity_available | 数量available |
| QTY_RESERVED | QTY_RESVD | quantity_reserved | 数量reserved |

## RHN_SUP_INV_DOC_EVT · sup.inventory_document_event

库存文书事件；一行代表一条库存文书事件记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |
| ID_CORRELATION | ID_CORR | correlation_id | 关联标识 |
| ID_USER_OCCURRED | ID_USER_OCCRD | occurred_by | 发生人标识 |

## RHN_SUP_INV_OPEN_PKG · sup.inventory_open_package

库存拆零包装；一行代表一条库存拆零包装记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| QTY_REMAINING_BASE | QTY_REM_BASE | remaining_base_quantity | remaining基础数量 |

## RHN_SUP_INV_PERIOD · sup.inventory_period

库存期间；一行代表一条库存期间记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| ID_INV_PERIOD_PREVIOUS | ID_INV_PERIOD_PREV | previous_period_id | 上一期间标识 |

## RHN_SUP_INV_PERIOD_BAL_SNAP · sup.inventory_period_balance_snapshot

库存期间余额快照；一行代表一条库存期间余额快照记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| QTY_DIFFERENCE | QTY_DIFF | quantity_difference | 数量差额 |
| QTY_MOVEMENT | QTY_MVMT | movement_quantity | movement数量 |

## RHN_SUP_INV_PERIOD_BAL_VAL · sup.inventory_period_balance_value

库存期间余额值；一行代表一条库存期间余额值记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| AMT_MOVEMENT | AMT_MVMT | movement_amount | movement金额 |
| AMT_ROUNDING_ADJ | AMT_RND_ADJ | rounding_adjustment_amount | 舍入调价金额 |
| AMT_VAL_DIFFERENCE | AMT_VAL_DIFF | value_difference | 值差额 |
| CD_CURRENCY | CD_CCY | currency_code | 币种编码 |

## RHN_SUP_INV_PERIOD_CLOSE_RUN · sup.inventory_period_close_run

库存期间日结运行；一行代表一条库存期间日结运行记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_COMPLETED | DT_CMPLD | completed_at | 完成时间 |
| DT_VALIDATED | DT_VLDTD | validated_at | validated时间 |
| ID_INV_PERIOD_PREVIOUS | ID_INV_PERIOD_PREV | previous_period_id | 上一期间标识 |
| ID_USER_VALIDATED | ID_USER_VLDTD | validated_by | validated人标识 |
| QTY_DIFFERENCE | QTY_DIFF | difference_count | 差额盘点 |
| QTY_DIMENSION | QTY_DIM | dimension_count | 维度盘点 |

## RHN_SUP_INV_PERIOD_CLOSE_TOTAL · sup.inventory_period_close_total

库存期间日结总计；一行代表一条库存期间日结总计记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| AMT_MOVEMENT | AMT_MVMT | movement_amount | movement金额 |
| AMT_ROUNDING_ADJ | AMT_RND_ADJ | rounding_adjustment_amount | 舍入调价金额 |
| AMT_VAL_DIFFERENCE | AMT_VAL_DIFF | value_difference | 值差额 |
| CD_CURRENCY | CD_CCY | currency_code | 币种编码 |

## RHN_SUP_INV_PRICE_ADJ · sup.inventory_price_adjustment

库存价格调价；一行代表一条库存价格调价记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_CURRENCY | CD_CCY | currency_code | 币种编码 |
| DA_BUSINESS | DA_BIZ | business_date | 业务日期 |
| DT_APPROVED | DT_APRVD | approved_at | 审批时间 |
| DT_CANCELLED | DT_CNCLD | cancelled_at | 取消时间 |
| DT_REVERSED | DT_RVRSD | reversed_at | reversed时间 |
| DT_SUBMITTED | DT_SUBMTD | submitted_at | 提交时间 |
| ID_INV_PRICE_ADJ_REVERSAL_OF | ID_INV_PRICE_ADJ_RVRSL_OF | reversal_of_id | reversal时点标识 |
| ID_USER_APPROVED | ID_USER_APRVD | approved_by | 审批人标识 |
| ID_USER_CANCELLED | ID_USER_CNCLD | cancelled_by | 取消人标识 |
| ID_USER_REVERSED | ID_USER_RVRSD | reversed_by | reversed人标识 |
| ID_USER_SUBMITTED | ID_USER_SUBMTD | submitted_by | 提交人标识 |

## RHN_SUP_INV_PRICE_ADJ_DETAIL · sup.inventory_price_adjustment_detail

库存价格调价明细；一行代表一条库存价格调价明细记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| AMT_ROUNDING | AMT_RND | rounding_amount | 舍入金额 |

## RHN_SUP_INV_PRICE_ADJ_LINE · sup.inventory_price_adjustment_line

库存价格调价明细；一行代表一条库存价格调价明细记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| AMT_ROUNDING | AMT_RND | rounding_amount | 舍入金额 |

## RHN_SUP_INV_RECON_LINE · sup.inventory_reconciliation_line

库存核对明细；一行代表一条库存核对明细记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| AMT_DIFFERENCE | AMT_DIFF | difference_amount | 差额金额 |
| AMT_EXPECTED | AMT_EXPCTD | expected_amount | 预期金额 |
| CD_CURRENCY | CD_CCY | currency_code | 币种编码 |
| QTY_DIFFERENCE | QTY_DIFF | difference_quantity | 差额数量 |
| QTY_EXPECTED | QTY_EXPCTD | expected_quantity | 预期数量 |
| SD_SEVERITY | SD_SEV | severity | 严重程度 |

## RHN_SUP_INV_RECON_RUN · sup.inventory_reconciliation_run

库存核对运行；一行代表一条库存核对运行记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DA_BUSINESS | DA_BIZ | business_date | 业务日期 |
| DT_COMPLETED | DT_CMPLD | completed_at | 完成时间 |
| QTY_DIMENSION | QTY_DIM | dimension_count | 维度盘点 |

## RHN_SUP_INV_RESV · sup.inventory_reservation

库存预留；一行代表一条库存预留记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_CONSUMED | DT_CNSMD | consumed_at | 消耗时间 |
| DT_RELEASED | DT_RLSD | released_at | released时间 |
| ID_USER_CONSUMED | ID_USER_CNSMD | consumed_by | 消耗人标识 |
| ID_USER_RELEASED | ID_USER_RLSD | released_by | released人标识 |
| QTY_CONSUMED | QTY_CNSMD | quantity_consumed | 数量消耗 |
| QTY_RESERVED | QTY_RESVD | quantity_reserved | 数量reserved |

## RHN_SUP_INV_SPLIT_EVT · sup.inventory_split_event

库存拆分事件；一行代表一条库存拆分事件记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |
| ID_USER_OCCURRED | ID_USER_OCCRD | occurred_by | 发生人标识 |

## RHN_SUP_INV_TRACE_CODE · sup.inventory_trace_code

库存追溯编码；一行代表一条库存追溯编码记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_NORMALIZED | CD_NORM | normalized_code | 标准化编码 |
| DT_RECEIVED | DT_RECVD | received_at | 接收时间 |
| QTY_REMAINING_BASE | QTY_REM_BASE | remaining_base_quantity | remaining基础数量 |

## RHN_SUP_INV_TRACE_EVT · sup.inventory_trace_event

库存追溯事件；一行代表一条库存追溯事件记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |
| ID_USER_OCCURRED | ID_USER_OCCRD | occurred_by | 发生人标识 |

## RHN_SUP_INV_TXN · sup.inventory_transaction

库存流水；一行代表一条库存流水记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |
| ID_INV_TXN_REVERSES | ID_INV_TXN_RVRS | reverses_transaction_id | 冲正流水标识 |

## RHN_SUP_INV_TXN_LINE · sup.inventory_transaction_line

库存流水明细；一行代表一条库存流水明细记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| BASE_QUANTITY_FACTOR | BASE_QTY_FACTOR | base_quantity_factor | 基础数量换算系数 |
| CD_OPERATION_UNIT | CD_OPER_UNIT | operation_unit_code | 业务操作单位编码 |
| QTY_OPERATION | QTY_OPER | operation_quantity | 业务操作数量 |

## RHN_SUP_INV_VALUAT_ENTRY · sup.inventory_valuation_entry

库存计价分录；一行代表一条库存计价分录记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_CURRENCY | CD_CCY | currency_code | 币种编码 |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |
| ID_INV_VALUAT_ENTRY_REVERSES | ID_INV_VALUAT_ENTRY_RVRS | reverses_entry_id | 冲正分录标识 |

## RHN_SUP_MED_DISP · sup.medication_dispense

药品发药；一行代表一条药品发药记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_OPERATION_UNIT | CD_OPER_UNIT | operation_unit_code | 业务操作单位编码 |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |
| ID_DISPENSER_ASSIGN | ID_DSPNSR_ASSIGN | dispenser_assignment_id | dispenser任职标识 |
| ID_DISPENSER_PRACT | ID_DSPNSR_PRACT | dispenser_practitioner_id | dispenser医务人员标识 |
| ID_DISPENSER_USER | ID_DSPNSR_USER | dispenser_user_id | dispenser用户标识 |
| ID_MED_DISP_ORIGINAL | ID_MED_DISP_ORIG | original_dispense_id | 原发药标识 |
| QTY_OPERATION | QTY_OPER | operation_quantity | 业务操作数量 |

## RHN_SUP_MED_DISP_LINE · sup.medication_dispense_line

药品发药明细；一行代表一条药品发药明细记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| BASE_QUANTITY_FACTOR | BASE_QTY_FACTOR | base_quantity_factor | 基础数量换算系数 |
| ID_MED_DISP_LINE_ORIGINAL | ID_MED_DISP_LINE_ORIG | original_dispense_line_id | 原发药明细标识 |
| QTY_DISPENSED | QTY_DSPNSD | quantity_dispensed | 数量dispensed |

## RHN_SUP_PHARM_REVIEW · sup.pharmacy_review

药房审核；一行代表一条药房审核记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_REVIEWED | DT_RVWD | reviewed_at | reviewed时间 |
| ID_PHARMACIST_PRACT | ID_PHMCST_PRACT | pharmacist_practitioner_id | pharmacist医务人员标识 |
| ID_REVIEWER_ASSIGN | ID_RVWR_ASSIGN | reviewer_assignment_id | reviewer任职标识 |
| ID_REVIEWER_USER | ID_RVWR_USER | reviewer_user_id | reviewer用户标识 |

## RHN_SUP_PURCH_ORDER · sup.purchase_order

采购医嘱；一行代表一条采购医嘱记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DA_EXPECTED | DA_EXPCTD | expected_date | 预期日期 |
| DES_APPROVAL_REASON | DES_APRVL_REASON | approval_reason | 审批原因 |
| DT_APPROVED | DT_APRVD | approved_at | 审批时间 |
| DT_SUBMITTED | DT_SUBMTD | submitted_at | 提交时间 |
| ID_USER_APPROVED | ID_USER_APRVD | approved_by | 审批人标识 |
| ID_USER_SUBMITTED | ID_USER_SUBMTD | submitted_by | 提交人标识 |

## RHN_SUP_PURCH_ORDER_LINE · sup.purchase_order_line

采购医嘱明细；一行代表一条采购医嘱明细记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| QTY_RECEIVED | QTY_RECVD | received_quantity | 接收数量 |

## RHN_SUP_RX_INV_FREEZE · sup.rx_inv_freeze

一行代表一条处方库存冻结明细

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_RELEASED | DT_RLSD | dt_released | 释放时间 |
| ID_USER_RELEASED | ID_USER_RLSD | id_user_released | 释放用户标识 |

## RHN_SUP_STOCK_COUNT · sup.stock_count

库存盘点；一行代表一条库存盘点记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_APPROVED | DT_APRVD | approved_at | 审批时间 |
| DT_SUBMITTED | DT_SUBMTD | submitted_at | 提交时间 |
| ID_USER_APPROVED | ID_USER_APRVD | approved_by | 审批人标识 |
| ID_USER_SUBMITTED | ID_USER_SUBMTD | submitted_by | 提交人标识 |

## RHN_SUP_STOCK_COUNT_LINE · sup.stock_count_line

库存盘点明细；一行代表一条库存盘点明细记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DES_VARIANCE_REASON | DES_VARNC_REASON | variance_reason | variance原因 |
| QTY_VARIANCE | QTY_VARNC | variance_quantity | variance数量 |

## RHN_SUP_STOCK_ITEM · sup.stock_item

库存项目；一行代表一条库存项目记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| FG_CONTROLLED | FG_CTRLD | controlled | 是否受控 |
| FG_LOT_REQUIRED | FG_LOT_RQD | lot_required | 是否批号应需 |
| FG_NEGATIVE | FG_NEG | negative_allowed | 是否negative允许 |
| FG_TRACE_REQUIRED | FG_TRACE_RQD | trace_required | 是否追溯应需 |

## RHN_SUP_STOCK_LOT · sup.stock_lot

库存批号；一行代表一条库存批号记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_APPROVAL_SNAP | CD_APRVL_SNAP | approval_code_snapshot | 审批编码快照 |
| DA_PRODUCTION | DA_PROD | production_date | 生产日期 |

## RHN_SUP_STOCK_REQ · sup.stock_requisition

库存请领；一行代表一条库存请领记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_APPROVED | DT_APRVD | approved_at | 审批时间 |
| DT_REQUESTED | DT_REQD | requested_at | 申请时间 |
| ID_DEPT_REQUESTING | ID_DEPT_REQNG | requesting_department_id | requesting科室标识 |
| ID_STOCK_SITE_DESTINATION | ID_STOCK_SITE_DEST | destination_site_id | 目标库房标识 |
| ID_USER_APPROVED | ID_USER_APRVD | approved_by | 审批人标识 |
| ID_USER_REQUESTED | ID_USER_REQD | requested_by | 申请人标识 |

## RHN_SUP_STOCK_REQ_ALLOC · sup.stock_requisition_allocation

库存请领分配；一行代表一条库存请领分配记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| QTY_ALLOCATED | QTY_ALLOCD | allocated_quantity | allocated数量 |

## RHN_SUP_STOCK_REQ_LINE · sup.stock_requisition_line

库存请领明细；一行代表一条库存请领明细记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| QTY_APPROVED | QTY_APRVD | approved_quantity | 审批数量 |
| QTY_REQUESTED | QTY_REQD | requested_quantity | 申请数量 |

## RHN_SUP_STOCK_RETURN · sup.stock_return

库存退回；一行代表一条库存退回记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_CONFIRMED | DT_CNFRMD | confirmed_at | 确认时间 |
| DT_REQUESTED | DT_REQD | requested_at | 申请时间 |
| ID_MED_DISP_ORIGINAL | ID_MED_DISP_ORIG | original_dispense_id | 原发药标识 |
| ID_USER_CONFIRMED | ID_USER_CNFRMD | confirmed_by | 确认人标识 |
| ID_USER_REQUESTED | ID_USER_REQD | requested_by | 申请人标识 |

## RHN_SUP_STOCK_RETURN_LINE · sup.stock_return_line

库存退回明细；一行代表一条库存退回明细记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| BASE_QUANTITY_FACTOR | BASE_QTY_FACTOR | base_quantity_factor | 基础数量换算系数 |
| DES_EXCEPT_DESCRIPTION | DES_EXCEPT_DESCR | exception_description | 例外说明 |
| ID_MED_DISP_LINE_ORIGINAL | ID_MED_DISP_LINE_ORIG | original_dispense_line_id | 原发药明细标识 |
| QTY_ACCEPTED | QTY_ACPTD | quantity_accepted | 数量接受 |
| QTY_REQUESTED | QTY_REQD | quantity_requested | 数量申请 |
| SD_DISPOSITION | SD_DISPOS | disposition | 处置方式 |

## RHN_SUP_STOCK_XFER · sup.stock_transfer

库存调拨；一行代表一条库存调拨记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_APPROVED | DT_APRVD | approved_at | 审批时间 |
| DT_DISPATCHED | DT_DSPTD | dispatched_at | 发出时间 |
| DT_RECEIVED | DT_RECVD | received_at | 接收时间 |
| DT_REQUESTED | DT_REQD | requested_at | 申请时间 |
| ID_INV_TXN_OUTBOUND | ID_INV_TXN_OUTBND | outbound_transaction_id | outbound流水标识 |
| ID_STOCK_SITE_DESTINATION | ID_STOCK_SITE_DEST | destination_site_id | 目标库房标识 |
| ID_USER_APPROVED | ID_USER_APRVD | approved_by | 审批人标识 |
| ID_USER_DISPATCHED | ID_USER_DSPTD | dispatched_by | 发出人标识 |
| ID_USER_RECEIVED | ID_USER_RECVD | received_by | 接收人标识 |
| ID_USER_REQUESTED | ID_USER_REQD | requested_by | 申请人标识 |

## RHN_SUP_STOCK_XFER_ALLOC · sup.stock_transfer_allocation

库存调拨分配；一行代表一条库存调拨分配记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| ID_STOCK_BIN_DESTINATION | ID_STOCK_BIN_DEST | destination_bin_id | 目标库位标识 |
| QTY_DISPATCHED | QTY_DSPTD | dispatched_quantity | 发出数量 |
| QTY_RECEIVED | QTY_RECVD | received_quantity | 接收数量 |

## RHN_SUP_STOCK_XFER_LINE · sup.stock_transfer_line

库存调拨明细；一行代表一条库存调拨明细记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| BASE_QUANTITY_FACTOR | BASE_QTY_FACTOR | base_quantity_factor | 基础数量换算系数 |
| CD_OPERATION_UNIT | CD_OPER_UNIT | operation_unit_code | 业务操作单位编码 |
| DES_DISCREPANCY_REASON | DES_DSCRPN_REASON | discrepancy_reason | 差异原因 |
| ID_STOCK_ITEM_DESTINATION | ID_STOCK_ITEM_DEST | destination_stock_item_id | 目标库存项目标识 |
| QTY_APPROVED | QTY_APRVD | approved_quantity | 审批数量 |
| QTY_DISPATCHED | QTY_DSPTD | dispatched_quantity | 发出数量 |
| QTY_RECEIVED | QTY_RECVD | received_quantity | 接收数量 |
| QTY_REQUESTED | QTY_REQD | requested_quantity | 申请数量 |
| QTY_REQUESTED_OPERATION | QTY_REQD_OPER | requested_operation_quantity | 申请业务操作数量 |

## RHN_SUP_SUPPL_SUPPLY_ITEM · sup.supplier_supply_item

供应商供应项目；一行代表一条供应商供应项目记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| PRICE_AGREEMENT | PRICE_AGRMT | agreement_price | agreement单价 |

## RHN_SUP_WARD_DELIV · sup.ward_delivery

病区配送；一行代表一条病区配送记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_RESOLUTION | CD_RSLN | resolution_code | 处理结果编码 |
| DES_DISCREPANCY_NOTE | DES_DSCRPN_NOTE | discrepancy_note | 差异备注 |
| DES_DISPATCH_NOTE | DES_DSPT_NOTE | dispatch_note | dispatch备注 |
| DES_RESOLUTION_NOTE | DES_RSLN_NOTE | resolution_note | 处理结果备注 |
| DT_DISPATCHED | DT_DSPTD | dispatched_at | 发出时间 |
| DT_RECEIVED | DT_RECVD | received_at | 接收时间 |
| DT_RESOLVED | DT_RSLVD | resolved_at | 已解决时间 |
| ID_USER_DISPATCHED | ID_USER_DSPTD | dispatched_by | 发出人标识 |
| ID_USER_RECEIVED | ID_USER_RECVD | received_by | 接收人标识 |
| ID_USER_RESOLVED | ID_USER_RSLVD | resolved_by | 已解决人标识 |

## RHN_SUP_WARD_DELIV_EVT · sup.ward_delivery_event

病区配送事件；一行代表一条病区配送事件记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |
| ID_USER_OCCURRED | ID_USER_OCCRD | occurred_by | 发生人标识 |

## RHN_SUP_WARD_DELIV_LINE · sup.ward_delivery_line

病区配送明细；一行代表一条病区配送明细记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_DISCREPANCY | CD_DSCRPN | discrepancy_code | 差异编码 |
| DES_DISCREPANCY_NOTE | DES_DSCRPN_NOTE | discrepancy_note | 差异备注 |
| QTY_EXPECTED | QTY_EXPCTD | expected_quantity | 预期数量 |
| QTY_RECEIVED | QTY_RECVD | received_quantity | 接收数量 |

## RHN_SUP_WARD_MED_RETURN_EVT · sup.ward_med_return_event

病区用药退回事件；一行代表一条病区用药退回事件记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |
| ID_USER_OCCURRED | ID_USER_OCCRD | occurred_by | 发生人标识 |

## RHN_SUP_WARD_MED_RETURN_LINE · sup.ward_med_return_line

病区用药退回明细；一行代表一条病区用药退回明细记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| ID_MED_DISP_LINE_ORIGINAL | ID_MED_DISP_LINE_ORIG | original_dispense_line_id | 原发药明细标识 |
| ID_MED_DISP_ORIGINAL | ID_MED_DISP_ORIG | original_dispense_id | 原发药标识 |
| QTY_REQUESTED | QTY_REQD | requested_quantity | 申请数量 |
| QTY_REQUESTED_BASE | QTY_REQD_BASE | requested_base_quantity | 申请基础数量 |
| SD_DISPOSITION | SD_DISPOS | disposition | 处置方式 |

## RHN_SUP_WARD_MED_RETURN_REQ · sup.ward_med_return_request

病区用药退回请求；一行代表一条病区用药退回请求记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DES_HANDOVER_NOTE | DES_HNDOVR_NOTE | handover_note | handover备注 |
| DT_RECEIVED | DT_RECVD | received_at | 接收时间 |
| DT_REQUESTED | DT_REQD | requested_at | 申请时间 |
| ID_PROCESSOR_ASSIGN | ID_PROCSR_ASSIGN | processor_assignment_id | processor任职标识 |
| ID_PROCESSOR_PRACT | ID_PROCSR_PRACT | processor_practitioner_id | processor医务人员标识 |
| ID_USER_RECEIVED | ID_USER_RECVD | received_by | 接收人标识 |
| ID_USER_REQUESTED | ID_USER_REQD | requested_by | 申请人标识 |

## RHN_SYS_ANN · sys.system_announcement

体系公告；一行代表一条体系公告记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_WITHDRAWN | DT_WDRWN | withdrawn_at | withdrawn时间 |
| ID_USER_WITHDRAWN | ID_USER_WDRWN | withdrawn_by | withdrawn人标识 |
| SD_PRIORITY | SD_PRI | priority | 优先级 |

## RHN_SYS_CFG_DEF · sys.configuration_definition

配置定义；一行代表一条配置定义记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| FG_INHERITANCE | FG_INHRT | inheritance_enabled | 是否inheritanceenabled |

## RHN_SYS_CFG_REV · sys.configuration_revision

配置修订；一行代表一条配置修订记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_EFFECTIVE_FROM | DT_EFF_FROM | effective_from | 生效开始日期 |
| DT_EFFECTIVE_TO | DT_EFF_TO | effective_to | 生效结束日期 |

## RHN_SYS_DEPT · sys.department

科室；一行代表一条科室记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| SD_DEPT_PROPERTY | SD_DEPT_PROP | department_property | 科室property |

## RHN_SYS_DEPT_CAP · sys.department_capability

科室能力；一行代表一条科室能力记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_QUALIFICATION_BASIS | CD_QUALIF_BASIS | qualification_basis_code | qualification依据编码 |

## RHN_SYS_DEPT_RESP · sys.department_responsibility

科室职责；一行代表一条科室职责记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| NA_EXT_RESPONSIBLE | NA_EXT_RSPNSBL | external_responsible_name | 外部responsible名称 |

## RHN_SYS_ORG · sys.organization

机构；一行代表一条机构记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_TIMEZONE | CD_TZ | timezone_code | 时区编码 |
| SD_ORG_PROPERTY | SD_ORG_PROP | organization_property | 机构property |

## RHN_SYS_ORG_ADDR · sys.organization_address

机构地址；一行代表一条机构地址记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_DISTRICT | CD_DIST | district_code | district编码 |
| CD_PROVINCE | CD_PROV | province_code | province编码 |

## RHN_SYS_ORG_CAP · sys.organization_capability

机构能力；一行代表一条机构能力记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_QUALIFICATION_BASIS | CD_QUALIF_BASIS | qualification_basis_code | qualification依据编码 |

## RHN_SYS_ORG_IDENT · sys.organization_identifier

机构标识；一行代表一条机构标识记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_VERIFIED | DT_VRFD | verified_at | 已验证时间 |
| ID_USER_VERIFIED | ID_USER_VRFD | verified_by | 已验证人标识 |

## RHN_SYS_ORG_RESP · sys.organization_responsibility

机构职责；一行代表一条机构职责记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| NA_EXT_RESPONSIBLE | NA_EXT_RSPNSBL | external_responsible_name | 外部responsible名称 |

## RHN_SYS_PARAM_DEF · sys.parameter_definition

参数定义；一行代表一条参数定义记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| FG_INHERITANCE | FG_INHRT | inheritance_enabled | 是否inheritanceenabled |
| FG_NULLABLE_VAL | FG_NULLBL_VAL | nullable_value | 是否nullable值 |
| SD_DEPENDENCY_BEHAVIOR | SD_DEPNCY_BEHAV | sd_dependency_behavior | 未满足依赖时的行为策略：DISABLE_AND_SUPPRESS 或 HIDE |
| SENSITIVITY | SENS | sensitivity | 敏感级别 |

## RHN_SYS_PARAM_VAL · sys.parameter_value

参数值；一行代表一条参数值记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| SCOPE_REFERENCE | SCOPE_REF | scope_reference | 范围参考 |

## RHN_SYS_PORTAL_NOTIFY · sys.portal_notification

门户通知；一行代表一条门户通知记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_ARCHIVED | DT_ARCHD | archived_at | archived时间 |
| ID_USER_RECIPIENT | ID_USER_RCPNT | recipient_user_id | recipient用户标识 |
| SD_SEVERITY | SD_SEV | severity | 严重程度 |

## RHN_SYS_PORTAL_USER_WKSPACE · sys.portal_user_workspace

门户用户工作台；一行代表一条门户用户工作台记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| JSON_FAVORITES | JSON_FAVS | favorites_json | 收藏JSON |

## RHN_SYS_POS · sys.position

岗位；一行代表一条岗位记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DES_DUTY_DESCRIPTION | DES_DUTY_DESCR | duty_description | duty说明 |

## RHN_SYS_PRINT_BATCH · sys.print_batch

打印批次；一行代表一次经过对账的批量打印请求

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DA_BUSINESS | DA_BIZ | business_date | 业务日期 |
| ID_IDEMPOTENCY | ID_IDEMP | idempotency_id | 请求幂等键 |
| JSON_SELECTION | JSON_SELCTN | selection_json | 选择条件快照JSON |
| QTY_EXCLUDED | QTY_EXCLD | excluded_count | 排除来源数 |
| QTY_INCLUDED | QTY_INCLD | included_count | 纳入卡片数 |
| QTY_SELECTED | QTY_SELCTD | selected_count | 选择来源数 |
| SD_LAYOUT_STRATEGY | SD_LAYOUT_STRAT | layout_strategy | 批量组版策略 |

## RHN_SYS_PRINT_BATCH_ITEM · sys.print_batch_item

打印批次明细；一行代表一个纳入或排除的业务来源

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| JSON_SNAPSHOT | JSON_SNAP | snapshot_json | 不可变打印快照JSON |

## RHN_SYS_PRINT_DELIVERY · sys.print_delivery

打印投递；一行代表批次输出向浏览器或本地桥的一次投递

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_CONFIRMED | DT_CNFRMD | confirmed_at | 设备确认时间 |
| ID_PRINT_DELIVERY | ID_PRINT_DELIV | id | 打印投递主键 |

## RHN_SYS_PRINT_JOB · sys.print_job

打印作业；一行代表一条打印作业记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_REQUESTED | DT_REQD | requested_at | 申请时间 |
| ID_CORRELATION | ID_CORR | correlation_id | 关联标识 |
| ID_PRINT_JOB_ORIGINAL | ID_PRINT_JOB_ORIG | original_job_id | 原作业标识 |
| ID_USER_REQUESTED | ID_USER_REQD | requested_by | 申请人标识 |

## RHN_SYS_PRINT_OUTPUT · sys.print_output

打印输出；一行代表一条打印输出记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CONTENT_DIGEST_ALGORITHM | CONTENT_DIGEST_ALGO | content_digest_algorithm | 内容摘要算法 |
| DT_GENERATED | DT_GEND | generated_at | 生成时间 |
| ID_USER_GENERATED | ID_USER_GEND | generated_by | 生成人标识 |

## RHN_SYS_STAFF_ASSIGN · sys.staff_assignment

员工任职；一行代表一条员工任职记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_SPECIALTY | CD_SPECLTY | specialty_code | specialty编码 |
| WORKLOAD_PERCENT | WKLOAD_PERCENT | workload_percent | 工作量百分比 |

## RHN_SYS_TNT · sys.tenant

租户；一行代表一条租户记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_TIMEZONE | CD_TZ | timezone_code | 时区编码 |

## RHN_SYS_USER_ACCT · sys.user_account

用户账户；一行代表一条用户账户记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_USERNAME | CD_USRNM | username | 用户名 |
| DT_PASSWORD_CHANGED | DT_PWD_CHANGED | password_changed_at | password变更时间 |
| HASH_PASSWORD | HASH_PWD | password_hash | password摘要 |

## RHN_SYS_WORK_TASK · sys.work_task

工作任务；一行代表一条工作任务记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_COMPLETED | DT_CMPLD | completed_at | 完成时间 |
| ID_USER_ASSIGNEE | ID_USER_ASGNEE | assignee_id | 受理人标识 |
| ID_USER_COMPLETED | ID_USER_CMPLD | completed_by | 完成人标识 |
| SD_ASSIGNEE_TYPE | SD_ASGNEE_TYPE | assignee_type | 受理人类型 |
| SD_PRIORITY | SD_PRI | priority | 优先级 |

## RHN_SYS_WORK_TASK_HIST · sys.work_task_history

工作任务历史；一行代表一条工作任务历史记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |
| ID_CORRELATION | ID_CORR | correlation_id | 关联标识 |

## RHN_VIS_ALLERGY_INTOL · vis.allergy_intolerance

过敏不耐受；一行代表一条过敏不耐受记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_CRITICALITY | CD_CRITCL | criticality_code | criticality编码 |
| CD_SUBSTANCE | CD_SUBST | substance_code | 物质编码 |
| CD_SUBSTANCE_CODE_SYS_URI | CD_SUBST_CODE_SYS_URI | substance_code_system_uri | 物质编码体系URI |
| DES_INACTIVATION_REASON | DES_INACTN_REASON | inactivation_reason | inactivation原因 |
| DES_REACTION | DES_REACT | reaction_text | reaction文本 |
| DT_INACTIVATED | DT_INACTD | inactivated_at | inactivated时间 |
| DT_RECORDED | DT_RECDD | recorded_at | 记录时间 |
| DT_VERIFIED | DT_VRFD | verified_at | 已验证时间 |
| ID_ALLERGEN | ID_ALRGN | id_allergen | 录入时选择的受控过敏原术语；为空表示自由文本 |
| ID_PRACT_RECORDER | ID_PRACT_RECDR | recorder_practitioner_id | 记录人医务人员标识 |
| ID_PRACT_VERIFIER | ID_PRACT_VRFR | verifier_practitioner_id | verifier医务人员标识 |
| ID_USER_INACTIVATED | ID_USER_INACTD | inactivated_by | inactivated人标识 |
| ID_USER_RECORDER | ID_USER_RECDR | recorder_user_id | 记录人用户标识 |
| NA_SUBSTANCE | NA_SUBST | substance_display | 物质显示 |
| SD_ASSERTION_TYPE | SD_ASSERT_TYPE | assertion_type | assertion类型 |
| SD_INFORMATION_SRC | SD_INFO_SRC | information_source | information来源 |
| SD_REACTION_SEVERITY | SD_REACT_SEV | reaction_severity | reaction严重程度 |
| SD_VERIFICATION_STATUS | SD_VRFCTN_STATUS | verification_status | 验证状态 |

## RHN_VIS_CLIN_DOC · vis.clinical_document

临床文书；一行代表一条临床文书记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_INSTANCE_KEY | CD_INST_KEY | instance_key | instance键 |

## RHN_VIS_CLIN_DOC_VER · vis.clinical_document_version

临床文书版本；一行代表一条临床文书版本记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CONTENT_DIGEST_ALGORITHM | CONTENT_DIGEST_ALGO | content_digest_algorithm | 内容摘要算法 |
| ID_CRYPTO_EVID_INTEGRITY | ID_CRYPTO_EVID_INTGR | integrity_evidence_id | integrity证据标识 |

## RHN_VIS_CRIT_VAL_ALERT · vis.critical_value_alert

危急值值预警；一行代表一条危急值值预警记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_DISPOSITION | CD_DISPOS | disposition_code | 处置方式编码 |
| DES_ACKNOWLEDGE_NOTE | DES_ACK_NOTE | acknowledge_note | acknowledge备注 |
| DT_ACKNOWLEDGED | DT_ACKD | acknowledged_at | acknowledged时间 |
| DT_ACKNOWLEDGE_DEADLINE | DT_ACK_DDLN | acknowledge_deadline_at | acknowledgedeadline时间 |
| DT_DETECTED | DT_DTCTD | detected_at | detected时间 |
| ID_DIAG_REPORT_SUPERSEDED | ID_DIAG_REPORT_SPRSDD | superseded_by_report_id | supersededby报告标识 |
| ID_USER_ACKNOWLEDGED | ID_USER_ACKD | acknowledged_by | acknowledged人标识 |
| ID_USER_RECIPIENT | ID_USER_RCPNT | recipient_user_id | recipient用户标识 |
| SD_ESCALATION_LEVEL | SD_ESCLN_LEVEL | escalation_level | 升级等级 |
| SD_SEVERITY | SD_SEV | severity | 严重程度 |

## RHN_VIS_CRIT_VAL_ALERT_EVT · vis.critical_value_alert_event

危急值值预警事件；一行代表一条危急值值预警事件记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |
| ID_CORRELATION | ID_CORR | correlation_id | 关联标识 |

## RHN_VIS_ENC · vis.encounter

就诊；一行代表一条就诊记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_TERMINATION | CD_TRMN | termination_code | termination编码 |
| DES_CHIEF_COMPLAINT | DES_CHIEF_CMPLNT | chief_complaint | 主诉求 |
| DES_TERMINATION_REASON | DES_TRMN_REASON | termination_reason | termination原因 |
| DIASTOLIC | DBP | diastolic | 舒张压 |
| DT_COMPLETED | DT_CMPLD | completed_at | 完成时间 |
| DT_REGISTERED | DT_REGD | registered_at | registered时间 |
| DT_TERMINATED | DT_TRMND | terminated_at | terminated时间 |
| ID_CLINICIAN | ID_CLNCN | clinician_id | clinician标识 |
| ID_USER_TERMINATED | ID_USER_TRMND | terminated_by | terminated人标识 |
| SYSTOLIC | SBP | systolic | 收缩压 |

## RHN_VIS_ENC_COMP_CHECK · vis.encounter_completion_check

就诊完成核查；一行代表一条就诊完成核查记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| SN_EXPECTED_VER | SN_EXPCTD_VER | expected_revision | 预期修订 |

## RHN_VIS_ENC_COMP_ISSUE · vis.encounter_completion_issue

就诊完成问题；一行代表一条就诊完成问题记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| SD_SEVERITY | SD_SEV | severity | 严重程度 |

## RHN_VIS_ENC_DIAG · vis.encounter_diagnosis

就诊诊断；一行代表一条就诊诊断记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_BUSINESS_VER_NO | CD_BIZ_VER_NO | business_version_no | 业务版本编号 |
| CODE_SYSTEM_VERSION_SNAPSHOT | CODE_SYSTEM_VERSION_SNAP | code_system_version_snapshot | 编码体系版本快照 |
| DT_RECORDED | DT_RECDD | recorded_at | 记录时间 |
| SD_VERIFICATION_STATUS | SD_VRFCTN_STATUS | verification_status | 验证状态 |

## RHN_VIS_ENC_DIAG_REV · vis.encounter_diagnosis_revision

就诊诊断修订；一行代表一条就诊诊断修订记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_BUSINESS_VER_NO | CD_BIZ_VER_NO | business_version_no | 业务版本编号 |
| CODE_SYSTEM_VERSION_SNAPSHOT | CODE_SYSTEM_VERSION_SNAP | code_system_version_snapshot | 编码体系版本快照 |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |
| SD_VERIFICATION_STATUS | SD_VRFCTN_STATUS | verification_status | 验证状态 |

## RHN_VIS_ENC_IDENT_CHECK · vis.encounter_identity_check

就诊身份核查；一行代表一条就诊身份核查记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_TERMINAL | CD_TRMNL | terminal_code | 终端编码 |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |
| SD_CHECK_SCENARIO | SD_CHECK_SCEN | check_scenario | 核查scenario |

## RHN_VIS_ENC_STATUS_EVT · vis.encounter_status_event

就诊状态事件；一行代表一条就诊状态事件记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |
| SN_EXPECTED_VER | SN_EXPCTD_VER | expected_revision | 预期修订 |

## RHN_VIS_ENC_WORK_SESSION · vis.encounter_work_session

就诊工作会话；一行代表一条就诊工作会话记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_TERMINAL | CD_TRMNL | terminal_code | 终端编码 |
| DT_HEARTBEAT | DT_HRTBT | heartbeat_at | heartbeat时间 |

## RHN_VIS_HEALTH_EVT · vis.health_event

健康事件；一行代表一条健康事件记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |
| DT_RECORDED | DT_RECDD | recorded_at | 记录时间 |
| ID_CORRELATION | ID_CORR | correlation_id | 关联标识 |
| ID_USER_RECORDED | ID_USER_RECDD | recorded_by | 记录人标识 |

## RHN_VIS_INP_BED_DAY_FACT · vis.inpatient_bed_day_fact

住院床位日事实；一行代表一条住院床位日事实记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DA_BUSINESS | DA_BIZ | business_date | 业务日期 |

## RHN_VIS_INP_BED_PROF · vis.inpatient_bed_profile

住院床位档案；一行代表一条住院床位档案记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| ID_RESPONSIBLE_NURSE | ID_RSPNSBL_NURSE | responsible_nurse_id | responsiblenurse标识 |
| SD_GENDER_RESTRICTION | SD_GENDER_RSTRCT | gender_restriction | 性别限制 |
| SD_OPERATIONAL_STATUS | SD_OPERAT_STATUS | operational_status | operational状态 |

## RHN_VIS_INP_CHART_EVT · vis.inpatient_chart_event

住院病历事件；一行代表一条住院病历事件记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |
| DT_RECORDED | DT_RECDD | recorded_at | 记录时间 |
| ID_USER_RECORDED | ID_USER_RECDD | recorded_by | 记录人标识 |

## RHN_VIS_INP_EPISODE_DETAIL · vis.inpatient_episode_detail

住院周期明细；一行代表一条住院周期明细记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_ADMISSION_METHOD | CD_ADM_METHOD | admission_method_code | 入院方法编码 |
| CD_ADMISSION_SRC | CD_ADM_SRC | admission_source_code | 入院来源编码 |
| CD_ADMISSION_TYPE | CD_ADM_TYPE | admission_type_code | 入院类型编码 |
| CD_DISCHARGE_DISPOSITION | CD_DISCH_DISPOS | discharge_disposition_code | discharge处置方式编码 |
| DES_ADMISSION_NOTE | DES_ADM_NOTE | admission_note | 入院备注 |
| DES_ADMISSION_REASON | DES_ADM_REASON | admission_reason | 入院原因 |
| DES_DISCHARGE_NOTE | DES_DISCH_NOTE | discharge_note | discharge备注 |
| EMERGENCY_CONTACT_PHONE | EMERG_CONTACT_PHONE | emergency_contact_phone | emergency联系方式电话 |
| EMERGENCY_CONTACT_RELATIONSHIP | EMERG_CONTACT_RELSHIP | emergency_contact_relationship | emergency联系方式relationship |
| ID_RESPONSIBLE_NURSE | ID_RSPNSBL_NURSE | responsible_nurse_id | responsiblenurse标识 |
| ID_SVC_LOC_ADMISSION | ID_SVC_LOC_ADM | admission_location_id | 入院位置标识 |
| ID_SVC_LOC_DISCHARGE | ID_SVC_LOC_DISCH | discharge_location_id | discharge位置标识 |
| NA_EMERGENCY_CONTACT | NA_EMERG_CONTACT | emergency_contact_name | emergency联系方式名称 |

## RHN_VIS_INP_EVT · vis.inpatient_event

住院事件；一行代表一条住院事件记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |

## RHN_VIS_INP_NURS_RECORD · vis.inpatient_nursing_record

住院护理记录；一行代表一条住院护理记录记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CONTENT_DIGEST_ALGORITHM | CONTENT_DIGEST_ALGO | content_digest_algorithm | 内容摘要算法 |
| DT_OCCURRED | DT_OCCRD | occurred_at | 发生时间 |
| DT_RECORDED | DT_RECDD | recorded_at | 记录时间 |
| ID_CRYPTO_EVID_INTEGRITY | ID_CRYPTO_EVID_INTGR | integrity_evidence_id | integrity证据标识 |
| ID_RECORDED_BY_PRACT | ID_RECDD_BY_PRACT | recorded_by_practitioner_id | 记录by医务人员标识 |
| ID_RECORDED_BY_SUBJECT | ID_RECDD_BY_SUBJECT | recorded_by_subject_id | 记录by主体标识 |
| JSON_ASSESSMENT | JSON_ASSMT | assessment_json | 评估JSON |
| NA_RECORDER | NA_RECDR | recorder_name | 记录人名称 |

## RHN_VIS_INP_OBS · vis.inpatient_observation

住院观察；一行代表一条住院观察记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_OBSERVED | DT_OBSD | observed_at | observed时间 |

## RHN_VIS_INP_OBS_GRP · vis.inpatient_observation_group

住院观察分组；一行代表一条住院观察分组记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DT_MEASURED | DT_MEASD | measured_at | measured时间 |
| DT_RECORDED | DT_RECDD | recorded_at | 记录时间 |
| ID_USER_RECORDED | ID_USER_RECDD | recorded_by | 记录人标识 |

## RHN_VIS_INP_SHIFT_HANDOFF · vis.inpatient_shift_handoff

住院班次交接；一行代表一条住院班次交接记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CONTENT_DIGEST_ALGORITHM | CONTENT_DIGEST_ALGO | content_digest_algorithm | 内容摘要算法 |
| ID_CRYPTO_EVID_INTEGRITY | ID_CRYPTO_EVID_INTGR | integrity_evidence_id | integrity证据标识 |

## RHN_VIS_INP_SHIFT_HANDOFF_ITEM · vis.inpatient_shift_handoff_item

住院班次交接项目；一行代表一条住院班次交接项目记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| DES_SITUATION | DES_SITUAT | situation | 情况 |

## RHN_VIS_OBS · vis.observation

观察；一行代表一条观察记录

| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |
| --- | --- | --- | --- |
| CD_INTERPRETATION | CD_INTERP | interpretation_code | interpretation编码 |
| CD_PERFORMER | CD_PRFRMR | performer_code | 执行人编码 |
| DT_EFFECTIVE | DT_EFF | effective_at | 生效时间 |
| DT_VAL_DATETIME | DT_VAL_DTTM | value_datetime | 值datetime |
| NA_PERFORMER | NA_PRFRMR | performer_name | 执行人名称 |
| REFERENCE_RANGE_HIGH | REF_RANGE_HIGH | reference_range_high | 参考范围上限 |
| REFERENCE_RANGE_LOW | REF_RANGE_LOW | reference_range_low | 参考范围下限 |
