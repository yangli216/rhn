-- Billing relief (惠民减免) policy foundation (generated).
-- Policies are versioned; a published version fixes timing (before or after insurance), sponsor, applicable scope,
-- quota and stacking. Rules scope a version to all charges, accounting categories, catalog items or charge sources.
-- Qualifications reference the BIL_RELIEF_QUALIF_TYPE dictionary shared with the roster. Applications record each
-- relief or reversal per settlement with its line allocation; quotas accumulate per resident, period and share scope.

-- 1. Tables.
create table RHN_BIL_RELIEF_POLICY (
    ID_RELIEF_POLICY bigint not null,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    CD_POLICY varchar(64) not null,
    NA_POLICY varchar(200) not null,
    DES_POLICY varchar(2000),
    SD_STATUS varchar(32) not null,
    ID_POLICY_VER_CUR bigint,
    ID_USER_CREATED bigint not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    constraint PK_BIL_RELIEF_POL primary key (ID_RELIEF_POLICY),
    constraint FK_BIL_RELIEF_POL_TNT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT),
    constraint UK_BIL_RELIEF_POL_CODE unique (ID_TNT, CD_POLICY),
    constraint CK_BIL_RELIEF_POL_STATUS check (SD_STATUS in ('DRAFT', 'ACTIVE', 'SUSPENDED', 'RETIRED'))
);

comment on table RHN_BIL_RELIEF_POLICY is '惠民减免政策；一行代表一项政策，计算内容见政策版本';
comment on column RHN_BIL_RELIEF_POLICY.ID_RELIEF_POLICY is '减免政策主键';
comment on column RHN_BIL_RELIEF_POLICY.REVISION is '乐观锁版本';
comment on column RHN_BIL_RELIEF_POLICY.ID_TNT is '租户标识';
comment on column RHN_BIL_RELIEF_POLICY.CD_POLICY is '政策编码';
comment on column RHN_BIL_RELIEF_POLICY.NA_POLICY is '政策名称';
comment on column RHN_BIL_RELIEF_POLICY.DES_POLICY is '政策说明';
comment on column RHN_BIL_RELIEF_POLICY.SD_STATUS is '政策状态';
comment on column RHN_BIL_RELIEF_POLICY.ID_POLICY_VER_CUR is '当前发布版本标识';
comment on column RHN_BIL_RELIEF_POLICY.ID_USER_CREATED is '创建人标识';
comment on column RHN_BIL_RELIEF_POLICY.DT_CREATED is '创建时间';
comment on column RHN_BIL_RELIEF_POLICY.ID_USER_UPDATED is '最后修改人标识';
comment on column RHN_BIL_RELIEF_POLICY.DT_UPDATED is '最后修改时间';

create table RHN_BIL_RELIEF_POLICY_VER (
    ID_POLICY_VER bigint not null,
    ID_TNT bigint not null,
    ID_RELIEF_POLICY bigint not null,
    SN_VER integer not null,
    SD_STATUS varchar(32) not null,
    SD_TIMING varchar(32) not null,
    SD_SPONSOR varchar(32) not null,
    CD_PAYER varchar(128),
    NA_PAYER varchar(200),
    JSON_APPL_SCOPE clob not null,
    DA_EFF_FROM date not null,
    DA_EFF_TO date,
    SN_PRI integer not null,
    CD_MUTEX_GROUP varchar(64),
    FG_STACK boolean default false not null,
    SD_QUALIF_MODE varchar(32) not null,
    FG_INS_APPL boolean default false not null,
    FG_BASE_PERS_ACCT boolean default false not null,
    AMT_ONCE_MAX decimal(24,6),
    SD_QUOTA_PERIOD varchar(32) not null,
    AMT_PERIOD_MAX decimal(24,6),
    QTY_PERIOD_MAX integer,
    FG_SHARE_SCENE boolean default false not null,
    FG_SHARE_ORG boolean default false not null,
    DES_VER_NOTE varchar(1000),
    ID_USER_CREATED bigint not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_PUBLISD bigint,
    DT_PUBLISD timestamp with time zone,
    constraint PK_BIL_RELIEF_VER primary key (ID_POLICY_VER),
    constraint FK_BIL_RELIEF_VER_TNT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT),
    constraint UK_BIL_RELIEF_VER_NO unique (ID_TNT, ID_RELIEF_POLICY, SN_VER),
    constraint CK_BIL_RELIEF_VER_STATUS check (SD_STATUS in ('DRAFT', 'PUBLISHED', 'SUPERSEDED')),
    constraint CK_BIL_RELIEF_VER_TIMING check (SD_TIMING in ('PRE_INSURANCE', 'POST_INSURANCE')),
    constraint CK_BIL_RELIEF_VER_SPONSOR check (SD_SPONSOR in ('HOSPITAL', 'GOVERNMENT', 'CHARITY', 'OTHER')),
    constraint CK_BIL_RELIEF_VER_QUALIF check (SD_QUALIF_MODE in ('ANY', 'ALL')),
    constraint CK_BIL_RELIEF_VER_PERIOD check (SD_QUOTA_PERIOD in ('NONE', 'DAY', 'MONTH', 'QUARTER', 'YEAR', 'POLICY_TERM')),
    constraint CK_BIL_RELIEF_VER_LIMIT check ((AMT_ONCE_MAX is null or AMT_ONCE_MAX > 0) and (AMT_PERIOD_MAX is null or AMT_PERIOD_MAX > 0) and (QTY_PERIOD_MAX is null or QTY_PERIOD_MAX > 0)),
    constraint CK_BIL_RELIEF_VER_EFF check (DA_EFF_TO is null or DA_EFF_TO >= DA_EFF_FROM),
    constraint FK_BIL_RELIEF_VER_POL foreign key (ID_RELIEF_POLICY) references RHN_BIL_RELIEF_POLICY(ID_RELIEF_POLICY)
);

