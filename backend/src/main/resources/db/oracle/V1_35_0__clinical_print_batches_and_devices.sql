create table RHN_META_PRINT_DEVICE (
    ID_PRINT_DEVICE number(19) primary key,
    REVISION number(19) default 0 not null,
    ID_TNT number(19) not null,
    ID_ORG number(19),
    ID_DEPT number(19),
    CD_DEVICE varchar(80) not null,
    NA_DEVICE varchar(200) not null,
    SD_CHANNEL varchar(24) not null,
    SD_OUTPUT_LANG varchar(24) not null,
    NA_QUEUE varchar(200),
    JSON_CAPABILITIES clob not null,
    SD_STATUS varchar(24) not null,
    DT_LAST_SEEN timestamp with time zone,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED number(19),
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED number(19),
    constraint UK_META_PRINT_DEVICE_CODE unique (ID_TNT, CD_DEVICE),
    constraint CK_META_PRINT_DEVICE_CHANNEL check (SD_CHANNEL in ('BROWSER_PDF','LOCAL_BRIDGE')),
    constraint CK_META_PRINT_DEVICE_LANG check (SD_OUTPUT_LANG in ('PDF','ZPL','TSPL','ESC_POS')),
    constraint CK_META_PRINT_DEVICE_STATUS check (SD_STATUS in ('ACTIVE','OFFLINE','INACTIVE')),
    constraint FK_META_PRINT_DEVICE_TNT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT),
    constraint FK_META_PRINT_DEVICE_ORG foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG),
    constraint FK_META_PRINT_DEVICE_DEPT foreign key (ID_TNT, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_DEPT)
);

create table RHN_META_PRINT_DEV_BIND (
    ID_PRINT_DEV_BIND number(19) primary key,
    REVISION number(19) default 0 not null,
    ID_TNT number(19) not null,
    ID_ORG number(19) not null,
    ID_DEPT number(19) not null,
    CD_DOC_TYPE varchar(80) not null,
    ID_PRINT_MEDIA number(19) not null,
    ID_PRINT_DEVICE number(19) not null,
    FG_DEFAULT number(1) default 1 not null,
    SD_STATUS varchar(24) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED number(19),
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED number(19),
    constraint UK_META_PRINT_DEV_BIND unique (ID_TNT, ID_ORG, ID_DEPT, CD_DOC_TYPE, ID_PRINT_MEDIA),
    constraint CK_META_PRINT_DEV_BIND_STATUS check (SD_STATUS in ('ACTIVE','INACTIVE')),
    constraint FK_META_PRINT_DEV_BIND_TNT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT),
    constraint FK_META_PRINT_DEV_BIND_ORG foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG),
    constraint FK_META_PRINT_DEV_BIND_DEPT foreign key (ID_TNT, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_DEPT),
    constraint FK_META_PRINT_DEV_BIND_MEDIA foreign key (ID_PRINT_MEDIA) references RHN_META_PRINT_MEDIA(ID_PRINT_MEDIA),
    constraint FK_META_PRINT_DEV_BIND_DEV foreign key (ID_PRINT_DEVICE) references RHN_META_PRINT_DEVICE(ID_PRINT_DEVICE)
);

