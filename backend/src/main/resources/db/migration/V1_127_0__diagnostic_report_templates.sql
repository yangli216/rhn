create table RHN_BD_DIAG_TPL (
    ID_DIAG_TPL bigint,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_CATALOG_ITEM bigint not null,
    SN_VERSION integer not null,
    SD_SVC_TYPE varchar(32) not null,
    DA_VALID_FROM date not null,
    DES_BASIS varchar(1000) not null,
    ID_USER_PUBLISH bigint not null,
    DT_PUBLISH timestamp with time zone not null,
    CONTENT_JSON text not null,
    constraint PK_BD_DIAG_TPL primary key (ID_DIAG_TPL),
    constraint UK_BD_DIAG_TPL_VER unique (ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION),
    constraint FK_BD_DIAG_TPL_ITEM foreign key (ID_CATALOG_ITEM) references RHN_BD_CATALOG_ITEM(ID_CATALOG_ITEM),
    constraint CK_BD_DIAG_TPL_VER check (SN_VERSION > 0),
    constraint CK_BD_DIAG_TPL_TYPE check (SD_SVC_TYPE in ('LABORATORY','EXAMINATION'))
);
create index IX_BD_DIAG_TPL_EFF on RHN_BD_DIAG_TPL(ID_TNT, ID_ORG, ID_CATALOG_ITEM, DA_VALID_FROM, SN_VERSION);
comment on table RHN_BD_DIAG_TPL is '机构诊疗项目报告模板；一行代表一个已发布不可变版本';
comment on column RHN_BD_DIAG_TPL.ID_DIAG_TPL is '报告模板版本主键';
comment on column RHN_BD_DIAG_TPL.ID_TNT is '租户标识';
comment on column RHN_BD_DIAG_TPL.ID_ORG is '模板所属机构';
comment on column RHN_BD_DIAG_TPL.ID_CATALOG_ITEM is '诊疗项目目录身份';
comment on column RHN_BD_DIAG_TPL.SN_VERSION is '机构项目内不可变版本号';
comment on column RHN_BD_DIAG_TPL.SD_SVC_TYPE is '检验或检查类型';
comment on column RHN_BD_DIAG_TPL.DA_VALID_FROM is '版本生效日期';
comment on column RHN_BD_DIAG_TPL.DES_BASIS is '机构规则确认与发布依据';
comment on column RHN_BD_DIAG_TPL.ID_USER_PUBLISH is '实际发布主体';
comment on column RHN_BD_DIAG_TPL.DT_PUBLISH is '实际发布时间';
comment on column RHN_BD_DIAG_TPL.CONTENT_JSON is '不可变模板指标规则词条内容';
alter table RHN_VIS_OBS add SD_VAL_COMPR varchar(8);
comment on column RHN_VIS_OBS.SD_VAL_COMPR is '数值比较符；EQ LT LE GT GE';
alter table RHN_VIS_OBS add SD_RULE_STATUS varchar(32);
comment on column RHN_VIS_OBS.SD_RULE_STATUS is '判定状态；无规则不等于正常';
alter table RHN_VIS_OBS add RULE_SNAP text;
comment on column RHN_VIS_OBS.RULE_SNAP is '签发结果规则及患者匹配条件快照';
alter table RHN_EX_DIAG_REPORT add ID_DIAG_TPL bigint;
comment on column RHN_EX_DIAG_REPORT.ID_DIAG_TPL is '实际采用报告模板版本；未知历史为空';
alter table RHN_EX_DIAG_REPORT add TPL_SNAP text;
comment on column RHN_EX_DIAG_REPORT.TPL_SNAP is '签发时模板及机构规则不可变快照';
alter table RHN_VIS_OBS add constraint CK_VIS_OBS_COMPR check (SD_VAL_COMPR is null or SD_VAL_COMPR in ('EQ','LT','LE','GT','GE'));
alter table RHN_EX_DIAG_REPORT add constraint FK_EX_REPORT_TPL foreign key (ID_DIAG_TPL) references RHN_BD_DIAG_TPL(ID_DIAG_TPL);