comment on table RHN_BIL_RELIEF_POLICY_VER is '惠民减免政策版本；一行代表一项政策的一个版本，发布后不再修改';
comment on column RHN_BIL_RELIEF_POLICY_VER.ID_POLICY_VER is '政策版本主键';
comment on column RHN_BIL_RELIEF_POLICY_VER.ID_TNT is '租户标识';
comment on column RHN_BIL_RELIEF_POLICY_VER.ID_RELIEF_POLICY is '减免政策标识';
comment on column RHN_BIL_RELIEF_POLICY_VER.SN_VER is '版本序号';
comment on column RHN_BIL_RELIEF_POLICY_VER.SD_STATUS is '版本状态';
comment on column RHN_BIL_RELIEF_POLICY_VER.SD_TIMING is '减免时机：医保前或医保后';
comment on column RHN_BIL_RELIEF_POLICY_VER.SD_SPONSOR is '减免承担主体';
comment on column RHN_BIL_RELIEF_POLICY_VER.CD_PAYER is '承担单位编码';
comment on column RHN_BIL_RELIEF_POLICY_VER.NA_PAYER is '承担单位名称';
comment on column RHN_BIL_RELIEF_POLICY_VER.JSON_APPL_SCOPE is '适用机构与结算场景';
comment on column RHN_BIL_RELIEF_POLICY_VER.DA_EFF_FROM is '生效日期';
comment on column RHN_BIL_RELIEF_POLICY_VER.DA_EFF_TO is '失效日期，空表示长期有效';
comment on column RHN_BIL_RELIEF_POLICY_VER.SN_PRI is '执行优先级，数值小者先执行';
comment on column RHN_BIL_RELIEF_POLICY_VER.CD_MUTEX_GROUP is '互斥组编码，同组只执行一项';
comment on column RHN_BIL_RELIEF_POLICY_VER.FG_STACK is '是否允许与其他政策叠加';
comment on column RHN_BIL_RELIEF_POLICY_VER.SD_QUALIF_MODE is '资格条件组合方式';
comment on column RHN_BIL_RELIEF_POLICY_VER.FG_INS_APPL is '医保结算患者是否适用';
comment on column RHN_BIL_RELIEF_POLICY_VER.FG_BASE_PERS_ACCT is '医保后计算基数是否包含个人账户支付';
comment on column RHN_BIL_RELIEF_POLICY_VER.AMT_ONCE_MAX is '单次减免上限';
comment on column RHN_BIL_RELIEF_POLICY_VER.SD_QUOTA_PERIOD is '额度周期';
comment on column RHN_BIL_RELIEF_POLICY_VER.AMT_PERIOD_MAX is '周期累计减免上限';
comment on column RHN_BIL_RELIEF_POLICY_VER.QTY_PERIOD_MAX is '周期最多享受次数';
comment on column RHN_BIL_RELIEF_POLICY_VER.FG_SHARE_SCENE is '门诊与住院是否共享额度';
comment on column RHN_BIL_RELIEF_POLICY_VER.FG_SHARE_ORG is '不同机构是否共享额度';
comment on column RHN_BIL_RELIEF_POLICY_VER.DES_VER_NOTE is '版本说明';
comment on column RHN_BIL_RELIEF_POLICY_VER.ID_USER_CREATED is '创建人标识';
comment on column RHN_BIL_RELIEF_POLICY_VER.DT_CREATED is '创建时间';
comment on column RHN_BIL_RELIEF_POLICY_VER.ID_USER_PUBLISD is '发布人标识';
comment on column RHN_BIL_RELIEF_POLICY_VER.DT_PUBLISD is '发布时间';

create table RHN_BIL_RELIEF_RULE (
    ID_RELIEF_RULE bigint not null,
    ID_TNT bigint not null,
    ID_POLICY_VER bigint not null,
    SN_LINE integer not null,
    SD_SCOPE_TYPE varchar(32) not null,
    CD_SCOPE_VAL varchar(64),
    ID_CATALOG_ITEM bigint,
    NA_SCOPE_SNAP varchar(300),
    FG_EXCLUDE boolean default false not null,
    SD_METHOD varchar(32),
    VAL_RATIO decimal(9,6),
    AMT_RULE decimal(24,6),
    AMT_MANUAL_MAX decimal(24,6),
    QTY_PERIOD_MAX integer,
    constraint PK_BIL_RELIEF_RULE primary key (ID_RELIEF_RULE),
    constraint FK_BIL_RELIEF_RULE_TNT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT),
    constraint UK_BIL_RELIEF_RULE_LINE unique (ID_TNT, ID_POLICY_VER, SN_LINE),
    constraint CK_BIL_RELIEF_RULE_SCOPE check (SD_SCOPE_TYPE in ('ALL', 'ACCOUNTING_CATEGORY', 'CATALOG_ITEM', 'SOURCE_TYPE')),
    constraint CK_BIL_RELIEF_RULE_METHOD check (SD_METHOD in ('RATIO', 'FREE', 'FIXED_AMOUNT', 'UNIT_AMOUNT', 'PRICE_CAP', 'MANUAL')),
    constraint CK_BIL_RELIEF_RULE_VAL check ((VAL_RATIO is null or (VAL_RATIO > 0 and VAL_RATIO <= 1)) and (AMT_RULE is null or AMT_RULE >= 0) and (AMT_MANUAL_MAX is null or AMT_MANUAL_MAX > 0) and (QTY_PERIOD_MAX is null or QTY_PERIOD_MAX > 0)),
    constraint FK_BIL_RELIEF_RULE_VER foreign key (ID_POLICY_VER) references RHN_BIL_RELIEF_POLICY_VER(ID_POLICY_VER)
);

