-- 注册配套国家基药目录的常用临床合理用药规则定义及 qmed-foundation-shadow-v1 规则版本
-- 1. 非甾体抗炎药（NSAIDs）重复用药核对
insert into RHN_AUD_MED_RULE (ID_RULE, CD_RULE, CD_CATEGORY, NA_RULE)
select 362387869899109, 'QMED.NSAID_DUPLICATE', 'DRUG_DUPLICATION', '非甾体抗炎药（NSAIDs）同方或联合用药重复核对'
where not exists (select 1 from RHN_AUD_MED_RULE where ID_RULE = 362387869899109);

insert into RHN_AUD_MED_RULE_VER (
    ID_RULE_VER, ID_RULE, NO_VERSION, CD_RULE_SET_VER, CD_IMPLEMENTATION,
    SD_STATUS, SD_SEVERITY, SD_DECISION, SD_OVERRIDE_POLICY, DT_EFFECTIVE_FROM, JSON_EVIDENCE
)
select 362387869899110, 362387869899109, 1, 'qmed-foundation-shadow-v1', 'java:nsaid-duplicate:1',
    'SHADOW', 'HIGH', 'REQUIRE_OVERRIDE', 'REASON_REQUIRED', TIMESTAMP '2026-01-01 00:00:00+00:00',
    '[{"sourceType":"CLINICAL_GUIDELINE","sourceTitle":"非甾体抗炎药临床合理使用规范","sourceVersion":"qmed-nsaid-spec-1","sourceLocator":"docs/architecture/rational-medication/基药目录配套用药安全规则规范.md","section":"NSAIDs重复用药规范","excerpt":"同一处方开立两种或以上全身性非甾体抗炎药，疗效不叠加而消化道溃疡、穿孔及急性肾损伤毒副作用显著增加，系统予以强制核对提示。","usageScope":"SHADOW_ONLY; CLINICAL_EVIDENCE"}]'
where not exists (select 1 from RHN_AUD_MED_RULE_VER where ID_RULE_VER = 362387869899110);

-- 2. 儿童及特定年龄禁忌用药核对
insert into RHN_AUD_MED_RULE (ID_RULE, CD_RULE, CD_CATEGORY, NA_RULE)
select 362387869899111, 'QMED.AGE_CONTRAINDICATION', 'SPECIAL_POPULATION_CONTRAINDICATION', '儿童及特定年龄禁忌用药核对'
where not exists (select 1 from RHN_AUD_MED_RULE where ID_RULE = 362387869899111);

insert into RHN_AUD_MED_RULE_VER (
    ID_RULE_VER, ID_RULE, NO_VERSION, CD_RULE_SET_VER, CD_IMPLEMENTATION,
    SD_STATUS, SD_SEVERITY, SD_DECISION, SD_OVERRIDE_POLICY, DT_EFFECTIVE_FROM, JSON_EVIDENCE
)
select 362387869899112, 362387869899111, 1, 'qmed-foundation-shadow-v1', 'java:age-contraindication:1',
    'SHADOW', 'CRITICAL', 'BLOCK', 'REASON_REQUIRED', TIMESTAMP '2026-01-01 00:00:00+00:00',
    '[{"sourceType":"DRUG_LABEL_SPEC","sourceTitle":"国家药品监督管理局儿童禁忌用药目录及说明书规范","sourceVersion":"qmed-age-spec-1","sourceLocator":"docs/architecture/rational-medication/基药目录配套用药安全规则规范.md","section":"儿童年龄禁忌","excerpt":"氟喹诺酮类药物可致幼年动物关节软骨发育受阻，18岁以下患者禁用；12岁以下儿童病毒性感染禁用阿司匹林以防发生瑞氏综合征。","usageScope":"SHADOW_ONLY; CLINICAL_EVIDENCE"}]'
where not exists (select 1 from RHN_AUD_MED_RULE_VER where ID_RULE_VER = 362387869899112);

-- 3. 双硫仑样反应配伍禁忌核对
insert into RHN_AUD_MED_RULE (ID_RULE, CD_RULE, CD_CATEGORY, NA_RULE)
select 362387869899113, 'QMED.DISULFIRAM_INTERACTION', 'DRUG_INTERACTION', '双硫仑样反应配伍禁忌核对'
where not exists (select 1 from RHN_AUD_MED_RULE where ID_RULE = 362387869899113);

insert into RHN_AUD_MED_RULE_VER (
    ID_RULE_VER, ID_RULE, NO_VERSION, CD_RULE_SET_VER, CD_IMPLEMENTATION,
    SD_STATUS, SD_SEVERITY, SD_DECISION, SD_OVERRIDE_POLICY, DT_EFFECTIVE_FROM, JSON_EVIDENCE
)
select 362387869899114, 362387869899113, 1, 'qmed-foundation-shadow-v1', 'java:disulfiram-interaction:1',
    'SHADOW', 'CRITICAL', 'BLOCK', 'REASON_REQUIRED', TIMESTAMP '2026-01-01 00:00:00+00:00',
    '[{"sourceType":"PHARMACOPOEIA_SAFETY","sourceTitle":"抗菌药物与含醇制剂相互作用临床防范指南","sourceVersion":"qmed-disulfiram-spec-1","sourceLocator":"docs/architecture/rational-medication/基药目录配套用药安全规则规范.md","section":"双硫仑反应禁忌","excerpt":"含甲硫四氮唑侧链的头孢类及咪唑类药物抑制乙醛脱氢酶，与含乙醇制剂合用将产生致死性双硫仑样反应，严禁同方或短间隔内联用。","usageScope":"SHADOW_ONLY; CLINICAL_EVIDENCE"}]'
where not exists (select 1 from RHN_AUD_MED_RULE_VER where ID_RULE_VER = 362387869899114);
