-- 病历决策复用公共模型配置；默认关闭，仅辅助核查，反馈独立于病历写入。
insert into RHN_SYS_PARAM_DEF (ID_PARAM_DEF, ID_PARAM_CAT, CD_PARAM_KEY, NA_PARAM_DEF, DES_PARAM_DEF, SD_VAL_TYPE, SD_CONTROL_TYPE, JSON_SCHEMA, JSON_DEFAULT_VAL, JSON_SCOPE, SD_PARAM_CAT, FG_INHRT, FG_CACHE, FG_NULLBL_VAL, SENS, SD_DISPLAY_POLICY, SD_STATUS, REVISION, DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED)
select 362387869796254, ID_PARAM_CAT, 'ai.clinical.decision-scene-record-quality-enabled', '病历完整性与矛盾提示', '仅核查资料覆盖与文字一致性，不自动补写临床事实；受决策总开关控制', 'BOOLEAN', 'SWITCH', '{"type":"boolean"}', 'false', '["PLATFORM","TENANT"]', 'BUSINESS', 1, 0, 0, 'NORMAL', 'PLAIN', 'ACTIVE', 0, CURRENT_TIMESTAMP, ID_USER_CREATED, CURRENT_TIMESTAMP, ID_USER_UPDATED
from RHN_SYS_PARAM_DEF where CD_PARAM_KEY = 'ai.clinical.mode';

create table RHN_AUD_AI_REC_DCSN (
    ID_RUN NUMBER(19) not null,
    ID_TNT NUMBER(19) not null,
    ID_ORG NUMBER(19) not null,
    ID_DEPT NUMBER(19) not null,
    ID_ENC NUMBER(19) not null,
    ID_USER_ACTOR VARCHAR2(100) not null,
    JSON_BINDING clob not null,
    constraint PK_AI_REC_DCSN primary key (ID_RUN),
    constraint UK_AI_REC_DCSN_TNT unique (ID_RUN,ID_TNT),
    constraint FK_AI_REC_DCSN_RUN foreign key (ID_RUN,ID_TNT) references RHN_AUD_AI_DCSN_RUN(ID_RUN,ID_TNT)
);
create index IX_AI_REC_DCSN_ENC on RHN_AUD_AI_REC_DCSN(ID_TNT,ID_ORG,ID_DEPT,ID_ENC,ID_USER_ACTOR,ID_RUN);

create table RHN_AUD_AI_REC_FB (
    ID_FB NUMBER(19) not null,
    ID_TNT NUMBER(19) not null,
    ID_RUN NUMBER(19) not null,
    CD_FINDING VARCHAR2(64) not null,
    CD_COMMAND VARCHAR2(100) not null,
    CD_REQUEST_HASH VARCHAR2(64) not null,
    SD_ACTION VARCHAR2(24) not null,
    JSON_FB clob not null,
    constraint PK_AI_REC_FB primary key (ID_FB),
    constraint UK_AI_REC_FB_CMD unique (ID_TNT,ID_RUN,CD_COMMAND,CD_FINDING),
    constraint CK_AI_REC_FB_ACTION check (SD_ACTION in ('ADOPTED','DISMISSED','MODIFIED','UNCHANGED')),
    constraint FK_AI_REC_FB_BIND foreign key (ID_RUN,ID_TNT) references RHN_AUD_AI_REC_DCSN(ID_RUN,ID_TNT)
);

comment on table RHN_AUD_AI_REC_DCSN is '病历决策反馈关联；一行代表一次可采纳核查与原就诊、医生及字段指纹的绑定';
comment on column RHN_AUD_AI_REC_DCSN.ID_RUN is '关联共用决策运行主键';
comment on column RHN_AUD_AI_REC_DCSN.ID_TNT is '租户标识';
comment on column RHN_AUD_AI_REC_DCSN.ID_ORG is '机构标识';
comment on column RHN_AUD_AI_REC_DCSN.ID_DEPT is '科室标识';
comment on column RHN_AUD_AI_REC_DCSN.ID_ENC is '就诊标识';
comment on column RHN_AUD_AI_REC_DCSN.ID_USER_ACTOR is '核查医生身份';
comment on column RHN_AUD_AI_REC_DCSN.JSON_BINDING is '原医生、执业人员、病历版本与字段指纹；不重复保存病历原文';

comment on table RHN_AUD_AI_REC_FB is '病历决策医生反馈；一行代表一条提示的一次追加操作或保存核实结果，不代表问题已经解决';
comment on column RHN_AUD_AI_REC_FB.ID_FB is '反馈记录主键';
comment on column RHN_AUD_AI_REC_FB.ID_TNT is '租户标识';
comment on column RHN_AUD_AI_REC_FB.ID_RUN is '关联病历核查运行';
comment on column RHN_AUD_AI_REC_FB.CD_FINDING is '有限提示编码';
comment on column RHN_AUD_AI_REC_FB.CD_COMMAND is '客户端幂等命令编码';
comment on column RHN_AUD_AI_REC_FB.CD_REQUEST_HASH is '反馈请求内容指纹，拒绝相同命令不同内容';
comment on column RHN_AUD_AI_REC_FB.SD_ACTION is '采纳、忽略、相关字段已修改保存或保存未修改';
comment on column RHN_AUD_AI_REC_FB.JSON_FB is '医生与时间、真实文档版本及变化字段指纹，不复制病历原文';
