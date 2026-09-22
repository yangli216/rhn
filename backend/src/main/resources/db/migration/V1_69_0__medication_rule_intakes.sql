create table RHN_AUD_KNOW_INTAKE (
    ID_TNT bigint not null,
    ID_INTAKE bigint not null,
    JSON_RUN text not null,
    constraint PK_KNOW_INTAKE primary key (ID_TNT,ID_INTAKE)
);
comment on table RHN_AUD_KNOW_INTAKE is '合理用药需求分析记录，一行代表一次不可变的意图分类与澄清分析，不代表药学证据或执行规则';
comment on column RHN_AUD_KNOW_INTAKE.ID_TNT is '租户标识';
comment on column RHN_AUD_KNOW_INTAKE.ID_INTAKE is '需求分析标识';
comment on column RHN_AUD_KNOW_INTAKE.JSON_RUN is '需求、澄清来源、能力范围、引用定位、模型与提示版本及分析结果快照';
alter table RHN_AUD_MED_KNOW_DRAFT add ID_INTAKE bigint;
comment on column RHN_AUD_MED_KNOW_DRAFT.ID_INTAKE is '本知识版本关联的需求分析标识，不作为药学证据';
alter table RHN_AUD_MED_KNOW_DRAFT add constraint FK_KNOW_DRAFT_INTAKE foreign key (ID_TNT,ID_INTAKE) references RHN_AUD_KNOW_INTAKE(ID_TNT,ID_INTAKE);
