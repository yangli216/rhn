-- Actual specimens and immutable local signing receipts.
create table RHN_EX_DIAG_SPEC (
    ID_DIAG_SPEC number(19),
    REVISION number(19) not null default 0,
    ID_TNT number(19) not null,
    ID_ORG number(19) not null,
    ID_DEPT number(19) not null,
    ID_PAT number(19) not null,
    ID_ENC number(19) not null,
    CD_SPEC_NO varchar2(64 char) not null,
    SD_SPEC_TYPE varchar2(64 char) not null,
    NA_SPEC_TYPE varchar2(200 char) not null,
    SD_CONTNR varchar2(64 char),
    NA_CONTNR varchar2(200 char),
    SD_STATUS varchar2(20 char) not null,
    DT_CREATED timestamp with time zone not null,
    DT_COLLD timestamp with time zone,
    ID_USER_COLLD number(19),
    DT_RECVD timestamp with time zone,
    ID_USER_RECVD number(19),
    DT_REJECT timestamp with time zone,
    ID_USER_REJECT number(19),
    DES_REJECT varchar2(1000 char),
    ID_SPEC_PRIOR number(19),
    CD_CMD varchar2(64 char) not null,
    HASH_CMD varchar2(64 char) not null,
    constraint PK_EX_DIAG_SPEC primary key (ID_DIAG_SPEC),
    constraint UK_EX_DIAG_SPEC_NO unique (ID_TNT, ID_ORG, CD_SPEC_NO),
    constraint UK_EX_SPEC_PRIOR unique (ID_TNT, ID_SPEC_PRIOR),
    constraint FK_EX_SPEC_PRIOR foreign key (ID_SPEC_PRIOR) references RHN_EX_DIAG_SPEC(ID_DIAG_SPEC),
    constraint CK_EX_DIAG_SPEC_ST check (SD_STATUS in ('READY','COLLECTED','RECEIVED','REJECTED'))
);
comment on table RHN_EX_DIAG_SPEC is '医技实际标本；一行代表一管实际标本及其当前作业事实';
comment on column RHN_EX_DIAG_SPEC.ID_DIAG_SPEC is '标本主键';
comment on column RHN_EX_DIAG_SPEC.REVISION is '乐观锁版本';
comment on column RHN_EX_DIAG_SPEC.ID_TNT is '租户标识';
comment on column RHN_EX_DIAG_SPEC.ID_ORG is '所属机构';
comment on column RHN_EX_DIAG_SPEC.ID_DEPT is '执行科室';
comment on column RHN_EX_DIAG_SPEC.ID_PAT is '患者标识';
comment on column RHN_EX_DIAG_SPEC.ID_ENC is '就诊标识';
comment on column RHN_EX_DIAG_SPEC.CD_SPEC_NO is '标本业务号';
comment on column RHN_EX_DIAG_SPEC.SD_SPEC_TYPE is '标本类型编码';
comment on column RHN_EX_DIAG_SPEC.NA_SPEC_TYPE is '标本类型名称快照';
comment on column RHN_EX_DIAG_SPEC.SD_CONTNR is '容器编码';
comment on column RHN_EX_DIAG_SPEC.NA_CONTNR is '容器名称快照';
comment on column RHN_EX_DIAG_SPEC.SD_STATUS is 'READY/COLLECTED/RECEIVED/REJECTED';
comment on column RHN_EX_DIAG_SPEC.DT_CREATED is '生成时间';
comment on column RHN_EX_DIAG_SPEC.DT_COLLD is '采集时间';
comment on column RHN_EX_DIAG_SPEC.ID_USER_COLLD is '采集人';
comment on column RHN_EX_DIAG_SPEC.DT_RECVD is '接收时间';
comment on column RHN_EX_DIAG_SPEC.ID_USER_RECVD is '接收人';
comment on column RHN_EX_DIAG_SPEC.DT_REJECT is '拒收时间';
comment on column RHN_EX_DIAG_SPEC.ID_USER_REJECT is '拒收人';
comment on column RHN_EX_DIAG_SPEC.DES_REJECT is '拒收原因';
comment on column RHN_EX_DIAG_SPEC.ID_SPEC_PRIOR is '被替代的拒收标本';
comment on column RHN_EX_DIAG_SPEC.CD_CMD is '生成命令标识';
comment on column RHN_EX_DIAG_SPEC.HASH_CMD is '生成命令内容摘要';
create table RHN_EX_DIAG_SPEC_TASK (
    ID_SPEC_TASK number(19),
    ID_TNT number(19) not null,
    ID_DIAG_SPEC number(19) not null,
    ID_DIAG_EXEC_TASK number(19) not null,
    constraint PK_EX_DIAG_SPEC_TASK primary key (ID_SPEC_TASK),
    constraint UK_EX_SPEC_TASK unique (ID_TNT, ID_DIAG_SPEC, ID_DIAG_EXEC_TASK),
    constraint FK_EX_SPEC_TASK_SPEC foreign key (ID_DIAG_SPEC) references RHN_EX_DIAG_SPEC(ID_DIAG_SPEC),
    constraint FK_EX_SPEC_TASK_EXEC foreign key (ID_DIAG_EXEC_TASK) references RHN_EX_DIAG_EXEC_TASK(ID_DIAG_EXEC_TASK)
);
comment on table RHN_EX_DIAG_SPEC_TASK is '医技标本申请关联；一行代表一管标本与一张申请的关联';
comment on column RHN_EX_DIAG_SPEC_TASK.ID_SPEC_TASK is '关联主键';
comment on column RHN_EX_DIAG_SPEC_TASK.ID_TNT is '租户标识';
comment on column RHN_EX_DIAG_SPEC_TASK.ID_DIAG_SPEC is '实际标本';
comment on column RHN_EX_DIAG_SPEC_TASK.ID_DIAG_EXEC_TASK is '执行任务';
create table RHN_EX_DIAG_CMD (
    ID_DIAG_CMD number(19),
    ID_TNT number(19) not null,
    ID_DIAG_EXEC_TASK number(19) not null,
    CD_CMD varchar2(64 char) not null,
    HASH_CMD varchar2(64 char) not null,
    ID_DIAG_REPORT number(19) not null,
    constraint PK_EX_DIAG_CMD primary key (ID_DIAG_CMD),
    constraint UK_EX_DIAG_CMD unique (ID_TNT, ID_DIAG_EXEC_TASK, CD_CMD),
    constraint FK_EX_DIAG_CMD_TASK foreign key (ID_DIAG_EXEC_TASK) references RHN_EX_DIAG_EXEC_TASK(ID_DIAG_EXEC_TASK),
    constraint FK_EX_DIAG_CMD_REPORT foreign key (ID_DIAG_REPORT) references RHN_EX_DIAG_REPORT(ID_DIAG_REPORT)
);
comment on table RHN_EX_DIAG_CMD is '医技签发回执；一行代表一次本地签发命令与不可变报告的关联';
comment on column RHN_EX_DIAG_CMD.ID_DIAG_CMD is '签发回执主键';
comment on column RHN_EX_DIAG_CMD.ID_TNT is '租户标识';
comment on column RHN_EX_DIAG_CMD.ID_DIAG_EXEC_TASK is '执行任务';
comment on column RHN_EX_DIAG_CMD.CD_CMD is '签发命令标识';
comment on column RHN_EX_DIAG_CMD.HASH_CMD is '签发命令内容摘要';
comment on column RHN_EX_DIAG_CMD.ID_DIAG_REPORT is '正式报告版本';
create index IX_EX_SPEC_CMD on RHN_EX_DIAG_SPEC(ID_TNT, ID_ORG, CD_CMD);
create index IX_EX_SPEC_TASK_EXEC on RHN_EX_DIAG_SPEC_TASK(ID_TNT, ID_DIAG_EXEC_TASK);

create table RHN_EX_SPEC_BATCH (
    ID_SPEC_BATCH number(19),
    ID_TNT number(19) not null,
    ID_ORG number(19) not null,
    CD_CMD varchar2(64 char) not null,
    HASH_CMD varchar2(64 char) not null,
    constraint PK_EX_SPEC_BATCH primary key (ID_SPEC_BATCH),
    constraint UK_EX_SPEC_BATCH_CMD unique (ID_TNT, ID_ORG, CD_CMD)
);
comment on table RHN_EX_SPEC_BATCH is '标本生成批次；一行代表一个机构内唯一的标本生成命令';
comment on column RHN_EX_SPEC_BATCH.ID_SPEC_BATCH is '标本生成批次主键';
comment on column RHN_EX_SPEC_BATCH.ID_TNT is '租户标识';
comment on column RHN_EX_SPEC_BATCH.ID_ORG is '所属机构';
comment on column RHN_EX_SPEC_BATCH.CD_CMD is '生成命令标识';
comment on column RHN_EX_SPEC_BATCH.HASH_CMD is '生成命令内容摘要';
