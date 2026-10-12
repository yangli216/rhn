-- V1_108_0__primary_care_medication_safety_categories.sql
-- Enrich baseline safety categories and add essential primary care rational drug use categories (Oracle)

-- 1. 补齐既有系统预置分类的药品成员（阿司匹林、双硫仑致敏抗菌药、含乙醇辅料制剂）
insert into RHN_AUD_MED_SAFETY_CAT_MBR (ID_MEMBER, ID_TNT, ID_SAFETY_CAT, ID_MED, CD_MED, NA_MED_SNAP, PREP_SPEC_SNAP, DOSE_FORM_SNAP, REVISION)
select 362387869899500 + row_number() over (order by m.ID_MED),
       m.ID_TNT, 362387869899305, m.ID_MED, m.CD_MED, m.NA_MED, m.PREP_SPEC, m.DOSE_FORM, 0
  from RHN_BD_MED m
 where m.ID_TNT = 362387869790209
   and (m.NA_MED like '%阿司匹林%' or m.NA_ALIAS like '%阿司匹林%')
   and not exists (select 1 from RHN_AUD_MED_SAFETY_CAT_MBR b where b.ID_SAFETY_CAT = 362387869899305 and b.ID_MED = m.ID_MED);

insert into RHN_AUD_MED_SAFETY_CAT_MBR (ID_MEMBER, ID_TNT, ID_SAFETY_CAT, ID_MED, CD_MED, NA_MED_SNAP, PREP_SPEC_SNAP, DOSE_FORM_SNAP, REVISION)
select 362387869899600 + row_number() over (order by m.ID_MED),
       m.ID_TNT, 362387869899301, m.ID_MED, m.CD_MED, m.NA_MED, m.PREP_SPEC, m.DOSE_FORM, 0
  from RHN_BD_MED m
 where m.ID_TNT = 362387869790209
   and (m.NA_MED like '%头孢%' or m.NA_MED like '%甲硝唑%' or m.NA_MED like '%替硝唑%' or m.NA_MED like '%奥硝唑%' or m.NA_MED like '%呋喃唑酮%')
   and not exists (select 1 from RHN_AUD_MED_SAFETY_CAT_MBR b where b.ID_SAFETY_CAT = 362387869899301 and b.ID_MED = m.ID_MED);

insert into RHN_AUD_MED_SAFETY_CAT_MBR (ID_MEMBER, ID_TNT, ID_SAFETY_CAT, ID_MED, CD_MED, NA_MED_SNAP, PREP_SPEC_SNAP, DOSE_FORM_SNAP, REVISION)
select 362387869899700 + row_number() over (order by m.ID_MED),
       m.ID_TNT, 362387869899302, m.ID_MED, m.CD_MED, m.NA_MED, m.PREP_SPEC, m.DOSE_FORM, 0
  from RHN_BD_MED m
 where m.ID_TNT = 362387869790209
   and (m.NA_MED like '%藿香正气水%' or m.NA_MED like '%十滴水%' or m.NA_MED like '%氢化可的松注射液%' or m.NA_MED like '%复方甘草口服溶液%' or m.NA_MED like '%酊%')
   and not exists (select 1 from RHN_AUD_MED_SAFETY_CAT_MBR b where b.ID_SAFETY_CAT = 362387869899302 and b.ID_MED = m.ID_MED);

-- 2. 新增覆盖常用且重要的基层合理用药核心分类
-- 2.1 儿童青少年禁用四环素类抗生素
insert into RHN_AUD_MED_SAFETY_CAT (ID_SAFETY_CAT, ID_TNT, CD_CAT, NA_CAT, SD_RULE_KIND, DES_RATNL, FG_SYSTEM, SD_STATUS, REVISION, CD_CAT_MAJOR, CD_CAT_SUB, FG_SYSIC_ONLY)
values (362387869899311, 362387869790209, 'TETRACYCLINE_PEDIATRIC_CONTRA', '儿童青少年禁用四环素类', 'AGE_CONTRAINDICATION', '8周岁以下儿童骨骼和牙齿发育期禁用，易致四环素牙永久性黄染及牙釉质发育不良。', 1, 'ACTIVE', 0, '一、抗微生物药', '（四）四环素类', 1);

