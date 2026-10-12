-- V1_110_0__register_pregnancy_contraindication_rule.sql
-- Register pregnancy teratogenicity contraindication rule in baseline engine (Oracle)

-- 1. 注册育龄期及妊娠期妇女禁用高危致畸药物规则定义
insert into RHN_AUD_MED_RULE (ID_RULE, CD_RULE, CD_CAT, NA_RULE) values
(362387869899121, 'QMED.PREGNANCY_CONTRA', 'SPECIAL_POPULATION_CONTRAINDICATION', '育龄期及妊娠期妇女禁用高危致畸药物核对');

-- 2. 注册在行规则集 qmed-standard-shadow-v2 对应的规则版本与临床依据
insert into RHN_AUD_MED_RULE_VER (
    ID_RULE_VER, ID_RULE, NO_VERSION, CD_RULE_SET_VER, CD_IMPL,
    SD_STATUS, SD_SEV, SD_DCSN, SD_OVRD_POLICY, DT_EFF_FROM, JSON_EVID
) values (
    362387869999121, 362387869899121, 1, 'qmed-standard-shadow-v2', 'java:category-population:pregnancy-contra:1',
    'SHADOW', 'CRITICAL', 'BLOCK', 'REASON_REQUIRED', TO_TIMESTAMP_TZ('2026-01-01 00:00:00 +00:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'),
    '[{"sourceType":"DRUG_LABEL_SPEC","sourceTitle":"国家药品监督管理局妊娠禁忌及FDA妊娠期药物安全性分类规范","sourceVersion":"qmed-pregnancy-spec-1","sourceLocator":"docs/architecture/rational-medication/基层合理用药核心规则规范.md","section":"妊娠期致畸禁忌","excerpt":"利巴韦林、甲氨蝶呤、他汀类、华法林等具有明确人类胚胎致畸性与生殖毒性（FDA X级/严重妊娠禁忌），育龄期备孕及妊娠期妇女严禁使用。","usageScope":"SHADOW_ONLY; CLINICAL_EVIDENCE"}]'
);
