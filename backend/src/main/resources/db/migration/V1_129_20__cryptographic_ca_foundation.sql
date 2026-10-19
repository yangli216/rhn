-- ADR-008: attestation purpose, personal CA signature origin, signer binding, certificate store and signing orders.
alter table RHN_AUD_CRYPTO_EVID drop constraint CK_AUD_CRYPTO_EVI_CRYPTO_EVIDE;
alter table RHN_AUD_CRYPTO_EVID add constraint CK_AUD_CRYPTO_EVI_CRYPTO_EVIDE
    check (SD_PROT_PURPOSE in ('INTEGRITY', 'ATTESTATION', 'NON_REPUDIATION'));
alter table RHN_AUD_CRYPTO_EVID add column SD_SIGN_CHANNEL varchar(32);
alter table RHN_AUD_CRYPTO_EVID add column SD_SIGN_FMT varchar(32);
alter table RHN_AUD_CRYPTO_EVID add column HASH_SIGNER_CERT varchar(128);
alter table RHN_AUD_CRYPTO_EVID add column ID_SIGN_ORDER bigint;
alter table RHN_AUD_CRYPTO_EVID add column DES_SIGNED_ENVLP clob;
alter table RHN_AUD_CRYPTO_EVID add constraint CK_AUD_CRYPTO_EVID_CHANNEL
    check (SD_SIGN_CHANNEL is null or SD_SIGN_CHANNEL in ('SYSTEM', 'CLIENT_TOKEN', 'MOBILE_COSIGN'));
alter table RHN_AUD_CRYPTO_EVID add constraint CK_AUD_CRYPTO_EVID_FMT
    check (SD_SIGN_FMT is null or SD_SIGN_FMT in ('SM2_STATEMENT', 'SM2_ENVELOPE'));

comment on column RHN_AUD_CRYPTO_EVID.SD_SIGN_CHANNEL is '签名私钥所在通道';
comment on column RHN_AUD_CRYPTO_EVID.SD_SIGN_FMT is '个人签名值格式';
comment on column RHN_AUD_CRYPTO_EVID.HASH_SIGNER_CERT is '签名证书SM3指纹';
comment on column RHN_AUD_CRYPTO_EVID.ID_SIGN_ORDER is '个人签名任务标识';
comment on column RHN_AUD_CRYPTO_EVID.DES_SIGNED_ENVLP is '厂商签名原文封装';

create table RHN_SYS_CA_SIGNER (
    ID_CA_SIGNER bigint not null,
    REVISION bigint not null,
    ID_TNT bigint not null,
    ID_USER bigint not null,
    ID_PRACT bigint,
    CD_CA_VENDOR varchar(32) not null,
    ID_EXT_SIGNER varchar(128) not null,
    SD_MEDIUM varchar(16) not null,
    SD_STATUS varchar(16) not null,
    HASH_CERT varchar(128),
    CD_CERT_SERIAL varchar(256),
    CERT_ISSUER varchar(500),
    DES_CERT_SUBJ varchar(500),
    DT_CERT_FROM timestamp with time zone,
    DT_CERT_TO timestamp with time zone,
    ID_USER_BOUND bigint not null,
    DT_BOUND timestamp with time zone not null,
    DT_UPDATED timestamp with time zone not null,
    constraint PK_SYS_CA_SIGNER primary key (ID_CA_SIGNER),
    constraint FK_SYS_CA_SIGNER_TNT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT),
    constraint UK_SYS_CA_SIGNER_EXT unique (ID_TNT, CD_CA_VENDOR, ID_EXT_SIGNER),
    constraint CK_SYS_CA_SIGNER_MEDIUM check (SD_MEDIUM in ('MOBILE', 'UKEY')),
    constraint CK_SYS_CA_SIGNER_STATUS check (SD_STATUS in ('ACTIVE', 'SUSPENDED', 'REVOKED', 'UNBOUND'))
);