create table RHN_SYS_PRINT_BATCH (
    ID_PRINT_BATCH number(19) primary key,
    REVISION number(19) default 0 not null,
    ID_TNT number(19) not null,
    ID_ORG number(19) not null,
    ID_DEPT number(19) not null,
    CD_DOC_TYPE varchar(80) not null,
    ID_PRINT_TMPL number(19) not null,
    ID_PRINT_TMPL_VER number(19) not null,
    ID_PRINT_MEDIA number(19) not null,
    ID_PRINT_DEVICE number(19),
    DA_BUSINESS date not null,
    JSON_SELECTION clob not null,
    SD_LAYOUT_STRATEGY varchar(32) not null,
    SN_START_SLOT number(10) default 1 not null,
    ID_IDEMPOTENCY varchar(128) not null,
    SD_STATUS varchar(32) not null,
    QTY_SELECTED number(10) default 0 not null,
    QTY_INCLUDED number(10) default 0 not null,
    QTY_EXCLUDED number(10) default 0 not null,
    QTY_PAGES number(10) default 0 not null,
    ID_PRINT_OUTPUT number(19),
    ID_PRINT_JOB number(19),
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED number(19) not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED number(19) not null,
    constraint UK_SYS_PRINT_BATCH_IDEM unique (ID_TNT, ID_IDEMPOTENCY),
    constraint CK_SYS_PRINT_BATCH_LAYOUT check (SD_LAYOUT_STRATEGY in ('ONE_CARD_PER_PAGE','SHEET_GRID')),
    constraint CK_SYS_PRINT_BATCH_STATUS check (SD_STATUS in ('BUILDING','GENERATED','QUEUED','SENT','DEVICE_CONFIRMED','PARTIAL','FAILED','CANCELLED')),
    constraint CK_SYS_PRINT_BATCH_COUNT check (QTY_SELECTED >= 0 and QTY_INCLUDED >= 0 and QTY_EXCLUDED >= 0 and QTY_PAGES >= 0 and SN_START_SLOT >= 1),
    constraint FK_SYS_PRINT_BATCH_TNT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT),
    constraint FK_SYS_PRINT_BATCH_ORG foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG),
    constraint FK_SYS_PRINT_BATCH_DEPT foreign key (ID_TNT, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_DEPT),
    constraint FK_SYS_PRINT_BATCH_TMPL foreign key (ID_PRINT_TMPL) references RHN_META_PRINT_TMPL(ID_PRINT_TMPL),
    constraint FK_SYS_PRINT_BATCH_VER foreign key (ID_PRINT_TMPL_VER) references RHN_META_PRINT_TMPL_VER(ID_PRINT_TMPL_VER),
    constraint FK_SYS_PRINT_BATCH_MEDIA foreign key (ID_PRINT_MEDIA) references RHN_META_PRINT_MEDIA(ID_PRINT_MEDIA),
    constraint FK_SYS_PRINT_BATCH_DEVICE foreign key (ID_PRINT_DEVICE) references RHN_META_PRINT_DEVICE(ID_PRINT_DEVICE),
    constraint FK_SYS_PRINT_BATCH_OUTPUT foreign key (ID_TNT, ID_PRINT_OUTPUT) references RHN_SYS_PRINT_OUTPUT(ID_TNT, ID_PRINT_OUTPUT),
    constraint FK_SYS_PRINT_BATCH_JOB foreign key (ID_TNT, ID_PRINT_JOB) references RHN_SYS_PRINT_JOB(ID_TNT, ID_PRINT_JOB)
);

create table RHN_SYS_PRINT_BATCH_ITEM (
    ID_PRINT_BATCH_ITEM number(19) primary key,
    ID_TNT number(19) not null,
    ID_PRINT_BATCH number(19) not null,
    SD_SRC_TYPE varchar(80) not null,
    ID_SRC number(19) not null,
    SN_SRC_VER number(19) not null,
    ID_PAT number(19),
    ID_ENC number(19),
    CD_GROUP_KEY varchar(160) not null,
    ID_ITEM_KEY varchar(128) not null,
    JSON_SNAPSHOT clob,
    SD_STATUS varchar(24) not null,
    CD_EXCLUDE_REASON varchar(64),
    DES_EXCLUDE_REASON varchar(500),
    SN_PAGE number(10),
    SN_SLOT number(10),
    DES_REPRINT_REASON varchar(500),
    DT_CREATED timestamp with time zone not null,
    constraint UK_SYS_PRINT_BATCH_ITEM unique (ID_TNT, ID_PRINT_BATCH, ID_SRC),
    constraint CK_SYS_PRINT_BATCH_ITEM_STATUS check (SD_STATUS in ('INCLUDED','EXCLUDED','FAILED')),
    constraint CK_SYS_PRINT_BATCH_ITEM_VER check (SN_SRC_VER > 0),
    constraint FK_SYS_PRINT_BATCH_ITEM_TNT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT),
    constraint FK_SYS_PRINT_BATCH_ITEM_BATCH foreign key (ID_PRINT_BATCH) references RHN_SYS_PRINT_BATCH(ID_PRINT_BATCH),
    constraint FK_SYS_PRINT_BATCH_ITEM_PAT foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT),
    constraint FK_SYS_PRINT_BATCH_ITEM_ENC foreign key (ID_TNT, ID_ENC) references RHN_VIS_ENC(ID_TNT, ID_ENC)
);

