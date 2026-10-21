-- 门诊医嘱开立核查模式与处方分方规则改为机构参数；默认值保持原行为（标准核查、西药/中成药分开、输液单列、5 种上限）。
insert into RHN_SYS_PARAM_DEF (
    ID_PARAM_DEF, ID_PARAM_CAT, CD_PARAM_KEY, NA_PARAM_DEF, DES_PARAM_DEF,
    SD_VAL_TYPE, SD_CONTROL_TYPE, JSON_SCHEMA, JSON_DEFAULT_VAL, JSON_EXAMPLE_VAL,
    UNIT, CD_DICT, JSON_SCOPE, SD_PARAM_CAT, FG_INHRT, FG_CACHE,
    FG_NULLBL_VAL, SENS, SD_DISPLAY_POLICY, SD_STATUS, REVISION,
    DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED,
    CD_DEPENDS_ON_KEY, EXPR_DEPENDS_ON_VAL, SD_DEPNCY_BEHAV
) values (
    362387869796210, 362387869794071,
    'outpatient.doctor-workstation.order-review-mode',
    '门诊医嘱开立核查模式',
    '标准模式每次开立先弹出核查窗确认分单、关联诊断与合理用药；简易模式直接开立，单据未填诊断时默认关联主诊断，仅在合理用药需确认或开立失败时弹出核查窗。两种模式门禁一致，不绕过合理用药与库存校验。',
    'STRING', 'SELECT', to_clob('{"type":"string","enum":["STANDARD","SIMPLE"],"x-enumLabels":{"STANDARD":"标准：开立前核查分单与诊断","SIMPLE":"简易：直接开立，异常时再核查"}}'),
    to_clob('"STANDARD"'), to_clob('"SIMPLE"'), null, null,
    to_clob('["PLATFORM","TENANT","ORGANIZATION","DEPARTMENT"]'), 'BUSINESS',
    1, 1, 0, 'NORMAL', 'PLAIN', 'ACTIVE', 0,
    to_timestamp_tz('2026-10-20 00:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 362387869790222, to_timestamp_tz('2026-10-20 00:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 362387869790222,
    null, null, 'DISABLE_AND_SUPPRESS'
);

insert into RHN_SYS_PARAM_CHG (
    ID_PARAM_CHG, ID_TNT, ID_PARAM_DEF, ID_PARAM_VAL, SD_TARGET_TYPE,
    SD_CHG_TYPE, JSON_BEFORE, JSON_AFTER, DES_CHG_REASON, CD_REQ,
    DT_CHANGED, ID_USER_CHANGED
) values (
    362387869796211, null, 362387869796210, null, 'DEFINITION',
    'CREATE', null,
    to_clob('{"source":"PRODUCT_BASELINE","key":"outpatient.doctor-workstation.order-review-mode","status":"ACTIVE"}'),
    '初始化门诊医嘱开立核查模式参数',
    'v1.129.45:outpatient.doctor-workstation.order-review-mode',
    to_timestamp_tz('2026-10-20 00:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 362387869790222
);
insert into RHN_SYS_PARAM_DEF (
    ID_PARAM_DEF, ID_PARAM_CAT, CD_PARAM_KEY, NA_PARAM_DEF, DES_PARAM_DEF,
    SD_VAL_TYPE, SD_CONTROL_TYPE, JSON_SCHEMA, JSON_DEFAULT_VAL, JSON_EXAMPLE_VAL,
    UNIT, CD_DICT, JSON_SCOPE, SD_PARAM_CAT, FG_INHRT, FG_CACHE,
    FG_NULLBL_VAL, SENS, SD_DISPLAY_POLICY, SD_STATUS, REVISION,
    DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED,
    CD_DEPENDS_ON_KEY, EXPR_DEPENDS_ON_VAL, SD_DEPNCY_BEHAV
) values (
    362387869796212, 362387869794071,
    'outpatient.prescription.split-policy',
    '门诊处方分方规则',
    '控制门诊自动分方：西药与中成药是否合方、输液是否单独成方、单张处方药品种数上限。发药药房隔离、草药整方、单列药品和同组输液原子性不受本参数影响。',
    'JSON', 'JSON_EDITOR', to_clob('{"type":"object","additionalProperties":false,"required":["mergeWesternAndPatent","separateInfusion","maxItemsPerPrescription"],"properties":{"mergeWesternAndPatent":{"type":"boolean","title":"西药与中成药合开一张处方","description":"开启后同一发药药房的西药与中成药合并分方，处方笺按西药处方管理。"},"separateInfusion":{"type":"boolean","title":"输液单独成方","description":"关闭后输液药品与同药房其他西药合方；同组输液始终在同一张处方内。"},"maxItemsPerPrescription":{"type":"integer","title":"单张处方药品种数上限","description":"《处方管理办法》规定每张处方不得超过 5 种药品，可按机构要求调低。","minimum":1,"maximum":5}}}'),
    to_clob('{"mergeWesternAndPatent":false,"separateInfusion":true,"maxItemsPerPrescription":5}'), to_clob('{"mergeWesternAndPatent":true,"separateInfusion":false,"maxItemsPerPrescription":5}'), null, null,
    to_clob('["PLATFORM","TENANT","ORGANIZATION","DEPARTMENT"]'), 'BUSINESS',
    1, 1, 0, 'NORMAL', 'PLAIN', 'ACTIVE', 0,
    to_timestamp_tz('2026-10-20 00:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 362387869790222, to_timestamp_tz('2026-10-20 00:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 362387869790222,
    null, null, 'DISABLE_AND_SUPPRESS'
);

insert into RHN_SYS_PARAM_CHG (
    ID_PARAM_CHG, ID_TNT, ID_PARAM_DEF, ID_PARAM_VAL, SD_TARGET_TYPE,
    SD_CHG_TYPE, JSON_BEFORE, JSON_AFTER, DES_CHG_REASON, CD_REQ,
    DT_CHANGED, ID_USER_CHANGED
) values (
    362387869796213, null, 362387869796212, null, 'DEFINITION',
    'CREATE', null,
    to_clob('{"source":"PRODUCT_BASELINE","key":"outpatient.prescription.split-policy","status":"ACTIVE"}'),
    '初始化门诊处方分方规则参数',
    'v1.129.45:outpatient.prescription.split-policy',
    to_timestamp_tz('2026-10-20 00:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 362387869790222
);
