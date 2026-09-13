alter table RHN_BD_MED add column FG_ANTIMICROBIAL_OUTPATIENT boolean default false not null;
alter table RHN_BD_MED add column FG_ANTIMICROBIAL_CONSULT boolean default false not null;
alter table RHN_BD_MED add column FG_ANTIMICROBIAL_EMERGENCY boolean default false not null;
alter table RHN_BD_MED add column QTY_ANTIMICROBIAL_MAX_DAYS integer;
alter table RHN_BD_MED add column SD_SKIN_TEST_METHOD varchar(32);
alter table RHN_BD_MED add column SD_SKIN_TEST_SOLUTION_MODE varchar(32);
alter table RHN_BD_MED add column QTY_SKIN_TEST_OBS_MINUTES integer;
alter table RHN_BD_MED add column QTY_SKIN_TEST_VALID_HOURS integer;
alter table RHN_BD_MED add column DES_SKIN_TEST_INSTRUCTION varchar(1000);

update RHN_BD_MED
set FG_ANTIMICROBIAL_OUTPATIENT = true,
    QTY_ANTIMICROBIAL_MAX_DAYS = 7
where FG_ANTIMICROBIAL = true;

update RHN_BD_MED
set SD_SKIN_TEST_METHOD = 'INTRADERMAL',
    SD_SKIN_TEST_SOLUTION_MODE = 'DILUTED_SOLUTION',
    QTY_SKIN_TEST_OBS_MINUTES = 20,
    QTY_SKIN_TEST_VALID_HOURS = 24
where FG_SKIN_TEST_REQUIRED = true;

alter table RHN_BD_MED add constraint CK_BD_MED_AM_MAX_DAYS check
    (QTY_ANTIMICROBIAL_MAX_DAYS is null or QTY_ANTIMICROBIAL_MAX_DAYS between 1 and 90);
alter table RHN_BD_MED add constraint CK_BD_MED_SK_METHOD check
    (SD_SKIN_TEST_METHOD is null or SD_SKIN_TEST_METHOD in ('INTRADERMAL', 'PRICK', 'OTHER'));
alter table RHN_BD_MED add constraint CK_BD_MED_SK_SOLUTION check
    (SD_SKIN_TEST_SOLUTION_MODE is null or SD_SKIN_TEST_SOLUTION_MODE in ('ORIGINAL_SOLUTION', 'DILUTED_SOLUTION'));
alter table RHN_BD_MED add constraint CK_BD_MED_SK_OBS check
    (QTY_SKIN_TEST_OBS_MINUTES is null or QTY_SKIN_TEST_OBS_MINUTES between 1 and 120);
alter table RHN_BD_MED add constraint CK_BD_MED_SK_VALID check
    (QTY_SKIN_TEST_VALID_HOURS is null or QTY_SKIN_TEST_VALID_HOURS between 1 and 8760);

comment on column RHN_BD_MED.FG_ANTIMICROBIAL_OUTPATIENT is '抗菌药是否允许门诊常规开立';
comment on column RHN_BD_MED.FG_ANTIMICROBIAL_CONSULT is '抗菌药是否要求会诊或审批';
comment on column RHN_BD_MED.FG_ANTIMICROBIAL_EMERGENCY is '抗菌药是否允许紧急使用后补审批';
comment on column RHN_BD_MED.QTY_ANTIMICROBIAL_MAX_DAYS is '抗菌药门诊疗程上限天数';
comment on column RHN_BD_MED.SD_SKIN_TEST_METHOD is '药品默认皮试方式';
comment on column RHN_BD_MED.SD_SKIN_TEST_SOLUTION_MODE is '药品默认皮试液配置方式';
comment on column RHN_BD_MED.QTY_SKIN_TEST_OBS_MINUTES is '药品默认皮试观察分钟数';
comment on column RHN_BD_MED.QTY_SKIN_TEST_VALID_HOURS is '阴性皮试结果默认有效小时数';
comment on column RHN_BD_MED.DES_SKIN_TEST_INSTRUCTION is '皮试液配制与执行说明';