create table RHN_SYS_PRINT_DELIVERY (
    ID_PRINT_DELIVERY number(19) primary key,
    REVISION number(19) default 0 not null,
    ID_TNT number(19) not null,
    ID_PRINT_BATCH number(19) not null,
    ID_PRINT_JOB number(19) not null,
    ID_PRINT_DEVICE number(19),
    SD_CHANNEL varchar(24) not null,
    SD_STATUS varchar(32) not null,
    QTY_ATTEMPT number(10) default 0 not null,
    CD_ERROR varchar(80),
    DES_ERROR varchar(1000),
    DT_QUEUED timestamp with time zone,
    DT_SENT timestamp with time zone,
    DT_CONFIRMED timestamp with time zone,
    DT_UPDATED timestamp with time zone not null,
    constraint CK_SYS_PRINT_DELIVERY_CHANNEL check (SD_CHANNEL in ('BROWSER_PDF','LOCAL_BRIDGE')),
    constraint CK_SYS_PRINT_DELIVERY_STATUS check (SD_STATUS in ('GENERATED','QUEUED','SENT','DEVICE_CONFIRMED','FAILED','CANCELLED')),
    constraint CK_SYS_PRINT_DELIVERY_ATTEMPT check (QTY_ATTEMPT >= 0),
    constraint FK_SYS_PRINT_DELIVERY_TNT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT),
    constraint FK_SYS_PRINT_DELIVERY_BATCH foreign key (ID_PRINT_BATCH) references RHN_SYS_PRINT_BATCH(ID_PRINT_BATCH),
    constraint FK_SYS_PRINT_DELIVERY_JOB foreign key (ID_TNT, ID_PRINT_JOB) references RHN_SYS_PRINT_JOB(ID_TNT, ID_PRINT_JOB),
    constraint FK_SYS_PRINT_DELIVERY_DEVICE foreign key (ID_PRINT_DEVICE) references RHN_META_PRINT_DEVICE(ID_PRINT_DEVICE)
);

create index IDX_META_PRINT_DEV_SCOPE on RHN_META_PRINT_DEVICE (ID_TNT, ID_ORG, ID_DEPT, SD_STATUS);
create index IDX_META_PRINT_BIND_RESOLVE on RHN_META_PRINT_DEV_BIND (ID_TNT, ID_ORG, ID_DEPT, CD_DOC_TYPE, SD_STATUS);
create index IDX_SYS_PRINT_BATCH_LIST on RHN_SYS_PRINT_BATCH (ID_TNT, ID_ORG, ID_DEPT, DT_CREATED);
create index IDX_SYS_PRINT_BATCH_ITEM_KEY on RHN_SYS_PRINT_BATCH_ITEM (ID_TNT, ID_ITEM_KEY, SD_STATUS);
create index IDX_SYS_PRINT_DELIVERY_QUEUE on RHN_SYS_PRINT_DELIVERY (ID_TNT, SD_CHANNEL, SD_STATUS, DT_UPDATED);

comment on table RHN_META_PRINT_DEVICE is '打印设备；一行代表一个浏览器或本地打印桥输出端点';
comment on table RHN_META_PRINT_DEV_BIND is '打印设备绑定；一行代表科室单据和介质到默认设备的路由';
comment on table RHN_SYS_PRINT_BATCH is '打印批次；一行代表一次经过对账的批量打印请求';
comment on table RHN_SYS_PRINT_BATCH_ITEM is '打印批次明细；一行代表一个纳入或排除的业务来源';
comment on table RHN_SYS_PRINT_DELIVERY is '打印投递；一行代表批次输出向浏览器或本地桥的一次投递';