-- 2.2 儿童及特殊人群禁用氨基糖苷类
insert into RHN_AUD_MED_SAFETY_CAT (ID_SAFETY_CAT, ID_TNT, CD_CAT, NA_CAT, SD_RULE_KIND, DES_RATNL, FG_SYSTEM, SD_STATUS, REVISION, CD_CAT_MAJOR, CD_CAT_SUB, FG_SYSIC_ONLY)
values (362387869899312, 362387869790209, 'AMINOGLYCOSIDE_PEDIATRIC_CONTRA', '儿童及特殊人群禁用氨基糖苷类', 'AGE_CONTRAINDICATION', '6周岁以下儿童及婴幼儿禁忌，具有不可逆耳蜗及前庭神经毒性（药物性耳聋高危）与急性肾毒性。', 1, 'ACTIVE', 0, '一、抗微生物药', '（三）氨基糖苷类', 1);

-- 2.3 质子泵抑制剂类抑酸药（重复用药）
insert into RHN_AUD_MED_SAFETY_CAT (ID_SAFETY_CAT, ID_TNT, CD_CAT, NA_CAT, SD_RULE_KIND, DES_RATNL, FG_SYSTEM, SD_STATUS, REVISION, CD_CAT_MAJOR, CD_CAT_SUB, FG_SYSIC_ONLY)
values (362387869899313, 362387869790209, 'PPI_DUPLICATE_THERAPY', '质子泵抑制剂类抑酸药', 'DUPLICATE_THERAPY', '口服或注射质子泵抑制剂（PPI）同方或重复开立，无协同增益，而成倍增加低镁血症、艰难梭菌肠炎与骨折风险。', 1, 'ACTIVE', 0, '九、消化系统用药', null, 1);

insert into RHN_AUD_MED_SAFETY_CAT_MBR (ID_MEMBER, ID_TNT, ID_SAFETY_CAT, ID_MED, CD_MED, NA_MED_SNAP, PREP_SPEC_SNAP, DOSE_FORM_SNAP, REVISION)
select 362387869899800 + row_number() over (order by m.ID_MED),
       m.ID_TNT, 362387869899313, m.ID_MED, m.CD_MED, m.NA_MED, m.PREP_SPEC, m.DOSE_FORM, 0
  from RHN_BD_MED m
 where m.ID_TNT = 362387869790209
   and (m.NA_MED like '%奥美拉唑%' or m.NA_MED like '%雷贝拉唑%' or m.NA_MED like '%泮托拉唑%' or m.NA_MED like '%兰索拉唑%')
   and not exists (select 1 from RHN_AUD_MED_SAFETY_CAT_MBR b where b.ID_SAFETY_CAT = 362387869899313 and b.ID_MED = m.ID_MED);

-- 2.4 ACEI与ARB降压药重复用药
insert into RHN_AUD_MED_SAFETY_CAT (ID_SAFETY_CAT, ID_TNT, CD_CAT, NA_CAT, SD_RULE_KIND, DES_RATNL, FG_SYSTEM, SD_STATUS, REVISION, CD_CAT_MAJOR, CD_CAT_SUB, FG_SYSIC_ONLY)
values (362387869899314, 362387869790209, 'RASI_DUPLICATE_THERAPY', 'ACEI与ARB降压药重复用药', 'DUPLICATE_THERAPY', '普利类与沙坦类降压药双重阻断RAAS系统，临床指南明确禁止联用，可致严重高钾血症及急性肾功能衰竭。', 1, 'ACTIVE', 0, '七、心血管系统用药', null, 1);

