alter table RHN_META_OP_PLAN_DIAG add column CD_CODE_SYSTEM varchar(64) default 'WHO.BD.CS.ICD10' not null;
alter table RHN_META_OP_PLAN_DIAG add column SD_DIAG_DOMAIN varchar(32) default 'WESTERN_MEDICINE' not null;
alter table RHN_META_OP_PLAN_DIAG add constraint CK_META_OP_PLAN_DIAG_DOMAIN
    check (SD_DIAG_DOMAIN in ('WESTERN_MEDICINE', 'TCM_DISEASE', 'TCM_SYNDROME'));

comment on column RHN_META_OP_PLAN_DIAG.CD_CODE_SYSTEM is '诊断编码体系快照';
comment on column RHN_META_OP_PLAN_DIAG.SD_DIAG_DOMAIN is '诊断领域：西医、中医病名或中医证候';