comment on column RHN_META_PRINT_DEVICE.ID_PRINT_DEVICE is '打印设备主键';
comment on column RHN_META_PRINT_DEVICE.REVISION is '乐观锁修订号';
comment on column RHN_META_PRINT_DEVICE.ID_TNT is '租户标识';
comment on column RHN_META_PRINT_DEVICE.ID_ORG is '机构标识';
comment on column RHN_META_PRINT_DEVICE.ID_DEPT is '科室标识';
comment on column RHN_META_PRINT_DEVICE.CD_DEVICE is '设备编码';
comment on column RHN_META_PRINT_DEVICE.NA_DEVICE is '设备名称';
comment on column RHN_META_PRINT_DEVICE.SD_CHANNEL is '投递通道';
comment on column RHN_META_PRINT_DEVICE.SD_OUTPUT_LANG is '输出语言';
comment on column RHN_META_PRINT_DEVICE.NA_QUEUE is '系统打印队列名称';
comment on column RHN_META_PRINT_DEVICE.JSON_CAPABILITIES is '设备能力JSON';
comment on column RHN_META_PRINT_DEVICE.SD_STATUS is '设备状态';
comment on column RHN_META_PRINT_DEVICE.DT_LAST_SEEN is '最后心跳时间';
comment on column RHN_META_PRINT_DEVICE.DT_CREATED is '创建时间';
comment on column RHN_META_PRINT_DEVICE.ID_USER_CREATED is '创建人标识';
comment on column RHN_META_PRINT_DEVICE.DT_UPDATED is '更新时间';
comment on column RHN_META_PRINT_DEVICE.ID_USER_UPDATED is '更新人标识';

comment on column RHN_META_PRINT_DEV_BIND.ID_PRINT_DEV_BIND is '设备绑定主键';
comment on column RHN_META_PRINT_DEV_BIND.REVISION is '乐观锁修订号';
comment on column RHN_META_PRINT_DEV_BIND.ID_TNT is '租户标识';
comment on column RHN_META_PRINT_DEV_BIND.ID_ORG is '机构标识';
comment on column RHN_META_PRINT_DEV_BIND.ID_DEPT is '科室标识';
comment on column RHN_META_PRINT_DEV_BIND.CD_DOC_TYPE is '单据类型编码';
comment on column RHN_META_PRINT_DEV_BIND.ID_PRINT_MEDIA is '打印介质标识';
comment on column RHN_META_PRINT_DEV_BIND.ID_PRINT_DEVICE is '打印设备标识';
comment on column RHN_META_PRINT_DEV_BIND.FG_DEFAULT is '是否默认设备';
comment on column RHN_META_PRINT_DEV_BIND.SD_STATUS is '状态';
comment on column RHN_META_PRINT_DEV_BIND.DT_CREATED is '创建时间';
comment on column RHN_META_PRINT_DEV_BIND.ID_USER_CREATED is '创建人标识';
comment on column RHN_META_PRINT_DEV_BIND.DT_UPDATED is '更新时间';
comment on column RHN_META_PRINT_DEV_BIND.ID_USER_UPDATED is '更新人标识';

comment on column RHN_SYS_PRINT_BATCH.ID_PRINT_BATCH is '打印批次主键';
comment on column RHN_SYS_PRINT_BATCH.REVISION is '乐观锁修订号';
comment on column RHN_SYS_PRINT_BATCH.ID_TNT is '租户标识';
comment on column RHN_SYS_PRINT_BATCH.ID_ORG is '机构标识';
comment on column RHN_SYS_PRINT_BATCH.ID_DEPT is '科室标识';
comment on column RHN_SYS_PRINT_BATCH.CD_DOC_TYPE is '单据类型编码';
comment on column RHN_SYS_PRINT_BATCH.ID_PRINT_TMPL is '打印模板标识';
comment on column RHN_SYS_PRINT_BATCH.ID_PRINT_TMPL_VER is '打印模板版本标识';
comment on column RHN_SYS_PRINT_BATCH.ID_PRINT_MEDIA is '打印介质标识';
comment on column RHN_SYS_PRINT_BATCH.ID_PRINT_DEVICE is '目标打印设备标识';
comment on column RHN_SYS_PRINT_BATCH.DA_BUSINESS is '业务日期';
comment on column RHN_SYS_PRINT_BATCH.JSON_SELECTION is '选择条件快照JSON';
comment on column RHN_SYS_PRINT_BATCH.SD_LAYOUT_STRATEGY is '批量组版策略';
comment on column RHN_SYS_PRINT_BATCH.SN_START_SLOT is '预切纸起始格';
comment on column RHN_SYS_PRINT_BATCH.ID_IDEMPOTENCY is '请求幂等键';
comment on column RHN_SYS_PRINT_BATCH.SD_STATUS is '批次状态';
comment on column RHN_SYS_PRINT_BATCH.QTY_SELECTED is '选择来源数';
comment on column RHN_SYS_PRINT_BATCH.QTY_INCLUDED is '纳入卡片数';
comment on column RHN_SYS_PRINT_BATCH.QTY_EXCLUDED is '排除来源数';
comment on column RHN_SYS_PRINT_BATCH.QTY_PAGES is '物理页数';
comment on column RHN_SYS_PRINT_BATCH.ID_PRINT_OUTPUT is '批次输出标识';
comment on column RHN_SYS_PRINT_BATCH.ID_PRINT_JOB is '批次打印作业标识';
comment on column RHN_SYS_PRINT_BATCH.DT_CREATED is '创建时间';
comment on column RHN_SYS_PRINT_BATCH.ID_USER_CREATED is '创建人标识';
comment on column RHN_SYS_PRINT_BATCH.DT_UPDATED is '更新时间';
comment on column RHN_SYS_PRINT_BATCH.ID_USER_UPDATED is '更新人标识';

