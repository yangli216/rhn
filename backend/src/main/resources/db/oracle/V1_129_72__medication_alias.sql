-- 药品别名：由通用药品表上的单个字符串改为独立别名表，一个别名一行；
-- 检索表按别名逐行生成拼音/五笔码，别名表仅可选保存人工助记码。

create table RHN_BD_MED_ALIAS (
    ID_MED_ALIAS number(19),
    ID_TNT number(19) not null,
    ID_MED number(19) not null,
    SD_ALIAS_TYPE varchar2(32 char) not null,
    NA_ALIAS varchar2(300 char) not null,
    CD_MNEM varchar2(128 char),
    FG_PRIMARY_ALIAS number(1) default 0 not null,
    SD_STATUS varchar2(32 char) not null,
    constraint PK_BD_MED_ALIAS primary key (ID_MED_ALIAS),
    constraint UK_BD_MED_ALIAS_NAME unique (ID_TNT, ID_MED, SD_ALIAS_TYPE, NA_ALIAS),
    constraint FK_BD_MED_ALIAS_TNT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT),
    constraint FK_BD_MED_ALIAS_MED foreign key (ID_TNT, ID_MED) references RHN_BD_MED(ID_TNT, ID_MED),
    constraint CK_BD_MED_ALIAS_PRIMARY check (FG_PRIMARY_ALIAS in (0, 1)),
    constraint CK_BD_MED_ALIAS_STATUS check (SD_STATUS in ('ACTIVE', 'INACTIVE'))
);
create index IX_BD_MED_ALIAS_MED on RHN_BD_MED_ALIAS (ID_TNT, ID_MED, SD_STATUS);
create index IX_BD_MED_ALIAS_NAME on RHN_BD_MED_ALIAS (ID_TNT, NA_ALIAS, SD_STATUS);
comment on table RHN_BD_MED_ALIAS is '药品别名；一行代表一条通用药品别名，检索简码由检索表按别名名称生成';
comment on column RHN_BD_MED_ALIAS.ID_MED_ALIAS is '药品别名主键';
comment on column RHN_BD_MED_ALIAS.ID_TNT is '租户标识';
comment on column RHN_BD_MED_ALIAS.ID_MED is '通用药品标识';
comment on column RHN_BD_MED_ALIAS.SD_ALIAS_TYPE is '别名类型';
comment on column RHN_BD_MED_ALIAS.NA_ALIAS is '别名名称';
comment on column RHN_BD_MED_ALIAS.CD_MNEM is '人工指定的助记码；为空时仅按别名名称生成拼音与五笔检索码';
comment on column RHN_BD_MED_ALIAS.FG_PRIMARY_ALIAS is '是否主要别名';
comment on column RHN_BD_MED_ALIAS.SD_STATUS is '状态';

-- 存量别名按整串迁移为一行（主要别名）；含多个别名的历史字符串请在药品知识维护中拆分。
-- 别名主键复用药品主键：每个药品最多迁移一行，且主键来自全局发号器，不会与后续新别名冲突。
insert into RHN_BD_MED_ALIAS (ID_MED_ALIAS, ID_TNT, ID_MED, SD_ALIAS_TYPE, NA_ALIAS, CD_MNEM, FG_PRIMARY_ALIAS, SD_STATUS)
select ID_MED, ID_TNT, ID_MED, 'SYNONYM', trim(NA_ALIAS), null, 1, 'ACTIVE'
from RHN_BD_MED
where NA_ALIAS is not null and trim(NA_ALIAS) is not null;

alter table RHN_BD_MED drop column NA_ALIAS;
