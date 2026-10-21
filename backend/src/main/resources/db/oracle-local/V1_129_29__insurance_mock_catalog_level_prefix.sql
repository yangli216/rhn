-- 医保 Mock 联调：thirdparty-mock-server 按医保目录编码首字母判定费用等级（X=甲类、Z=乙类、其余=自费）。
-- V1_129_26 生成的 MOCKYB 前缀会被统一判为自费，导致医保报销恒为 0。
-- 联调目录改为：诊疗项目 X 前缀（甲类，统筹报销），药品 Z 前缀（乙类，先行自付后报销）。
update RHN_BD_CONCEPT c
   set CD_CONCEPT = (case when exists (select 1 from RHN_BD_ITEM_TERM_MAP t
                                        join RHN_BD_ITEM_ATTR_SUBJECT s on s.ID_ITEM_ATTR_SUBJECT = t.ID_ITEM_ATTR_SUBJECT
                                       where t.ID_CONCEPT = c.ID_CONCEPT and s.SD_SUBJECT_TYPE = 'MEDICATION')
                         then 'ZYB' else 'XYB' end) || substr(c.CD_CONCEPT, -7),
       REVISION = c.REVISION + 1,
       DT_UPDATED = systimestamp
 where c.ID_CODE_SYSTEM = 362387869900801 and c.CD_CONCEPT like 'MOCKYB%';
