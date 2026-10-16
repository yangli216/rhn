create table RHN_SYS_ORG_CHG (
    ID_ORG_CHG number(19) not null,
    ID_TNT number(19) not null,
    CD_RSRC_TYPE varchar2(32) not null,
    ID_RSRC number(19) not null,
    CD_ACTION varchar2(32) not null,
    DES_BEFORE clob not null,
    DES_AFTER clob not null,
    DES_REASON varchar2(1000) not null,
    NA_ACTOR varchar2(128) not null,
    ID_USER number(19),
    DT_OCCRD timestamp with time zone not null,
    constraint PK_SYS_ORG_CHG primary key (ID_ORG_CHG),
    constraint FK_SYS_ORG_CHG_TNT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT)
);

create index IX_SYS_ORG_CHG_RSRC on RHN_SYS_ORG_CHG (ID_TNT, CD_RSRC_TYPE, ID_RSRC, DT_OCCRD);

comment on table RHN_SYS_ORG_CHG is '组织与人员变更记录；一行代表一次追加式维护事件';
comment on column RHN_SYS_ORG_CHG.ID_ORG_CHG is '组织变更记录主键';
comment on column RHN_SYS_ORG_CHG.ID_TNT is '租户标识';
comment on column RHN_SYS_ORG_CHG.CD_RSRC_TYPE is '变更对象类型';
comment on column RHN_SYS_ORG_CHG.ID_RSRC is '机构、科室、人员或岗位标识';
comment on column RHN_SYS_ORG_CHG.CD_ACTION is '变更动作';
comment on column RHN_SYS_ORG_CHG.DES_BEFORE is '变更前完整快照';
comment on column RHN_SYS_ORG_CHG.DES_AFTER is '变更后完整快照';
comment on column RHN_SYS_ORG_CHG.DES_REASON is '变更原因';
comment on column RHN_SYS_ORG_CHG.ID_USER is '操作账号标识';
comment on column RHN_SYS_ORG_CHG.DT_OCCRD is '变更发生时间';
comment on column RHN_SYS_ORG_CHG.NA_ACTOR is '操作账号名称快照';