create index IX_SYS_CA_SIGNER_USER on RHN_SYS_CA_SIGNER (ID_TNT, ID_USER, CD_CA_VENDOR, SD_STATUS);
create index IX_SYS_CA_SIGNER_CERT on RHN_SYS_CA_SIGNER (ID_TNT, CD_CA_VENDOR, HASH_CERT);

comment on table RHN_SYS_CA_SIGNER is 'CA签名人绑定；一行代表一个账号在一家CA厂商的签名身份';
comment on column RHN_SYS_CA_SIGNER.ID_CA_SIGNER is 'CA签名人绑定主键';
comment on column RHN_SYS_CA_SIGNER.REVISION is '乐观锁版本';
comment on column RHN_SYS_CA_SIGNER.ID_TNT is '租户标识';
comment on column RHN_SYS_CA_SIGNER.ID_USER is '绑定账号标识';
comment on column RHN_SYS_CA_SIGNER.ID_PRACT is '执业人员标识';
comment on column RHN_SYS_CA_SIGNER.CD_CA_VENDOR is 'CA厂商适配器编码';
comment on column RHN_SYS_CA_SIGNER.ID_EXT_SIGNER is '厂商侧签名人标识';
comment on column RHN_SYS_CA_SIGNER.SD_MEDIUM is '证书介质';
comment on column RHN_SYS_CA_SIGNER.SD_STATUS is '绑定状态';
comment on column RHN_SYS_CA_SIGNER.HASH_CERT is '当前证书SM3指纹';
comment on column RHN_SYS_CA_SIGNER.CD_CERT_SERIAL is '当前证书序列号';
comment on column RHN_SYS_CA_SIGNER.CERT_ISSUER is '当前证书签发者';
comment on column RHN_SYS_CA_SIGNER.DES_CERT_SUBJ is '当前证书主体';
comment on column RHN_SYS_CA_SIGNER.DT_CERT_FROM is '证书生效时间';
comment on column RHN_SYS_CA_SIGNER.DT_CERT_TO is '证书失效时间';
comment on column RHN_SYS_CA_SIGNER.ID_USER_BOUND is '绑定操作账号标识';
comment on column RHN_SYS_CA_SIGNER.DT_BOUND is '绑定时间';
comment on column RHN_SYS_CA_SIGNER.DT_UPDATED is '更新时间';

create table RHN_AUD_CRYPTO_CERT (
    ID_CRYPTO_CERT bigint not null,
    ID_TNT bigint not null,
    HASH_CERT varchar(128) not null,
    CD_CA_VENDOR varchar(32) not null,
    CD_CERT_SERIAL varchar(256) not null,
    CERT_ISSUER varchar(500) not null,
    DES_CERT_SUBJ varchar(500) not null,
    DT_CERT_FROM timestamp with time zone not null,
    DT_CERT_TO timestamp with time zone not null,
    DES_CERT_DER clob not null,
    DT_RECDD timestamp with time zone not null,
    constraint PK_AUD_CRYPTO_CERT primary key (ID_CRYPTO_CERT),
    constraint FK_AUD_CRYPTO_CERT_TNT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT),
    constraint UK_AUD_CRYPTO_CERT_HASH unique (ID_TNT, HASH_CERT)
);

comment on table RHN_AUD_CRYPTO_CERT is '签名证书材料；一行代表一张按指纹只追加保存的证书';
comment on column RHN_AUD_CRYPTO_CERT.ID_CRYPTO_CERT is '证书材料主键';
comment on column RHN_AUD_CRYPTO_CERT.ID_TNT is '租户标识';
comment on column RHN_AUD_CRYPTO_CERT.HASH_CERT is '证书SM3指纹';
comment on column RHN_AUD_CRYPTO_CERT.CD_CA_VENDOR is 'CA厂商适配器编码';
comment on column RHN_AUD_CRYPTO_CERT.CD_CERT_SERIAL is '证书序列号';
comment on column RHN_AUD_CRYPTO_CERT.CERT_ISSUER is '证书签发者';
comment on column RHN_AUD_CRYPTO_CERT.DES_CERT_SUBJ is '证书主体';
comment on column RHN_AUD_CRYPTO_CERT.DT_CERT_FROM is '证书生效时间';
comment on column RHN_AUD_CRYPTO_CERT.DT_CERT_TO is '证书失效时间';
comment on column RHN_AUD_CRYPTO_CERT.DES_CERT_DER is '证书DER编码Base64';
comment on column RHN_AUD_CRYPTO_CERT.DT_RECDD is '首次记录时间';

