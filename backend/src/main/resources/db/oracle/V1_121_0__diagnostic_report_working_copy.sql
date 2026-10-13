-- Simple saved working copy and optional second signer; no approval state machine.
create table RHN_EX_DIAG_DRAFT (
    ID_DIAG_DRAFT number(19),
    REVISION number(19) not null default 0,
    ID_TNT number(19) not null,
    ID_DIAG_EXEC_TASK number(19) not null,
    JSON_CONTENT clob not null,
    ID_USER_AUTHOR number(19) not null,
    NA_AUTHOR varchar2(100 char) not null,
    DT_UPDATED timestamp with time zone not null,
    ID_DIAG_REPORT number(19),
    CD_CMD varchar2(64 char),
    constraint PK_EX_DIAG_DRAFT primary key (ID_DIAG_DRAFT),
    constraint UK_EX_DIAG_DRAFT_TASK unique (ID_TNT, ID_DIAG_EXEC_TASK),
    constraint FK_EX_DIAG_DRAFT_TASK foreign key (ID_DIAG_EXEC_TASK) references RHN_EX_DIAG_EXEC_TASK(ID_DIAG_EXEC_TASK),
    constraint FK_EX_DIAG_DRAFT_REPORT foreign key (ID_DIAG_REPORT) references RHN_EX_DIAG_REPORT(ID_DIAG_REPORT)
);
comment on table RHN_EX_DIAG_DRAFT is '医技报告草稿；每个执行任务一份当前工作内容';
comment on column RHN_EX_DIAG_DRAFT.ID_DIAG_DRAFT is '报告草稿主键';
comment on column RHN_EX_DIAG_DRAFT.REVISION is '乐观锁版本';
comment on column RHN_EX_DIAG_DRAFT.ID_TNT is '租户标识';
comment on column RHN_EX_DIAG_DRAFT.ID_DIAG_EXEC_TASK is '医技执行任务';
comment on column RHN_EX_DIAG_DRAFT.JSON_CONTENT is '报告工作内容JSON';
comment on column RHN_EX_DIAG_DRAFT.ID_USER_AUTHOR is '最后录入人';
comment on column RHN_EX_DIAG_DRAFT.NA_AUTHOR is '录入人名称快照';
comment on column RHN_EX_DIAG_DRAFT.DT_UPDATED is '最后更新时间';
comment on column RHN_EX_DIAG_DRAFT.ID_DIAG_REPORT is '已签发的报告版本';
comment on column RHN_EX_DIAG_DRAFT.CD_CMD is '签发请求幂等键';
alter table RHN_EX_DIAG_REPORT add DES_FINDING clob;
comment on column RHN_EX_DIAG_REPORT.DES_FINDING is '检查所见';
alter table RHN_EX_DIAG_REPORT add ID_USER_AUTHOR number(19);
comment on column RHN_EX_DIAG_REPORT.ID_USER_AUTHOR is '本地报告录入人主体';
alter table RHN_EX_DIAG_REPORT add ID_USER_SIGNER number(19);
comment on column RHN_EX_DIAG_REPORT.ID_USER_SIGNER is '实际签发人主体';
alter table RHN_EX_DIAG_REPORT add NA_SIGNER varchar2(100 char);
comment on column RHN_EX_DIAG_REPORT.NA_SIGNER is '签发人名称快照';
alter table RHN_EX_DIAG_REPORT add FG_SELF_SIGN number(1);
comment on column RHN_EX_DIAG_REPORT.FG_SELF_SIGN is '是否同人签发；历史和外部未知时为空';
alter table RHN_EX_DIAG_REPORT add DES_CORRECT clob;
comment on column RHN_EX_DIAG_REPORT.DES_CORRECT is '报告更正原因';
insert into RHN_SYS_PARAM_CAT (ID_PARAM_CAT, ID_PARAM_CAT_PARENT, CD_PARAM_CAT, NA_PARAM_CAT, DES_PARAM_CAT, SN_SORT, FG_ACTIVE, REVISION, DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED)
values (362387873130001, null, 'DIAGNOSTICS_SIGNING', '医技报告签发', '检验与检查的机构级可选双签参数', 70, 1, 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222);
insert into RHN_SYS_PARAM_DEF (ID_PARAM_DEF, ID_PARAM_CAT, CD_PARAM_KEY, NA_PARAM_DEF, DES_PARAM_DEF, SD_VAL_TYPE, SD_CONTROL_TYPE, JSON_SCHEMA, JSON_DEFAULT_VAL, JSON_EXAMPLE_VAL, JSON_SCOPE, SD_PARAM_CAT, FG_INHRT, FG_CACHE, FG_NULLBL_VAL, SENS, SD_DISPLAY_POLICY, SD_STATUS, REVISION, DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED, SD_DEPNCY_BEHAV)
values (362387873130002, 362387873130001, 'diagnostics.laboratory.double-sign.required', '检验报告要求另一人签发', '默认关闭；启用后由另一名医技人员打开已保存草稿直接审核并签发，不增加多级审批', 'BOOLEAN', 'SWITCH', '{"type":"boolean"}', 'false', 'true', '["ORGANIZATION"]', 'BUSINESS', 1, 1, 0, 'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222, 'DISABLE_AND_SUPPRESS');
insert into RHN_SYS_PARAM_DEF (ID_PARAM_DEF, ID_PARAM_CAT, CD_PARAM_KEY, NA_PARAM_DEF, DES_PARAM_DEF, SD_VAL_TYPE, SD_CONTROL_TYPE, JSON_SCHEMA, JSON_DEFAULT_VAL, JSON_EXAMPLE_VAL, JSON_SCOPE, SD_PARAM_CAT, FG_INHRT, FG_CACHE, FG_NULLBL_VAL, SENS, SD_DISPLAY_POLICY, SD_STATUS, REVISION, DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED, SD_DEPNCY_BEHAV)
values (362387873130003, 362387873130001, 'diagnostics.examination.double-sign.required', '检查报告要求另一人签发', '默认关闭；启用后由另一名医技人员打开已保存草稿直接审核并签发，不增加多级审批', 'BOOLEAN', 'SWITCH', '{"type":"boolean"}', 'false', 'true', '["ORGANIZATION"]', 'BUSINESS', 1, 1, 0, 'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222, 'DISABLE_AND_SUPPRESS');