comment on table RHN_BIL_RELIEF_RULE is '惠民减免规则；一行代表政策版本中的一条费用范围及其计算方式';
comment on column RHN_BIL_RELIEF_RULE.ID_RELIEF_RULE is '减免规则主键';
comment on column RHN_BIL_RELIEF_RULE.ID_TNT is '租户标识';
comment on column RHN_BIL_RELIEF_RULE.ID_POLICY_VER is '政策版本标识';
comment on column RHN_BIL_RELIEF_RULE.SN_LINE is '规则行号';
comment on column RHN_BIL_RELIEF_RULE.SD_SCOPE_TYPE is '费用范围类型';
comment on column RHN_BIL_RELIEF_RULE.CD_SCOPE_VAL is '会计大类或收费来源编码';
comment on column RHN_BIL_RELIEF_RULE.ID_CATALOG_ITEM is '收费项目标识';
comment on column RHN_BIL_RELIEF_RULE.NA_SCOPE_SNAP is '范围名称快照';
comment on column RHN_BIL_RELIEF_RULE.FG_EXCLUDE is '是否为排除范围';
comment on column RHN_BIL_RELIEF_RULE.SD_METHOD is '减免方式，排除范围为空';
comment on column RHN_BIL_RELIEF_RULE.VAL_RATIO is '减免比例，0 至 1';
comment on column RHN_BIL_RELIEF_RULE.AMT_RULE is '固定减免、单位减免或个人限价金额';
comment on column RHN_BIL_RELIEF_RULE.AMT_MANUAL_MAX is '人工核准金额上限';
comment on column RHN_BIL_RELIEF_RULE.QTY_PERIOD_MAX is '本规则范围周期最多享受次数';

create table RHN_BIL_RELIEF_QUALIF (
    ID_RELIEF_QUALIF bigint not null,
    ID_TNT bigint not null,
    ID_POLICY_VER bigint not null,
    SN_LINE integer not null,
    SD_QUALIF_SRC varchar(32) not null,
    CD_QUALIF_TYPE varchar(64),
    JSON_COND clob,
    CD_PRVDR varchar(64),
    SD_FAIL_POLICY varchar(32),
    constraint PK_BIL_RELIEF_QLF primary key (ID_RELIEF_QUALIF),
    constraint FK_BIL_RELIEF_QLF_TNT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT),
    constraint UK_BIL_RELIEF_QLF_LINE unique (ID_TNT, ID_POLICY_VER, SN_LINE),
    constraint CK_BIL_RELIEF_QLF_SRC check (SD_QUALIF_SRC in ('ALL', 'ROSTER', 'ATTRIBUTE', 'PROVIDER')),
    constraint CK_BIL_RELIEF_QLF_FAIL check (SD_FAIL_POLICY in ('BLOCK', 'INELIGIBLE', 'MANUAL_CONFIRM')),
    constraint FK_BIL_RELIEF_QLF_VER foreign key (ID_POLICY_VER) references RHN_BIL_RELIEF_POLICY_VER(ID_POLICY_VER)
);

comment on table RHN_BIL_RELIEF_QUALIF is '惠民减免资格条件；一行代表政策版本要求的一项资格条件';
comment on column RHN_BIL_RELIEF_QUALIF.ID_RELIEF_QUALIF is '资格条件主键';
comment on column RHN_BIL_RELIEF_QUALIF.ID_TNT is '租户标识';
comment on column RHN_BIL_RELIEF_QUALIF.ID_POLICY_VER is '政策版本标识';
comment on column RHN_BIL_RELIEF_QUALIF.SN_LINE is '条件行号';
comment on column RHN_BIL_RELIEF_QUALIF.SD_QUALIF_SRC is '资格来源';
comment on column RHN_BIL_RELIEF_QUALIF.CD_QUALIF_TYPE is '资格类别编码';
comment on column RHN_BIL_RELIEF_QUALIF.JSON_COND is '属性条件';
comment on column RHN_BIL_RELIEF_QUALIF.CD_PRVDR is '外部资格接口编码';
comment on column RHN_BIL_RELIEF_QUALIF.SD_FAIL_POLICY is '外部资格查询失败时的处理';

create table RHN_BIL_RELIEF_ROSTER (
    ID_RELIEF_ROSTER bigint not null,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_ORG bigint,
    CD_QUALIF_TYPE varchar(64) not null,
    ID_PAT bigint not null,
    NA_PAT_SNAP varchar(128) not null,
    DA_EFF_FROM date not null,
    DA_EFF_TO date,
    CD_EVID_NO varchar(128),
    DES_EVID varchar(1000),
    CD_BATCH varchar(64),
    SD_STATUS varchar(32) not null,
    DES_REASON varchar(1000),
    ID_USER_CREATED bigint not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_UPDATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    constraint PK_BIL_RELIEF_RST primary key (ID_RELIEF_ROSTER),
    constraint FK_BIL_RELIEF_RST_TNT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT),
    constraint CK_BIL_RELIEF_RST_STATUS check (SD_STATUS in ('ACTIVE', 'REVOKED')),
    constraint CK_BIL_RELIEF_RST_EFF check (DA_EFF_TO is null or DA_EFF_TO >= DA_EFF_FROM)
);
create index IX_BIL_RELIEF_RST_PAT on RHN_BIL_RELIEF_ROSTER (ID_TNT, ID_PAT, CD_QUALIF_TYPE);
create index IX_BIL_RELIEF_RST_TYPE on RHN_BIL_RELIEF_ROSTER (ID_TNT, CD_QUALIF_TYPE, SD_STATUS);

