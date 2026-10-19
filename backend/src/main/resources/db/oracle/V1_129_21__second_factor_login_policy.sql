-- 等保三级双因子：口令登录后是否必须再完成扫码或证书（UKey）认证；缺值时不要求，应急账号由部署配置豁免并单独审计。
insert into RHN_SYS_PARAM_DEF (
    ID_PARAM_DEF, ID_PARAM_CAT, CD_PARAM_KEY, NA_PARAM_DEF, DES_PARAM_DEF,
    SD_VAL_TYPE, SD_CONTROL_TYPE, JSON_SCHEMA, JSON_DEFAULT_VAL, JSON_EXAMPLE_VAL,
    UNIT, CD_DICT, JSON_SCOPE, SD_PARAM_CAT, FG_INHRT, FG_CACHE,
    FG_NULLBL_VAL, SENS, SD_DISPLAY_POLICY, SD_STATUS, REVISION,
    DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED,
    CD_DEPENDS_ON_KEY, EXPR_DEPENDS_ON_VAL, SD_DEPNCY_BEHAV
) values (
    362387869796301, 362387869794002,
    'platform.identity.second-factor.policy',
    '登录双因子要求',
    '控制口令登录后是否必须再用手机扫码或证书（UKey）确认身份；扫码和证书登录本身已满足双因子。启用前请确认相关账号已绑定 CA 签名人，并在部署配置中保留应急账号。',
    'JSON', 'JSON_EDITOR', to_clob('{"type":"object","additionalProperties":false,"required":["mode"],"properties":{"mode":{"type":"string","title":"双因子要求","description":"不要求：口令即可登录；特权账号必须：拥有账号授权、系统维护或 AI 配置管理权限的账号必须完成第二步；所有账号必须：全部账号口令登录后都要完成第二步。","enum":["NONE","REQUIRED_FOR_PRIVILEGED","REQUIRED"],"x-enumLabels":{"NONE":"不要求","REQUIRED_FOR_PRIVILEGED":"特权账号必须","REQUIRED":"所有账号必须"}}}}'),
    to_clob('{"mode":"NONE"}'), to_clob('{"mode":"REQUIRED_FOR_PRIVILEGED"}'), null, null,
    to_clob('["PLATFORM","TENANT"]'), 'SYSTEM',
    1, 1, 0, 'NORMAL', 'PLAIN', 'ACTIVE', 0,
    to_timestamp_tz('2026-10-18 00:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 362387869790222, to_timestamp_tz('2026-10-18 00:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 362387869790222,
    null, null, 'DISABLE_AND_SUPPRESS'
);

insert into RHN_SYS_PARAM_CHG (
    ID_PARAM_CHG, ID_TNT, ID_PARAM_DEF, ID_PARAM_VAL, SD_TARGET_TYPE,
    SD_CHG_TYPE, JSON_BEFORE, JSON_AFTER, DES_CHG_REASON, CD_REQ,
    DT_CHANGED, ID_USER_CHANGED
) values (
    362387869796302, null, 362387869796301, null, 'DEFINITION',
    'CREATE', null,
    to_clob('{"source":"PRODUCT_BASELINE","key":"platform.identity.second-factor.policy","status":"ACTIVE"}'),
    '初始化登录双因子要求参数',
    'v1.129.21:platform.identity.second-factor.policy',
    to_timestamp_tz('2026-10-18 00:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 362387869790222
);
