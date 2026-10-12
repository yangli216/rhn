-- V1_109_0__register_primary_care_parameterized_rules.sql
-- Register primary care parameterized rules and statin category in baseline engine (H2 / PostgreSQL)

-- 1. 新增安全分类：他汀类调脂药
insert into RHN_AUD_MED_SAFETY_CAT (ID_SAFETY_CAT, ID_TNT, CD_CAT, NA_CAT, SD_RULE_KIND, DES_RATNL, FG_SYSTEM, SD_STATUS, REVISION, CD_CAT_MAJOR, CD_CAT_SUB, FG_SYSIC_ONLY)
values (362387869899318, 362387869790209, 'STATIN_LIPID_LOWERING', '他汀类调脂药', 'DRUG_INTERACTION', '辛伐他汀、阿托伐他汀等主要经CYP3A4酶代谢，与CYP3A4强抑制剂联用可致血药浓度剧增，诱发致死性横纹肌溶解及急性肾衰竭。', true, 'ACTIVE', 0, '七、心血管系统用药', null, true);

-- 2. 补齐大环内酯类抗菌药成员
insert into RHN_AUD_MED_SAFETY_CAT_MBR (ID_MEMBER, ID_TNT, ID_SAFETY_CAT, ID_MED, CD_MED, NA_MED_SNAP, PREP_SPEC_SNAP, DOSE_FORM_SNAP, REVISION)
select 362387869900100 + row_number() over (order by m.ID_MED),
       m.ID_TNT, 362387869899316, m.ID_MED, m.CD_MED, m.NA_MED, m.PREP_SPEC, m.DOSE_FORM, 0
  from RHN_BD_MED m
 where m.ID_TNT = 362387869790209
   and (m.NA_MED like '%红霉素%' or m.NA_MED like '%克拉霉素%' or m.NA_MED like '%阿奇霉素%' or m.NA_MED like '%罗红霉素%')
   and not exists (select 1 from RHN_AUD_MED_SAFETY_CAT_MBR b where b.ID_SAFETY_CAT = 362387869899316 and b.ID_MED = m.ID_MED);

-- 3. 补齐他汀类调脂药成员
insert into RHN_AUD_MED_SAFETY_CAT_MBR (ID_MEMBER, ID_TNT, ID_SAFETY_CAT, ID_MED, CD_MED, NA_MED_SNAP, PREP_SPEC_SNAP, DOSE_FORM_SNAP, REVISION)
select 362387869900200 + row_number() over (order by m.ID_MED),
       m.ID_TNT, 362387869899318, m.ID_MED, m.CD_MED, m.NA_MED, m.PREP_SPEC, m.DOSE_FORM, 0
  from RHN_BD_MED m
 where m.ID_TNT = 362387869790209
   and (m.NA_MED like '%他汀%')
   and not exists (select 1 from RHN_AUD_MED_SAFETY_CAT_MBR b where b.ID_SAFETY_CAT = 362387869899318 and b.ID_MED = m.ID_MED);

-- 4. 注册 6 条基层核心合理用药规则定义
insert into RHN_AUD_MED_RULE (ID_RULE, CD_RULE, CD_CAT, NA_RULE) values
(362387869899115, 'QMED.PPI_DUPLICATE', 'DRUG_DUPLICATION', '质子泵抑制剂（PPI）同方或重复用药核对');

insert into RHN_AUD_MED_RULE (ID_RULE, CD_RULE, CD_CAT, NA_RULE) values
(362387869899116, 'QMED.RASI_DUPLICATE', 'DRUG_DUPLICATION', 'ACEI与ARB类降压药重复用药核对');

insert into RHN_AUD_MED_RULE (ID_RULE, CD_RULE, CD_CAT, NA_RULE) values
(362387869899117, 'QMED.SEDATIVE_HYPNOTIC_DUPLICATE', 'DRUG_DUPLICATION', '镇静催眠类及抗焦虑药物重复用药核对');

insert into RHN_AUD_MED_RULE (ID_RULE, CD_RULE, CD_CAT, NA_RULE) values
(362387869899118, 'QMED.TETRACYCLINE_PEDIATRIC', 'SPECIAL_POPULATION_CONTRAINDICATION', '儿童青少年禁用四环素类抗生素核对');