comment on table RHN_BIL_RELIEF_ROSTER is '惠民资格名单；一行代表一位居民的一项资格及其有效期';
comment on column RHN_BIL_RELIEF_ROSTER.ID_RELIEF_ROSTER is '资格名单主键';
comment on column RHN_BIL_RELIEF_ROSTER.REVISION is '乐观锁版本';
comment on column RHN_BIL_RELIEF_ROSTER.ID_TNT is '租户标识';
comment on column RHN_BIL_RELIEF_ROSTER.ID_ORG is '登记机构标识';
comment on column RHN_BIL_RELIEF_ROSTER.CD_QUALIF_TYPE is '资格类别编码';
comment on column RHN_BIL_RELIEF_ROSTER.ID_PAT is '居民标识';
comment on column RHN_BIL_RELIEF_ROSTER.NA_PAT_SNAP is '居民姓名快照';
comment on column RHN_BIL_RELIEF_ROSTER.DA_EFF_FROM is '资格生效日期';
comment on column RHN_BIL_RELIEF_ROSTER.DA_EFF_TO is '资格失效日期，空表示长期有效';
comment on column RHN_BIL_RELIEF_ROSTER.CD_EVID_NO is '资格证明编号';
comment on column RHN_BIL_RELIEF_ROSTER.DES_EVID is '资格依据说明';
comment on column RHN_BIL_RELIEF_ROSTER.CD_BATCH is '导入批次';
comment on column RHN_BIL_RELIEF_ROSTER.SD_STATUS is '名单状态';
comment on column RHN_BIL_RELIEF_ROSTER.DES_REASON is '停用原因';
comment on column RHN_BIL_RELIEF_ROSTER.ID_USER_CREATED is '创建人标识';
comment on column RHN_BIL_RELIEF_ROSTER.DT_CREATED is '创建时间';
comment on column RHN_BIL_RELIEF_ROSTER.ID_USER_UPDATED is '最后修改人标识';
comment on column RHN_BIL_RELIEF_ROSTER.DT_UPDATED is '最后修改时间';

create table RHN_BIL_RELIEF_APPLY (
    ID_RELIEF_APPLY bigint not null,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_STL bigint not null,
    ID_PAT bigint not null,
    ID_RELIEF_POLICY bigint not null,
    ID_POLICY_VER bigint not null,
    SD_TIMING varchar(32) not null,
    SD_SPONSOR varchar(32) not null,
    SD_STL_SCENE varchar(32) not null,
    AMT_BASE decimal(24,6) not null,
    AMT_RELIEF decimal(24,6) not null,
    SD_STATUS varchar(32) not null,
    ID_RELIEF_APPLY_RVRS bigint,
    ID_STL_TENDER bigint,
    JSON_QUALIF_EVID clob,
    DES_MANUAL_REASON varchar(1000),
    DES_MANUAL_EVID varchar(1000),
    ID_USER_APRVD bigint,
    CD_COMMAND varchar(128) not null,
    ID_USER_CREATED bigint not null,
    DT_CREATED timestamp with time zone not null,
    constraint PK_BIL_RELIEF_APL primary key (ID_RELIEF_APPLY),
    constraint FK_BIL_RELIEF_APL_TNT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT),
    constraint UK_BIL_RELIEF_APL_CMD unique (ID_TNT, CD_COMMAND),
    constraint CK_BIL_RELIEF_APL_TIMING check (SD_TIMING in ('PRE_INSURANCE', 'POST_INSURANCE')),
    constraint CK_BIL_RELIEF_APL_SPONSOR check (SD_SPONSOR in ('HOSPITAL', 'GOVERNMENT', 'CHARITY', 'OTHER')),
    constraint CK_BIL_RELIEF_APL_STATUS check (SD_STATUS in ('APPLIED', 'REVERSED')),
    constraint FK_BIL_RELIEF_APL_POL foreign key (ID_RELIEF_POLICY) references RHN_BIL_RELIEF_POLICY(ID_RELIEF_POLICY),
    constraint FK_BIL_RELIEF_APL_VER foreign key (ID_POLICY_VER) references RHN_BIL_RELIEF_POLICY_VER(ID_POLICY_VER)
);
create index IX_BIL_RELIEF_APL_STL on RHN_BIL_RELIEF_APPLY (ID_TNT, ID_STL);
create index IX_BIL_RELIEF_APL_POL on RHN_BIL_RELIEF_APPLY (ID_TNT, ID_RELIEF_POLICY, DT_CREATED);
create index IX_BIL_RELIEF_APL_PAT on RHN_BIL_RELIEF_APPLY (ID_TNT, ID_PAT, DT_CREATED);

comment on table RHN_BIL_RELIEF_APPLY is '结算减免记录；一行代表一项政策对一张结算单的一次减免或冲销';
comment on column RHN_BIL_RELIEF_APPLY.ID_RELIEF_APPLY is '减免记录主键';
comment on column RHN_BIL_RELIEF_APPLY.ID_TNT is '租户标识';
comment on column RHN_BIL_RELIEF_APPLY.ID_ORG is '结算机构标识';
comment on column RHN_BIL_RELIEF_APPLY.ID_STL is '结算单标识';
comment on column RHN_BIL_RELIEF_APPLY.ID_PAT is '居民标识';
comment on column RHN_BIL_RELIEF_APPLY.ID_RELIEF_POLICY is '减免政策标识';
comment on column RHN_BIL_RELIEF_APPLY.ID_POLICY_VER is '政策版本标识';
comment on column RHN_BIL_RELIEF_APPLY.SD_TIMING is '减免时机';
comment on column RHN_BIL_RELIEF_APPLY.SD_SPONSOR is '减免承担主体';
comment on column RHN_BIL_RELIEF_APPLY.SD_STL_SCENE is '结算场景';
comment on column RHN_BIL_RELIEF_APPLY.AMT_BASE is '计算基数';
comment on column RHN_BIL_RELIEF_APPLY.AMT_RELIEF is '减免金额，冲销记录为负';
comment on column RHN_BIL_RELIEF_APPLY.SD_STATUS is '减免记录状态';
comment on column RHN_BIL_RELIEF_APPLY.ID_RELIEF_APPLY_RVRS is '被冲销的原减免记录标识';
comment on column RHN_BIL_RELIEF_APPLY.ID_STL_TENDER is '医保后减免对应的结算支付标识';
comment on column RHN_BIL_RELIEF_APPLY.JSON_QUALIF_EVID is '资格认定依据快照';
comment on column RHN_BIL_RELIEF_APPLY.DES_MANUAL_REASON is '人工核准原因';
comment on column RHN_BIL_RELIEF_APPLY.DES_MANUAL_EVID is '人工核准依据';
comment on column RHN_BIL_RELIEF_APPLY.ID_USER_APRVD is '人工核准人标识';
comment on column RHN_BIL_RELIEF_APPLY.CD_COMMAND is '幂等命令码';
comment on column RHN_BIL_RELIEF_APPLY.ID_USER_CREATED is '创建人标识';
comment on column RHN_BIL_RELIEF_APPLY.DT_CREATED is '创建时间';

