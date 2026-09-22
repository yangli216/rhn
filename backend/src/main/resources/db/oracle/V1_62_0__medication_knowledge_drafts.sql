create table RHN_AUD_MED_KNOW_DRAFT (
    ID_TNT number(19) not null,
    ID_KNOWLEDGE number(19) not null,
    NO_VERSION number(10) not null,
    JSON_VERSION clob not null,
    constraint PK_AUD_MED_KNOW_DRAFT primary key (ID_TNT, ID_KNOWLEDGE, NO_VERSION)
);

comment on table RHN_AUD_MED_KNOW_DRAFT is '合理用药知识草稿版本，一行代表一个租户下一条知识草稿的一次不可变保存版本';
comment on column RHN_AUD_MED_KNOW_DRAFT.ID_TNT is '租户标识';
comment on column RHN_AUD_MED_KNOW_DRAFT.ID_KNOWLEDGE is '知识草稿标识，各版本共用';
comment on column RHN_AUD_MED_KNOW_DRAFT.NO_VERSION is '该知识草稿的递增版本号';
comment on column RHN_AUD_MED_KNOW_DRAFT.JSON_VERSION is '不可变草稿版本快照，含来源原文、标准身份、条件、结构校验及操作者';
