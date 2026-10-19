-- Additive transaction reconciliation; no existing business or merchant data is deleted.
create table RHN_BIL_RECON_ATTEMPT (
    ID_RECON_ATTEMPT bigint,
    ID_TNT bigint not null,
    ID_RECON_TASK bigint not null,
    NUM_ATTEMPT int not null,
    NUM_CLAIM bigint not null,
    SD_STATUS varchar(32) not null,
    DT_STARTED timestamp with time zone not null,
    DT_FINSH timestamp with time zone,
    CD_ERROR varchar(128),
    DES_ERROR varchar(1024),
    ID_RECON_FILE bigint,
    constraint PK_RECON_ATTEMPT primary key (ID_RECON_ATTEMPT)
);
comment on table RHN_BIL_RECON_ATTEMPT is '支付对账拉取尝试；一行代表一次有领取令牌的执行及脱敏结果';
comment on column RHN_BIL_RECON_ATTEMPT.ID_RECON_ATTEMPT is '主键';
comment on column RHN_BIL_RECON_ATTEMPT.ID_TNT is '租户标识';
comment on column RHN_BIL_RECON_ATTEMPT.ID_RECON_TASK is '商户账单任务标识';
comment on column RHN_BIL_RECON_ATTEMPT.NUM_ATTEMPT is '执行尝试序号';
comment on column RHN_BIL_RECON_ATTEMPT.NUM_CLAIM is '任务领取令牌';
comment on column RHN_BIL_RECON_ATTEMPT.SD_STATUS is '处理状态';
comment on column RHN_BIL_RECON_ATTEMPT.DT_STARTED is '尝试开始时间';
comment on column RHN_BIL_RECON_ATTEMPT.DT_FINSH is '尝试结束时间';
comment on column RHN_BIL_RECON_ATTEMPT.CD_ERROR is '安全错误分类';
comment on column RHN_BIL_RECON_ATTEMPT.DES_ERROR is '脱敏错误说明';
comment on column RHN_BIL_RECON_ATTEMPT.ID_RECON_FILE is '证据版本标识';
create table RHN_BIL_RECON_ACCT (
    ID_RECON_ACCT bigint,
    ID_TNT bigint not null,
    CD_MERCH_SCOPE varchar(64) not null,
    constraint PK_RECON_ACCT primary key (ID_RECON_ACCT)
);
comment on table RHN_BIL_RECON_ACCT is '支付对账商户范围；一行代表一个租户独占的渠道商户账单覆盖范围';
comment on column RHN_BIL_RECON_ACCT.ID_RECON_ACCT is '主键';
comment on column RHN_BIL_RECON_ACCT.ID_TNT is '租户标识';
comment on column RHN_BIL_RECON_ACCT.CD_MERCH_SCOPE is '商户账单范围指纹';
create table RHN_BIL_RECON_POLICY (
    ID_RECON_POLICY bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    CD_PAY_METHOD varchar(128) not null,
    CD_MERCH_SCOPE varchar(64) not null,
    FL_AUTO boolean not null,
    TM_FETCH varchar(128) not null,
    QTY_BKFILL int not null,
    ID_USER_UPDATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    DES_SCHED_ERROR varchar(1024),
    DT_SCHED_ERROR timestamp with time zone,
    constraint PK_RECON_POLICY primary key (ID_RECON_POLICY)
);
comment on table RHN_BIL_RECON_POLICY is '支付交易对账策略；一行代表一个机构支付方式的自动拉取策略';
comment on column RHN_BIL_RECON_POLICY.ID_RECON_POLICY is '主键';
comment on column RHN_BIL_RECON_POLICY.REVISION is '乐观锁版本';
comment on column RHN_BIL_RECON_POLICY.ID_TNT is '租户标识';
comment on column RHN_BIL_RECON_POLICY.ID_ORG is '归属法人机构标识';
comment on column RHN_BIL_RECON_POLICY.CD_PAY_METHOD is '支付方式编码';
comment on column RHN_BIL_RECON_POLICY.CD_MERCH_SCOPE is '商户账单范围指纹';
comment on column RHN_BIL_RECON_POLICY.FL_AUTO is '是否自动拉取核对';
comment on column RHN_BIL_RECON_POLICY.TM_FETCH is '账单时区的每日拉取时刻';
comment on column RHN_BIL_RECON_POLICY.QTY_BKFILL is '历史补拉天数';
comment on column RHN_BIL_RECON_POLICY.ID_USER_UPDATED is '最后配置人标识';
comment on column RHN_BIL_RECON_POLICY.DT_UPDATED is '最后配置时间';
comment on column RHN_BIL_RECON_POLICY.DES_SCHED_ERROR is '自动调度脱敏错误说明';
comment on column RHN_BIL_RECON_POLICY.DT_SCHED_ERROR is '自动调度错误发生时间';
create table RHN_BIL_RECON_TASK (
    ID_RECON_TASK bigint,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG_CRED bigint not null,
    CD_PAY_METHOD varchar(128) not null,
    CD_ADAPTER varchar(128) not null,
    CD_MERCH_SCOPE varchar(64) not null,
    ID_MERCH varchar(128) not null,
    CD_ENV varchar(256) not null,
    ID_APP varchar(128) not null,
    DA_BIZ date not null,
    CD_CCY varchar(128) not null,
    SD_STATUS varchar(32) not null,
    QTY_ATTEMPT int not null,
    NUM_CLAIM bigint not null,
    DT_NEXT timestamp with time zone not null,
    DT_LEASE timestamp with time zone,
    DT_CMPLD timestamp with time zone,
    DES_ERROR varchar(1024),
    CD_ERROR varchar(128),
    ID_RECON_FILE bigint,
    ID_USER_CREATED bigint not null,
    DT_CREATED timestamp with time zone not null,
    CD_REQUEST varchar(128) not null,
    constraint PK_RECON_TASK primary key (ID_RECON_TASK)
);
comment on table RHN_BIL_RECON_TASK is '支付交易账单任务；一行代表一个商户账期的可恢复拉取任务';
comment on column RHN_BIL_RECON_TASK.ID_RECON_TASK is '主键';
comment on column RHN_BIL_RECON_TASK.REVISION is '乐观锁版本';
comment on column RHN_BIL_RECON_TASK.ID_TNT is '租户标识';
comment on column RHN_BIL_RECON_TASK.ID_ORG_CRED is '凭证所属机构标识';
comment on column RHN_BIL_RECON_TASK.CD_PAY_METHOD is '支付方式编码';
comment on column RHN_BIL_RECON_TASK.CD_ADAPTER is '适配器编码';
comment on column RHN_BIL_RECON_TASK.CD_MERCH_SCOPE is '商户账单范围指纹';
comment on column RHN_BIL_RECON_TASK.ID_MERCH is '渠道商户标识快照';
comment on column RHN_BIL_RECON_TASK.CD_ENV is '渠道环境快照';
comment on column RHN_BIL_RECON_TASK.ID_APP is '凭证应用标识快照';
comment on column RHN_BIL_RECON_TASK.DA_BIZ is '渠道账单日期';
comment on column RHN_BIL_RECON_TASK.CD_CCY is '币种编码';
comment on column RHN_BIL_RECON_TASK.SD_STATUS is '处理状态';
comment on column RHN_BIL_RECON_TASK.QTY_ATTEMPT is '执行尝试序号';
comment on column RHN_BIL_RECON_TASK.NUM_CLAIM is '任务领取令牌';
comment on column RHN_BIL_RECON_TASK.DT_NEXT is '下一次尝试时间';
comment on column RHN_BIL_RECON_TASK.DT_LEASE is '租约失效时间';
comment on column RHN_BIL_RECON_TASK.DT_CMPLD is '最后成功处理时间';
comment on column RHN_BIL_RECON_TASK.DES_ERROR is '脱敏错误说明';
comment on column RHN_BIL_RECON_TASK.CD_ERROR is '安全错误分类';
comment on column RHN_BIL_RECON_TASK.ID_RECON_FILE is '最新已发布证据版本标识';
comment on column RHN_BIL_RECON_TASK.ID_USER_CREATED is '任务发起人标识';
comment on column RHN_BIL_RECON_TASK.DT_CREATED is '创建时间';
comment on column RHN_BIL_RECON_TASK.CD_REQUEST is '初始幂等命令编码';
create table RHN_BIL_RECON_FILE (
    ID_RECON_FILE bigint,
    ID_TNT bigint not null,
    ID_RECON_TASK bigint not null,
    NUM_ATTEMPT int not null,
    TXT_SHA varchar(64) not null,
    TXT_CIPHER clob not null,
    CD_PARSER varchar(128) not null,
    CD_RULE varchar(128) not null,
    TXT_LOCAL_HASH varchar(64) not null,
    TXT_PROOF varchar(128) not null,
    DT_CREATED timestamp with time zone not null,
    FL_CMPL boolean not null,
    constraint PK_RECON_FILE primary key (ID_RECON_FILE)
);
comment on table RHN_BIL_RECON_FILE is '支付交易账单证据版本；一行代表一次取得的商户账单证据及其发布状态';
comment on column RHN_BIL_RECON_FILE.ID_RECON_FILE is '主键';
comment on column RHN_BIL_RECON_FILE.ID_TNT is '租户标识';
comment on column RHN_BIL_RECON_FILE.ID_RECON_TASK is '商户账单任务标识';
comment on column RHN_BIL_RECON_FILE.NUM_ATTEMPT is '执行尝试序号';
comment on column RHN_BIL_RECON_FILE.TXT_SHA is '原始证据内容摘要';
comment on column RHN_BIL_RECON_FILE.TXT_CIPHER is '原始账单集合密文；不保存明文';
comment on column RHN_BIL_RECON_FILE.CD_PARSER is '账单解析器版本';
comment on column RHN_BIL_RECON_FILE.CD_RULE is '匹配规则版本';
comment on column RHN_BIL_RECON_FILE.TXT_LOCAL_HASH is '本地事实快照摘要';
comment on column RHN_BIL_RECON_FILE.TXT_PROOF is '渠道来源校验方式';
comment on column RHN_BIL_RECON_FILE.DT_CREATED is '创建时间';
comment on column RHN_BIL_RECON_FILE.FL_CMPL is '是否完整发布';
create table RHN_BIL_RECON_ROW (
    REVISION bigint default 0 not null,
    ID_RECON_ROW bigint,
    ID_TNT bigint not null,
    ID_RECON_FILE bigint not null,
    NUM_LINE int not null,
    ID_ORG bigint,
    ID_PAY_ORDER bigint,
    SD_TXN_TYPE varchar(32) not null,
    CD_MERCH_ORDER varchar(128),
    CD_EXT_TXN varchar(128),
    CD_REF_REQ varchar(128),
    CD_EXT_REF varchar(128),
    CD_ORIG_TXN varchar(128),
    AMT_GROSS decimal(24,6) not null,
    AMT_SETTLE decimal(24,6),
    AMT_FEE decimal(24,6),
    CD_CCY varchar(128) not null,
    SD_CHANNEL_STATUS varchar(32) not null,
    SD_OUTCOME varchar(32) not null,
    FL_FINAL boolean not null,
    DT_OCCRD timestamp with time zone not null,
    SD_DISPOS varchar(32) not null,
    ID_PRPSR bigint,
    ID_RVWR bigint,
    DES_REASON varchar(2000),
    constraint PK_RECON_ROW primary key (ID_RECON_ROW)
);
comment on table RHN_BIL_RECON_ROW is '支付交易账单规范明细；一行代表一个证据版本中的独立收退事件';
comment on column RHN_BIL_RECON_ROW.REVISION is '乐观锁版本';
comment on column RHN_BIL_RECON_ROW.ID_RECON_ROW is '主键';
comment on column RHN_BIL_RECON_ROW.ID_TNT is '租户标识';
comment on column RHN_BIL_RECON_ROW.ID_RECON_FILE is '证据版本标识';
comment on column RHN_BIL_RECON_ROW.NUM_LINE is '账单规范明细行号';
comment on column RHN_BIL_RECON_ROW.ID_ORG is '归属法人机构标识';
comment on column RHN_BIL_RECON_ROW.ID_PAY_ORDER is '可信原支付指令标识';
comment on column RHN_BIL_RECON_ROW.SD_TXN_TYPE is '收款退款或撤销类型';
comment on column RHN_BIL_RECON_ROW.CD_MERCH_ORDER is '商户支付订单号';
comment on column RHN_BIL_RECON_ROW.CD_EXT_TXN is '渠道原交易号';
comment on column RHN_BIL_RECON_ROW.CD_REF_REQ is '商户退款请求号';
comment on column RHN_BIL_RECON_ROW.CD_EXT_REF is '渠道退款单号';
comment on column RHN_BIL_RECON_ROW.CD_ORIG_TXN is '退款关联渠道原交易号';
comment on column RHN_BIL_RECON_ROW.AMT_GROSS is '业务收退金额';
comment on column RHN_BIL_RECON_ROW.AMT_SETTLE is '渠道应结金额；与业务金额分开保存';
comment on column RHN_BIL_RECON_ROW.AMT_FEE is '渠道手续费原始符号金额';
comment on column RHN_BIL_RECON_ROW.CD_CCY is '币种编码';
comment on column RHN_BIL_RECON_ROW.SD_CHANNEL_STATUS is '渠道原始交易或退款状态';
comment on column RHN_BIL_RECON_ROW.SD_OUTCOME is '规范化交易最终状态';
comment on column RHN_BIL_RECON_ROW.FL_FINAL is '账单是否明确最终成功';
comment on column RHN_BIL_RECON_ROW.DT_OCCRD is '渠道事件发生时间';
comment on column RHN_BIL_RECON_ROW.SD_DISPOS is '未归属明细处置状态';
comment on column RHN_BIL_RECON_ROW.ID_PRPSR is '例外提交人标识';
comment on column RHN_BIL_RECON_ROW.ID_RVWR is '复核人标识';
comment on column RHN_BIL_RECON_ROW.DES_REASON is '处置或复核依据';
create table RHN_BIL_RECON_ACTION (
    ID_RECON_ACTION bigint,
    ID_TNT bigint not null,
    CD_COMMAND varchar(128) not null,
    TXT_INPUT_HASH varchar(64) not null,
    SD_ACTION varchar(32) not null,
    ID_TARGET bigint not null,
    ID_ACTOR bigint not null,
    DES_REASON varchar(2000),
    DT_CREATED timestamp with time zone not null,
    SD_STATUS varchar(32) not null,
    TXT_RESULT clob,
    DT_LEASE timestamp with time zone,
    constraint PK_RECON_ACTION primary key (ID_RECON_ACTION)
);
comment on table RHN_BIL_RECON_ACTION is '支付对账操作凭据；一行代表一次幂等命令和审计结果';
comment on column RHN_BIL_RECON_ACTION.ID_RECON_ACTION is '主键';
comment on column RHN_BIL_RECON_ACTION.ID_TNT is '租户标识';
comment on column RHN_BIL_RECON_ACTION.CD_COMMAND is '幂等命令编码';
comment on column RHN_BIL_RECON_ACTION.TXT_INPUT_HASH is '命令输入指纹';
comment on column RHN_BIL_RECON_ACTION.SD_ACTION is '审计动作类型';
comment on column RHN_BIL_RECON_ACTION.ID_TARGET is '审计目标标识';
comment on column RHN_BIL_RECON_ACTION.ID_ACTOR is '实际操作人标识';
comment on column RHN_BIL_RECON_ACTION.DES_REASON is '处置或复核依据';
comment on column RHN_BIL_RECON_ACTION.DT_CREATED is '创建时间';
comment on column RHN_BIL_RECON_ACTION.SD_STATUS is '处理状态';
comment on column RHN_BIL_RECON_ACTION.TXT_RESULT is '脱敏查询结果';
comment on column RHN_BIL_RECON_ACTION.DT_LEASE is '租约失效时间';
alter table RHN_BIL_RECON_BATCH add ID_RECON_FILE bigint;
comment on column RHN_BIL_RECON_BATCH.ID_RECON_FILE is '渠道账单证据版本标识';
alter table RHN_BIL_RECON_BATCH add ID_RECON_TASK bigint;
comment on column RHN_BIL_RECON_BATCH.ID_RECON_TASK is '商户账单任务标识';
alter table RHN_BIL_RECON_BATCH add NUM_EXEC int default 0 not null;
comment on column RHN_BIL_RECON_BATCH.NUM_EXEC is '对账执行版本序号';
alter table RHN_BIL_RECON_BATCH add CD_MERCH_SCOPE varchar(64) default 'LEGACY' not null;
comment on column RHN_BIL_RECON_BATCH.CD_MERCH_SCOPE is '商户账单范围指纹';
alter table RHN_BIL_RECON_BATCH add SD_CLOSURE varchar(32) default 'OPEN' not null;
comment on column RHN_BIL_RECON_BATCH.SD_CLOSURE is '财务结案状态；与对平结果分开';
alter table RHN_BIL_RECON_BATCH add ID_RVWR bigint;
comment on column RHN_BIL_RECON_BATCH.ID_RVWR is '复核人标识';
alter table RHN_BIL_RECON_BATCH add DT_RVWD timestamp with time zone;
comment on column RHN_BIL_RECON_BATCH.DT_RVWD is '复核时间';
alter table RHN_BIL_RECON_BATCH add DT_SNAP timestamp with time zone;
comment on column RHN_BIL_RECON_BATCH.DT_SNAP is '本地快照截止时间';
alter table RHN_BIL_RECON_BATCH add TXT_LOCAL_HASH varchar(64);
comment on column RHN_BIL_RECON_BATCH.TXT_LOCAL_HASH is '本地事实快照摘要';
alter table RHN_BIL_RECON_BATCH add AMT_EXT_PAY decimal(24,6) default 0 not null;
comment on column RHN_BIL_RECON_BATCH.AMT_EXT_PAY is '渠道收款业务总额';
alter table RHN_BIL_RECON_BATCH add AMT_REF_ACCEPT decimal(24,6) default 0 not null;
comment on column RHN_BIL_RECON_BATCH.AMT_REF_ACCEPT is '渠道退款受理业务总额';
alter table RHN_BIL_RECON_BATCH add AMT_REF_FINAL decimal(24,6) default 0 not null;
comment on column RHN_BIL_RECON_BATCH.AMT_REF_FINAL is '渠道最终退款业务总额';
alter table RHN_BIL_RECON_BATCH add AMT_FEE decimal(24,6) default 0 not null;
comment on column RHN_BIL_RECON_BATCH.AMT_FEE is '渠道手续费合计';
alter table RHN_BIL_RECON_ITEM add ID_RECON_ROW bigint;
comment on column RHN_BIL_RECON_ITEM.ID_RECON_ROW is '账单规范明细标识';
alter table RHN_BIL_RECON_ITEM add ID_PAY_ORDER bigint;
comment on column RHN_BIL_RECON_ITEM.ID_PAY_ORDER is '可信原支付指令标识';
alter table RHN_BIL_RECON_ITEM add SD_TXN_TYPE varchar(32);
comment on column RHN_BIL_RECON_ITEM.SD_TXN_TYPE is '收款退款或撤销类型';
alter table RHN_BIL_RECON_ITEM add SD_CHANNEL_STATUS varchar(32);
comment on column RHN_BIL_RECON_ITEM.SD_CHANNEL_STATUS is '渠道原始交易或退款状态';
alter table RHN_BIL_RECON_ITEM add DT_CHANNEL timestamp with time zone;
comment on column RHN_BIL_RECON_ITEM.DT_CHANNEL is '渠道事件发生时间';
alter table RHN_BIL_RECON_ITEM add DT_POSTED timestamp with time zone;
comment on column RHN_BIL_RECON_ITEM.DT_POSTED is '本地资金事实记账时间';
alter table RHN_BIL_RECON_ITEM add ID_RVWR bigint;
comment on column RHN_BIL_RECON_ITEM.ID_RVWR is '复核人标识';
alter table RHN_BIL_RECON_ITEM add DT_RVWD timestamp with time zone;
comment on column RHN_BIL_RECON_ITEM.DT_RVWD is '复核时间';
alter table RHN_BIL_RECON_ITEM_EVT add TXT_INPUT_HASH varchar(64);
comment on column RHN_BIL_RECON_ITEM_EVT.TXT_INPUT_HASH is '命令输入指纹';

