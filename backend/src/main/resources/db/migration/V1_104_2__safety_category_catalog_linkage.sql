-- V1_104_1__safety_category_catalog_linkage.sql
-- Link Rational Medication Safety Categories with Standard Catalog Categories (H2 / PostgreSQL)

alter table RHN_AUD_MED_SAFETY_CAT add CD_CAT_MAJOR varchar(128);
alter table RHN_AUD_MED_SAFETY_CAT add CD_CAT_SUB varchar(128);
alter table RHN_AUD_MED_SAFETY_CAT add FG_SYSTEMIC_ONLY boolean default false not null;

-- 关联基线标准目录
update RHN_AUD_MED_SAFETY_CAT
   set CD_CAT_MAJOR = '一、抗微生物药',
       CD_CAT_SUB = '（八）喹诺酮类',
       FG_SYSTEMIC_ONLY = true
 where CD_CAT = 'QUINOLONE_PEDIATRIC_CONTRA';

update RHN_AUD_MED_SAFETY_CAT
   set CD_CAT_MAJOR = '四、镇痛、解热、抗炎、抗风湿、抗痛风药',
       CD_CAT_SUB = '（二）解热镇痛、抗炎、抗风湿药',
       FG_SYSTEMIC_ONLY = true
 where CD_CAT = 'SYSTEMIC_NSAID';