create table RHN_BIL_RELIEF_APPLY_LINE (
    ID_RELIEF_APPLY_LINE bigint not null,
    ID_TNT bigint not null,
    ID_RELIEF_APPLY bigint not null,
    ID_STL_LINE bigint not null,
    ID_CHARGE_ITEM bigint not null,
    ID_RELIEF_RULE bigint,
    AMT_BASE decimal(24,6) not null,
    AMT_RELIEF decimal(24,6) not null,
    constraint PK_BIL_RELIEF_APL_LN primary key (ID_RELIEF_APPLY_LINE),
    constraint FK_BIL_RELIEF_APL_LN_TNT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT),
    constraint UK_BIL_RELIEF_APL_LN_LINE unique (ID_TNT, ID_RELIEF_APPLY, ID_STL_LINE),
    constraint FK_BIL_RELIEF_APL_LN_APL foreign key (ID_RELIEF_APPLY) references RHN_BIL_RELIEF_APPLY(ID_RELIEF_APPLY)
);
create index IX_BIL_RELIEF_APL_LN_CHG on RHN_BIL_RELIEF_APPLY_LINE (ID_TNT, ID_CHARGE_ITEM);

comment on table RHN_BIL_RELIEF_APPLY_LINE is '结算减免分配明细；一行代表一条减免记录在一个结算行上的分配';
comment on column RHN_BIL_RELIEF_APPLY_LINE.ID_RELIEF_APPLY_LINE is '减免分配明细主键';
comment on column RHN_BIL_RELIEF_APPLY_LINE.ID_TNT is '租户标识';
comment on column RHN_BIL_RELIEF_APPLY_LINE.ID_RELIEF_APPLY is '减免记录标识';
comment on column RHN_BIL_RELIEF_APPLY_LINE.ID_STL_LINE is '结算行标识';
comment on column RHN_BIL_RELIEF_APPLY_LINE.ID_CHARGE_ITEM is '收费事项标识';
comment on column RHN_BIL_RELIEF_APPLY_LINE.ID_RELIEF_RULE is '命中的减免规则标识';
comment on column RHN_BIL_RELIEF_APPLY_LINE.AMT_BASE is '本行计算基数';
comment on column RHN_BIL_RELIEF_APPLY_LINE.AMT_RELIEF is '本行减免金额，冲销为负';

create table RHN_BIL_RELIEF_QUOTA (
    ID_RELIEF_QUOTA bigint not null,
    REVISION bigint default 0 not null,
    ID_TNT bigint not null,
    ID_RELIEF_POLICY bigint not null,
    ID_PAT bigint not null,
    CD_PERIOD varchar(32) not null,
    CD_SHARE varchar(128) not null,
    CD_SCOPE varchar(200) not null,
    AMT_USED decimal(24,6) not null,
    QTY_USED integer not null,
    DT_UPDATED timestamp with time zone not null,
    constraint PK_BIL_RELIEF_QTA primary key (ID_RELIEF_QUOTA),
    constraint FK_BIL_RELIEF_QTA_TNT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT),
    constraint UK_BIL_RELIEF_QTA_KEY unique (ID_TNT, ID_RELIEF_POLICY, ID_PAT, CD_PERIOD, CD_SHARE, CD_SCOPE),
    constraint CK_BIL_RELIEF_QTA_USED check (AMT_USED >= 0 and QTY_USED >= 0),
    constraint FK_BIL_RELIEF_QTA_POL foreign key (ID_RELIEF_POLICY) references RHN_BIL_RELIEF_POLICY(ID_RELIEF_POLICY)
);

comment on table RHN_BIL_RELIEF_QUOTA is '惠民减免额度累计；一行代表一位居民在一个额度范围和周期内的已用金额与次数';
comment on column RHN_BIL_RELIEF_QUOTA.ID_RELIEF_QUOTA is '额度累计主键';
comment on column RHN_BIL_RELIEF_QUOTA.REVISION is '乐观锁版本';
comment on column RHN_BIL_RELIEF_QUOTA.ID_TNT is '租户标识';
comment on column RHN_BIL_RELIEF_QUOTA.ID_RELIEF_POLICY is '减免政策标识';
comment on column RHN_BIL_RELIEF_QUOTA.ID_PAT is '居民标识';
comment on column RHN_BIL_RELIEF_QUOTA.CD_PERIOD is '周期键，如 2026 或 2026-10';
comment on column RHN_BIL_RELIEF_QUOTA.CD_SHARE is '共享范围键：结算场景与机构';
comment on column RHN_BIL_RELIEF_QUOTA.CD_SCOPE is '额度对象：整项政策或规则范围';
comment on column RHN_BIL_RELIEF_QUOTA.AMT_USED is '已用减免金额';
comment on column RHN_BIL_RELIEF_QUOTA.QTY_USED is '已享受次数';
comment on column RHN_BIL_RELIEF_QUOTA.DT_UPDATED is '最后变动时间';