alter table RHN_BIL_RECON_ATTEMPT add constraint UK_RECON_ATTEMPT_TASK unique (ID_TNT,ID_RECON_TASK,NUM_ATTEMPT);


alter table RHN_BIL_RECON_ACCT add constraint UK_RECON_ACCT_SCOPE unique (CD_MERCH_SCOPE);
alter table RHN_BIL_RECON_ACCT add constraint UK_RECON_ACCT_TNT_SCOPE unique (ID_TNT,CD_MERCH_SCOPE);
alter table RHN_BIL_RECON_POLICY add constraint UK_RECON_POLICY_ORG unique (ID_TNT,ID_ORG,CD_PAY_METHOD);
alter table RHN_BIL_RECON_POLICY add constraint FK_RECON_POLICY_ORG foreign key (ID_TNT,ID_ORG) references RHN_SYS_ORG(ID_TNT,ID_ORG);
alter table RHN_BIL_RECON_POLICY add constraint FK_RECON_POLICY_SCOPE foreign key (ID_TNT,CD_MERCH_SCOPE) references RHN_BIL_RECON_ACCT(ID_TNT,CD_MERCH_SCOPE);
alter table RHN_BIL_RECON_TASK add constraint UK_RECON_TASK_SCOPE unique (ID_TNT,CD_MERCH_SCOPE,DA_BIZ,CD_CCY);
alter table RHN_BIL_RECON_TASK add constraint UK_RECON_TASK_TNT unique (ID_TNT,ID_RECON_TASK);
alter table RHN_BIL_RECON_ATTEMPT add constraint FK_RECON_ATTEMPT_TASK foreign key (ID_TNT,ID_RECON_TASK) references RHN_BIL_RECON_TASK(ID_TNT,ID_RECON_TASK);
alter table RHN_BIL_RECON_TASK add constraint UK_RECON_TASK_COMMAND unique (ID_TNT,CD_REQUEST);
alter table RHN_BIL_RECON_TASK add constraint FK_RECON_TASK_SCOPE foreign key (ID_TNT,CD_MERCH_SCOPE) references RHN_BIL_RECON_ACCT(ID_TNT,CD_MERCH_SCOPE);
alter table RHN_BIL_RECON_TASK add constraint FK_RECON_TASK_CRED_ORG foreign key (ID_TNT,ID_ORG_CRED) references RHN_SYS_ORG(ID_TNT,ID_ORG);
alter table RHN_BIL_RECON_FILE add constraint UK_RECON_FILE_TNT unique (ID_TNT,ID_RECON_FILE);
alter table RHN_BIL_RECON_FILE add constraint UK_RECON_FILE_ATTEMPT unique (ID_TNT,ID_RECON_TASK,NUM_ATTEMPT);
alter table RHN_BIL_RECON_FILE add constraint FK_RECON_FILE_TASK foreign key (ID_TNT,ID_RECON_TASK) references RHN_BIL_RECON_TASK(ID_TNT,ID_RECON_TASK);
alter table RHN_BIL_RECON_TASK add constraint FK_RECON_TASK_FILE foreign key (ID_TNT,ID_RECON_FILE) references RHN_BIL_RECON_FILE(ID_TNT,ID_RECON_FILE);
alter table RHN_BIL_RECON_ROW add constraint UK_RECON_ROW_LINE unique (ID_TNT,ID_RECON_FILE,NUM_LINE);
alter table RHN_BIL_RECON_ROW add constraint FK_RECON_ROW_FILE foreign key (ID_TNT,ID_RECON_FILE) references RHN_BIL_RECON_FILE(ID_TNT,ID_RECON_FILE);
alter table RHN_BIL_RECON_ROW add constraint FK_RECON_ROW_ORG foreign key (ID_TNT,ID_ORG) references RHN_SYS_ORG(ID_TNT,ID_ORG);
alter table RHN_BIL_RECON_ACTION add constraint UK_RECON_ACTION_COMMAND unique (ID_TNT,CD_COMMAND);
alter table RHN_BIL_RECON_BATCH drop constraint UK_BIL_RECON_BATC_RECON_BATC_3;
alter table RHN_BIL_RECON_BATCH add constraint UK_RECON_BATCH_SCOPE_VER unique (ID_TNT,ID_ORG,SD_RECON_TYPE,CD_SRC,CD_PAY_METHOD,DA_BIZ,CD_CCY,CD_MERCH_SCOPE,NUM_EXEC);
alter table RHN_BIL_RECON_BATCH add constraint UK_RECON_BATCH_FILE_ORG unique (ID_TNT,ID_ORG,ID_RECON_FILE);
alter table RHN_BIL_RECON_BATCH add constraint FK_RECON_BATCH_FILE foreign key (ID_TNT,ID_RECON_FILE) references RHN_BIL_RECON_FILE(ID_TNT,ID_RECON_FILE);
alter table RHN_BIL_RECON_ITEM add constraint FK_RECON_ITEM_ROW foreign key (ID_RECON_ROW) references RHN_BIL_RECON_ROW(ID_RECON_ROW);
alter table RHN_BIL_RECON_ITEM drop constraint CK_BIL_RECON_ITEM_RECON_ITEM_M;
alter table RHN_BIL_RECON_ITEM add constraint CK_BIL_RECON_ITEM_RECON_ITEM_M check (SD_MATCH_TYPE in ('MATCHED','LOCAL_ONLY','EXTERNAL_ONLY','AMOUNT_DIFFERENCE','STATUS_DIFFERENCE','DUPLICATE','TIME_DIFFERENCE','IDENTITY_DIFFERENCE','AWAITING_CONFIRMATION','LOCAL_NOT_POSTED','REVERSAL_REVIEW','LEDGER_DIFFERENCE'));
alter table RHN_BIL_RECON_ITEM drop constraint CK_BIL_RECON_ITEM_RECON_ITEM_S;
alter table RHN_BIL_RECON_ITEM add constraint CK_BIL_RECON_ITEM_RECON_ITEM_S check (SD_STATUS in ('OPEN','RESOLVED','IGNORED','REVIEW_PENDING','ACCEPTED_EXCEPTION'));
alter table RHN_BIL_RECON_ITEM_EVT drop constraint CK_BIL_RECON_ITEM_RECON_EVENT_;
alter table RHN_BIL_RECON_ITEM_EVT add constraint CK_BIL_RECON_ITEM_RECON_EVENT_ check (SD_EVT_TYPE in ('DETECT','RESOLVE','IGNORE','REOPEN','SUBMIT','APPROVE','REJECT','QUERY'));
create index IX_RECON_TASK_DUE on RHN_BIL_RECON_TASK(SD_STATUS,DT_NEXT,DT_LEASE);
create index IX_RECON_ROW_ORG on RHN_BIL_RECON_ROW(ID_TNT,ID_RECON_FILE,ID_ORG,NUM_LINE);
create index IX_RECON_ITEM_ORDER on RHN_BIL_RECON_ITEM(ID_TNT,ID_PAY_ORDER);
create index IX_RECON_ITEM_BATCH_STATUS on RHN_BIL_RECON_ITEM(ID_TNT,ID_RECON_BATCH,SD_STATUS);

