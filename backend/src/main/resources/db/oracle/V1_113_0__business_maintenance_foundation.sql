-- Business maintenance state is protected infrastructure, not a cleanup dataset.

create table RHN_SYS_MAINT_BATCH (
    ID_MAINT_BATCH number(19) not null,
    ID_TNT number(19) not null,
    CD_CMD varchar2(128) not null,
    CD_HASH varchar2(64) not null,
    DT_CREATED timestamp with time zone not null,
    JSON_VIEW clob not null,
    constraint PK_MAINT_BATCH primary key (ID_MAINT_BATCH),
    constraint UK_MAINT_BATCH_TNT unique (ID_MAINT_BATCH,ID_TNT),
    constraint UK_MAINT_BATCH_CMD unique (ID_TNT,CD_CMD)
);

comment on table RHN_SYS_MAINT_BATCH is '测试来源批次；一行代表一次有明确依据的测试对象登记，登记后不可修改';

comment on column RHN_SYS_MAINT_BATCH.ID_MAINT_BATCH is '测试来源批次主键';

comment on column RHN_SYS_MAINT_BATCH.ID_TNT is '租户标识';

comment on column RHN_SYS_MAINT_BATCH.CD_CMD is '不可复用的请求幂等编码';

comment on column RHN_SYS_MAINT_BATCH.CD_HASH is '规范化请求指纹';

comment on column RHN_SYS_MAINT_BATCH.DT_CREATED is '创建时间';

comment on column RHN_SYS_MAINT_BATCH.JSON_VIEW is '批次范围及经核对的业务根对象；不含诊疗正文';

create index IX_MAINT_BATCH_TIME on RHN_SYS_MAINT_BATCH(ID_TNT,DT_CREATED);

create table RHN_SYS_MAINT_PLAN (
    ID_MAINT_PLAN number(19) not null,
    ID_TNT number(19) not null,
    DT_CREATED timestamp with time zone not null,
    DT_EXPIRES timestamp with time zone not null,
    CD_HASH varchar2(64) not null,
    JSON_VIEW clob not null,
    JSON_SEALED clob not null,
    constraint PK_MAINT_PLAN primary key (ID_MAINT_PLAN),
    constraint UK_MAINT_PLAN_TNT unique (ID_MAINT_PLAN,ID_TNT)
);

comment on table RHN_SYS_MAINT_PLAN is '维护预览计划；一行代表一个不可变范围、规则与影响快照';

comment on column RHN_SYS_MAINT_PLAN.ID_MAINT_PLAN is '不可变维护预览计划主键';

comment on column RHN_SYS_MAINT_PLAN.ID_TNT is '租户标识';

comment on column RHN_SYS_MAINT_PLAN.DT_CREATED is '创建时间';

comment on column RHN_SYS_MAINT_PLAN.DT_EXPIRES is '计划执行有效期';

comment on column RHN_SYS_MAINT_PLAN.CD_HASH is '计划及领域规则指纹';

comment on column RHN_SYS_MAINT_PLAN.JSON_VIEW is '影响摘要与阻断信息';

comment on column RHN_SYS_MAINT_PLAN.JSON_SEALED is '绑定租户和计划标识的加密输入与领域对象快照';

create index IX_MAINT_PLAN_TIME on RHN_SYS_MAINT_PLAN(ID_TNT,DT_CREATED);

create table RHN_SYS_MAINT_TASK (
    ID_MAINT_TASK number(19) not null,
    ID_TNT number(19) not null,
    ID_MAINT_PLAN number(19) not null,
    CD_CMD varchar2(128) not null,
    CD_HASH varchar2(64) not null,
    SD_STATUS varchar2(24) not null,
    DT_CREATED timestamp with time zone not null,
    DT_UPDATED timestamp with time zone not null,
    JSON_VIEW clob not null,
    constraint PK_MAINT_TASK primary key (ID_MAINT_TASK),
    constraint UK_MAINT_TASK_TNT unique (ID_MAINT_TASK,ID_TNT),
    constraint UK_MAINT_TASK_CMD unique (ID_TNT,CD_CMD),
    constraint UK_MAINT_TASK_PLAN unique (ID_TNT,ID_MAINT_PLAN),
    constraint FK_MAINT_TASK_PLAN foreign key (ID_MAINT_PLAN,ID_TNT) references RHN_SYS_MAINT_PLAN(ID_MAINT_PLAN,ID_TNT),
    constraint CK_MAINT_TASK_STATUS check (SD_STATUS in ('QUEUED','PREPARING','RUNNING','VERIFYING','SUCCEEDED','FAILED','CANCELLED'))
);

comment on table RHN_SYS_MAINT_TASK is '维护执行任务；一行代表一个计划的唯一执行命令，更新采用任务行锁';

