-- 挂号医保结算时机改为可按机构维护的参数：大多数医院挂号时即做医保交易，基层社区医院常在诊间统一医保结算。默认诊间统一结算，不触发挂号环节的外部医保交易。
insert into RHN_SYS_PARAM_DEF (
    ID_PARAM_DEF, ID_PARAM_CAT, CD_PARAM_KEY, NA_PARAM_DEF, DES_PARAM_DEF,
    SD_VAL_TYPE, SD_CONTROL_TYPE, JSON_SCHEMA, JSON_DEFAULT_VAL, JSON_EXAMPLE_VAL,
    UNIT, CD_DICT, JSON_SCOPE, SD_PARAM_CAT, FG_INHRT, FG_CACHE,
    FG_NULLBL_VAL, SENS, SD_DISPLAY_POLICY, SD_STATUS, REVISION,
    DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED,
    CD_DEPENDS_ON_KEY, EXPR_DEPENDS_ON_VAL, SD_DEPNCY_BEHAV
) values (
    362387869796401, 362387869794051,
    'billing.registration.insurance-settlement',
    '挂号医保结算时机',
    '选择医保身份挂号时在何时完成医保结算：挂号时结算（挂号环节完成医保登记、预结算、结算，个人自付部分收款后建立就诊），或诊间统一结算（挂号时不做医保交易，挂号费并入门诊统一医保结算）。',
    'JSON', 'JSON_EDITOR', '{"type":"object","additionalProperties":false,"required":["timing"],"properties":{"timing":{"type":"string","title":"医保结算时机","description":"挂号时结算：选医保身份挂号时在挂号环节完成医保登记、预结算与结算，个人自付部分再收款，成功后才建立就诊；诊间统一结算：挂号时不做医保交易，就诊建立后挂号费作为待结费用并入门诊统一医保结算。","enum":["REGISTRATION","VISIT_UNIFIED"],"x-enumLabels":{"REGISTRATION":"挂号时结算","VISIT_UNIFIED":"诊间统一结算"}}}}',
    '{"timing":"VISIT_UNIFIED"}', '{"timing":"REGISTRATION"}', null, null,
    '["PLATFORM","TENANT","ORGANIZATION","DEPARTMENT"]', 'BUSINESS',
    true, true, false, 'NORMAL', 'PLAIN', 'ACTIVE', 0,
    timestamp with time zone '2026-10-19 00:00:00+08', 362387869790222, timestamp with time zone '2026-10-19 00:00:00+08', 362387869790222,
    null, null, 'DISABLE_AND_SUPPRESS'
);

insert into RHN_SYS_PARAM_CHG (
    ID_PARAM_CHG, ID_TNT, ID_PARAM_DEF, ID_PARAM_VAL, SD_TARGET_TYPE,
    SD_CHG_TYPE, JSON_BEFORE, JSON_AFTER, DES_CHG_REASON, CD_REQ,
    DT_CHANGED, ID_USER_CHANGED
) values (
    362387869796402, null, 362387869796401, null, 'DEFINITION',
    'CREATE', null,
    '{"source":"PRODUCT_BASELINE","key":"billing.registration.insurance-settlement","status":"ACTIVE"}',
    '初始化挂号医保结算时机参数',
    'v1.129.23:billing.registration.insurance-settlement',
    timestamp with time zone '2026-10-19 00:00:00+08', 362387869790222
);

-- 诊间统一结算模式下，医保挂号费并入后续门诊结算：挂号意向有费用账户但没有挂号结算单。
alter table RHN_BIL_REG_BIL_INTENT drop constraint CK_BIL_REG_BIL_IN_REG_BILL_FIN;
alter table RHN_BIL_REG_BIL_INTENT add constraint CK_BIL_REG_BIL_IN_REG_BILL_FIN check (
    (AMT_FEE = 0 and ID_PAT_ACCT is null and ID_STL is null)
    or (AMT_FEE > 0 and ID_PAT_ACCT is not null and (ID_STL is not null or SD_STL_MODE = 'MEDICAL_INSURANCE')));
