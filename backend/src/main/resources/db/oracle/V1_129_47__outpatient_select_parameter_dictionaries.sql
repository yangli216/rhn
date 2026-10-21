-- 门诊下拉选择参数补绑系统枚举字典：参数平台按绑定字典校验写入值，未绑定时无法保存当前值。
update RHN_SYS_PARAM_DEF set CD_DICT = 'OUT_ALLERGY_VERIFICATION_MODE', REVISION = REVISION + 1
where CD_PARAM_KEY = 'outpatient.medication.allergy-verification.mode' and CD_DICT is null;
update RHN_SYS_PARAM_DEF set CD_DICT = 'OUT_ORDER_REVIEW_MODE', REVISION = REVISION + 1
where CD_PARAM_KEY = 'outpatient.doctor-workstation.order-review-mode' and CD_DICT is null;
update RHN_SYS_PARAM_DEF set CD_DICT = 'OUT_COMPLETION_MODE', REVISION = REVISION + 1
where CD_PARAM_KEY = 'outpatient.doctor-workstation.completion-mode' and CD_DICT is null;
update RHN_SYS_PARAM_DEF set CD_DICT = 'OUT_REGISTRATION_CUTOFF_MODE', REVISION = REVISION + 1
where CD_PARAM_KEY = 'outpatient.registration.validity.cutoff-mode' and CD_DICT is null;

insert into RHN_SYS_PARAM_CHG (
    ID_PARAM_CHG, ID_TNT, ID_PARAM_DEF, ID_PARAM_VAL, SD_TARGET_TYPE,
    SD_CHG_TYPE, JSON_BEFORE, JSON_AFTER, DES_CHG_REASON, CD_REQ,
    DT_CHANGED, ID_USER_CHANGED
)
select 362387869796216, null, ID_PARAM_DEF, null, 'DEFINITION', 'UPDATE', to_clob('{"dictionaryCode":null}'),
       to_clob('{"dictionaryCode":"OUT_ORDER_REVIEW_MODE"}'), '下拉选择参数绑定系统枚举字典',
       'v1.129.47:outpatient.doctor-workstation.order-review-mode',
       to_timestamp_tz('2026-10-21 00:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 362387869790222
from RHN_SYS_PARAM_DEF where CD_PARAM_KEY = 'outpatient.doctor-workstation.order-review-mode'
union all
select 362387869796217, null, ID_PARAM_DEF, null, 'DEFINITION', 'UPDATE', to_clob('{"dictionaryCode":null}'),
       to_clob('{"dictionaryCode":"OUT_COMPLETION_MODE"}'), '下拉选择参数绑定系统枚举字典',
       'v1.129.47:outpatient.doctor-workstation.completion-mode',
       to_timestamp_tz('2026-10-21 00:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 362387869790222
from RHN_SYS_PARAM_DEF where CD_PARAM_KEY = 'outpatient.doctor-workstation.completion-mode'
union all
select 362387869796218, null, ID_PARAM_DEF, null, 'DEFINITION', 'UPDATE', to_clob('{"dictionaryCode":null}'),
       to_clob('{"dictionaryCode":"OUT_REGISTRATION_CUTOFF_MODE"}'), '下拉选择参数绑定系统枚举字典',
       'v1.129.47:outpatient.registration.validity.cutoff-mode',
       to_timestamp_tz('2026-10-21 00:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 362387869790222
from RHN_SYS_PARAM_DEF where CD_PARAM_KEY = 'outpatient.registration.validity.cutoff-mode' union all
select 362387869796219, null, ID_PARAM_DEF, null, 'DEFINITION', 'UPDATE', to_clob('{"dictionaryCode":null}'),
       to_clob('{"dictionaryCode":"OUT_ALLERGY_VERIFICATION_MODE"}'), '下拉选择参数绑定系统枚举字典',
       'v1.129.47:outpatient.medication.allergy-verification.mode',
       to_timestamp_tz('2026-10-21 00:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 362387869790222
from RHN_SYS_PARAM_DEF where CD_PARAM_KEY = 'outpatient.medication.allergy-verification.mode';
