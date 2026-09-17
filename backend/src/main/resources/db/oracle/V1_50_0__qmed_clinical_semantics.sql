-- Immutable clinical semantics and explicit ingredient mappings. No historical order backfill.
declare
    object_count number;
begin
    select count(*) into object_count from user_tables where table_name = 'RHN_BD_CLIN_SEM_VER';
    if object_count = 0 then
        execute immediate 'create table RHN_BD_CLIN_SEM_VER (
    ID_CLIN_SEM_VER number(19) not null,
    ID_TNT number(19) not null,
    SD_CONCEPT_KIND varchar2(32) not null,
    CD_CONCEPT varchar2(96) not null,
    HASH_SEM_VER varchar2(64) not null,
    SD_CHANGE_TYPE varchar2(40) not null,
    DES_SOURCE varchar2(256 char) not null,
    JSON_SNAPSHOT clob not null,
    DT_RECORDED timestamp with time zone not null,
    CD_IDENTITY_KEY varchar2(96),
    ID_USER_RECORDED number(19),
    constraint PK_BD_CLIN_SEM_VER primary key (ID_CLIN_SEM_VER),
    constraint UQ_BD_CLIN_SEM_IDENTITY unique (CD_IDENTITY_KEY)
)';
    end if;
end;
/
declare
    object_count number;
begin
    select count(*) into object_count from user_indexes where index_name = 'IX_BD_CLIN_SEM_CONCEPT';
    if object_count = 0 then
        execute immediate 'create index IX_BD_CLIN_SEM_CONCEPT on RHN_BD_CLIN_SEM_VER (ID_TNT, SD_CONCEPT_KIND, CD_CONCEPT, ID_CLIN_SEM_VER)';
    end if;
end;
/
comment on table RHN_BD_CLIN_SEM_VER is '临床语义版本；一行代表一次不可变概念版本或显示信息变更记录';
comment on column RHN_BD_CLIN_SEM_VER.ID_CLIN_SEM_VER is '临床语义版本记录主键';
comment on column RHN_BD_CLIN_SEM_VER.ID_TNT is '租户标识';
comment on column RHN_BD_CLIN_SEM_VER.SD_CONCEPT_KIND is '概念类型';
comment on column RHN_BD_CLIN_SEM_VER.CD_CONCEPT is '稳定概念标识';
comment on column RHN_BD_CLIN_SEM_VER.HASH_SEM_VER is '语义内容版本哈希';
comment on column RHN_BD_CLIN_SEM_VER.SD_CHANGE_TYPE is '变更类型';
comment on column RHN_BD_CLIN_SEM_VER.DES_SOURCE is '资料来源';
comment on column RHN_BD_CLIN_SEM_VER.JSON_SNAPSHOT is '不可变资料快照';
comment on column RHN_BD_CLIN_SEM_VER.DT_RECORDED is '版本记录时间';
comment on column RHN_BD_CLIN_SEM_VER.ID_USER_RECORDED is '记录人标识';
comment on column RHN_BD_CLIN_SEM_VER.CD_IDENTITY_KEY is '成分去重身份键；其他版本记录为空';
