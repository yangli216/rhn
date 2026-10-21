-- 门诊检验/检查/治疗申请单头：同一次整批开立按机构合单规则把多条服务请求归入一张申请单。
-- 明细、执行任务、收费仍按服务请求逐条处理；历史及单条开立的请求不归单（ID_SVC_DOC 为空），展示为一项一单。

create table RHN_EX_SVC_DOC (
    ID_SVC_DOC bigint,
    REVISION bigint not null,
    ID_TNT bigint not null,
    ID_PAT bigint not null,
    ID_ENC bigint not null,
    CD_DOC_NO varchar(64) not null,
    SD_SVC_TYPE varchar(32) not null,
    ID_ORG_EXEC bigint not null,
    ID_DEPT_EXEC bigint not null,
    SD_GRP_RULE varchar(32) not null,
    CD_GRP_VAL varchar(64),
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint not null,
    constraint PK_EX_SVC_DOC_PK primary key (ID_SVC_DOC),
    constraint UK_EX_SVC_DOC_TNT unique (ID_TNT, ID_SVC_DOC),
    constraint CK_EX_SVC_DOC_GRP_RULE check (SD_GRP_RULE in ('PER_ITEM', 'BY_DEPT', 'BY_DEPT_SPECIMEN', 'BY_DEPT_EXAM_TYPE'))
);
create index IDX_EX_SVC_DOC_ENC on RHN_EX_SVC_DOC (ID_TNT, ID_ENC);
comment on table RHN_EX_SVC_DOC is '门诊服务申请单；一行代表一张检验、检查或治疗申请单，包含一条或多条服务请求';
comment on column RHN_EX_SVC_DOC.ID_SVC_DOC is '申请单主键';
comment on column RHN_EX_SVC_DOC.REVISION is '乐观锁版本';
comment on column RHN_EX_SVC_DOC.ID_TNT is '租户标识';
comment on column RHN_EX_SVC_DOC.ID_PAT is '患者标识';
comment on column RHN_EX_SVC_DOC.ID_ENC is '就诊标识';
comment on column RHN_EX_SVC_DOC.CD_DOC_NO is '申请单号';
comment on column RHN_EX_SVC_DOC.SD_SVC_TYPE is '服务类型：LABORATORY、EXAMINATION、TREATMENT 等';
comment on column RHN_EX_SVC_DOC.ID_ORG_EXEC is '执行机构标识';
comment on column RHN_EX_SVC_DOC.ID_DEPT_EXEC is '执行科室标识';
comment on column RHN_EX_SVC_DOC.SD_GRP_RULE is '开立时采用的合单规则';
comment on column RHN_EX_SVC_DOC.CD_GRP_VAL is '合单依据值：标本类型或检查类型；按科室合单时为空';
comment on column RHN_EX_SVC_DOC.DT_CREATED is '创建时间';
comment on column RHN_EX_SVC_DOC.ID_USER_CREATED is '开立人标识';

alter table RHN_EX_SVC_REQ add column ID_SVC_DOC bigint;
alter table RHN_EX_SVC_REQ add constraint FK_EX_SVC_REQ_SVC_DOC foreign key (ID_TNT, ID_SVC_DOC) references RHN_EX_SVC_DOC(ID_TNT, ID_SVC_DOC);
create index IDX_EX_SVC_REQ_SVC_DOC on RHN_EX_SVC_REQ (ID_TNT, ID_SVC_DOC);
comment on column RHN_EX_SVC_REQ.ID_SVC_DOC is '所属申请单标识；为空表示一项一单';

insert into RHN_SYS_PARAM_DEF (
    ID_PARAM_DEF, ID_PARAM_CAT, CD_PARAM_KEY, NA_PARAM_DEF, DES_PARAM_DEF,
    SD_VAL_TYPE, SD_CONTROL_TYPE, JSON_SCHEMA, JSON_DEFAULT_VAL, JSON_EXAMPLE_VAL,
    UNIT, CD_DICT, JSON_SCOPE, SD_PARAM_CAT, FG_INHRT, FG_CACHE,
    FG_NULLBL_VAL, SENS, SD_DISPLAY_POLICY, SD_STATUS, REVISION,
    DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED,
    CD_DEPENDS_ON_KEY, EXPR_DEPENDS_ON_VAL, SD_DEPNCY_BEHAV
) values (
    362387869796214, 362387869794071,
    'outpatient.service-request.grouping-policy',
    '门诊申请单合单规则',
    '控制门诊整批开立时检验、检查、治疗项目如何合并为申请单：按执行科室、标本类型或检查类型合单，以及单张申请单项目数上限。合单只影响申请单的展示、关联诊断与打印，执行任务、收费与撤销仍按项目逐条处理。',
    'JSON', 'JSON_EDITOR', '{"type":"object","additionalProperties":false,"required":["laboratory","examination","treatment","maxItemsPerDocument"],"properties":{"laboratory":{"type":"string","title":"检验合单方式","enum":["PER_ITEM","BY_DEPT","BY_DEPT_SPECIMEN"],"x-enumLabels":{"PER_ITEM":"每个项目一张申请单","BY_DEPT":"同执行科室合单","BY_DEPT_SPECIMEN":"同执行科室且同标本类型合单"}},"examination":{"type":"string","title":"检查合单方式","enum":["PER_ITEM","BY_DEPT","BY_DEPT_EXAM_TYPE"],"x-enumLabels":{"PER_ITEM":"每个项目一张申请单","BY_DEPT":"同执行科室合单","BY_DEPT_EXAM_TYPE":"同执行科室且同检查类型合单"}},"treatment":{"type":"string","title":"治疗/处置合单方式","enum":["PER_ITEM","BY_DEPT"],"x-enumLabels":{"PER_ITEM":"每个项目一张申请单","BY_DEPT":"同执行科室合单"}},"maxItemsPerDocument":{"type":"integer","title":"单张申请单项目数上限","description":"超过上限时按开立顺序拆成多张申请单。","minimum":1,"maximum":30}}}',
    '{"laboratory":"BY_DEPT_SPECIMEN","examination":"BY_DEPT_EXAM_TYPE","treatment":"BY_DEPT","maxItemsPerDocument":10}', '{"laboratory":"BY_DEPT","examination":"PER_ITEM","treatment":"BY_DEPT","maxItemsPerDocument":6}', null, null,
    '["PLATFORM","TENANT","ORGANIZATION","DEPARTMENT"]', 'BUSINESS',
    true, true, false, 'NORMAL', 'PLAIN', 'ACTIVE', 0,
    timestamp with time zone '2026-10-21 00:00:00+08', 362387869790222, timestamp with time zone '2026-10-21 00:00:00+08', 362387869790222,
    null, null, 'DISABLE_AND_SUPPRESS'
);

insert into RHN_SYS_PARAM_CHG (
    ID_PARAM_CHG, ID_TNT, ID_PARAM_DEF, ID_PARAM_VAL, SD_TARGET_TYPE,
    SD_CHG_TYPE, JSON_BEFORE, JSON_AFTER, DES_CHG_REASON, CD_REQ,
    DT_CHANGED, ID_USER_CHANGED
) values (
    362387869796215, null, 362387869796214, null, 'DEFINITION',
    'CREATE', null,
    '{"source":"PRODUCT_BASELINE","key":"outpatient.service-request.grouping-policy","status":"ACTIVE"}',
    '初始化门诊申请单合单规则参数',
    'v1.129.46:outpatient.service-request.grouping-policy',
    timestamp with time zone '2026-10-21 00:00:00+08', 362387869790222
);