create table RHN_BIL_RELIEF_QUOTA_TXN (
    ID_QUOTA_TXN bigint not null,
    ID_TNT bigint not null,
    ID_RELIEF_QUOTA bigint not null,
    ID_RELIEF_APPLY bigint,
    SD_TXN_TYPE varchar(32) not null,
    AMT_DELTA decimal(24,6) not null,
    QTY_DELTA integer not null,
    CD_COMMAND varchar(128) not null,
    ID_USER bigint not null,
    DT_OCCRD timestamp with time zone not null,
    constraint PK_BIL_RELIEF_QTX primary key (ID_QUOTA_TXN),
    constraint FK_BIL_RELIEF_QTX_TNT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT),
    constraint UK_BIL_RELIEF_QTX_CMD unique (ID_TNT, CD_COMMAND),
    constraint CK_BIL_RELIEF_QTX_TYPE check (SD_TXN_TYPE in ('RESERVE', 'CONFIRM', 'RELEASE', 'REVERSE')),
    constraint FK_BIL_RELIEF_QTX_QTA foreign key (ID_RELIEF_QUOTA) references RHN_BIL_RELIEF_QUOTA(ID_RELIEF_QUOTA),
    constraint FK_BIL_RELIEF_QTX_APL foreign key (ID_RELIEF_APPLY) references RHN_BIL_RELIEF_APPLY(ID_RELIEF_APPLY)
);
create index IX_BIL_RELIEF_QTX_QTA on RHN_BIL_RELIEF_QUOTA_TXN (ID_TNT, ID_RELIEF_QUOTA);

comment on table RHN_BIL_RELIEF_QUOTA_TXN is '惠民减免额度流水；一行代表一次额度占用、确认、释放或恢复';
comment on column RHN_BIL_RELIEF_QUOTA_TXN.ID_QUOTA_TXN is '额度流水主键';
comment on column RHN_BIL_RELIEF_QUOTA_TXN.ID_TNT is '租户标识';
comment on column RHN_BIL_RELIEF_QUOTA_TXN.ID_RELIEF_QUOTA is '额度累计标识';
comment on column RHN_BIL_RELIEF_QUOTA_TXN.ID_RELIEF_APPLY is '减免记录标识';
comment on column RHN_BIL_RELIEF_QUOTA_TXN.SD_TXN_TYPE is '额度变动类型';
comment on column RHN_BIL_RELIEF_QUOTA_TXN.AMT_DELTA is '金额变动，释放与恢复为负';
comment on column RHN_BIL_RELIEF_QUOTA_TXN.QTY_DELTA is '次数变动，释放与恢复为负';
comment on column RHN_BIL_RELIEF_QUOTA_TXN.CD_COMMAND is '幂等命令码';
comment on column RHN_BIL_RELIEF_QUOTA_TXN.ID_USER is '操作人标识';
comment on column RHN_BIL_RELIEF_QUOTA_TXN.DT_OCCRD is '发生时间';

