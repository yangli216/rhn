-- QMED-1: advisory evaluation foundation. No clinical tables or prescribing gates are changed.

create table RHN_AUD_MED_RULE (
    ID_RULE number(19) primary key,
    CD_RULE varchar2(100 char) not null,
    CD_CATEGORY varchar2(60 char) not null,
    NA_RULE varchar2(200 char) not null,
    constraint UQ_QMED_RULE_CODE unique (CD_RULE)
);

comment on table RHN_AUD_MED_RULE is '合理用药规则定义；一行代表一条平台级规则定义';

comment on column RHN_AUD_MED_RULE.ID_RULE is '规则标识';

comment on column RHN_AUD_MED_RULE.CD_RULE is '稳定规则编码';

comment on column RHN_AUD_MED_RULE.CD_CATEGORY is '规则分类';

comment on column RHN_AUD_MED_RULE.NA_RULE is '规则名称';

create table RHN_AUD_MED_RULE_VER (
    ID_RULE_VER number(19) primary key,
    ID_RULE number(19) not null,
    NO_VERSION number(10) not null,
    CD_RULE_SET_VER varchar2(100 char) not null,
    CD_IMPLEMENTATION varchar2(150 char) not null,
    SD_STATUS varchar2(24 char) not null,
    SD_SEVERITY varchar2(24 char) not null,
    SD_DECISION varchar2(24 char) not null,
    SD_OVERRIDE_POLICY varchar2(24 char) not null,
    DT_EFFECTIVE_FROM timestamp with time zone not null,
    DT_EFFECTIVE_TO timestamp with time zone,
    JSON_EVIDENCE clob not null,
    constraint FK_QMED_VER_RULE foreign key (ID_RULE) references RHN_AUD_MED_RULE (ID_RULE),
    constraint UQ_QMED_RULE_VERSION unique (ID_RULE, NO_VERSION),
    constraint UQ_QMED_SET_RULE unique (CD_RULE_SET_VER, ID_RULE),
    constraint CK_QMED_RULE_STATUS check (SD_STATUS in ('DRAFT','VALIDATED','APPROVED','SHADOW','PUBLISHED','RETIRED')),
    constraint CK_QMED_RULE_VERSION check (NO_VERSION > 0),
    constraint CK_QMED_RULE_PERIOD check (DT_EFFECTIVE_TO is null or DT_EFFECTIVE_TO > DT_EFFECTIVE_FROM),
    constraint CK_QMED_DECISION_1 check (SD_DECISION in ('PASS','WARN','REQUIRE_OVERRIDE','BLOCK','UNAVAILABLE')),
    constraint CK_QMED_SEVERITY_1 check (SD_SEVERITY in ('INFO','LOW','MODERATE','HIGH','CRITICAL')),
    constraint CK_QMED_OVERRIDE_1 check (SD_OVERRIDE_POLICY in ('NOT_ALLOWED','ACKNOWLEDGE','REASON_REQUIRED'))
);

comment on table RHN_AUD_MED_RULE_VER is '合理用药规则版本；一行代表一条不可变规则版本及证据';

comment on column RHN_AUD_MED_RULE_VER.ID_RULE_VER is '规则版本标识';

comment on column RHN_AUD_MED_RULE_VER.ID_RULE is '规则定义标识';

comment on column RHN_AUD_MED_RULE_VER.NO_VERSION is '不可变规则版本号';

comment on column RHN_AUD_MED_RULE_VER.CD_RULE_SET_VER is '规则集版本';

comment on column RHN_AUD_MED_RULE_VER.CD_IMPLEMENTATION is '强类型执行定义版本';

comment on column RHN_AUD_MED_RULE_VER.SD_STATUS is '发布状态';

comment on column RHN_AUD_MED_RULE_VER.SD_SEVERITY is '风险严重程度';

comment on column RHN_AUD_MED_RULE_VER.SD_DECISION is '执行动作';

comment on column RHN_AUD_MED_RULE_VER.SD_OVERRIDE_POLICY is '覆盖策略';

comment on column RHN_AUD_MED_RULE_VER.DT_EFFECTIVE_FROM is '生效时间';

comment on column RHN_AUD_MED_RULE_VER.DT_EFFECTIVE_TO is '失效时间';

comment on column RHN_AUD_MED_RULE_VER.JSON_EVIDENCE is '不可变来源证据快照';

