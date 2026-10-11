create table RHN_AUD_AI_DCSN_RUN (
    ID_RUN number(19) not null,
    ID_TNT number(19) not null,
    ID_ORG number(19),
    ID_DEPT number(19),
    SD_SCENE varchar2(64) not null,
    SD_MODE varchar2(24) not null,
    SD_OUTCOME varchar2(64) not null,
    DT_CREATED timestamp with time zone not null,
    SD_COMPARE varchar2(32) not null,
    FG_EQUAL number(10),
    NO_LATENCY number(10),
    FG_CALL number(10) not null,
    FG_JUDGED number(10) not null,
    FG_UNCERT number(10) not null,
    JSON_RUN clob not null,
    constraint PK_AI_DCSN_RUN primary key (ID_RUN),
    constraint UK_AI_DCSN_RUN_TNT unique (ID_RUN,ID_TNT)
);

comment on table RHN_AUD_AI_DCSN_RUN is '共用决策运行观察；一行代表一次有触发的决策尝试，包括旁路及回退';

comment on column RHN_AUD_AI_DCSN_RUN.ID_RUN is '运行记录主键';

comment on column RHN_AUD_AI_DCSN_RUN.ID_TNT is '租户标识';

comment on column RHN_AUD_AI_DCSN_RUN.ID_ORG is '机构标识';

comment on column RHN_AUD_AI_DCSN_RUN.ID_DEPT is '科室标识';

comment on column RHN_AUD_AI_DCSN_RUN.SD_SCENE is '决策场景';

comment on column RHN_AUD_AI_DCSN_RUN.SD_MODE is '运行模式';

comment on column RHN_AUD_AI_DCSN_RUN.SD_OUTCOME is '运行结果';

comment on column RHN_AUD_AI_DCSN_RUN.DT_CREATED is '记录时间';

comment on column RHN_AUD_AI_DCSN_RUN.SD_COMPARE is '基线可比较状态';

comment on column RHN_AUD_AI_DCSN_RUN.FG_EQUAL is '与基线一致标志；无基线时为空';

comment on column RHN_AUD_AI_DCSN_RUN.NO_LATENCY is '总耗时毫秒';

comment on column RHN_AUD_AI_DCSN_RUN.FG_CALL is '是否实际发起模型调用；仅配置检查不计调用';

comment on column RHN_AUD_AI_DCSN_RUN.FG_JUDGED is '是否得到有效判断；失败或格式错误不计判断样本';

comment on column RHN_AUD_AI_DCSN_RUN.FG_UNCERT is '有效判断中是否存在低置信度或无可匹配候选';

comment on column RHN_AUD_AI_DCSN_RUN.JSON_RUN is '不可变输入及判断快照；仅有权限的详情读取';

create table RHN_AUD_AI_DCSN_REVIEW (
    ID_REVIEW number(19) not null,
    ID_TNT number(19) not null,
    ID_RUN number(19) not null,
    DT_CREATED timestamp with time zone not null,
    JSON_REVIEW clob not null,
    constraint PK_AI_DCSN_REVIEW primary key (ID_REVIEW),
    constraint FK_AI_DCSN_REVIEW_RUN foreign key (ID_RUN,ID_TNT) references RHN_AUD_AI_DCSN_RUN(ID_RUN,ID_TNT)
);

comment on table RHN_AUD_AI_DCSN_REVIEW is '共用决策人工研判；一行代表一次追加的人工意见，不改变临床处置';

comment on column RHN_AUD_AI_DCSN_REVIEW.ID_REVIEW is '研判记录主键';

comment on column RHN_AUD_AI_DCSN_REVIEW.ID_TNT is '租户标识';

comment on column RHN_AUD_AI_DCSN_REVIEW.ID_RUN is '关联运行记录';

comment on column RHN_AUD_AI_DCSN_REVIEW.DT_CREATED is '研判时间';

comment on column RHN_AUD_AI_DCSN_REVIEW.JSON_REVIEW is '研判结果原因和操作者快照；历史追加保留';

create index IX_AI_DCSN_RUN_SCOPE on RHN_AUD_AI_DCSN_RUN (ID_TNT,ID_ORG,ID_DEPT,DT_CREATED);

create index IX_AI_DCSN_RUN_SCENE on RHN_AUD_AI_DCSN_RUN (ID_TNT,ID_ORG,ID_DEPT,SD_SCENE,ID_RUN);

create index IX_AI_DCSN_REVIEW_RUN on RHN_AUD_AI_DCSN_REVIEW (ID_TNT,ID_RUN,ID_REVIEW);