-- 2. Qualification type dictionary.
insert into RHN_BD_DICT_DEF (ID_DICT_DEF, REVISION, SD_SCOPE_TYPE, CD_SCOPE, ID_TNT, CD_DICT_DEF, NA_DICT_DEF, DES_DICT_DEF, SD_STATUS, DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED, FG_SYS_MANAGED, ID_DICT_CAT) values (362387869940001, 0, 'PLATFORM', 'PLATFORM', null, 'BIL_RELIEF_QUALIF_TYPE', '惠民资格类别', '享受结算惠民减免的人员资格类别；资格名单与减免政策共同引用，机构可扩展。', 'ACTIVE', timestamp with time zone '2026-10-17 00:00:00+08', 362387869790222, timestamp with time zone '2026-10-17 00:00:00+08', 362387869790222, false, 362387869840010);
insert into RHN_BD_DICT_CHG (ID_DICT_CHG, ID_TNT, ID_DICT_DEF_DICT, ID_DICT_ITEM, SD_CHG_TYPE, SD_TARGET_TYPE, JSON_BEFORE, JSON_AFTER, DES_REASON, CD_REQ, DT_CHANGED, ID_USER_CHANGED, ID_DICT_CAT, ID_DICT_ATTR_DEF) values (362387869940201, null, 362387869940001, null, 'CREATE_DICT', 'DICT', null, '{"code": "BIL_RELIEF_QUALIF_TYPE", "name": "惠民资格类别", "status": "ACTIVE"}', '结算惠民减免引用资格类别，名单与政策共享同一类别', 'v1.129.15:billing-relief-policy', timestamp with time zone '2026-10-17 00:00:00+08', 362387869790222, 362387869840010, null);
insert into RHN_BD_DICT_ITEM (ID_DICT_ITEM, ID_DICT_DEF_DICT, CD_DICT_ITEM, NA_DICT_ITEM, DES_DICT_ITEM, SN_SORT, SD_STATUS, ID_DICT_ITEM_PARENT) values (362387869940101, 362387869940001, 'FAMILY_DOCTOR_SIGNED', '家庭医生签约居民', '与本机构家庭医生团队签约且在有效期内的居民', 10, 'ACTIVE', null);
insert into RHN_BD_DICT_CHG (ID_DICT_CHG, ID_TNT, ID_DICT_DEF_DICT, ID_DICT_ITEM, SD_CHG_TYPE, SD_TARGET_TYPE, JSON_BEFORE, JSON_AFTER, DES_REASON, CD_REQ, DT_CHANGED, ID_USER_CHANGED, ID_DICT_CAT, ID_DICT_ATTR_DEF) values (362387869940202, null, 362387869940001, 362387869940101, 'ADD_ITEM', 'ITEM', null, '{"code": "FAMILY_DOCTOR_SIGNED", "name": "家庭医生签约居民", "sortOrder": 10, "status": "ACTIVE"}', '结算惠民减免引用资格类别，名单与政策共享同一类别', 'v1.129.15:billing-relief-policy', timestamp with time zone '2026-10-17 00:00:00+08', 362387869790222, 362387869840010, null);
insert into RHN_BD_DICT_ITEM (ID_DICT_ITEM, ID_DICT_DEF_DICT, CD_DICT_ITEM, NA_DICT_ITEM, DES_DICT_ITEM, SN_SORT, SD_STATUS, ID_DICT_ITEM_PARENT) values (362387869940102, 362387869940001, 'PREGNANT_WOMAN', '孕产妇', '在妇幼保健管理中的孕产妇', 20, 'ACTIVE', null);
insert into RHN_BD_DICT_CHG (ID_DICT_CHG, ID_TNT, ID_DICT_DEF_DICT, ID_DICT_ITEM, SD_CHG_TYPE, SD_TARGET_TYPE, JSON_BEFORE, JSON_AFTER, DES_REASON, CD_REQ, DT_CHANGED, ID_USER_CHANGED, ID_DICT_CAT, ID_DICT_ATTR_DEF) values (362387869940203, null, 362387869940001, 362387869940102, 'ADD_ITEM', 'ITEM', null, '{"code": "PREGNANT_WOMAN", "name": "孕产妇", "sortOrder": 20, "status": "ACTIVE"}', '结算惠民减免引用资格类别，名单与政策共享同一类别', 'v1.129.15:billing-relief-policy', timestamp with time zone '2026-10-17 00:00:00+08', 362387869790222, 362387869840010, null);
insert into RHN_BD_DICT_ITEM (ID_DICT_ITEM, ID_DICT_DEF_DICT, CD_DICT_ITEM, NA_DICT_ITEM, DES_DICT_ITEM, SN_SORT, SD_STATUS, ID_DICT_ITEM_PARENT) values (362387869940103, 362387869940001, 'MINIMUM_LIVING', '最低生活保障对象', '民政认定的城乡低保对象', 30, 'ACTIVE', null);
insert into RHN_BD_DICT_CHG (ID_DICT_CHG, ID_TNT, ID_DICT_DEF_DICT, ID_DICT_ITEM, SD_CHG_TYPE, SD_TARGET_TYPE, JSON_BEFORE, JSON_AFTER, DES_REASON, CD_REQ, DT_CHANGED, ID_USER_CHANGED, ID_DICT_CAT, ID_DICT_ATTR_DEF) values (362387869940204, null, 362387869940001, 362387869940103, 'ADD_ITEM', 'ITEM', null, '{"code": "MINIMUM_LIVING", "name": "最低生活保障对象", "sortOrder": 30, "status": "ACTIVE"}', '结算惠民减免引用资格类别，名单与政策共享同一类别', 'v1.129.15:billing-relief-policy', timestamp with time zone '2026-10-17 00:00:00+08', 362387869790222, 362387869840010, null);
insert into RHN_BD_DICT_ITEM (ID_DICT_ITEM, ID_DICT_DEF_DICT, CD_DICT_ITEM, NA_DICT_ITEM, DES_DICT_ITEM, SN_SORT, SD_STATUS, ID_DICT_ITEM_PARENT) values (362387869940104, 362387869940001, 'EXTREME_POVERTY', '特困供养人员', '民政认定的特困供养人员', 40, 'ACTIVE', null);
insert into RHN_BD_DICT_CHG (ID_DICT_CHG, ID_TNT, ID_DICT_DEF_DICT, ID_DICT_ITEM, SD_CHG_TYPE, SD_TARGET_TYPE, JSON_BEFORE, JSON_AFTER, DES_REASON, CD_REQ, DT_CHANGED, ID_USER_CHANGED, ID_DICT_CAT, ID_DICT_ATTR_DEF) values (362387869940205, null, 362387869940001, 362387869940104, 'ADD_ITEM', 'ITEM', null, '{"code": "EXTREME_POVERTY", "name": "特困供养人员", "sortOrder": 40, "status": "ACTIVE"}', '结算惠民减免引用资格类别，名单与政策共享同一类别', 'v1.129.15:billing-relief-policy', timestamp with time zone '2026-10-17 00:00:00+08', 362387869790222, 362387869840010, null);
insert into RHN_BD_DICT_ITEM (ID_DICT_ITEM, ID_DICT_DEF_DICT, CD_DICT_ITEM, NA_DICT_ITEM, DES_DICT_ITEM, SN_SORT, SD_STATUS, ID_DICT_ITEM_PARENT) values (362387869940105, 362387869940001, 'SPECIAL_CARE', '优抚对象', '退役军人事务部门认定的重点优抚对象', 50, 'ACTIVE', null);
insert into RHN_BD_DICT_CHG (ID_DICT_CHG, ID_TNT, ID_DICT_DEF_DICT, ID_DICT_ITEM, SD_CHG_TYPE, SD_TARGET_TYPE, JSON_BEFORE, JSON_AFTER, DES_REASON, CD_REQ, DT_CHANGED, ID_USER_CHANGED, ID_DICT_CAT, ID_DICT_ATTR_DEF) values (362387869940206, null, 362387869940001, 362387869940105, 'ADD_ITEM', 'ITEM', null, '{"code": "SPECIAL_CARE", "name": "优抚对象", "sortOrder": 50, "status": "ACTIVE"}', '结算惠民减免引用资格类别，名单与政策共享同一类别', 'v1.129.15:billing-relief-policy', timestamp with time zone '2026-10-17 00:00:00+08', 362387869790222, 362387869840010, null);
insert into RHN_BD_DICT_ITEM (ID_DICT_ITEM, ID_DICT_DEF_DICT, CD_DICT_ITEM, NA_DICT_ITEM, DES_DICT_ITEM, SN_SORT, SD_STATUS, ID_DICT_ITEM_PARENT) values (362387869940106, 362387869940001, 'HOSPITAL_STAFF', '本院职工及家属', '医院人事部门登记的职工及其直系亲属', 60, 'ACTIVE', null);
insert into RHN_BD_DICT_CHG (ID_DICT_CHG, ID_TNT, ID_DICT_DEF_DICT, ID_DICT_ITEM, SD_CHG_TYPE, SD_TARGET_TYPE, JSON_BEFORE, JSON_AFTER, DES_REASON, CD_REQ, DT_CHANGED, ID_USER_CHANGED, ID_DICT_CAT, ID_DICT_ATTR_DEF) values (362387869940207, null, 362387869940001, 362387869940106, 'ADD_ITEM', 'ITEM', null, '{"code": "HOSPITAL_STAFF", "name": "本院职工及家属", "sortOrder": 60, "status": "ACTIVE"}', '结算惠民减免引用资格类别，名单与政策共享同一类别', 'v1.129.15:billing-relief-policy', timestamp with time zone '2026-10-17 00:00:00+08', 362387869790222, 362387869840010, null);