comment on column RHN_SYS_MAINT_TASK.ID_MAINT_TASK is '维护执行任务主键';

comment on column RHN_SYS_MAINT_TASK.ID_TNT is '租户标识';

comment on column RHN_SYS_MAINT_TASK.ID_MAINT_PLAN is '对应不可变预览计划';

comment on column RHN_SYS_MAINT_TASK.CD_CMD is '不可复用的执行请求幂等编码';

comment on column RHN_SYS_MAINT_TASK.CD_HASH is '执行请求指纹';

comment on column RHN_SYS_MAINT_TASK.SD_STATUS is '持久任务执行状态';

comment on column RHN_SYS_MAINT_TASK.DT_CREATED is '登记时间';

comment on column RHN_SYS_MAINT_TASK.DT_UPDATED is '最近状态更新时间';

comment on column RHN_SYS_MAINT_TASK.JSON_VIEW is '任务范围、操作者和执行结果摘要';

create index IX_MAINT_TASK_TIME on RHN_SYS_MAINT_TASK(ID_TNT,DT_CREATED);

create table RHN_SYS_MAINT_BACKUP (
    ID_MAINT_TASK number(19) not null,
    ID_TNT number(19) not null,
    DT_CREATED timestamp with time zone not null,
    JSON_SEALED clob not null,
    constraint PK_MAINT_BACKUP primary key (ID_MAINT_TASK),
    constraint UK_MAINT_BACKUP_TNT unique (ID_MAINT_TASK,ID_TNT),
    constraint FK_MAINT_BACKUP_TASK foreign key (ID_MAINT_TASK,ID_TNT) references RHN_SYS_MAINT_TASK(ID_MAINT_TASK,ID_TNT)
);

comment on table RHN_SYS_MAINT_BACKUP is '维护范围恢复快照；一行代表一个维护任务的加密恢复数据，按任务不可变保留，业务清理不可删除';

comment on column RHN_SYS_MAINT_BACKUP.ID_MAINT_TASK is '对应维护任务；一任务一份范围恢复快照';

comment on column RHN_SYS_MAINT_BACKUP.ID_TNT is '租户标识';

comment on column RHN_SYS_MAINT_BACKUP.DT_CREATED is '备份时间';

comment on column RHN_SYS_MAINT_BACKUP.JSON_SEALED is '按任务和租户绑定加密的领域恢复快照';

create index IX_MAINT_BACKUP_TIME on RHN_SYS_MAINT_BACKUP(ID_TNT,DT_CREATED);

create table RHN_SYS_MAINT_AUDIT (
    ID_MAINT_AUDIT number(19) not null,
    ID_TNT number(19) not null,
    ID_RSRC number(19) not null,
    CD_ACTION varchar2(32) not null,
    NA_ACTOR varchar2(128) not null,
    DT_CREATED timestamp with time zone not null,
    DES_DETAIL varchar2(1000) not null,
    constraint PK_MAINT_AUDIT primary key (ID_MAINT_AUDIT),
    constraint UK_MAINT_AUDIT_TNT unique (ID_MAINT_AUDIT,ID_TNT)
);

comment on table RHN_SYS_MAINT_AUDIT is '维护审计；一行代表一次维护操作或阶段记录，仅追加，业务清理不可删除';

comment on column RHN_SYS_MAINT_AUDIT.ID_MAINT_AUDIT is '追加式维护审计主键';

comment on column RHN_SYS_MAINT_AUDIT.ID_TNT is '租户标识';

comment on column RHN_SYS_MAINT_AUDIT.ID_RSRC is '批次、计划或任务资源标识';

comment on column RHN_SYS_MAINT_AUDIT.CD_ACTION is '审计操作编码';

comment on column RHN_SYS_MAINT_AUDIT.NA_ACTOR is '业务操作者账号';

comment on column RHN_SYS_MAINT_AUDIT.DT_CREATED is '记录时间';

comment on column RHN_SYS_MAINT_AUDIT.DES_DETAIL is '必要操作摘要；不含完整诊疗正文';

create index IX_MAINT_AUDIT_TIME on RHN_SYS_MAINT_AUDIT(ID_TNT,DT_CREATED);

create table RHN_SYS_MAINT_STATE (
    ID_TNT number(19) not null,
    ID_MAINT_TASK number(19),
    constraint PK_MAINT_STATE primary key (ID_TNT),
    constraint FK_MAINT_STATE_TASK foreign key (ID_MAINT_TASK,ID_TNT) references RHN_SYS_MAINT_TASK(ID_MAINT_TASK,ID_TNT)
);

comment on table RHN_SYS_MAINT_STATE is '租户写入维护屏障；一行代表一个租户的维护阻断状态，按租户行锁串行登记，不进入业务清理范围';

