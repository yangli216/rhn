-- 检查申请按收费方案落账：一条检查申请可生成多条收费明细（主项目、多部位加收、附加项目），每条对应一个物价项。
-- 开立时把带价格来源的收费方案快照到申请；计费按快照逐行生成收费事项，撤销时逐行冲销。

create table RHN_EX_SVC_REQ_CHG (
    ID_SVC_REQ_CHG bigint,
    ID_TNT bigint not null,
    ID_CARE_REQ bigint not null,
    SN_LINE integer not null,
    SD_CHG_ROLE varchar(24) not null,
    ID_CATALOG_ITEM bigint not null,
    CD_ITEM_SNAP varchar(128) not null,
    NA_ITEM_SNAP varchar(300) not null,
    CD_UNIT varchar(64) not null,
    QTY_CHARGE decimal(28,8) not null,
    ID_PRICE bigint,
    SN_PRICE_VER bigint,
    SD_PRICE_TYPE varchar(32),
    PRICE_UNIT decimal(24,6) not null,
    AMT_TOTAL decimal(24,6) not null,
    CD_CCY varchar(8) not null,
    SD_ACCTG_CAT varchar(64),
    DT_CREATED timestamp with time zone not null,
    constraint PK_EX_SVC_REQ_CHG primary key (ID_SVC_REQ_CHG),
    constraint UK_EX_SVC_REQ_CHG_LINE unique (ID_TNT, ID_CARE_REQ, SN_LINE),
    constraint FK_EX_SVC_REQ_CHG_REQ foreign key (ID_TNT, ID_CARE_REQ) references RHN_EX_SVC_REQ(ID_TNT, ID_CARE_REQ),
    constraint CK_EX_SVC_REQ_CHG_LINE check (SN_LINE > 0),
    constraint CK_EX_SVC_REQ_CHG_QTY check (QTY_CHARGE > 0),
    constraint CK_EX_SVC_REQ_CHG_ROLE check (SD_CHG_ROLE in ('BASE_SERVICE', 'TIER', 'MULTI_SITE_FIXED', 'MULTI_SITE_ITEM', 'ATTACHMENT'))
);
comment on table RHN_EX_SVC_REQ_CHG is '检查申请收费方案；一行代表开立时快照的一条收费明细，计费按行生成收费事项';
comment on column RHN_EX_SVC_REQ_CHG.ID_SVC_REQ_CHG is '申请收费明细主键';
comment on column RHN_EX_SVC_REQ_CHG.ID_TNT is '租户标识';
comment on column RHN_EX_SVC_REQ_CHG.ID_CARE_REQ is '服务请求标识';
comment on column RHN_EX_SVC_REQ_CHG.SN_LINE is '收费行号，从 1 开始，与收费事项行号一致';
comment on column RHN_EX_SVC_REQ_CHG.SD_CHG_ROLE is '收费行类型：主项目、阶梯档位、多部位固定加收、多部位加收项目、附加项目';
comment on column RHN_EX_SVC_REQ_CHG.ID_CATALOG_ITEM is '收费物价项目标识';
comment on column RHN_EX_SVC_REQ_CHG.CD_ITEM_SNAP is '物价项目编码快照';
comment on column RHN_EX_SVC_REQ_CHG.NA_ITEM_SNAP is '物价项目名称快照';
comment on column RHN_EX_SVC_REQ_CHG.CD_UNIT is '收费单位';
comment on column RHN_EX_SVC_REQ_CHG.QTY_CHARGE is '收费数量';
comment on column RHN_EX_SVC_REQ_CHG.ID_PRICE is '价格版本标识；多部位固定加收取检查配置金额，为空';
comment on column RHN_EX_SVC_REQ_CHG.SN_PRICE_VER is '价格修订号';
comment on column RHN_EX_SVC_REQ_CHG.SD_PRICE_TYPE is '价格类型';
comment on column RHN_EX_SVC_REQ_CHG.PRICE_UNIT is '单价快照';
comment on column RHN_EX_SVC_REQ_CHG.AMT_TOTAL is '金额，等于单价乘数量';
comment on column RHN_EX_SVC_REQ_CHG.CD_CCY is '币种';
comment on column RHN_EX_SVC_REQ_CHG.SD_ACCTG_CAT is '核算分类快照';
comment on column RHN_EX_SVC_REQ_CHG.DT_CREATED is '创建时间';

alter table RHN_BIL_CHARGE_ITEM add column SN_CHG_LINE integer default 1 not null;
alter table RHN_BIL_CHARGE_ITEM add column SD_CHG_ROLE varchar(24);
alter table RHN_BIL_CHARGE_ITEM add constraint CK_BIL_CHARGE_ITEM_CHG_LINE check (SN_CHG_LINE > 0);
comment on column RHN_BIL_CHARGE_ITEM.SN_CHG_LINE is '同一来源内的收费行号；检查申请按收费方案逐行落账，其余来源为 1';
comment on column RHN_BIL_CHARGE_ITEM.SD_CHG_ROLE is '收费行类型，与检查申请收费方案一致；非检查申请为空';
-- 来源唯一键加入行号：同一检查申请的多行收费、冲销与退费冲销按行各占一条。
alter table RHN_BIL_CHARGE_ITEM drop constraint UK_BIL_CHARGE_ITE_CHARGE_SOURC;
alter table RHN_BIL_CHARGE_ITEM add constraint UK_BIL_CHARGE_ITEM_SRC_LINE unique (ID_TNT, SD_SRC_TYPE, ID_SRC, SN_CHG_LINE);