create table RHN_AUD_MED_EVAL (
    ID_EVAL number(19) primary key,
    ID_TNT number(19) not null,
    ID_PRESCRIPTION number(19) not null,
    NO_TARGET_REV number(19) not null,
    ID_ENC number(19) not null,
    ID_PAT number(19) not null,
    ID_ORG number(19) not null,
    ID_DEPT number(19) not null,
    CD_INPUT_HASH varchar2(64 char) not null,
    CD_RULE_SET_VER varchar2(100 char) not null,
    CD_ENGINE_VER varchar2(80 char) not null,
    SD_MODE varchar2(24 char) not null,
    SD_DECISION varchar2(24 char) not null,
    JSON_INPUT clob not null,
    JSON_RESULT clob not null,
    DT_STARTED timestamp with time zone not null,
    DT_COMPLETED timestamp with time zone not null,
    ID_USER_ACTOR number(19) not null,
    constraint UQ_QMED_EVAL_TENANT unique (ID_TNT, ID_EVAL),
    constraint CK_QMED_EVAL_MODE check (SD_MODE = 'SHADOW'),
    constraint CK_QMED_EVAL_REV check (NO_TARGET_REV >= 0),
    constraint CK_QMED_EVAL_IDS check (ID_EVAL > 0 and ID_TNT > 0 and ID_PRESCRIPTION > 0),
    constraint CK_QMED_DECISION_2 check (SD_DECISION in ('PASS','WARN','REQUIRE_OVERRIDE','BLOCK','UNAVAILABLE'))
);

comment on table RHN_AUD_MED_EVAL is '合理用药评价；一行代表一次完整处方的旁路安全评价';

comment on column RHN_AUD_MED_EVAL.ID_EVAL is '评价标识';

comment on column RHN_AUD_MED_EVAL.ID_TNT is '租户标识';

comment on column RHN_AUD_MED_EVAL.ID_PRESCRIPTION is '目标处方标识';

comment on column RHN_AUD_MED_EVAL.NO_TARGET_REV is '处方乐观锁版本';

comment on column RHN_AUD_MED_EVAL.ID_ENC is '就诊标识';

comment on column RHN_AUD_MED_EVAL.ID_PAT is '居民标识';

comment on column RHN_AUD_MED_EVAL.ID_ORG is '机构标识';

comment on column RHN_AUD_MED_EVAL.ID_DEPT is '科室标识';

comment on column RHN_AUD_MED_EVAL.CD_INPUT_HASH is '完整输入的哈希值';

comment on column RHN_AUD_MED_EVAL.CD_RULE_SET_VER is '规则集版本';

comment on column RHN_AUD_MED_EVAL.CD_ENGINE_VER is '引擎版本';

comment on column RHN_AUD_MED_EVAL.SD_MODE is '评价模式';

comment on column RHN_AUD_MED_EVAL.SD_DECISION is '聚合执行动作';

comment on column RHN_AUD_MED_EVAL.JSON_INPUT is '完整处方输入快照';

comment on column RHN_AUD_MED_EVAL.JSON_RESULT is '评价结果与每条规则执行记录';

comment on column RHN_AUD_MED_EVAL.DT_STARTED is '评价开始时间';

comment on column RHN_AUD_MED_EVAL.DT_COMPLETED is '评价完成时间';

comment on column RHN_AUD_MED_EVAL.ID_USER_ACTOR is '发起用户标识';

create table RHN_AUD_MED_FINDING (
    ID_FINDING number(19) primary key,
    ID_TNT number(19) not null,
    ID_EVAL number(19) not null,
    ID_RULE_VER number(19) not null,
    SD_SEVERITY varchar2(24 char) not null,
    SD_DECISION varchar2(24 char) not null,
    DES_MESSAGE varchar2(1000 char) not null,
    JSON_REQUEST_IDS clob not null,
    JSON_EVIDENCE clob not null,
    SD_OVERRIDE_POLICY varchar2(24 char) not null,
    DES_ACTION varchar2(1000 char) not null,
    constraint UQ_QMED_FIND_TENANT unique (ID_TNT, ID_EVAL, ID_FINDING),
    constraint FK_QMED_FIND_EVAL foreign key (ID_TNT, ID_EVAL) references RHN_AUD_MED_EVAL (ID_TNT, ID_EVAL),
    constraint FK_QMED_FIND_RULE foreign key (ID_RULE_VER) references RHN_AUD_MED_RULE_VER (ID_RULE_VER),
    constraint CK_QMED_DECISION_3 check (SD_DECISION in ('PASS','WARN','REQUIRE_OVERRIDE','BLOCK','UNAVAILABLE')),
    constraint CK_QMED_SEVERITY_3 check (SD_SEVERITY in ('INFO','LOW','MODERATE','HIGH','CRITICAL')),
    constraint CK_QMED_OVERRIDE_3 check (SD_OVERRIDE_POLICY in ('NOT_ALLOWED','ACKNOWLEDGE','REASON_REQUIRED'))
);

