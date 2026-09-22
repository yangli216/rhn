create table RHN_AUD_KNOW_RULE (
    ID_TNT bigint not null,
    ID_KNOW_RULE bigint not null,
    ID_KNOWLEDGE bigint not null,
    NO_VERSION bigint not null,
    NO_KNOWLEDGE_VERSION bigint not null,
    CD_COMPILER_VER varchar(80) not null,
    JSON_CONTENT text not null,
    constraint PK_AUD_KNOW_RULE primary key (ID_TNT, ID_KNOW_RULE),
    constraint UK_KNOW_RULE_VERSION unique (ID_TNT, ID_KNOWLEDGE, NO_VERSION),
    constraint UK_KNOW_RULE_SOURCE unique (ID_TNT, ID_KNOWLEDGE, NO_KNOWLEDGE_VERSION, CD_COMPILER_VER)
);

comment on table RHN_AUD_KNOW_RULE is '知识衍生规则候选，一行代表一条知识规则的一次不可变编译版本，尚不代表审核或发布';
comment on column RHN_AUD_KNOW_RULE.ID_TNT is '租户标识';
comment on column RHN_AUD_KNOW_RULE.ID_KNOW_RULE is '知识规则候选版本标识';
comment on column RHN_AUD_KNOW_RULE.ID_KNOWLEDGE is '来源知识标识及规则版本链标识';
comment on column RHN_AUD_KNOW_RULE.NO_VERSION is '该知识规则的递增候选版本号';
comment on column RHN_AUD_KNOW_RULE.NO_KNOWLEDGE_VERSION is '本次编译锁定的知识版本号';
comment on column RHN_AUD_KNOW_RULE.CD_COMPILER_VER is '结构化规则编译器版本';
comment on column RHN_AUD_KNOW_RULE.JSON_CONTENT is '知识及标准来源、结构化规则、指纹、合成测试及生成操作者快照';