insert into RHN_AUD_MED_SAFETY_CAT_MBR (ID_MEMBER, ID_TNT, ID_SAFETY_CAT, ID_MED, CD_MED, NA_MED_SNAP, PREP_SPEC_SNAP, DOSE_FORM_SNAP, REVISION)
select 362387869899900 + row_number() over (order by m.ID_MED),
       m.ID_TNT, 362387869899314, m.ID_MED, m.CD_MED, m.NA_MED, m.PREP_SPEC, m.DOSE_FORM, 0
  from RHN_BD_MED m
 where m.ID_TNT = 362387869790209
   and (m.NA_MED like '%普利%' or m.NA_MED like '%沙坦%')
   and not exists (select 1 from RHN_AUD_MED_SAFETY_CAT_MBR b where b.ID_SAFETY_CAT = 362387869899314 and b.ID_MED = m.ID_MED);

-- 2.5 镇静催眠类药物重复用药
insert into RHN_AUD_MED_SAFETY_CAT (ID_SAFETY_CAT, ID_TNT, CD_CAT, NA_CAT, SD_RULE_KIND, DES_RATNL, FG_SYSTEM, SD_STATUS, REVISION, CD_CAT_MAJOR, CD_CAT_SUB, FG_SYSIC_ONLY)
values (362387869899315, 362387869790209, 'SEDATIVE_HYPNOTIC_DUPLICATE', '镇静催眠类药物重复用药', 'DUPLICATE_THERAPY', '联合使用两种或以上镇静催眠药（地西泮、佐匹克隆、艾司唑仑等），易导致过度镇静、呼吸抑制及老年跌倒骨折。', 1, 'ACTIVE', 0, '六、治疗精神障碍药', '（五）镇静催眠药', 1);

-- 2.6 大环内酯类抗菌药相互作用
insert into RHN_AUD_MED_SAFETY_CAT (ID_SAFETY_CAT, ID_TNT, CD_CAT, NA_CAT, SD_RULE_KIND, DES_RATNL, FG_SYSTEM, SD_STATUS, REVISION, CD_CAT_MAJOR, CD_CAT_SUB, FG_SYSIC_ONLY)
values (362387869899316, 362387869790209, 'MACROLIDE_STATIN_INTERACTION', '大环内酯类抗菌药', 'DRUG_INTERACTION', '红霉素、克拉霉素强效抑制CYP3A4代谢酶，与经CYP3A4代谢的他汀类降脂药联用显著升高血药浓度，诱发致死性横纹肌溶解。', 1, 'ACTIVE', 0, '一、抗微生物药', '（五）大环内酯类', 1);

-- 2.7 妊娠期禁用致畸高危药物
insert into RHN_AUD_MED_SAFETY_CAT (ID_SAFETY_CAT, ID_TNT, CD_CAT, NA_CAT, SD_RULE_KIND, DES_RATNL, FG_SYSTEM, SD_STATUS, REVISION)
values (362387869899317, 362387869790209, 'PREGNANCY_CONTRA_CATEGORY_X', '妊娠期禁用致畸高危药物', 'SPECIAL_POPULATION_CONTRAINDICATION', '临床证实对人类胎儿具有明确致畸性或胚胎致死风险（FDA X级/禁忌），育龄期备孕及妊娠期妇女严禁使用。', 1, 'ACTIVE', 0);

insert into RHN_AUD_MED_SAFETY_CAT_MBR (ID_MEMBER, ID_TNT, ID_SAFETY_CAT, ID_MED, CD_MED, NA_MED_SNAP, PREP_SPEC_SNAP, DOSE_FORM_SNAP, REVISION)
select 362387869900000 + row_number() over (order by m.ID_MED),
       m.ID_TNT, 362387869899317, m.ID_MED, m.CD_MED, m.NA_MED, m.PREP_SPEC, m.DOSE_FORM, 0
  from RHN_BD_MED m
 where m.ID_TNT = 362387869790209
   and (m.NA_MED like '%利巴韦林%' or m.NA_MED like '%甲氨蝶呤%' or m.NA_MED like '%他汀%' or m.NA_MED like '%华法林%')
   and not exists (select 1 from RHN_AUD_MED_SAFETY_CAT_MBR b where b.ID_SAFETY_CAT = 362387869899317 and b.ID_MED = m.ID_MED);
