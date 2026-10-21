-- 保障类型使用字典 INS_COVERAGE_TYPE（医疗费用类别 01/02…）；医保险种 310/390 在医保接入边界由后端映射。
-- 还原 V1_129_27 把演示参保类型改成 310/390 的做法（界面按字典显示，310 无字典项会显示成原始编码）。
update RHN_INS_PAT_COVER
   set CD_COVER_TYPE = decode(CD_COVER_TYPE, '310', '01', '390', '02', CD_COVER_TYPE),
       REVISION = REVISION + 1,
       DT_UPDATED = systimestamp
 where ID_USER_CREATED = 'seed-insurance-mock' and CD_COVER_TYPE in ('310', '390');
