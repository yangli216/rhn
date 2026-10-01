-- Shared decision settings retain their keys, credentials and overrides. New scenes opt in independently.

update RHN_SYS_PARAM_DEF set NA_PARAM_DEF='决策总开关', DES_PARAM_DEF='所有业务场景共用的决策模式；关闭、旁路观察或辅助匹配' where CD_PARAM_KEY='ai.clinical.decision-mode';

insert into RHN_SYS_PARAM_DEF (ID_PARAM_DEF, ID_PARAM_CAT, CD_PARAM_KEY, NA_PARAM_DEF, DES_PARAM_DEF, SD_VAL_TYPE, SD_CONTROL_TYPE, JSON_SCHEMA, JSON_DEFAULT_VAL, JSON_SCOPE, SD_PARAM_CAT, FG_INHRT, FG_CACHE, FG_NULLBL_VAL, SENS, SD_DISPLAY_POLICY, SD_STATUS, REVISION, DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED)
select 362387869796206, ID_PARAM_CAT, 'ai.clinical.decision-scene-assistant-recommendations-enabled', '辅诊建议决策启用', '受决策总开关控制，模型、密钥、超时及置信度与其他场景共用', 'BOOLEAN', 'SWITCH', to_clob('{"type":"boolean"}'), to_clob('true'), to_clob('["PLATFORM","TENANT"]'), 'BUSINESS', 1, 0, 0, 'NORMAL', 'PLAIN', 'ACTIVE', 0, CURRENT_TIMESTAMP, ID_USER_CREATED, CURRENT_TIMESTAMP, ID_USER_UPDATED
from RHN_SYS_PARAM_DEF where CD_PARAM_KEY='ai.clinical.decision-mode';

insert into RHN_SYS_PARAM_DEF (ID_PARAM_DEF, ID_PARAM_CAT, CD_PARAM_KEY, NA_PARAM_DEF, DES_PARAM_DEF, SD_VAL_TYPE, SD_CONTROL_TYPE, JSON_SCHEMA, JSON_DEFAULT_VAL, JSON_SCOPE, SD_PARAM_CAT, FG_INHRT, FG_CACHE, FG_NULLBL_VAL, SENS, SD_DISPLAY_POLICY, SD_STATUS, REVISION, DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED)
select 362387869796207, ID_PARAM_CAT, 'ai.clinical.decision-scene-plan-compilation-enabled', '智能建方决策启用', '受决策总开关控制，模型、密钥、超时及置信度与其他场景共用', 'BOOLEAN', 'SWITCH', to_clob('{"type":"boolean"}'), to_clob('false'), to_clob('["PLATFORM","TENANT"]'), 'BUSINESS', 1, 0, 0, 'NORMAL', 'PLAIN', 'ACTIVE', 0, CURRENT_TIMESTAMP, ID_USER_CREATED, CURRENT_TIMESTAMP, ID_USER_UPDATED
from RHN_SYS_PARAM_DEF where CD_PARAM_KEY='ai.clinical.decision-mode';
