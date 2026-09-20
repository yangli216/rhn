create table RHN_AUD_MED_GOV (
    ID_RULE_GOV number(19) not null,
    ID_TNT number(19) not null,
    CD_RULE_KEY varchar2(100) not null,
    REVISION number(19) not null,
    JSON_STATE clob not null,
    constraint PK_MED_GOV primary key (ID_RULE_GOV),
    constraint UK_MED_GOV_KEY unique (ID_TNT,CD_RULE_KEY)
);

comment on table RHN_AUD_MED_GOV is '合理用药规则治理，一行代表一个租户内一条规则的审核、部署及审计状态';

comment on column RHN_AUD_MED_GOV.ID_RULE_GOV is '规则治理标识';

comment on column RHN_AUD_MED_GOV.ID_TNT is '租户标识';

comment on column RHN_AUD_MED_GOV.CD_RULE_KEY is '稳定规则键';

comment on column RHN_AUD_MED_GOV.REVISION is '乐观锁版本';

comment on column RHN_AUD_MED_GOV.JSON_STATE is '审核、部署及操作历史快照';

create table RHN_AUD_MED_GOV_RUN (
    ID_RULE_RUN number(19) not null,
    ID_TNT number(19) not null,
    CD_RULE_KEY varchar2(100) not null,
    CD_VERSION varchar2(100) not null,
    SD_MODE varchar2(20) not null,
    SD_DECISION varchar2(32) not null,
    ID_PRESCRIPTION number(19) not null,
    DT_CREATED timestamp with time zone not null,
    JSON_RUN clob not null,
    constraint PK_MED_GOV_RUN primary key (ID_RULE_RUN)
);

comment on table RHN_AUD_MED_GOV_RUN is '合理用药规则运行记录，一行代表已部署规则版本对一张处方的一次自动评价';

comment on column RHN_AUD_MED_GOV_RUN.ID_RULE_RUN is '运行记录标识';

comment on column RHN_AUD_MED_GOV_RUN.ID_TNT is '租户标识';

comment on column RHN_AUD_MED_GOV_RUN.CD_RULE_KEY is '稳定规则键';

comment on column RHN_AUD_MED_GOV_RUN.CD_VERSION is '规则版本键';

comment on column RHN_AUD_MED_GOV_RUN.SD_MODE is '旁路或正式运行模式';

comment on column RHN_AUD_MED_GOV_RUN.SD_DECISION is '评价结论';

comment on column RHN_AUD_MED_GOV_RUN.ID_PRESCRIPTION is '处方标识';

comment on column RHN_AUD_MED_GOV_RUN.DT_CREATED is '评价时间';

comment on column RHN_AUD_MED_GOV_RUN.JSON_RUN is '发布版本及评价事实快照';

create index IX_MED_GOV_RUN_KEY on RHN_AUD_MED_GOV_RUN (ID_TNT,CD_RULE_KEY,CD_VERSION);

alter table RHN_AUD_MED_EVAL drop constraint CK_QMED_EVAL_MODE;

alter table RHN_AUD_MED_EVAL add constraint CK_QMED_EVAL_MODE check (SD_MODE in ('SHADOW','ENFORCED'));