comment on table RHN_AUD_MED_FINDING is '合理用药风险发现；一行代表某次评价中一条规则的风险发现';

comment on column RHN_AUD_MED_FINDING.ID_FINDING is '风险发现标识';

comment on column RHN_AUD_MED_FINDING.ID_TNT is '租户标识';

comment on column RHN_AUD_MED_FINDING.ID_EVAL is '评价标识';

comment on column RHN_AUD_MED_FINDING.ID_RULE_VER is '实际执行规则版本标识';

comment on column RHN_AUD_MED_FINDING.SD_SEVERITY is '风险严重程度';

comment on column RHN_AUD_MED_FINDING.SD_DECISION is '执行动作';

comment on column RHN_AUD_MED_FINDING.DES_MESSAGE is '风险说明';

comment on column RHN_AUD_MED_FINDING.JSON_REQUEST_IDS is '涉及药品请求标识列表';

comment on column RHN_AUD_MED_FINDING.JSON_EVIDENCE is '证据快照';

comment on column RHN_AUD_MED_FINDING.SD_OVERRIDE_POLICY is '覆盖策略';

comment on column RHN_AUD_MED_FINDING.DES_ACTION is '建议处理方式';

create table RHN_AUD_MED_OVERRIDE (
    ID_OVERRIDE number(19) primary key,
    ID_TNT number(19) not null,
    ID_EVAL number(19) not null,
    ID_FINDING number(19) not null,
    ID_USER_ACTOR number(19) not null,
    DES_REASON varchar2(1000 char) not null,
    DT_CREATED timestamp with time zone not null,
    constraint FK_QMED_OVERRIDE_FIND foreign key (ID_TNT, ID_EVAL, ID_FINDING) references RHN_AUD_MED_FINDING (ID_TNT, ID_EVAL, ID_FINDING),
    constraint UQ_QMED_OVERRIDE_ACTOR unique (ID_TNT, ID_EVAL, ID_FINDING, ID_USER_ACTOR),
    constraint CK_QMED_OVERRIDE_REASON check (trim(DES_REASON) is not null and length(trim(DES_REASON)) > 0)
);

comment on table RHN_AUD_MED_OVERRIDE is '合理用药风险覆盖记录；一行代表用户对一个风险发现的覆盖理由';

comment on column RHN_AUD_MED_OVERRIDE.ID_OVERRIDE is '覆盖记录标识';

comment on column RHN_AUD_MED_OVERRIDE.ID_TNT is '租户标识';

comment on column RHN_AUD_MED_OVERRIDE.ID_EVAL is '评价标识';

comment on column RHN_AUD_MED_OVERRIDE.ID_FINDING is '风险发现标识';

comment on column RHN_AUD_MED_OVERRIDE.ID_USER_ACTOR is '覆盖用户标识';

comment on column RHN_AUD_MED_OVERRIDE.DES_REASON is '覆盖理由';

comment on column RHN_AUD_MED_OVERRIDE.DT_CREATED is '覆盖时间';

create index IX_QMED_EVAL_TARGET on RHN_AUD_MED_EVAL (ID_TNT, ID_PRESCRIPTION, DT_STARTED);

create index IX_QMED_FIND_RULE on RHN_AUD_MED_FINDING (ID_RULE_VER);

insert into RHN_AUD_MED_RULE (ID_RULE, CD_RULE, CD_CATEGORY, NA_RULE) values (362387869899101, 'QMED.EXACT_GENERIC_DUPLICATE', 'EXACT_GENERIC_DUPLICATE', '同处方通用药精确重复核对');

insert into RHN_AUD_MED_RULE_VER (ID_RULE_VER, ID_RULE, NO_VERSION, CD_RULE_SET_VER, CD_IMPLEMENTATION, SD_STATUS, SD_SEVERITY, SD_DECISION, SD_OVERRIDE_POLICY, DT_EFFECTIVE_FROM, JSON_EVIDENCE) values (362387869899102, 362387869899101, 1, 'qmed-foundation-shadow-v1', 'java:exact-generic-duplicate:1', 'SHADOW', 'LOW', 'WARN', 'ACKNOWLEDGE', TO_TIMESTAMP_TZ('2026-01-01 00:00:00 +00:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), '[{"sourceType":"ENGINEERING_BASELINE","sourceTitle":"QMED-1 首条旁路规则规范","sourceVersion":"qmed-duplicate-spec-1","sourceLocator":"docs/architecture/rational-medication/QMED-1接口与验收.md","section":"首条规则语义","excerpt":"同一处方中至少两条 DRAFT/ACTIVE 药品请求具有相同 medicationId 时产生核对提示；不判定治疗不合理。","usageScope":"SHADOW_ONLY; NOT_CLINICAL_EVIDENCE"}]');