comment on column RHN_SYS_MAINT_STATE.ID_TNT is '租户标识及屏障主键';

comment on column RHN_SYS_MAINT_STATE.ID_MAINT_TASK is '当前阻断写入的维护任务；空表示可写';

create table RHN_SYS_MAINT_WRITE (
    ID_MAINT_WRITE number(19) not null,
    ID_TNT number(19) not null,
    DT_STARTED timestamp with time zone not null,
    CD_NODE varchar2(200),
    ID_PROC number(19),
    NUM_PROC_START number(19),
    constraint PK_MAINT_WRITE primary key (ID_MAINT_WRITE)
);

comment on table RHN_SYS_MAINT_WRITE is '在途业务写入凭据；一行代表一次被接纳的在途写入，请求或事务完成后精确删除，不能按时间推断事务结束';

comment on column RHN_SYS_MAINT_WRITE.ID_MAINT_WRITE is '在途写入凭据主键';

comment on column RHN_SYS_MAINT_WRITE.ID_TNT is '租户标识';

comment on column RHN_SYS_MAINT_WRITE.DT_STARTED is '写入开始时间';

comment on column RHN_SYS_MAINT_WRITE.CD_NODE is 'OS进程命名空间；不同宿主或PID命名空间不得复用';
comment on column RHN_SYS_MAINT_WRITE.ID_PROC is '写入所属进程PID；仅在同一进程命名空间核对';
comment on column RHN_SYS_MAINT_WRITE.NUM_PROC_START is '进程启动时刻的Unix毫秒；用于识别PID复用';

create index IX_MAINT_WRITE_TNT on RHN_SYS_MAINT_WRITE(ID_TNT,DT_STARTED);

create table RHN_SYS_MAINT_ORIGIN (
    ID_MAINT_ORIGIN number(19) not null,
    ID_TNT number(19) not null,
    ID_ORG number(19) not null,
    ID_MAINT_BATCH number(19) not null,
    SD_MODULE varchar2(32) not null,
    SD_RSRC_TYPE varchar2(32) not null,
    ID_RSRC number(19) not null,
    DT_TAGGED timestamp with time zone not null,
    constraint PK_MAINT_ORIGIN primary key (ID_MAINT_ORIGIN),
    constraint UK_MAINT_ORIGIN_RSRC unique (ID_TNT,SD_RSRC_TYPE,ID_RSRC),
    constraint FK_MAINT_ORIGIN_BATCH foreign key (ID_MAINT_BATCH,ID_TNT) references RHN_SYS_MAINT_BATCH(ID_MAINT_BATCH,ID_TNT)
);
comment on table RHN_SYS_MAINT_ORIGIN is '不可变测试来源标记；一行代表一个经明确依据登记的业务根对象来源，业务删除后保留，不依据名称或当前环境推断测试身份';
comment on column RHN_SYS_MAINT_ORIGIN.ID_MAINT_ORIGIN is '不可变测试来源标记主键';
comment on column RHN_SYS_MAINT_ORIGIN.ID_TNT is '租户标识';
comment on column RHN_SYS_MAINT_ORIGIN.ID_ORG is '业务所属机构';
comment on column RHN_SYS_MAINT_ORIGIN.ID_MAINT_BATCH is '明确测试用途的来源批次';
comment on column RHN_SYS_MAINT_ORIGIN.SD_MODULE is '根业务模块';
comment on column RHN_SYS_MAINT_ORIGIN.SD_RSRC_TYPE is '根业务对象类型';
comment on column RHN_SYS_MAINT_ORIGIN.ID_RSRC is '经核对的根业务对象标识';
comment on column RHN_SYS_MAINT_ORIGIN.DT_TAGGED is '测试来源登记时间；子业务沿根业务继承用途';

create table RHN_SYS_MAINT_RETIRE (
    ID_TNT number(19) not null,
    ID_RSRC number(19) not null,
    ID_MAINT_TASK number(19) not null,
    constraint PK_MAINT_RETIRE primary key (ID_TNT,ID_RSRC),
    constraint FK_MAINT_RETIRE_TASK foreign key (ID_MAINT_TASK,ID_TNT) references RHN_SYS_MAINT_TASK(ID_MAINT_TASK,ID_TNT)
);
comment on table RHN_SYS_MAINT_RETIRE is '已清理业务身份留痕；一行代表一个已清理业务对象身份，阻止迟到事件恢复已删除事实，不能随业务清理删除';
comment on column RHN_SYS_MAINT_RETIRE.ID_TNT is '租户标识';
comment on column RHN_SYS_MAINT_RETIRE.ID_RSRC is '已清理的全局业务对象标识；不可重新生成使用';
comment on column RHN_SYS_MAINT_RETIRE.ID_MAINT_TASK is '关联维护任务；恢复数据时需同时核对业务身份状态';

