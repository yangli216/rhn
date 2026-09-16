create table RHN_AUD_MED_CAND (
    ID_CAND number(19) not null primary key,
    ID_TNT number(19) not null,
    ID_USER_ACTOR number(19) not null,
    JSON_CONTENT clob not null,
    constraint UK_QMED_CAND_TNT unique (ID_TNT, ID_CAND)
);
create table RHN_AUD_MED_TRIAL (
    ID_TRIAL number(19) not null primary key,
    ID_TNT number(19) not null,
    ID_CAND number(19) not null,
    ID_USER_ACTOR number(19) not null,
    JSON_INPUT clob not null,
    JSON_RESULT clob not null,
    constraint FK_QMED_TRIAL_CAND foreign key (ID_TNT, ID_CAND) references RHN_AUD_MED_CAND (ID_TNT, ID_CAND)
);
create index IX_QMED_TRIAL_CAND on RHN_AUD_MED_TRIAL (ID_TNT, ID_CAND, ID_TRIAL);
comment on table RHN_AUD_MED_CAND is '合理用药候选规则，一行代表一次不可变的 AI 生成版本';
comment on column RHN_AUD_MED_CAND.ID_CAND is '候选规则标识';
comment on column RHN_AUD_MED_CAND.ID_TNT is '租户标识';
comment on column RHN_AUD_MED_CAND.ID_USER_ACTOR is '创建用户标识';
comment on column RHN_AUD_MED_CAND.JSON_CONTENT is '规则定义、来源、模型和药品主数据快照';
comment on table RHN_AUD_MED_TRIAL is '合理用药试跑，一行代表一次模拟或旁路执行';
comment on column RHN_AUD_MED_TRIAL.ID_TRIAL is '试跑标识';
comment on column RHN_AUD_MED_TRIAL.ID_TNT is '租户标识';
comment on column RHN_AUD_MED_TRIAL.ID_CAND is '候选规则标识';
comment on column RHN_AUD_MED_TRIAL.ID_USER_ACTOR is '操作用户标识';
comment on column RHN_AUD_MED_TRIAL.JSON_INPUT is '完整试跑输入快照';
comment on column RHN_AUD_MED_TRIAL.JSON_RESULT is '试跑结果快照';
