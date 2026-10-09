-- V1_104_0__medication_safety_categories.sql
-- Rational Medication Safety Classification & Member Management (Oracle)

create table RHN_AUD_MED_SAFETY_CAT (
    ID_SAFETY_CAT number(19) not null,
    ID_TNT number(19) not null,
    CD_CAT varchar2(64 char) not null,
    NA_CAT varchar2(128 char) not null,
    SD_RULE_KIND varchar2(64 char) not null,
    DES_RATIONALE varchar2(512 char),
    FG_SYSTEM number(1) default 1 not null,
    SD_STATUS varchar2(32 char) default 'ACTIVE' not null,
    REVISION number(10) default 0 not null,
    DT_CREATED timestamp with time zone default systimestamp not null,
    ID_USER_CREATED number(19),
    DT_UPDATED timestamp with time zone default systimestamp not null,
    ID_USER_UPDATED number(19),
    constraint PK_QMED_SAFETY_CAT primary key (ID_SAFETY_CAT),
    constraint UK_QMED_SAFETY_CAT unique (ID_TNT, CD_CAT)
);

create table RHN_AUD_MED_SAFETY_CAT_MBR (
    ID_MEMBER number(19) not null,
    ID_TNT number(19) not null,
    ID_SAFETY_CAT number(19) not null,
    ID_MED number(19),
    CD_MED varchar2(64 char),
    NA_MED_SNAP varchar2(128 char) not null,
    PREP_SPEC_SNAP varchar2(128 char),
    DOSE_FORM_SNAP varchar2(64 char),
    REVISION number(10) default 0 not null,
    DT_CREATED timestamp with time zone default systimestamp not null,
    ID_USER_CREATED number(19),
    constraint PK_QMED_SAFETY_MBR primary key (ID_MEMBER),
    constraint FK_QMED_MBR_CAT foreign key (ID_SAFETY_CAT) references RHN_AUD_MED_SAFETY_CAT(ID_SAFETY_CAT) on delete cascade
);

create index IX_QMED_MBR_MED on RHN_AUD_MED_SAFETY_CAT_MBR(ID_TNT, ID_MED);
create index IX_QMED_MBR_CAT on RHN_AUD_MED_SAFETY_CAT_MBR(ID_TNT, ID_SAFETY_CAT);

-- 预置 5 大基线合理用药安全分类
insert into RHN_AUD_MED_SAFETY_CAT (ID_SAFETY_CAT, ID_TNT, CD_CAT, NA_CAT, SD_RULE_KIND, DES_RATIONALE, FG_SYSTEM, SD_STATUS, REVISION)
values (362387869899301, 362387869790209, 'DISULFIRAM_INDUCER', '双硫仑反应致敏抗菌药', 'DRUG_INTERACTION', '具有甲硫四氮唑或类似侧链，抑制乙醛脱氢酶；与含乙醇制剂同方或短间隔联用可致乙醛急性蓄积中毒。', 1, 'ACTIVE', 0);

insert into RHN_AUD_MED_SAFETY_CAT (ID_SAFETY_CAT, ID_TNT, CD_CAT, NA_CAT, SD_RULE_KIND, DES_RATIONALE, FG_SYSTEM, SD_STATUS, REVISION)
values (362387869899302, 362387869790209, 'ETHANOL_SOLVENT', '含乙醇辅料与溶剂制剂', 'DRUG_INTERACTION', '药品制剂中含有乙醇作为溶剂或赋形剂，与双硫仑反应致敏药物联合使用具有致死性配伍禁忌风险。', 1, 'ACTIVE', 0);

insert into RHN_AUD_MED_SAFETY_CAT (ID_SAFETY_CAT, ID_TNT, CD_CAT, NA_CAT, SD_RULE_KIND, DES_RATIONALE, FG_SYSTEM, SD_STATUS, REVISION)
values (362387869899303, 362387869790209, 'SYSTEMIC_NSAID', '全身作用非甾体抗炎药', 'DUPLICATE_THERAPY', '口服或注射给药的全身性 NSAIDs，联合使用不增加镇痛疗效，而成倍增加胃肠道穿孔大出血及急性肾损伤风险。', 1, 'ACTIVE', 0);

insert into RHN_AUD_MED_SAFETY_CAT (ID_SAFETY_CAT, ID_TNT, CD_CAT, NA_CAT, SD_RULE_KIND, DES_RATIONALE, FG_SYSTEM, SD_STATUS, REVISION)
values (362387869899304, 362387869790209, 'QUINOLONE_PEDIATRIC_CONTRA', '儿童青少年禁忌氟喹诺酮类', 'AGE_CONTRAINDICATION', '18周岁以下骨骼发育期儿童及青少年使用有潜在软骨发育损害高危风险，禁忌常规开立。', 1, 'ACTIVE', 0);

insert into RHN_AUD_MED_SAFETY_CAT (ID_SAFETY_CAT, ID_TNT, CD_CAT, NA_CAT, SD_RULE_KIND, DES_RATIONALE, FG_SYSTEM, SD_STATUS, REVISION)
values (362387869899305, 362387869790209, 'ASPIRIN_PEDIATRIC_CONTRA', '儿童发热禁忌阿司匹林制剂', 'AGE_CONTRAINDICATION', '12周岁以下儿童病毒性感染发热使用阿司匹林解热镇痛，存在诱发致死性瑞氏综合征（Reye综合征）风险。', 1, 'ACTIVE', 0);

-- 从现有 RHN_BD_MED 自动匹配并初始化已有药品成员 (双氯芬酸钠)
insert into RHN_AUD_MED_SAFETY_CAT_MBR (ID_MEMBER, ID_TNT, ID_SAFETY_CAT, ID_MED, CD_MED, NA_MED_SNAP, PREP_SPEC_SNAP, DOSE_FORM_SNAP, REVISION)
select 362387869899400 + row_number() over (order by m.ID_MED),
       m.ID_TNT, 362387869899303, m.ID_MED, m.CD_MED, m.NA_MED, m.PREP_SPEC, m.DOSE_FORM, 0
  from RHN_BD_MED m
 where m.ID_TNT = 362387869790209
   and m.NA_MED like '%双氯芬酸%'
   and not exists (select 1 from RHN_AUD_MED_SAFETY_CAT_MBR b where b.ID_SAFETY_CAT = 362387869899303 and b.ID_MED = m.ID_MED);
