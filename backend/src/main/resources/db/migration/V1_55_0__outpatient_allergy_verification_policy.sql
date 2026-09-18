insert into RHN_SYS_PARAM_DEF (
    ID_PARAM_DEF, ID_PARAM_CAT, CD_PARAM_KEY, NA_PARAM_DEF, DES_PARAM_DEF,
    SD_VAL_TYPE, SD_CONTROL_TYPE, JSON_SCHEMA, JSON_DEFAULT_VAL, JSON_EXAMPLE_VAL,
    UNIT, CD_DICT, JSON_SCOPE, SD_PARAM_CAT, FG_INHERITANCE, FG_CACHE,
    FG_NULLABLE_VAL, SENSITIVITY, SD_DISPLAY_POLICY, SD_STATUS, REVISION,
    DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED,
    CD_DEPENDS_ON_KEY, EXPR_DEPENDS_ON_VAL, SD_DEPENDENCY_BEHAVIOR
) values (
    362387869795121, 362387869794071,
    'outpatient.medication.allergy-verification.mode',
    '门诊药品过敏核验处置模式',
    '控制门诊药品开立时患者过敏状态未采集或本次未确认的处置方式；WARN仅警告并允许继续，BLOCK阻断开立。已知过敏原命中仍须填写继续开立理由，不受本参数放宽。',
    'STRING', 'SELECT', '{"type":"string","enum":["WARN","BLOCK"]}',
    '"WARN"', '"BLOCK"', null, null,
    '["PLATFORM","TENANT","ORGANIZATION","DEPARTMENT"]', 'BUSINESS',
    true, true, false, 'NORMAL', 'PLAIN', 'ACTIVE', 0,
    current_timestamp, 362387869790222, current_timestamp, 362387869790222,
    null, null, 'DISABLE_AND_SUPPRESS'
);

insert into RHN_SYS_PARAM_CHG (
    ID_PARAM_CHG, ID_TNT, ID_PARAM_DEF, ID_PARAM_VAL, SD_TARGET_TYPE,
    SD_CHG_TYPE, JSON_BEFORE, JSON_AFTER, DES_CHG_REASON, CD_REQ,
    DT_CHANGED, ID_USER_CHANGED
) values (
    362387869796121, null, 362387869795121, null, 'DEFINITION',
    'CREATE', null,
    '{"source":"PRODUCT_BASELINE","key":"outpatient.medication.allergy-verification.mode","status":"ACTIVE"}',
    '初始化门诊药品过敏核验处置模式参数',
    'baseline-v155:outpatient.medication.allergy-verification.mode',
    current_timestamp, 362387869790222
);
