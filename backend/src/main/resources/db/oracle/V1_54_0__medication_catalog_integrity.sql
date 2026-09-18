create table RHN_BD_MED_STD_SOURCE (
    ID_MED_STD_SOURCE number(19) not null,
    ID_TNT number(19) not null,
    ID_MED number(19) not null,
    CD_CATALOG varchar2(64 char) not null,
    CATALOG_VERSION varchar2(64 char) not null,
    CD_STD_ENTRY varchar2(64 char) not null,
    CD_STD_SPEC varchar2(64 char) not null,
    SOURCE_HASH varchar2(64 char) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED number(19) not null,
    constraint PK_BD_MED_STD_SOURCE primary key (ID_MED_STD_SOURCE),
    constraint UK_BD_MED_STD_SOURCE unique (ID_TNT, CD_CATALOG, CATALOG_VERSION, CD_STD_SPEC),
    constraint FK_BD_MED_STD_SOURCE_MED foreign key (ID_TNT, ID_MED) references RHN_BD_MED (ID_TNT, ID_MED)
);
create index IX_BD_MED_STD_SOURCE_MED on RHN_BD_MED_STD_SOURCE (ID_TNT, ID_MED);
comment on table RHN_BD_MED_STD_SOURCE is '药品标准来源关联，一行代表一个租户内特定目录版本的标准规格与药品基本信息的关联。';
comment on column RHN_BD_MED_STD_SOURCE.ID_MED_STD_SOURCE is '标准来源关联主键';
comment on column RHN_BD_MED_STD_SOURCE.ID_TNT is '租户标识';
comment on column RHN_BD_MED_STD_SOURCE.ID_MED is '药品基本信息标识';
comment on column RHN_BD_MED_STD_SOURCE.CD_CATALOG is '标准目录编码';
comment on column RHN_BD_MED_STD_SOURCE.CATALOG_VERSION is '标准目录版本';
comment on column RHN_BD_MED_STD_SOURCE.CD_STD_ENTRY is '标准条目编码';
comment on column RHN_BD_MED_STD_SOURCE.CD_STD_SPEC is '标准规格编码';
comment on column RHN_BD_MED_STD_SOURCE.SOURCE_HASH is '目录内容校验值';
comment on column RHN_BD_MED_STD_SOURCE.DT_CREATED is '关联建立时间';
comment on column RHN_BD_MED_STD_SOURCE.ID_USER_CREATED is '关联建立人员标识';

alter table RHN_BD_ITEM_PKG add constraint UK_BD_ITEM_PKG_PRODUCT unique (ID_TNT, ID_CATALOG_ITEM, ID_ITEM_PKG);
alter table RHN_BD_ITEM_PKG add constraint FK_BD_ITEM_PKG_BASE_PRODUCT
    foreign key (ID_TNT, ID_CATALOG_ITEM, ID_ITEM_PKG_BASE)
    references RHN_BD_ITEM_PKG (ID_TNT, ID_CATALOG_ITEM, ID_ITEM_PKG);
alter table RHN_SUP_STOCK_ITEM add constraint FK_SUP_STOCK_ITEM_PRODUCT_PKG
    foreign key (ID_TNT, ID_CATALOG_ITEM, ID_ITEM_PKG_BASE)
    references RHN_BD_ITEM_PKG (ID_TNT, ID_CATALOG_ITEM, ID_ITEM_PKG);
alter table RHN_BD_CATALOG_PRICE add constraint FK_BD_PRICE_PRODUCT_PKG
    foreign key (ID_TNT, ID_CATALOG_ITEM, ID_ITEM_PKG)
    references RHN_BD_ITEM_PKG (ID_TNT, ID_CATALOG_ITEM, ID_ITEM_PKG);
