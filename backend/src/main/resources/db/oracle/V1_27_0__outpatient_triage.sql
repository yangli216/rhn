-- =============================================================================
-- Outpatient Pre-examination and Triage Table (Oracle)
-- =============================================================================

create table RHN_OP_TRIAGE_REC (
    ID_TRIAGE_REC number(19) not null,
    ID_TNT number(19) not null,
    ID_ORG number(19) not null,
    ID_RESIDENT number(19),
    ID_ENC number(19),
    ID_PAT_REG number(19),
    CD_TRIAGE_NO varchar2(64) not null,
    DT_TRIAGE timestamp with time zone not null,
    ID_TRIAGE_NURSE varchar2(64),
    NA_TRIAGE_NURSE varchar2(100),
    NA_PATIENT varchar2(100) not null,
    SD_GENDER varchar2(20) not null,
    AGE number(10),
    DT_BIRTH date,
    NO_PHONE varchar2(30),
    NO_ID_CARD varchar2(30),
    NO_HEALTH_RECORD varchar2(64),
    SD_ARRIVAL_METHOD varchar2(32) default 'WALK_IN',
    SD_COMPANION_TYPE varchar2(32) default 'NONE',
    DES_CHIEF_COMPLAINT varchar2(1000),
    TXT_SYMPTOMS varchar2(1000),
    VAL_TEMP number(4, 1),
    VAL_PULSE number(4, 0),
    VAL_RESP number(4, 0),
    VAL_SBP number(4, 0),
    VAL_DBP number(4, 0),
    VAL_SPO2 number(4, 1),
    VAL_GLUCOSE number(4, 1),
    VAL_PAIN number(10),
    SD_CONSCIOUSNESS varchar2(32) default 'ALERT',
    FG_FEVER number(1) default 0 not null,
    TXT_EPIDEMIC varchar2(1000),
    TXT_RISK_TAGS varchar2(1000),
    SD_TRIAGE_LEVEL varchar2(32) default 'LEVEL_4_NON_URGENT' not null,
    DES_TRIAGE_REASON varchar2(1000),
    ID_TARGET_DEPT number(19),
    NA_TARGET_DEPT varchar2(100),
    ID_TARGET_DOC varchar2(64),
    NA_TARGET_DOC varchar2(100),
    SD_GREEN_CHANNEL varchar2(32) default 'NONE',
    SD_DISPOSITION varchar2(32) default 'WAITING_QUEUE',
    SD_STATUS varchar2(32) default 'RECORDED' not null,
    TXT_NOTES varchar2(1000),
    REVISION number(19) default 0 not null,
    DT_CREATED timestamp with time zone not null,
    DT_UPDATED timestamp with time zone not null,
    constraint PK_OP_TRIAGE_REC primary key (ID_TRIAGE_REC),
    constraint UK_OP_TRIAGE_NO unique (ID_TNT, CD_TRIAGE_NO)
);

create index IDX_OP_TRIAGE_DATE on RHN_OP_TRIAGE_REC (ID_TNT, ID_ORG, DT_TRIAGE);
create index IDX_OP_TRIAGE_RESIDENT on RHN_OP_TRIAGE_REC (ID_TNT, ID_RESIDENT);
create index IDX_OP_TRIAGE_ENC on RHN_OP_TRIAGE_REC (ID_TNT, ID_ENC);
create index IDX_OP_TRIAGE_LEVEL on RHN_OP_TRIAGE_REC (ID_TNT, SD_TRIAGE_LEVEL);

insert into RHN_SYS_ACC_PERM (ID_ACC_PERM, ID_TNT, ID_MGMT_MOD, CD_ACC_PERM, NA_ACC_PERM, CD_ACTION, CD_RSRC, SD_STATUS)
values (362387869896170, 362387869790209, 362387869896002, 'OUTPATIENT_TRIAGE.ACCESS', '访问门诊预检分诊', 'ACCESS', 'OUTPATIENT_TRIAGE', 'ACTIVE');

insert into RHN_SYS_ROLE_PERM_ASSIGN (ID_ROLE_PERM_ASSIGN, ID_TNT, ID_ACC_ROLE, ID_ACC_PERM, DT_VALID_FROM, DT_VALID_TO, ID_USER_GRANTED, DT_CREATED)
values (362387869896270, 362387869790209, 362387869796001, 362387869896170, TIMESTAMP '2026-09-04 22:38:12.436772+08:00', null, 362387869790222, TIMESTAMP '2026-09-04 22:38:12.436772+08:00');
