create table RHN_AUD_KNOW_EXTRACT (
    ID_TNT bigint not null,
    ID_EXTRACT bigint not null,
    JSON_RUN text not null,
    constraint PK_AUD_KNOW_EXTRACT primary key (ID_TNT, ID_EXTRACT)
);

comment on table RHN_AUD_KNOW_EXTRACT is '合理用药 AI 知识抽取记录，一行代表一次基于来源原文的不可变抽取结果，不代表临床审核或发布';
comment on column RHN_AUD_KNOW_EXTRACT.ID_TNT is '租户标识';
comment on column RHN_AUD_KNOW_EXTRACT.ID_EXTRACT is '知识抽取记录标识';
comment on column RHN_AUD_KNOW_EXTRACT.JSON_RUN is '原文、模型与提示版本、引用定位、标准候选、缺口及操作者快照';
