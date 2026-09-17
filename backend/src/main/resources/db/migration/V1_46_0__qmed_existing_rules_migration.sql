-- 注册 QMED-2 阶段迁移的 3 类既有临床安全规则定义及 qmed-foundation-shadow-v1 规则版本
insert into RHN_AUD_MED_RULE (ID_RULE, CD_RULE, CD_CATEGORY, NA_RULE) values (
    362387869899103, 'QMED.ANTIMICROBIAL_OUTPATIENT', 'ANTIMICROBIAL_OUTPATIENT', '门诊抗菌药物使用限制与疗程核对'
);

insert into RHN_AUD_MED_RULE_VER (
    ID_RULE_VER, ID_RULE, NO_VERSION, CD_RULE_SET_VER, CD_IMPLEMENTATION,
    SD_STATUS, SD_SEVERITY, SD_DECISION, SD_OVERRIDE_POLICY, DT_EFFECTIVE_FROM, JSON_EVIDENCE
) values (
    362387869899104, 362387869899103, 1, 'qmed-foundation-shadow-v1', 'java:antimicrobial-outpatient:1',
    'SHADOW', 'HIGH', 'REQUIRE_OVERRIDE', 'REASON_REQUIRED', TIMESTAMP '2026-01-01 00:00:00+00:00',
    '[{"sourceType":"CLINICAL_REGULATION","sourceTitle":"门诊抗菌药物临床应用管理规范","sourceVersion":"qmed-am-spec-1","sourceLocator":"docs/architecture/rational-medication/实施路线图.md","section":"QMED-2 迁移对象","excerpt":"门诊限制使用级/特殊使用级抗菌药未经专科会诊不得开立，普通抗菌药门诊处方一般不得超过7日用量。","usageScope":"SHADOW_ONLY; CLINICAL_EVIDENCE"}]'
);

insert into RHN_AUD_MED_RULE (ID_RULE, CD_RULE, CD_CATEGORY, NA_RULE) values (
    362387869899105, 'QMED.DRUG_ALLERGY', 'DRUG_ALLERGY', '患者药物过敏史与过敏原核对'
);

insert into RHN_AUD_MED_RULE_VER (
    ID_RULE_VER, ID_RULE, NO_VERSION, CD_RULE_SET_VER, CD_IMPLEMENTATION,
    SD_STATUS, SD_SEVERITY, SD_DECISION, SD_OVERRIDE_POLICY, DT_EFFECTIVE_FROM, JSON_EVIDENCE
) values (
    362387869899106, 362387869899105, 1, 'qmed-foundation-shadow-v1', 'java:drug-allergy:1',
    'SHADOW', 'CRITICAL', 'BLOCK', 'REASON_REQUIRED', TIMESTAMP '2026-01-01 00:00:00+00:00',
    '[{"sourceType":"CLINICAL_SAFETY_STANDARD","sourceTitle":"处方用药过敏防范与核查规范","sourceVersion":"qmed-allergy-spec-1","sourceLocator":"docs/architecture/rational-medication/实施路线图.md","section":"QMED-2 迁移对象","excerpt":"开具处方前必须采集患者过敏史，命中明确药物过敏原时系统强制阻断，抢救及特殊情况须充分记录理由。","usageScope":"SHADOW_ONLY; CLINICAL_EVIDENCE"}]'
);

insert into RHN_AUD_MED_RULE (ID_RULE, CD_RULE, CD_CATEGORY, NA_RULE) values (
    362387869899107, 'QMED.SKIN_TEST', 'SKIN_TEST', '强制皮试药品阴性结果与免试核对'
);

insert into RHN_AUD_MED_RULE_VER (
    ID_RULE_VER, ID_RULE, NO_VERSION, CD_RULE_SET_VER, CD_IMPLEMENTATION,
    SD_STATUS, SD_SEVERITY, SD_DECISION, SD_OVERRIDE_POLICY, DT_EFFECTIVE_FROM, JSON_EVIDENCE
) values (
    362387869899108, 362387869899107, 1, 'qmed-foundation-shadow-v1', 'java:skin-test:1',
    'SHADOW', 'HIGH', 'REQUIRE_OVERRIDE', 'REASON_REQUIRED', TIMESTAMP '2026-01-01 00:00:00+00:00',
    '[{"sourceType":"CLINICAL_SAFETY_STANDARD","sourceTitle":"青霉素与头孢类药品皮试操作规程","sourceVersion":"qmed-skintest-spec-1","sourceLocator":"docs/architecture/rational-medication/实施路线图.md","section":"QMED-2 迁移对象","excerpt":"易致敏注射剂用药前必须皮试，24小时内未重复使用者须重新皮试，同批号免试需有明确临床核验记录。","usageScope":"SHADOW_ONLY; CLINICAL_EVIDENCE"}]'
);
