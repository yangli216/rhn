-- Payment merchant credentials use the existing server-side AES-GCM service.
create table RHN_BIL_PAY_CFG (
    ID_PAY_CFG bigint,
    REVISION bigint not null default 0,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    CD_PAY_METHOD varchar(128) not null,
    FL_ENABLED boolean not null,
    FL_ID_LOCK boolean not null,
    TXT_CIPHER clob not null,
    ID_USER_UPDATED bigint not null,
    DT_UPDATED timestamp with time zone not null,
    constraint PK_BIL_PAY_CFG primary key (ID_PAY_CFG),
    constraint UK_BIL_PAY_CFG_SCOPE unique (ID_TNT, ID_ORG, CD_PAY_METHOD),
    constraint FK_BIL_PAY_CFG_TNT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT),
    constraint FK_BIL_PAY_CFG_ORG foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG)
);
comment on table RHN_BIL_PAY_CFG is '支付渠道机构商户配置；一行代表一个租户法人机构的一种支付方式的加密商户配置';
comment on column RHN_BIL_PAY_CFG.ID_PAY_CFG is '支付渠道配置主键';
comment on column RHN_BIL_PAY_CFG.REVISION is '乐观锁版本';
comment on column RHN_BIL_PAY_CFG.ID_TNT is '租户标识';
comment on column RHN_BIL_PAY_CFG.ID_ORG is '法人机构标识';
comment on column RHN_BIL_PAY_CFG.CD_PAY_METHOD is '支付方式编码';
comment on column RHN_BIL_PAY_CFG.FL_ENABLED is '是否允许新收款；停用保留原单查询退款';
comment on column RHN_BIL_PAY_CFG.FL_ID_LOCK is '商户身份是否已锁定';
comment on column RHN_BIL_PAY_CFG.TXT_CIPHER is '机构渠道凭证配置密文；不保存明文';
comment on column RHN_BIL_PAY_CFG.ID_USER_UPDATED is '最后修改人标识';
comment on column RHN_BIL_PAY_CFG.DT_UPDATED is '最后修改时间';

insert into RHN_SYS_MGMT_MOD (ID_MGMT_MOD, ID_TNT, ID_MGMT_MOD_PARENT, CD_MGMT_MOD, NA_MGMT_MOD,
    SD_MOD_TYPE, ROUTE_PATH, CD_COMP, CD_ICON, SN_SORT, SD_STATUS, DT_CREATED, DT_UPDATED, REVISION)
select 362387869899170 + row_number() over (order by parent.ID_TNT), parent.ID_TNT, parent.ID_MGMT_MOD,
    'PAYMENT_CHANNELS', '支付渠道', 'MODULE', '/settings/payment-channels', 'PaymentChannelManagement',
    'settings', 75, 'ACTIVE', current_timestamp, current_timestamp, 0
from RHN_SYS_MGMT_MOD parent where parent.CD_MGMT_MOD = 'SYSTEM_CONFIG';

insert into RHN_SYS_ACC_PERM (ID_ACC_PERM, ID_TNT, ID_MGMT_MOD, CD_ACC_PERM, NA_ACC_PERM, CD_ACTION, CD_RSRC, SD_STATUS)
select 362387869899270 + row_number() over (order by module.ID_TNT), module.ID_TNT, module.ID_MGMT_MOD,
    'PAYMENT_CONFIGURATION.MANAGE', '维护支付渠道配置', 'MANAGE', 'PAYMENT_CONFIGURATION', 'ACTIVE'
from RHN_SYS_MGMT_MOD module where module.CD_MGMT_MOD = 'PAYMENT_CHANNELS';

-- Provision a dedicated administrative role; do not grant payment credentials to clinical roles.
insert into RHN_SYS_ACC_ROLE (ID_ACC_ROLE, ID_TNT, CD_ACC_ROLE, NA_ACC_ROLE, SD_ROLE_TYPE, SD_STATUS, DT_CREATED, DT_UPDATED, REVISION)
select 362387869899370 + row_number() over (order by module.ID_TNT), module.ID_TNT,
    'PAYMENT_CONFIG_ADMIN', '支付渠道配置管理员', 'ADMIN', 'ACTIVE', current_timestamp, current_timestamp, 0
from RHN_SYS_MGMT_MOD module where module.CD_MGMT_MOD = 'PAYMENT_CHANNELS';

insert into RHN_SYS_ROLE_PERM_ASSIGN (ID_ROLE_PERM_ASSIGN, ID_TNT, ID_ACC_ROLE, ID_ACC_PERM, DT_VALID_FROM, DT_CREATED)
select 362387869899470 + row_number() over (order by r.ID_TNT), r.ID_TNT, r.ID_ACC_ROLE,
    p.ID_ACC_PERM, current_timestamp, current_timestamp
from RHN_SYS_ACC_ROLE r join RHN_SYS_ACC_PERM p on p.ID_TNT = r.ID_TNT
where r.CD_ACC_ROLE = 'PAYMENT_CONFIG_ADMIN' and p.CD_ACC_PERM = 'PAYMENT_CONFIGURATION.MANAGE';
