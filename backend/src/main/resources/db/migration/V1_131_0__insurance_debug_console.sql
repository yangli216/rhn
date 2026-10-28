-- 医保接入向导调试控制台：调试配置与医保网关往返记录，及其权限。
create table RHN_INS_DBG_CFG (
    ID_DBG_CFG bigint not null,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    FG_ENABLED boolean default false not null,
    SD_SCOPE varchar(32) default 'IMPORTANT' not null,
    CD_SEL_INFNO varchar(512),
    SD_RETAIN varchar(32) default 'REDACTED' not null,
    QTY_KEEP_DAYS integer default 7 not null,
    DT_ENABLED_UNTIL timestamp with time zone,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED bigint,
    constraint PK_INS_DBG_CFG primary key (ID_DBG_CFG),
    constraint UK_INS_DBG_CFG_TNT unique (ID_TNT),
    constraint CK_INS_DBG_CFG_SCOPE check (SD_SCOPE in ('ALL', 'IMPORTANT', 'SELECTED')),
    constraint CK_INS_DBG_CFG_RETAIN check (SD_RETAIN in ('SUMMARY', 'REDACTED', 'RAW')),
    constraint CK_INS_DBG_CFG_KEEP check (QTY_KEEP_DAYS between 1 and 90)
);

create table RHN_INS_EXCH_LOG (
    ID_EXCH_LOG bigint not null,
    ID_TNT bigint not null,
    CD_INFNO varchar(16) not null,
    DT_STARTED timestamp with time zone not null,
    QTY_ELAPSED_MS bigint not null,
    QTY_HTTP_STATUS integer,
    CD_INFCODE varchar(32),
    DES_ERR_MSG varchar(1000),
    SD_OUTCOME varchar(32) not null,
    SD_RETAIN varchar(32) not null,
    ID_USER bigint,
    NA_ACTOR varchar(128),
    ID_ORG bigint,
    ID_CORR varchar(128),
    JSON_REQ text,
    JSON_RESP text,
    DT_EXPIRES timestamp with time zone not null,
    DT_CREATED timestamp with time zone not null,
    constraint PK_INS_EXCH_LOG primary key (ID_EXCH_LOG),
    constraint CK_INS_EXCH_LOG_OUTCOME check (SD_OUTCOME in ('OK', 'REJECTED', 'TIMEOUT', 'NETWORK', 'HTTP_STATUS', 'BAD_JSON', 'INCOMPLETE')),
    constraint CK_INS_EXCH_LOG_RETAIN check (SD_RETAIN in ('SUMMARY', 'REDACTED', 'RAW'))
);
create index IX_INS_EXCH_LOG_TNT_TIME on RHN_INS_EXCH_LOG (ID_TNT, DT_STARTED);
create index IX_INS_EXCH_LOG_EXPIRES on RHN_INS_EXCH_LOG (DT_EXPIRES);

comment on table RHN_INS_DBG_CFG is '医保调试控制台配置；一行代表一个租户的调试开关与记录范围';
comment on column RHN_INS_DBG_CFG.ID_DBG_CFG is '主键';
comment on column RHN_INS_DBG_CFG.REVISION is '乐观锁版本';
comment on column RHN_INS_DBG_CFG.ID_TNT is '租户标识';
comment on column RHN_INS_DBG_CFG.FG_ENABLED is '调试开关';
comment on column RHN_INS_DBG_CFG.SD_SCOPE is '记录范围：ALL 所有交易、IMPORTANT 重要交易、SELECTED 指定交易';
comment on column RHN_INS_DBG_CFG.CD_SEL_INFNO is '指定交易号，逗号分隔';
comment on column RHN_INS_DBG_CFG.SD_RETAIN is '报文留存级别：SUMMARY 仅摘要、REDACTED 脱敏报文、RAW 原始报文';
comment on column RHN_INS_DBG_CFG.QTY_KEEP_DAYS is '记录保留天数';
comment on column RHN_INS_DBG_CFG.DT_ENABLED_UNTIL is '调试自动关闭时间；为空表示不自动关闭';
comment on column RHN_INS_DBG_CFG.DT_UPDATED is '最近修改时间';
comment on column RHN_INS_DBG_CFG.ID_USER_UPDATED is '最近修改人';

