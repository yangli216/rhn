create table RHN_BD_ENTRY_REVIEW (
    ID_REVIEW bigint not null,
    ID_TNT bigint not null,
    HASH_IDTY varchar(64) not null,
    ID_ENTRY varchar(120) not null,
    REVISION integer not null,
    JSON_EVENT text not null,
    constraint PK_BD_ENTRY_REVIEW primary key (ID_REVIEW),
    constraint UK_BD_ENTRY_REVIEW_REV unique (ID_TNT, HASH_IDTY, ID_ENTRY, REVISION)
);
comment on table RHN_BD_ENTRY_REVIEW is '标准目录逐条转录核对事件，一行代表一个租户对特定目录版本中一个条目的不可变核对操作；不替代来源审批与临床审核';
comment on column RHN_BD_ENTRY_REVIEW.ID_REVIEW is '核对事件标识';
comment on column RHN_BD_ENTRY_REVIEW.ID_TNT is '租户标识';
comment on column RHN_BD_ENTRY_REVIEW.HASH_IDTY is '目录标识版本及内容和来源文件指纹组合哈希';
comment on column RHN_BD_ENTRY_REVIEW.ID_ENTRY is '电子目录条目标识';
comment on column RHN_BD_ENTRY_REVIEW.REVISION is '条目核对递增序号，用于并发控制';
comment on column RHN_BD_ENTRY_REVIEW.JSON_EVENT is '不可变核对结果，含问题说明、操作人和时间';