comment on column RHN_SYS_PRINT_BATCH_ITEM.ID_PRINT_BATCH_ITEM is '打印批次明细主键';
comment on column RHN_SYS_PRINT_BATCH_ITEM.ID_TNT is '租户标识';
comment on column RHN_SYS_PRINT_BATCH_ITEM.ID_PRINT_BATCH is '打印批次标识';
comment on column RHN_SYS_PRINT_BATCH_ITEM.SD_SRC_TYPE is '业务来源类型';
comment on column RHN_SYS_PRINT_BATCH_ITEM.ID_SRC is '业务来源标识';
comment on column RHN_SYS_PRINT_BATCH_ITEM.SN_SRC_VER is '业务来源版本';
comment on column RHN_SYS_PRINT_BATCH_ITEM.ID_PAT is '患者标识';
comment on column RHN_SYS_PRINT_BATCH_ITEM.ID_ENC is '就诊标识';
comment on column RHN_SYS_PRINT_BATCH_ITEM.CD_GROUP_KEY is '稳定分组键';
comment on column RHN_SYS_PRINT_BATCH_ITEM.ID_ITEM_KEY is '逻辑卡片幂等键';
comment on column RHN_SYS_PRINT_BATCH_ITEM.JSON_SNAPSHOT is '不可变打印快照JSON';
comment on column RHN_SYS_PRINT_BATCH_ITEM.SD_STATUS is '明细状态';
comment on column RHN_SYS_PRINT_BATCH_ITEM.CD_EXCLUDE_REASON is '排除原因编码';
comment on column RHN_SYS_PRINT_BATCH_ITEM.DES_EXCLUDE_REASON is '排除原因说明';
comment on column RHN_SYS_PRINT_BATCH_ITEM.SN_PAGE is '输出页码';
comment on column RHN_SYS_PRINT_BATCH_ITEM.SN_SLOT is '输出格号';
comment on column RHN_SYS_PRINT_BATCH_ITEM.DES_REPRINT_REASON is '补打原因';
comment on column RHN_SYS_PRINT_BATCH_ITEM.DT_CREATED is '创建时间';

comment on column RHN_SYS_PRINT_DELIVERY.ID_PRINT_DELIVERY is '打印投递主键';
comment on column RHN_SYS_PRINT_DELIVERY.REVISION is '乐观锁修订号';
comment on column RHN_SYS_PRINT_DELIVERY.ID_TNT is '租户标识';
comment on column RHN_SYS_PRINT_DELIVERY.ID_PRINT_BATCH is '打印批次标识';
comment on column RHN_SYS_PRINT_DELIVERY.ID_PRINT_JOB is '打印作业标识';
comment on column RHN_SYS_PRINT_DELIVERY.ID_PRINT_DEVICE is '目标设备标识';
comment on column RHN_SYS_PRINT_DELIVERY.SD_CHANNEL is '投递通道';
comment on column RHN_SYS_PRINT_DELIVERY.SD_STATUS is '投递状态';
comment on column RHN_SYS_PRINT_DELIVERY.QTY_ATTEMPT is '投递尝试次数';
comment on column RHN_SYS_PRINT_DELIVERY.CD_ERROR is '失败编码';
comment on column RHN_SYS_PRINT_DELIVERY.DES_ERROR is '失败说明';
comment on column RHN_SYS_PRINT_DELIVERY.DT_QUEUED is '入队时间';
comment on column RHN_SYS_PRINT_DELIVERY.DT_SENT is '发送时间';
comment on column RHN_SYS_PRINT_DELIVERY.DT_CONFIRMED is '设备确认时间';
comment on column RHN_SYS_PRINT_DELIVERY.DT_UPDATED is '更新时间';

