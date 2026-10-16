-- 门诊血压测量要求改为可按机构维护的结构化参数；原硬编码规则（18 周岁及以上或年龄不明必填）作为默认值，阻断时机默认改为诊毕。
insert into RHN_SYS_PARAM_DEF (
    ID_PARAM_DEF, ID_PARAM_CAT, CD_PARAM_KEY, NA_PARAM_DEF, DES_PARAM_DEF,
    SD_VAL_TYPE, SD_CONTROL_TYPE, JSON_SCHEMA, JSON_DEFAULT_VAL, JSON_EXAMPLE_VAL,
    UNIT, CD_DICT, JSON_SCOPE, SD_PARAM_CAT, FG_INHRT, FG_CACHE,
    FG_NULLBL_VAL, SENS, SD_DISPLAY_POLICY, SD_STATUS, REVISION,
    DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED,
    CD_DEPENDS_ON_KEY, EXPR_DEPENDS_ON_VAL, SD_DEPNCY_BEHAV
) values (
    362387869796195, 362387869794071,
    'outpatient.vital-signs.blood-pressure.requirement',
    '门诊血压测量要求',
    '控制门诊就诊何时必须填写收缩压和舒张压：是否启用、必测起始年龄、年龄不明时是否必测，以及在保存草稿时还是诊毕时阻断。',
    'JSON', 'JSON_EDITOR', to_clob('{"type":"object","additionalProperties":false,"required":["enabled","minAge","unknownAgeRequired","enforceAt"],"properties":{"enabled":{"type":"boolean","title":"门诊就诊必测血压","description":"关闭后门诊就诊不再强制填写血压。"},"minAge":{"type":"integer","title":"必测起始年龄（周岁）","description":"按就诊日计算的周岁年龄达到该值即须测量；每次就诊均按首诊处理。18 表示成人就诊必测，35 表示 35 岁及以上首诊测压。","minimum":0,"maximum":120,"x-visibleWhen":{"enabled":true}},"unknownAgeRequired":{"type":"boolean","title":"年龄不明时也必测","description":"患者出生日期缺失或晚于就诊日时是否仍要求测量。","x-visibleWhen":{"enabled":true}},"enforceAt":{"type":"string","title":"拦截时机","description":"诊毕时：保存草稿只提醒，诊毕准入时阻断；保存草稿时：未填写血压不能保存病历草稿。","enum":["COMPLETION","DRAFT"],"x-enumLabels":{"COMPLETION":"诊毕时","DRAFT":"保存草稿时"},"x-visibleWhen":{"enabled":true}}}}'),
    to_clob('{"enabled":true,"minAge":18,"unknownAgeRequired":true,"enforceAt":"COMPLETION"}'), to_clob('{"enabled":true,"minAge":35,"unknownAgeRequired":false,"enforceAt":"COMPLETION"}'), null, null,
    to_clob('["PLATFORM","TENANT","ORGANIZATION","DEPARTMENT"]'), 'BUSINESS',
    1, 1, 0, 'NORMAL', 'PLAIN', 'ACTIVE', 0,
    to_timestamp_tz('2026-10-16 00:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 362387869790222, to_timestamp_tz('2026-10-16 00:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 362387869790222,
    null, null, 'DISABLE_AND_SUPPRESS'
);

insert into RHN_SYS_PARAM_CHG (
    ID_PARAM_CHG, ID_TNT, ID_PARAM_DEF, ID_PARAM_VAL, SD_TARGET_TYPE,
    SD_CHG_TYPE, JSON_BEFORE, JSON_AFTER, DES_CHG_REASON, CD_REQ,
    DT_CHANGED, ID_USER_CHANGED
) values (
    362387869796196, null, 362387869796195, null, 'DEFINITION',
    'CREATE', null,
    to_clob('{"source":"PRODUCT_BASELINE","key":"outpatient.vital-signs.blood-pressure.requirement","status":"ACTIVE"}'),
    '初始化门诊血压测量要求参数',
    'v1.129.12:outpatient.vital-signs.blood-pressure.requirement',
    to_timestamp_tz('2026-10-16 00:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 362387869790222
);