create table RHN_AUD_CA_SIGN_ORDER (
    ID_SIGN_ORDER bigint not null,
    REVISION bigint not null,
    ID_TNT bigint not null,
    ID_ORG bigint,
    ID_USER bigint not null,
    NA_ACTOR varchar(128) not null,
    ID_CA_SIGNER bigint,
    ID_CRYPTO_EVID_ATTEST bigint not null,
    ID_CRYPTO_EVID_RESULT bigint not null,
    CD_SCENE varchar(64) not null,
    CD_CA_VENDOR varchar(32) not null,
    PRVDR_ASSUR varchar(64) not null,
    SD_SIGN_MODE varchar(32) not null,
    SD_STATUS varchar(32) not null,
    SN_STMT_VER integer not null,
    JSON_STMT clob not null,
    STMT_DIGEST_ALGO varchar(64) not null,
    HASH_STMT varchar(512) not null,
    CONTENT_DIGEST_ALGO varchar(64) not null,
    HASH_CONTENT varchar(512) not null,
    ID_CRYPTO_EVID_PREV bigint,
    ID_CORR varchar(64) not null,
    DES_SUBJECT varchar(200) not null,
    DES_PAT_DISP varchar(64),
    ID_EXT_ORDER varchar(128),
    DES_CLAIM varchar(2000),
    SN_ATMPTS integer not null,
    DT_NEXT_CHECK timestamp with time zone,
    CD_ERROR varchar(64),
    DES_ERROR_MSG varchar(500),
    DT_EXPIRES timestamp with time zone not null,
    DT_CREATED timestamp with time zone not null,
    DT_UPDATED timestamp with time zone not null,
    DT_CMPLD timestamp with time zone,
    constraint PK_AUD_CA_SIGN_ORDER primary key (ID_SIGN_ORDER),
    constraint FK_AUD_CA_SIGN_ORDER_TNT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT),
    constraint FK_AUD_CA_SIGN_ORDER_ATTEST foreign key (ID_TNT, ID_CRYPTO_EVID_ATTEST)
        references RHN_AUD_CRYPTO_EVID(ID_TNT, ID_CRYPTO_EVID),
    constraint FK_AUD_CA_SIGN_ORDER_SIGNER foreign key (ID_CA_SIGNER) references RHN_SYS_CA_SIGNER(ID_CA_SIGNER),
    constraint UK_AUD_CA_SIGN_ORDER_RESULT unique (ID_TNT, ID_CRYPTO_EVID_RESULT),
    constraint CK_AUD_CA_SIGN_ORDER_MODE check (SD_SIGN_MODE in ('CLIENT_TOKEN', 'PUSH', 'QR_CLAIM', 'AUTO')),
    constraint CK_AUD_CA_SIGN_ORDER_STATUS check (SD_STATUS in ('PENDING', 'AWAITING_SIGNER', 'SIGNED',
        'VERIFIED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'FAILED', 'VOIDED_BY_SIGNER'))
);

create index IX_AUD_CA_SIGN_ORDER_ATTEST on RHN_AUD_CA_SIGN_ORDER (ID_TNT, ID_CRYPTO_EVID_ATTEST, DT_CREATED);
create index IX_AUD_CA_SIGN_ORDER_DUE on RHN_AUD_CA_SIGN_ORDER (SD_STATUS, DT_NEXT_CHECK);
create index IX_AUD_CA_SIGN_ORDER_EXT on RHN_AUD_CA_SIGN_ORDER (CD_CA_VENDOR, ID_EXT_ORDER);
create index IX_AUD_CA_SIGN_ORDER_USER on RHN_AUD_CA_SIGN_ORDER (ID_TNT, ID_USER, SD_STATUS, DT_CREATED);

comment on table RHN_AUD_CA_SIGN_ORDER is '个人CA签名任务；一行代表一次对签署行为证据的个人签名请求';
comment on column RHN_AUD_CA_SIGN_ORDER.ID_SIGN_ORDER is '签名任务主键';
comment on column RHN_AUD_CA_SIGN_ORDER.REVISION is '乐观锁版本';
comment on column RHN_AUD_CA_SIGN_ORDER.ID_TNT is '租户标识';
comment on column RHN_AUD_CA_SIGN_ORDER.ID_ORG is '发起机构标识';
comment on column RHN_AUD_CA_SIGN_ORDER.ID_USER is '签名人账号标识';
comment on column RHN_AUD_CA_SIGN_ORDER.NA_ACTOR is '签名人账号名称快照';
comment on column RHN_AUD_CA_SIGN_ORDER.ID_CA_SIGNER is 'CA签名人绑定标识';
comment on column RHN_AUD_CA_SIGN_ORDER.ID_CRYPTO_EVID_ATTEST is '被签名的签署行为证据标识';
comment on column RHN_AUD_CA_SIGN_ORDER.ID_CRYPTO_EVID_RESULT is '预分配的个人签名证据标识';
comment on column RHN_AUD_CA_SIGN_ORDER.CD_SCENE is '业务签名场景编码';
comment on column RHN_AUD_CA_SIGN_ORDER.CD_CA_VENDOR is 'CA厂商适配器编码';
comment on column RHN_AUD_CA_SIGN_ORDER.PRVDR_ASSUR is '厂商适配器可信等级';
comment on column RHN_AUD_CA_SIGN_ORDER.SD_SIGN_MODE is '签名方式';
comment on column RHN_AUD_CA_SIGN_ORDER.SD_STATUS is '签名任务状态';
comment on column RHN_AUD_CA_SIGN_ORDER.SN_STMT_VER is '待签声明版本';
comment on column RHN_AUD_CA_SIGN_ORDER.JSON_STMT is '冻结的待签声明JSON';
comment on column RHN_AUD_CA_SIGN_ORDER.STMT_DIGEST_ALGO is '声明摘要算法';
comment on column RHN_AUD_CA_SIGN_ORDER.HASH_STMT is '声明摘要';
comment on column RHN_AUD_CA_SIGN_ORDER.CONTENT_DIGEST_ALGO is '被签内容摘要算法';
comment on column RHN_AUD_CA_SIGN_ORDER.HASH_CONTENT is '被签内容摘要';
comment on column RHN_AUD_CA_SIGN_ORDER.ID_CRYPTO_EVID_PREV is '声明引用的上一证据标识';
comment on column RHN_AUD_CA_SIGN_ORDER.ID_CORR is '关联标识';
comment on column RHN_AUD_CA_SIGN_ORDER.DES_SUBJECT is '签名人端展示主题';
comment on column RHN_AUD_CA_SIGN_ORDER.DES_PAT_DISP is '已脱敏的患者展示名';
comment on column RHN_AUD_CA_SIGN_ORDER.ID_EXT_ORDER is '厂商签名任务号';
comment on column RHN_AUD_CA_SIGN_ORDER.DES_CLAIM is '扫码认领内容';
comment on column RHN_AUD_CA_SIGN_ORDER.SN_ATMPTS is '厂商调用次数';
comment on column RHN_AUD_CA_SIGN_ORDER.DT_NEXT_CHECK is '下次处理时间';
comment on column RHN_AUD_CA_SIGN_ORDER.CD_ERROR is '最近错误编码';
comment on column RHN_AUD_CA_SIGN_ORDER.DES_ERROR_MSG is '最近错误说明';
comment on column RHN_AUD_CA_SIGN_ORDER.DT_EXPIRES is '任务过期时间';
comment on column RHN_AUD_CA_SIGN_ORDER.DT_CREATED is '创建时间';
comment on column RHN_AUD_CA_SIGN_ORDER.DT_UPDATED is '更新时间';
comment on column RHN_AUD_CA_SIGN_ORDER.DT_CMPLD is '进入终态时间';
