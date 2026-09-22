create table RHN_AUD_KNOW_SUITE (
    ID_TNT bigint not null,
    ID_KNOW_RULE bigint not null,
    NO_VERSION bigint not null,
    JSON_SUITE text not null,
    constraint PK_AUD_KNOW_SUITE primary key (ID_TNT, ID_KNOW_RULE, NO_VERSION)
);

comment on table RHN_AUD_KNOW_SUITE is '人工编写的知识候选合成验证样例，一行代表一组不可变样例版本';
comment on column RHN_AUD_KNOW_SUITE.ID_TNT is '租户标识';
comment on column RHN_AUD_KNOW_SUITE.ID_KNOW_RULE is '固定知识规则候选版本标识';
comment on column RHN_AUD_KNOW_SUITE.NO_VERSION is '样例递增版本号';
comment on column RHN_AUD_KNOW_SUITE.JSON_SUITE is '人工定义的事实、预期结果与依据及候选指纹和作者快照';

create table RHN_AUD_KNOW_TEST (
    ID_TNT bigint not null,
    ID_KNOW_TEST bigint not null,
    ID_KNOW_RULE bigint not null,
    NO_SUITE_VERSION bigint not null,
    JSON_RUN text not null,
    constraint PK_AUD_KNOW_TEST primary key (ID_TNT, ID_KNOW_TEST)
);
create index IX_AUD_KNOW_TEST_RULE on RHN_AUD_KNOW_TEST (ID_TNT, ID_KNOW_RULE, ID_KNOW_TEST);

comment on table RHN_AUD_KNOW_TEST is '知识规则候选的合成样例执行审计，一行代表一次固定样例版本验证';
comment on column RHN_AUD_KNOW_TEST.ID_TNT is '租户标识';
comment on column RHN_AUD_KNOW_TEST.ID_KNOW_TEST is '验证执行标识';
comment on column RHN_AUD_KNOW_TEST.ID_KNOW_RULE is '固定知识规则候选版本标识';
comment on column RHN_AUD_KNOW_TEST.NO_SUITE_VERSION is '本次执行的样例版本号';
comment on column RHN_AUD_KNOW_TEST.JSON_RUN is '样例输入及预期、实际命中医嘱、差异、指纹和执行者快照';

