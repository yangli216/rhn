alter table RHN_BD_MED add (
    FG_ANTIMICROBIAL_OUTPATIENT number(1) default 0 not null,
    FG_ANTIMICROBIAL_CONSULT number(1) default 0 not null,
    FG_ANTIMICROBIAL_EMERGENCY number(1) default 0 not null,
    QTY_ANTIMICROBIAL_MAX_DAYS number(10),
    SD_SKIN_TEST_METHOD varchar2(32),
    SD_SKIN_TEST_SOLUTION_MODE varchar2(32),
    QTY_SKIN_TEST_OBS_MINUTES number(10),
    QTY_SKIN_TEST_VALID_HOURS number(10),
    DES_SKIN_TEST_INSTRUCTION varchar2(1000)
);

update RHN_BD_MED
set FG_ANTIMICROBIAL_OUTPATIENT = 1,
    QTY_ANTIMICROBIAL_MAX_DAYS = 7
where FG_ANTIMICROBIAL = 1;

update RHN_BD_MED
set SD_SKIN_TEST_METHOD = 'INTRADERMAL',
    SD_SKIN_TEST_SOLUTION_MODE = 'DILUTED_SOLUTION',
    QTY_SKIN_TEST_OBS_MINUTES = 20,
    QTY_SKIN_TEST_VALID_HOURS = 24
where FG_SKIN_TEST_REQUIRED = 1;

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
