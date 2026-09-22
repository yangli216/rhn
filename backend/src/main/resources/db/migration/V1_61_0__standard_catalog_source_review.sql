create table RHN_BD_STD_REVIEW (
    ID_STD_REVIEW bigint not null,
    ID_TNT bigint not null,
    CD_CATALOG varchar(64) not null,
    HASH_IDENTITY varchar(64) not null,
    REVISION integer not null,
    JSON_EVENT text not null,
    constraint PK_BD_STD_REVIEW primary key (ID_STD_REVIEW),
    constraint UK_BD_STD_REVIEW_REV unique (ID_TNT, HASH_IDENTITY, REVISION)
);

create index IX_BD_STD_REVIEW_CATALOG on RHN_BD_STD_REVIEW (ID_TNT, CD_CATALOG, ID_STD_REVIEW);

comment on table RHN_BD_STD_REVIEW is '标准目录来源核验事件，一行代表一个租户对特定目录及来源文件版本的一次不可变核验操作';

comment on column RHN_BD_STD_REVIEW.ID_STD_REVIEW is '来源核验事件标识';
comment on column RHN_BD_STD_REVIEW.ID_TNT is '租户标识';
comment on column RHN_BD_STD_REVIEW.CD_CATALOG is '标准目录标识';
comment on column RHN_BD_STD_REVIEW.HASH_IDENTITY is '目录标识、版本、内容指纹及来源文件指纹的组合哈希';
comment on column RHN_BD_STD_REVIEW.REVISION is '该租户及来源版本的递增核验序号';
comment on column RHN_BD_STD_REVIEW.JSON_EVENT is '核验事件快照，含证据、提交人、复核人、理由及时间';
