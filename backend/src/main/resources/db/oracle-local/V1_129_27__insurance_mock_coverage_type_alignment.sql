-- 医保 Mock 联调：演示患者的参保类型与 application-insurance-mock.yml 的医保注册资料（险种 310 职工 / 390 居民）对齐。
-- 诊间快捷预结算直接以患者保障类型匹配“机构+科室+险种”注册资料，原种子写入 01/02 会导致
-- “医保注册资料缺失或不唯一”。仅修正本地演示种子（ID_USER_CREATED = seed-insurance-mock），位于 db/oracle-local。
update RHN_INS_PAT_COVER
   set CD_COVER_TYPE = decode(CD_COVER_TYPE, '01', '310', '02', '390', CD_COVER_TYPE),
       REVISION = REVISION + 1,
       DT_UPDATED = systimestamp
 where ID_USER_CREATED = 'seed-insurance-mock' and CD_COVER_TYPE in ('01', '02');