insert into RHN_AUD_MED_RULE (ID_RULE, CD_RULE, CD_CAT, NA_RULE) values
(362387869899119, 'QMED.AMINOGLYCOSIDE_PEDIATRIC', 'SPECIAL_POPULATION_CONTRAINDICATION', '儿童及特定年龄禁用氨基糖苷类抗生素核对');

insert into RHN_AUD_MED_RULE (ID_RULE, CD_RULE, CD_CAT, NA_RULE) values
(362387869899120, 'QMED.MACROLIDE_STATIN_INTERACTION', 'DRUG_INTERACTION', '大环内酯类抗菌药与他汀类相互作用核对');

-- 5. 注册在行规则集 qmed-standard-shadow-v2 对应的规则版本与临床依据
insert into RHN_AUD_MED_RULE_VER (
    ID_RULE_VER, ID_RULE, NO_VERSION, CD_RULE_SET_VER, CD_IMPL,
    SD_STATUS, SD_SEV, SD_DCSN, SD_OVRD_POLICY, DT_EFF_FROM, JSON_EVID
) values (
    362387869999115, 362387869899115, 1, 'qmed-standard-shadow-v2', 'java:category-duplicate:ppi:1',
    'SHADOW', 'HIGH', 'REQUIRE_OVERRIDE', 'REASON_REQUIRED', TIMESTAMP '2026-01-01 00:00:00+00:00',
    '[{"sourceType":"CLINICAL_GUIDELINE","sourceTitle":"质子泵抑制剂临床合理使用规范","sourceVersion":"qmed-ppi-spec-1","sourceLocator":"docs/architecture/rational-medication/基层合理用药核心规则规范.md","section":"PPI重复用药规范","excerpt":"联合使用两种及以上质子泵抑制剂通常不增加抑酸疗效，而成倍增加艰难梭菌感染、低镁血症及骨折风险。建议保留单一适宜品种。","usageScope":"SHADOW_ONLY; CLINICAL_EVIDENCE"}]'
);

insert into RHN_AUD_MED_RULE_VER (
    ID_RULE_VER, ID_RULE, NO_VERSION, CD_RULE_SET_VER, CD_IMPL,
    SD_STATUS, SD_SEV, SD_DCSN, SD_OVRD_POLICY, DT_EFF_FROM, JSON_EVID
) values (
    362387869999116, 362387869899116, 1, 'qmed-standard-shadow-v2', 'java:category-duplicate:rasi:1',
    'SHADOW', 'CRITICAL', 'BLOCK', 'REASON_REQUIRED', TIMESTAMP '2026-01-01 00:00:00+00:00',
    '[{"sourceType":"CLINICAL_GUIDELINE","sourceTitle":"中国高血压防治指南与RAAS阻断剂临床合理用药","sourceVersion":"qmed-rasi-spec-1","sourceLocator":"docs/architecture/rational-medication/基层合理用药核心规则规范.md","section":"RAAS双重阻断禁忌","excerpt":"临床指南明确反对ACEI（普利类）与ARB（沙坦类）联用双重阻断RAAS系统，可诱发严重高血钾、急性肾衰竭及过低血压。","usageScope":"SHADOW_ONLY; CLINICAL_EVIDENCE"}]'
);

insert into RHN_AUD_MED_RULE_VER (
    ID_RULE_VER, ID_RULE, NO_VERSION, CD_RULE_SET_VER, CD_IMPL,
    SD_STATUS, SD_SEV, SD_DCSN, SD_OVRD_POLICY, DT_EFF_FROM, JSON_EVID
) values (
    362387869999117, 362387869899117, 1, 'qmed-standard-shadow-v2', 'java:category-duplicate:sedative-hypnotic:1',
    'SHADOW', 'HIGH', 'REQUIRE_OVERRIDE', 'REASON_REQUIRED', TIMESTAMP '2026-01-01 00:00:00+00:00',
    '[{"sourceType":"CLINICAL_GUIDELINE","sourceTitle":"镇静催眠药物临床合理使用指导原则","sourceVersion":"qmed-sedative-spec-1","sourceLocator":"docs/architecture/rational-medication/基层合理用药核心规则规范.md","section":"镇静催眠药重复用药","excerpt":"联合开立两种或以上镇静催眠药物易导致中枢过度抑制、呼吸抑制及老年患者跌倒骨折。建议精简为单一适宜方案。","usageScope":"SHADOW_ONLY; CLINICAL_EVIDENCE"}]'
);