create table RHN_SYS_MAINT_ORG_STATE (
    ID_TNT number(19) not null,
    ID_ORG number(19) not null,
    SD_LFCYCL varchar2(16) not null,
    DT_UPDATED timestamp with time zone not null,
    NA_ACTOR varchar2(128) not null,
    constraint PK_MAINT_ORG_STATE primary key (ID_TNT,ID_ORG),
    constraint FK_MAINT_ORG_STATE_ORG foreign key (ID_ORG,ID_TNT) references RHN_SYS_ORG(ID_ORG,ID_TNT),
    constraint CK_MAINT_ORG_LIFECYCLE check (SD_LFCYCL in ('PRELIVE','LIVE'))
);
comment on table RHN_SYS_MAINT_ORG_STATE is '机构上线状态；一行代表一个租户内机构的上线确认，未登记视为未确认，正式上线不可回退，不进入清理范围';
comment on column RHN_SYS_MAINT_ORG_STATE.ID_TNT is '租户标识';
comment on column RHN_SYS_MAINT_ORG_STATE.ID_ORG is '机构标识';
comment on column RHN_SYS_MAINT_ORG_STATE.SD_LFCYCL is '上线前或正式上线状态；正式上线不可回退';
comment on column RHN_SYS_MAINT_ORG_STATE.DT_UPDATED is '状态确认时间';
comment on column RHN_SYS_MAINT_ORG_STATE.NA_ACTOR is '确认账号';

-- Register independent permissions; no destructive grants are automatically assigned to roles.
insert into RHN_SYS_MGMT_MOD (ID_MGMT_MOD,ID_TNT,ID_MGMT_MOD_PARENT,CD_MGMT_MOD,NA_MGMT_MOD,SD_MOD_TYPE,ROUTE_PATH,CD_COMP,CD_ICON,SN_SORT,SD_STATUS,DT_CREATED,DT_UPDATED,REVISION)
values (362387870112001,362387869790209,362387869896017,'MAINTENANCE','业务初始化与清理','MODULE','/settings/business-maintenance','BusinessMaintenance','settings',69,'ACTIVE',current_timestamp,current_timestamp,0);
insert into RHN_SYS_ACC_PERM (ID_ACC_PERM,ID_TNT,ID_MGMT_MOD,CD_ACC_PERM,NA_ACC_PERM,CD_ACTION,CD_RSRC,SD_STATUS) values (362387870112002,362387869790209,362387870112001,'MAINTENANCE.VIEW','查看业务初始化与清理','VIEW','MAINTENANCE','ACTIVE');
insert into RHN_SYS_ACC_PERM (ID_ACC_PERM,ID_TNT,ID_MGMT_MOD,CD_ACC_PERM,NA_ACC_PERM,CD_ACTION,CD_RSRC,SD_STATUS) values (362387870112003,362387869790209,362387870112001,'MAINTENANCE.MANAGE','登记来源与生成维护预览','MANAGE','MAINTENANCE','ACTIVE');
insert into RHN_SYS_ACC_PERM (ID_ACC_PERM,ID_TNT,ID_MGMT_MOD,CD_ACC_PERM,NA_ACC_PERM,CD_ACTION,CD_RSRC,SD_STATUS) values (362387870112004,362387869790209,362387870112001,'MAINTENANCE.EXECUTE','执行业务初始化与清理','EXECUTE','MAINTENANCE','ACTIVE');
insert into RHN_SYS_ACC_PERM (ID_ACC_PERM,ID_TNT,ID_MGMT_MOD,CD_ACC_PERM,NA_ACC_PERM,CD_ACTION,CD_RSRC,SD_STATUS) values (362387870112005,362387869790209,362387870112001,'MAINTENANCE.TENANT','维护整个租户的数据范围','TENANT','MAINTENANCE','ACTIVE');
insert into RHN_SYS_ACC_PERM (ID_ACC_PERM,ID_TNT,ID_MGMT_MOD,CD_ACC_PERM,NA_ACC_PERM,CD_ACTION,CD_RSRC,SD_STATUS) values (362387870112006,362387869790209,362387870112001,'MAINTENANCE.BACKUP','下载维护范围恢复快照','BACKUP','MAINTENANCE','ACTIVE');
insert into RHN_SYS_ACC_PERM (ID_ACC_PERM,ID_TNT,ID_MGMT_MOD,CD_ACC_PERM,NA_ACC_PERM,CD_ACTION,CD_RSRC,SD_STATUS) values (362387870112007,362387869790209,362387870112001,'MAINTENANCE.LIFECYCLE','确认上线状态与上线前重置','LIFECYCLE','MAINTENANCE','ACTIVE');