insert into RHN_SYS_MGMT_MOD (ID_MGMT_MOD,ID_TNT,ID_MGMT_MOD_PARENT,CD_MGMT_MOD,NA_MGMT_MOD,SD_MOD_TYPE,ROUTE_PATH,CD_COMP,CD_ICON,SN_SORT,SD_STATUS,DT_CREATED,DT_UPDATED,REVISION)
select 362387869900100+row_number() over(order by p.ID_TNT),p.ID_TNT,p.ID_MGMT_MOD,'PAYMENT_RECONCILIATION','支付对账','MODULE','/billing/payment-reconciliation','PaymentReconciliationWorkspace','billing',65,'ACTIVE',current_timestamp,current_timestamp,0
from RHN_SYS_MGMT_MOD p where p.CD_MGMT_MOD='BILLING';
insert into RHN_SYS_ACC_PERM (ID_ACC_PERM,ID_TNT,ID_MGMT_MOD,CD_ACC_PERM,NA_ACC_PERM,CD_ACTION,CD_RSRC,SD_STATUS)
select 362387869900200+row_number() over(order by m.ID_TNT),m.ID_TNT,m.ID_MGMT_MOD,'PAYMENT_RECONCILIATION.READ','查看支付交易对账','READ','PAYMENT_RECONCILIATION','ACTIVE' from RHN_SYS_MGMT_MOD m where m.CD_MGMT_MOD='PAYMENT_RECONCILIATION';
insert into RHN_SYS_ACC_PERM (ID_ACC_PERM,ID_TNT,ID_MGMT_MOD,CD_ACC_PERM,NA_ACC_PERM,CD_ACTION,CD_RSRC,SD_STATUS)
select 362387869900300+row_number() over(order by m.ID_TNT),m.ID_TNT,m.ID_MGMT_MOD,'PAYMENT_RECONCILIATION.RUN','拉取核对及配置对账策略','RUN','PAYMENT_RECONCILIATION','ACTIVE' from RHN_SYS_MGMT_MOD m where m.CD_MGMT_MOD='PAYMENT_RECONCILIATION';
insert into RHN_SYS_ACC_PERM (ID_ACC_PERM,ID_TNT,ID_MGMT_MOD,CD_ACC_PERM,NA_ACC_PERM,CD_ACTION,CD_RSRC,SD_STATUS)
select 362387869900400+row_number() over(order by m.ID_TNT),m.ID_TNT,m.ID_MGMT_MOD,'PAYMENT_RECONCILIATION.HANDLE','核查支付对账差异','HANDLE','PAYMENT_RECONCILIATION','ACTIVE' from RHN_SYS_MGMT_MOD m where m.CD_MGMT_MOD='PAYMENT_RECONCILIATION';
insert into RHN_SYS_ACC_PERM (ID_ACC_PERM,ID_TNT,ID_MGMT_MOD,CD_ACC_PERM,NA_ACC_PERM,CD_ACTION,CD_RSRC,SD_STATUS)
select 362387869900500+row_number() over(order by m.ID_TNT),m.ID_TNT,m.ID_MGMT_MOD,'PAYMENT_RECONCILIATION.REVIEW','复核支付对账例外','REVIEW','PAYMENT_RECONCILIATION','ACTIVE' from RHN_SYS_MGMT_MOD m where m.CD_MGMT_MOD='PAYMENT_RECONCILIATION';
insert into RHN_SYS_ACC_PERM (ID_ACC_PERM,ID_TNT,ID_MGMT_MOD,CD_ACC_PERM,NA_ACC_PERM,CD_ACTION,CD_RSRC,SD_STATUS)
select 362387869900600+row_number() over(order by m.ID_TNT),m.ID_TNT,m.ID_MGMT_MOD,'PAYMENT_RECONCILIATION.EXPORT','导出支付对账结果','EXPORT','PAYMENT_RECONCILIATION','ACTIVE' from RHN_SYS_MGMT_MOD m where m.CD_MGMT_MOD='PAYMENT_RECONCILIATION';
insert into RHN_SYS_ACC_PERM (ID_ACC_PERM,ID_TNT,ID_MGMT_MOD,CD_ACC_PERM,NA_ACC_PERM,CD_ACTION,CD_RSRC,SD_STATUS)
select 362387869900700+row_number() over(order by m.ID_TNT),m.ID_TNT,m.ID_MGMT_MOD,'PAYMENT_RECONCILIATION.MERCHANT_READ','读取商户全账与未归属流水','MERCHANT_READ','PAYMENT_RECONCILIATION','ACTIVE' from RHN_SYS_MGMT_MOD m where m.CD_MGMT_MOD='PAYMENT_RECONCILIATION';
insert into RHN_SYS_ACC_PERM (ID_ACC_PERM,ID_TNT,ID_MGMT_MOD,CD_ACC_PERM,NA_ACC_PERM,CD_ACTION,CD_RSRC,SD_STATUS)
select 362387869900800+row_number() over(order by m.ID_TNT),m.ID_TNT,m.ID_MGMT_MOD,'PAYMENT_RECONCILIATION.IMPORT','受控导入历史标准化账单','IMPORT','PAYMENT_RECONCILIATION','ACTIVE' from RHN_SYS_MGMT_MOD m where m.CD_MGMT_MOD='PAYMENT_RECONCILIATION';
insert into RHN_SYS_ACC_ROLE (ID_ACC_ROLE,ID_TNT,CD_ACC_ROLE,NA_ACC_ROLE,SD_ROLE_TYPE,SD_STATUS,DT_CREATED,DT_UPDATED,REVISION)
select 362387869901100+row_number() over(order by t.ID_TNT),t.ID_TNT,'PAYMENT_RECON_ADMIN','支付对账财务人员','ADMIN','ACTIVE',current_timestamp,current_timestamp,0 from RHN_SYS_TNT t;
insert into RHN_SYS_ROLE_PERM_ASSIGN (ID_ROLE_PERM_ASSIGN,ID_TNT,ID_ACC_ROLE,ID_ACC_PERM,DT_VALID_FROM,DT_CREATED)
select 362387869902100+row_number() over(order by r.ID_TNT,p.ID_ACC_PERM),r.ID_TNT,r.ID_ACC_ROLE,p.ID_ACC_PERM,current_timestamp,current_timestamp from RHN_SYS_ACC_ROLE r join RHN_SYS_ACC_PERM p on r.ID_TNT=p.ID_TNT where r.CD_ACC_ROLE='PAYMENT_RECON_ADMIN' and p.CD_ACC_PERM in ('PAYMENT_RECONCILIATION.READ','PAYMENT_RECONCILIATION.RUN','PAYMENT_RECONCILIATION.HANDLE','PAYMENT_RECONCILIATION.REVIEW','PAYMENT_RECONCILIATION.EXPORT');
insert into RHN_SYS_ACC_ROLE (ID_ACC_ROLE,ID_TNT,CD_ACC_ROLE,NA_ACC_ROLE,SD_ROLE_TYPE,SD_STATUS,DT_CREATED,DT_UPDATED,REVISION)
select 362387869901200+row_number() over(order by t.ID_TNT),t.ID_TNT,'PAYMENT_RECON_MERCHANT','支付商户全账财务人员','ADMIN','ACTIVE',current_timestamp,current_timestamp,0 from RHN_SYS_TNT t;
insert into RHN_SYS_ROLE_PERM_ASSIGN (ID_ROLE_PERM_ASSIGN,ID_TNT,ID_ACC_ROLE,ID_ACC_PERM,DT_VALID_FROM,DT_CREATED)
select 362387869902200+row_number() over(order by r.ID_TNT,p.ID_ACC_PERM),r.ID_TNT,r.ID_ACC_ROLE,p.ID_ACC_PERM,current_timestamp,current_timestamp from RHN_SYS_ACC_ROLE r join RHN_SYS_ACC_PERM p on r.ID_TNT=p.ID_TNT where r.CD_ACC_ROLE='PAYMENT_RECON_MERCHANT' and p.CD_ACC_PERM in ('PAYMENT_RECONCILIATION.READ','PAYMENT_RECONCILIATION.RUN','PAYMENT_RECONCILIATION.HANDLE','PAYMENT_RECONCILIATION.REVIEW','PAYMENT_RECONCILIATION.EXPORT','PAYMENT_RECONCILIATION.MERCHANT_READ');
insert into RHN_SYS_ACC_ROLE (ID_ACC_ROLE,ID_TNT,CD_ACC_ROLE,NA_ACC_ROLE,SD_ROLE_TYPE,SD_STATUS,DT_CREATED,DT_UPDATED,REVISION)
select 362387869901300+row_number() over(order by t.ID_TNT),t.ID_TNT,'PAYMENT_RECON_IMPORT','支付账单受控导入人员','ADMIN','ACTIVE',current_timestamp,current_timestamp,0 from RHN_SYS_TNT t;
insert into RHN_SYS_ROLE_PERM_ASSIGN (ID_ROLE_PERM_ASSIGN,ID_TNT,ID_ACC_ROLE,ID_ACC_PERM,DT_VALID_FROM,DT_CREATED)
select 362387869902300+row_number() over(order by r.ID_TNT,p.ID_ACC_PERM),r.ID_TNT,r.ID_ACC_ROLE,p.ID_ACC_PERM,current_timestamp,current_timestamp from RHN_SYS_ACC_ROLE r join RHN_SYS_ACC_PERM p on r.ID_TNT=p.ID_TNT where r.CD_ACC_ROLE='PAYMENT_RECON_IMPORT' and p.CD_ACC_PERM in ('PAYMENT_RECONCILIATION.READ','PAYMENT_RECONCILIATION.IMPORT');
