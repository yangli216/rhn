alter table RHN_AUD_MED_GOV_RUN add constraint UQ_MED_RUN_TNT unique (ID_TNT,ID_RULE_RUN);

create table RHN_AUD_KNOW_FEEDBACK (
    ID_TNT number(19) not null,
    ID_FEEDBACK number(19) not null,
    ID_RULE_RUN number(19) not null,
    ID_DEPLOYMENT number(19) not null,
    ID_ORG number(19) not null,
    ID_DEPT number(19) not null,
    NO_REVISION number(10) not null,
    SD_OPERATION varchar2(16) not null,
    SD_VERDICT varchar2(32),
    JSON_EVENT clob not null,
    HASH_EVENT varchar2(64) not null,
    constraint PK_KNOW_FEEDBACK primary key (ID_TNT,ID_FEEDBACK),
    constraint UQ_KNOW_FEEDBACK_REV unique (ID_TNT,ID_RULE_RUN,NO_REVISION),
    constraint FK_KNOW_FEEDBACK_RUN foreign key (ID_TNT,ID_RULE_RUN) references RHN_AUD_MED_GOV_RUN(ID_TNT,ID_RULE_RUN),
    constraint CK_KNOW_FEEDBACK_OP check (SD_OPERATION in ('RECORD','WITHDRAW'))
);
create index IX_KNOW_FEEDBACK_SCOPE on RHN_AUD_KNOW_FEEDBACK(ID_TNT,ID_ORG,ID_DEPT,ID_DEPLOYMENT);
comment on table RHN_AUD_KNOW_FEEDBACK is '合理用药旁路研判记录，一行代表对一次观察追加或撤回的人工意见，不改写运行结果或发布状态';
comment on column RHN_AUD_KNOW_FEEDBACK.ID_TNT is '租户标识';
comment on column RHN_AUD_KNOW_FEEDBACK.ID_FEEDBACK is '不可变研判事件标识';
comment on column RHN_AUD_KNOW_FEEDBACK.ID_RULE_RUN is '旁路运行观察标识';
comment on column RHN_AUD_KNOW_FEEDBACK.ID_DEPLOYMENT is '冻结发布记录标识';
comment on column RHN_AUD_KNOW_FEEDBACK.ID_ORG is '观察所属机构';
comment on column RHN_AUD_KNOW_FEEDBACK.ID_DEPT is '观察所属科室';
comment on column RHN_AUD_KNOW_FEEDBACK.NO_REVISION is '本次观察研判事件序号';
comment on column RHN_AUD_KNOW_FEEDBACK.SD_OPERATION is '研判操作：追加意见或撤回';
comment on column RHN_AUD_KNOW_FEEDBACK.SD_VERDICT is '人工研判分类，撤回时为空';
comment on column RHN_AUD_KNOW_FEEDBACK.JSON_EVENT is '运行与规则版本指纹、人工意见、依据、建议及操作者快照';
comment on column RHN_AUD_KNOW_FEEDBACK.HASH_EVENT is '研判事件原始快照的 SHA256 指纹';
