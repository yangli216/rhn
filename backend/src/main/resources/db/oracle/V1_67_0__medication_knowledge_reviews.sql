create table RHN_AUD_KNOW_REVIEW (
    ID_TNT number(19) not null,
    ID_KNOW_REVIEW number(19) not null,
    ID_KNOW_RULE number(19) not null,
    JSON_REVIEW clob not null,
    constraint PK_AUD_KNOW_REVIEW primary key (ID_TNT, ID_KNOW_REVIEW)
);
create index IX_AUD_KNOW_REVIEW_RULE on RHN_AUD_KNOW_REVIEW (ID_TNT, ID_KNOW_RULE, ID_KNOW_REVIEW);

comment on table RHN_AUD_KNOW_REVIEW is '知识规则候选审核留痕，一行代表一次提交、撤回、退回或批准事件';
comment on column RHN_AUD_KNOW_REVIEW.ID_TNT is '租户标识';
comment on column RHN_AUD_KNOW_REVIEW.ID_KNOW_REVIEW is '不可变审核事件标识';
comment on column RHN_AUD_KNOW_REVIEW.ID_KNOW_RULE is '固定知识规则候选版本标识';
comment on column RHN_AUD_KNOW_REVIEW.JSON_REVIEW is '提交或审核时冻结的知识、验证、指纹、策略、核验意见及操作者快照';