insert into RHN_AUD_MED_RULE_VER (
    ID_RULE_VER, ID_RULE, NO_VERSION, CD_RULE_SET_VER, CD_IMPL,
    SD_STATUS, SD_SEV, SD_DCSN, SD_OVRD_POLICY, DT_EFF_FROM, JSON_EVID
) values (
    362387869999118, 362387869899118, 1, 'qmed-standard-shadow-v2', 'java:category-population:tetracycline-pediatric:1',
    'SHADOW', 'CRITICAL', 'BLOCK', 'REASON_REQUIRED', TIMESTAMP '2026-01-01 00:00:00+00:00',
    '[{"sourceType":"DRUG_LABEL_SPEC","sourceTitle":"四环素类药品说明书及儿童用药禁忌规范","sourceVersion":"qmed-tetra-spec-1","sourceLocator":"docs/architecture/rational-medication/基层合理用药核心规则规范.md","section":"儿童四环素禁忌","excerpt":"8周岁以下儿童骨骼和牙齿发育期禁用四环素类抗生素（多西环素、米诺环素等）。","usageScope":"SHADOW_ONLY; CLINICAL_EVIDENCE"}]'
);

insert into RHN_AUD_MED_RULE_VER (
    ID_RULE_VER, ID_RULE, NO_VERSION, CD_RULE_SET_VER, CD_IMPL,
    SD_STATUS, SD_SEV, SD_DCSN, SD_OVRD_POLICY, DT_EFF_FROM, JSON_EVID
) values (
    362387869999119, 362387869899119, 1, 'qmed-standard-shadow-v2', 'java:category-population:aminoglycoside-pediatric:1',
    'SHADOW', 'CRITICAL', 'BLOCK', 'REASON_REQUIRED', TIMESTAMP '2026-01-01 00:00:00+00:00',
    '[{"sourceType":"DRUG_LABEL_SPEC","sourceTitle":"氨基糖苷类抗生素耳肾毒性防范与儿童禁忌规范","sourceVersion":"qmed-amino-spec-1","sourceLocator":"docs/architecture/rational-medication/基层合理用药核心规则规范.md","section":"儿童氨基糖苷禁忌","excerpt":"6周岁以下儿童及婴幼儿禁忌使用氨基糖苷类抗生素（庆大霉素、阿米卡星等）。","usageScope":"SHADOW_ONLY; CLINICAL_EVIDENCE"}]'
);

insert into RHN_AUD_MED_RULE_VER (
    ID_RULE_VER, ID_RULE, NO_VERSION, CD_RULE_SET_VER, CD_IMPL,
    SD_STATUS, SD_SEV, SD_DCSN, SD_OVRD_POLICY, DT_EFF_FROM, JSON_EVID
) values (
    362387869999120, 362387869899120, 1, 'qmed-standard-shadow-v2', 'java:category-conflict:macrolide-statin:1',
    'SHADOW', 'CRITICAL', 'BLOCK', 'REASON_REQUIRED', TIMESTAMP '2026-01-01 00:00:00+00:00',
    '[{"sourceType":"PHARMACOPOEIA_SAFETY","sourceTitle":"降脂药物临床应用与药物相互作用指南","sourceVersion":"qmed-macrolide-statin-spec-1","sourceLocator":"docs/architecture/rational-medication/基层合理用药核心规则规范.md","section":"大环内酯他汀相互作用","excerpt":"红霉素/克拉霉素强效抑制CYP3A4酶，显著升高经该酶代谢的他汀类血药浓度，有诱发急性横纹肌溶解及肾衰竭风险。建议暂停他汀或更换非相互作用抗感染药。","usageScope":"SHADOW_ONLY; CLINICAL_EVIDENCE"}]'
);
