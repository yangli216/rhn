-- Standard-reference duplicate evaluation, retaining the six existing SHADOW implementations.
insert into RHN_AUD_MED_RULE_VER
    (ID_RULE_VER, ID_RULE, NO_VERSION, CD_RULE_SET_VER, CD_IMPLEMENTATION, SD_STATUS,
     SD_SEVERITY, SD_DECISION, SD_OVERRIDE_POLICY, DT_EFFECTIVE_FROM, DT_EFFECTIVE_TO, JSON_EVIDENCE)
select v.ID_RULE_VER + 100000, v.ID_RULE, v.NO_VERSION + 1, 'qmed-standard-shadow-v2',
       case when d.CD_RULE = 'QMED.EXACT_GENERIC_DUPLICATE' then 'java:standard-reference-duplicate:1' else v.CD_IMPLEMENTATION end,
       'SHADOW', v.SD_SEVERITY, v.SD_DECISION, v.SD_OVERRIDE_POLICY, v.DT_EFFECTIVE_FROM, v.DT_EFFECTIVE_TO,
       TO_CLOB('[{"sourceType": "ENGINEERING_BASELINE", "sourceTitle": "标准目录与用药语义运行契约", "sourceVersion": "qmed-standard-duplicate-1", "sourceLocator": "docs/architecture/rational-medication/标准目录与用药语义运行契约.md", "section": "标准规格重复规则", "excerpt": "同一处方中相同目录版本与标准规格的有效条目产生核对提示；缺少标准关联时不可评价。", "usageScope": "SHADOW_ONLY; NOT_CLINICAL_EVIDENCE"}]')
from RHN_AUD_MED_RULE_VER v join RHN_AUD_MED_RULE d on d.ID_RULE = v.ID_RULE
where v.CD_RULE_SET_VER = 'qmed-foundation-shadow-v1' and d.CD_RULE = 'QMED.EXACT_GENERIC_DUPLICATE';

-- Standard-reference duplicate evaluation, retaining the six existing SHADOW implementations.
insert into RHN_AUD_MED_RULE_VER
    (ID_RULE_VER, ID_RULE, NO_VERSION, CD_RULE_SET_VER, CD_IMPLEMENTATION, SD_STATUS,
     SD_SEVERITY, SD_DECISION, SD_OVERRIDE_POLICY, DT_EFFECTIVE_FROM, DT_EFFECTIVE_TO, JSON_EVIDENCE)
select v.ID_RULE_VER + 100000, v.ID_RULE, v.NO_VERSION + 1, 'qmed-standard-shadow-v2',
       case when d.CD_RULE = 'QMED.EXACT_GENERIC_DUPLICATE' then 'java:standard-reference-duplicate:1' else v.CD_IMPLEMENTATION end,
       'SHADOW', v.SD_SEVERITY, v.SD_DECISION, v.SD_OVERRIDE_POLICY, v.DT_EFFECTIVE_FROM, v.DT_EFFECTIVE_TO,
       v.JSON_EVIDENCE
from RHN_AUD_MED_RULE_VER v join RHN_AUD_MED_RULE d on d.ID_RULE = v.ID_RULE
where v.CD_RULE_SET_VER = 'qmed-foundation-shadow-v1' and d.CD_RULE <> 'QMED.EXACT_GENERIC_DUPLICATE';
