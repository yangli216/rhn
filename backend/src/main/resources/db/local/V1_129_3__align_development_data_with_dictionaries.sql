-- Development sample values that were outside their dictionaries (see V1_129_2 and the 2026-10-14 dictionary audit).

-- Medication storage (BD_STORAGE_TYPE): temperature conditions only.
update RHN_BD_MED set SD_STORAGE_TYPE = 'ROOM_TEMPERATURE' where SD_STORAGE_TYPE in ('NORMAL', 'DRY');
update RHN_BD_MED set SD_STORAGE_TYPE = 'REFRIGERATED' where SD_STORAGE_TYPE = 'COLD_CHAIN';

-- Department type (DEPT_TYPE): use the national clinical subject codes instead of local CLIN_* codes.
update RHN_SYS_DEPT set SD_DEPT_TYPE = '07' where SD_DEPT_TYPE = 'CLIN_PEDIATRICS';
update RHN_SYS_DEPT set SD_DEPT_TYPE = '04' where SD_DEPT_TYPE = 'CLIN_GENERAL_SURGERY';
update RHN_SYS_DEPT set SD_DEPT_TYPE = '50' where SD_DEPT_TYPE = 'CLIN_TCM';
update RHN_SYS_DEPT set SD_DEPT_TYPE = '05' where SD_DEPT_TYPE = 'CLIN_OBSTETRICS_GYNECOLOGY';
update RHN_SYS_DEPT set SD_DEPT_TYPE = '02' where SD_DEPT_TYPE = 'CUSTOM_OTHER' and CD_DEPT = 'GENERAL';

-- Duplicate-order rule (BD_SERVICE_DUPLICATE_RULE): SAME_DAY is not a defined rule and nothing enforces it.
update RHN_BD_SVC_ITEM set SD_DUP_RULE = 'WARN' where SD_DUP_RULE = 'SAME_DAY';

-- Examination variant method (BD_SERVICE_VARIANT_METHOD): plain scan and PA projection are the standard method.
update RHN_BD_SVC_VAR set SD_METHOD_TYPE = 'STANDARD' where SD_METHOD_TYPE in ('PLAIN', 'PA');