comment on table RHN_INS_EXCH_LOG is '医保网关往返记录；一行代表一次与医保网关的报文往返';
comment on column RHN_INS_EXCH_LOG.ID_EXCH_LOG is '主键';
comment on column RHN_INS_EXCH_LOG.ID_TNT is '租户标识';
comment on column RHN_INS_EXCH_LOG.CD_INFNO is '交易号';
comment on column RHN_INS_EXCH_LOG.DT_STARTED is '发起时间';
comment on column RHN_INS_EXCH_LOG.QTY_ELAPSED_MS is '耗时毫秒';
comment on column RHN_INS_EXCH_LOG.QTY_HTTP_STATUS is 'HTTP 状态码';
comment on column RHN_INS_EXCH_LOG.CD_INFCODE is '医保返回码';
comment on column RHN_INS_EXCH_LOG.DES_ERR_MSG is '医保返回的错误信息';
comment on column RHN_INS_EXCH_LOG.SD_OUTCOME is '往返结果分类';
comment on column RHN_INS_EXCH_LOG.SD_RETAIN is '本条记录的报文留存级别';
comment on column RHN_INS_EXCH_LOG.ID_USER is '操作人标识';
comment on column RHN_INS_EXCH_LOG.NA_ACTOR is '操作人名称';
comment on column RHN_INS_EXCH_LOG.ID_ORG is '机构标识';
comment on column RHN_INS_EXCH_LOG.ID_CORR is '请求关联号';
comment on column RHN_INS_EXCH_LOG.JSON_REQ is '请求报文，按留存级别脱敏或原样保存';
comment on column RHN_INS_EXCH_LOG.JSON_RESP is '响应报文，按留存级别脱敏或原样保存';
comment on column RHN_INS_EXCH_LOG.DT_EXPIRES is '到期清理时间';
comment on column RHN_INS_EXCH_LOG.DT_CREATED is '记录时间';

insert into RHN_SYS_ACC_PERM (ID_ACC_PERM, ID_TNT, ID_MGMT_MOD, CD_ACC_PERM, NA_ACC_PERM, CD_ACTION, CD_RSRC, SD_STATUS)
select (select coalesce(max(ID_ACC_PERM), 0) from RHN_SYS_ACC_PERM) + row_number() over (order by module.ID_TNT, perm.CD),
       module.ID_TNT, module.ID_MGMT_MOD, perm.CD, perm.NA, perm.ACT, 'INSURANCE_DEBUG', 'ACTIVE'
from RHN_SYS_MGMT_MOD module
cross join (select 'INSURANCE_DEBUG.VIEW' CD, '查看医保调试记录' NA, 'VIEW' ACT
            union all select 'INSURANCE_DEBUG.CONFIGURE', '配置医保调试开关与记录范围', 'CONFIGURE'
            union all select 'INSURANCE_DEBUG.RAW', '查看医保原始报文', 'RAW') perm
where module.CD_MGMT_MOD = 'INSURANCE_ONBOARDING';

insert into RHN_SYS_ACC_ROLE (ID_ACC_ROLE, ID_TNT, CD_ACC_ROLE, NA_ACC_ROLE, SD_ROLE_TYPE, SD_STATUS, DT_CREATED, DT_UPDATED, REVISION)
select (select coalesce(max(ID_ACC_ROLE), 0) from RHN_SYS_ACC_ROLE) + row_number() over (order by module.ID_TNT), module.ID_TNT,
    'INSURANCE_DEBUG_ADMIN', '医保调试管理员', 'ADMIN', 'ACTIVE', current_timestamp, current_timestamp, 0
from RHN_SYS_MGMT_MOD module where module.CD_MGMT_MOD = 'INSURANCE_ONBOARDING';

insert into RHN_SYS_ROLE_PERM_ASSIGN (ID_ROLE_PERM_ASSIGN, ID_TNT, ID_ACC_ROLE, ID_ACC_PERM, DT_VALID_FROM, DT_CREATED)
select (select coalesce(max(ID_ROLE_PERM_ASSIGN), 0) from RHN_SYS_ROLE_PERM_ASSIGN)
           + row_number() over (order by r.ID_TNT, p.CD_ACC_PERM), r.ID_TNT, r.ID_ACC_ROLE, p.ID_ACC_PERM, current_timestamp, current_timestamp
from RHN_SYS_ACC_ROLE r join RHN_SYS_ACC_PERM p on p.ID_TNT = r.ID_TNT
where r.CD_ACC_ROLE = 'INSURANCE_DEBUG_ADMIN' and p.CD_ACC_PERM in ('INSURANCE_DEBUG.VIEW', 'INSURANCE_DEBUG.CONFIGURE', 'INSURANCE_DEBUG.RAW');
