create table RHN_AUD_KNOW_REPLAY (
    ID_TNT number(19) not null,
    ID_REPLAY number(19) not null,
    ID_KNOWLEDGE number(19) not null,
    NO_VERSION number(19) not null,
    ID_ORG number(19) not null,
    ID_DEPT number(19) not null,
    JSON_RUN clob not null,
    constraint PK_AUD_KNOW_REPLAY primary key (ID_TNT, ID_REPLAY)
);

create index IX_KNOW_REPLAY_SCOPE on RHN_AUD_KNOW_REPLAY (ID_TNT, ID_ORG, ID_DEPT, ID_KNOWLEDGE, ID_REPLAY);

comment on table RHN_AUD_KNOW_REPLAY is '合理用药知识处方回放记录，一行代表一个固定知识版本对一次历史审查输入的不可变回放结果';
comment on column RHN_AUD_KNOW_REPLAY.ID_TNT is '租户标识';
comment on column RHN_AUD_KNOW_REPLAY.ID_REPLAY is '知识回放记录标识';
comment on column RHN_AUD_KNOW_REPLAY.ID_KNOWLEDGE is '知识草稿标识';
comment on column RHN_AUD_KNOW_REPLAY.NO_VERSION is '本次回放使用的知识版本号';
comment on column RHN_AUD_KNOW_REPLAY.ID_ORG is '原评价所属机构标识';
comment on column RHN_AUD_KNOW_REPLAY.ID_DEPT is '原评价所属科室标识';
comment on column RHN_AUD_KNOW_REPLAY.JSON_RUN is '固定知识、原评价来源、最小处方事实、缺口、结果、指纹及操作者快照';