-- 3. Permissions: policy maintenance and roster maintenance, granted to a dedicated tenant administrator role.
insert into RHN_SYS_ACC_PERM values (362387869940301, 362387869790209, 362387869896005, 'BILLING_RELIEF.MANAGE', '维护惠民减免政策', 'MANAGE', 'BILLING_RELIEF', 'ACTIVE');
insert into RHN_SYS_ACC_PERM values (362387869940302, 362387869790209, 362387869896005, 'BILLING_RELIEF.ROSTER', '维护惠民资格名单', 'MANAGE', 'BILLING_RELIEF_ROSTER', 'ACTIVE');
insert into RHN_SYS_ACC_ROLE values (362387869940311, 362387869790209, 'BILLING_RELIEF_ADMIN', '惠民政策管理员', 'ADMIN', 'ACTIVE', timestamp with time zone '2026-10-17 00:00:00+08', timestamp with time zone '2026-10-17 00:00:00+08', 0);
insert into RHN_SYS_ROLE_PERM_ASSIGN values (362387869940321, 362387869790209, 362387869940311, 362387869940301, timestamp with time zone '2026-10-17 00:00:00+08', null, 362387869790222, timestamp with time zone '2026-10-17 00:00:00+08');
insert into RHN_SYS_ROLE_PERM_ASSIGN values (362387869940322, 362387869790209, 362387869940311, 362387869940302, timestamp with time zone '2026-10-17 00:00:00+08', null, 362387869790222, timestamp with time zone '2026-10-17 00:00:00+08');
insert into RHN_SYS_USER_ROLE_ASSIGN values (362387869940331, 362387869790209, 362387869790222, 362387869940311, null, null, 'TENANT', timestamp with time zone '2026-10-17 00:00:00+08', null, 362387869790222, timestamp with time zone '2026-10-17 00:00:00+08');

-- 4. Post-insurance relief is a settlement funding source: its own settlement amount and a tender sourced by the
--    relief application instead of a payment or an insurance response.
alter table RHN_BIL_STL add column AMT_RELIEF decimal(24,6) default 0 not null;
alter table RHN_BIL_STL_TENDER add column ID_RELIEF_APPLY bigint;
alter table RHN_BIL_STL_TENDER add constraint UK_BIL_STL_TENDER_RELIEF unique (ID_TNT, ID_RELIEF_APPLY);
comment on column RHN_BIL_STL.AMT_RELIEF is '医保后惠民减免与补助金额';
comment on column RHN_BIL_STL_TENDER.ID_RELIEF_APPLY is '减免记录标识，医保后减免的资金来源';

-- 5. Manual relief approval at the cashier is a separate permission held by the relief administrator role.
insert into RHN_SYS_ACC_PERM values (362387869940303, 362387869790209, 362387869896005, 'BILLING_RELIEF.APPROVE', '核准惠民人工减免', 'APPROVE', 'BILLING_RELIEF', 'ACTIVE');
insert into RHN_SYS_ROLE_PERM_ASSIGN values (362387869940323, 362387869790209, 362387869940311, 362387869940303, timestamp with time zone '2026-10-17 00:00:00+08', null, 362387869790222, timestamp with time zone '2026-10-17 00:00:00+08');

-- 6. A refund reverses relief: credit invoices and reversal settlements carry a negative discount (the relief
--    taken back), and a fully relieved charge reverses to a zero net amount.
alter table RHN_BIL_INVOICE drop constraint CK_BIL_INVOICE_INVOICE_DISCOUN;
alter table RHN_BIL_INVOICE add constraint CK_BIL_INVOICE_INVOICE_DISCOUN check (
    (SD_INVOICE_TYPE = 'STANDARD' and AMT_DISC >= 0) or (SD_INVOICE_TYPE = 'CREDIT' and AMT_DISC <= 0));
alter table RHN_BIL_INVOICE drop constraint CK_BIL_INVOICE_INVOICE_AMOUNT;
alter table RHN_BIL_INVOICE add constraint CK_BIL_INVOICE_INVOICE_AMOUNT check (
    (SD_INVOICE_TYPE = 'STANDARD' and AMT_GROSS >= 0 and AMT_NET >= 0)
    or (SD_INVOICE_TYPE = 'CREDIT' and AMT_GROSS < 0 and AMT_NET <= 0));
alter table RHN_BIL_STL drop constraint CK_BIL_STL_SETTLEMENT_AMOUNTS;
alter table RHN_BIL_STL add constraint CK_BIL_STL_SETTLEMENT_AMOUNTS check (AMT_INS >= 0 and AMT_PAT >= 0 and AMT_OTHER >= 0
    and ((SD_STL_TYPE <> 'REVERSAL' and AMT_DISC >= 0 and AMT_GROSS >= 0 and AMT_NET >= 0)
      or (SD_STL_TYPE = 'REVERSAL' and AMT_DISC <= 0 and AMT_GROSS <= 0 and AMT_NET <= 0)));
