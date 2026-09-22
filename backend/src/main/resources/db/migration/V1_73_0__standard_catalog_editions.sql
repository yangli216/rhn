create table RHN_BD_STD_EDITION (
    ID_TNT bigint not null,
    ID_STD_EDITION bigint not null,
    CD_CATALOG varchar(64) not null,
    CATALOG_VERSION varchar(64) not null,
    JSON_EDITION text not null,
    HASH_EDITION varchar(64) not null,
    JSON_METADATA text not null,
    HASH_METADATA varchar(64) not null,
    constraint PK_BD_STD_EDITION primary key (ID_TNT,ID_STD_EDITION),
    constraint UQ_BD_STD_EDITION_VER unique (ID_TNT,CD_CATALOG,CATALOG_VERSION)
);
comment on table RHN_BD_STD_EDITION is '标准参考目录登记，一行代表一个租户保存的不可变候选版次，不改变当前运行目录';
comment on column RHN_BD_STD_EDITION.ID_TNT is '租户标识';
comment on column RHN_BD_STD_EDITION.ID_STD_EDITION is '标准目录登记版次标识';
comment on column RHN_BD_STD_EDITION.CD_CATALOG is '标准目录编码体系标识';
comment on column RHN_BD_STD_EDITION.CATALOG_VERSION is '不可覆盖的目录版次';
comment on column RHN_BD_STD_EDITION.JSON_EDITION is '目录登记元数据及完整规范化目录包，保留来源声明与原上传文本指纹';
comment on column RHN_BD_STD_EDITION.HASH_EDITION is '登记元数据与完整目录包的规范化 SHA256 指纹';
comment on column RHN_BD_STD_EDITION.JSON_METADATA is '独立登记摘要，列表读取不加载完整目录包';
comment on column RHN_BD_STD_EDITION.HASH_METADATA is '登记摘要的规范化 SHA256 指纹';
