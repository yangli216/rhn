create table RHN_META_PRINT_TASK_DEF (
    ID_PRINT_TASK_DEF number(19) primary key,
    REVISION number(19) default 0 not null,
    CD_TASK varchar2(100 char) not null,
    NA_TASK varchar2(200 char) not null,
    SD_CATEGORY varchar2(32 char) not null,
    SD_SOURCE_TYPE varchar2(80 char) not null,
    CD_DATA_PROVIDER varchar2(80 char) not null,
    CD_PAYLOAD_SCHEMA varchar2(100 char) not null,
    SN_SCHEMA_VER number(10) not null,
    JSON_PURPOSES clob not null,
    FG_BATCH number(1) default 0 not null,
    SD_STATUS varchar2(24 char) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED number(19),
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED number(19),
    constraint UK_META_PRINT_TASK_CODE unique (CD_TASK),
    constraint CK_META_PRINT_TASK_STATUS check (SD_STATUS in ('ACTIVE','INACTIVE')),
    constraint CK_META_PRINT_TASK_SCHEMA check (SN_SCHEMA_VER > 0),
    constraint CK_META_PRINT_TASK_BATCH check (FG_BATCH in (0, 1))
);

create table RHN_META_PRINT_IMPL (
    ID_PRINT_IMPL number(19) primary key,
    REVISION number(19) default 0 not null,
    ID_TNT number(19),
    CD_IMPL varchar2(100 char) not null,
    NA_IMPL varchar2(200 char) not null,
    SD_RENDERER varchar2(32 char) not null,
    CD_ADAPTER varchar2(80 char) not null,
    ID_PRINT_TMPL number(19),
    CD_PAYLOAD_SCHEMA varchar2(100 char) not null,
    SD_OUTPUT_FORMAT varchar2(24 char) not null,
    JSON_CONFIG clob not null,
    SD_STATUS varchar2(24 char) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED number(19),
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED number(19),
    constraint UK_META_PRINT_IMPL_CODE unique (ID_TNT, CD_IMPL),
    constraint CK_META_PRINT_IMPL_RENDERER check (SD_RENDERER in ('INTERNAL_TEMPLATE','EXTERNAL_REPORT','LEGACY_REPORT')),
    constraint CK_META_PRINT_IMPL_FORMAT check (SD_OUTPUT_FORMAT in ('PDF','HTML','RAW')),
    constraint CK_META_PRINT_IMPL_STATUS check (SD_STATUS in ('ACTIVE','INACTIVE')),
    constraint FK_META_PRINT_IMPL_TNT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT),
    constraint FK_META_PRINT_IMPL_TMPL foreign key (ID_PRINT_TMPL) references RHN_META_PRINT_TMPL(ID_PRINT_TMPL)
);

create table RHN_META_PRINT_IMPL_BIND (
    ID_PRINT_IMPL_BIND number(19) primary key,
    REVISION number(19) default 0 not null,
    ID_TNT number(19),
    ID_ORG number(19),
    ID_DEPT number(19),
    ID_PRINT_TASK_DEF number(19) not null,
    SD_PURPOSE varchar2(40 char) not null,
    ID_PRINT_IMPL number(19) not null,
    SD_SCOPE varchar2(24 char) not null,
    SD_FALLBACK varchar2(24 char) not null,
    DT_VALID_FROM timestamp with time zone not null,
    DT_VALID_TO timestamp with time zone,
    SD_STATUS varchar2(24 char) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED number(19),
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED number(19),
    constraint CK_META_PRINT_BIND_SCOPE check (SD_SCOPE in ('PLATFORM','TENANT','ORGANIZATION','DEPARTMENT')),
    constraint CK_META_PRINT_BIND_PURPOSE check (SD_PURPOSE in ('*','CLINICAL_USE','PATIENT_COPY','ARCHIVE_COPY')),
    constraint CK_META_PRINT_BIND_FALLBACK check (SD_FALLBACK in ('FAIL_CLOSED','PLATFORM_DEFAULT')),
    constraint CK_META_PRINT_BIND_STATUS check (SD_STATUS in ('ACTIVE','INACTIVE')),
    constraint CK_META_PRINT_BIND_DATES check (DT_VALID_TO is null or DT_VALID_TO > DT_VALID_FROM),
    constraint CK_META_PRINT_BIND_OWNER check (
        (SD_SCOPE = 'PLATFORM' and ID_TNT is null and ID_ORG is null and ID_DEPT is null) or
        (SD_SCOPE = 'TENANT' and ID_TNT is not null and ID_ORG is null and ID_DEPT is null) or
        (SD_SCOPE = 'ORGANIZATION' and ID_TNT is not null and ID_ORG is not null and ID_DEPT is null) or
        (SD_SCOPE = 'DEPARTMENT' and ID_TNT is not null and ID_ORG is not null and ID_DEPT is not null)),
    constraint FK_META_PRINT_BIND_TNT foreign key (ID_TNT) references RHN_SYS_TNT(ID_TNT),
    constraint FK_META_PRINT_BIND_ORG foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG),
    constraint FK_META_PRINT_BIND_DEPT foreign key (ID_TNT, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_DEPT),
    constraint FK_META_PRINT_BIND_TASK foreign key (ID_PRINT_TASK_DEF) references RHN_META_PRINT_TASK_DEF(ID_PRINT_TASK_DEF),
    constraint FK_META_PRINT_BIND_IMPL foreign key (ID_PRINT_IMPL) references RHN_META_PRINT_IMPL(ID_PRINT_IMPL)
);

alter table RHN_SYS_PRINT_OUTPUT add (
    ID_PRINT_TASK_DEF number(19),
    CD_PRINT_TASK varchar2(100 char),
    ID_PRINT_IMPL number(19),
    ID_PRINT_IMPL_BIND number(19),
    CD_PAYLOAD_SCHEMA varchar2(100 char)
);
alter table RHN_SYS_PRINT_OUTPUT add constraint FK_SYS_PRINT_OUTPUT_TASK foreign key (ID_PRINT_TASK_DEF) references RHN_META_PRINT_TASK_DEF(ID_PRINT_TASK_DEF);
alter table RHN_SYS_PRINT_OUTPUT add constraint FK_SYS_PRINT_OUTPUT_IMPL foreign key (ID_PRINT_IMPL) references RHN_META_PRINT_IMPL(ID_PRINT_IMPL);
alter table RHN_SYS_PRINT_OUTPUT add constraint FK_SYS_PRINT_OUTPUT_BIND foreign key (ID_PRINT_IMPL_BIND) references RHN_META_PRINT_IMPL_BIND(ID_PRINT_IMPL_BIND);

create index IDX_META_PRINT_TASK_STATUS on RHN_META_PRINT_TASK_DEF (SD_STATUS, SD_CATEGORY, CD_TASK);
create index IDX_META_PRINT_IMPL_VISIBLE on RHN_META_PRINT_IMPL (ID_TNT, SD_STATUS, CD_PAYLOAD_SCHEMA);
create index IDX_META_PRINT_IMPL_RESOLVE on RHN_META_PRINT_IMPL_BIND (ID_PRINT_TASK_DEF, ID_TNT, ID_ORG, ID_DEPT, SD_PURPOSE, SD_STATUS);
create index IDX_SYS_PRINT_OUTPUT_TASK on RHN_SYS_PRINT_OUTPUT (ID_TNT, CD_PRINT_TASK, DT_GENERATED);

insert into RHN_META_PRINT_TASK_DEF values (270000000000301, 0, 'OP.MEDICAL_RECORD.PRINT', '门诊病历打印', 'CLINICAL_DOCUMENT', 'ClinicalDocument', 'CLINICAL_DOCUMENT', 'RHN.PRINT.OUTPATIENT_NOTE.V1', 1, '["CLINICAL_USE","PATIENT_COPY","ARCHIVE_COPY"]', 0, 'ACTIVE', current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_TASK_DEF values (270000000000302, 0, 'OP.PRESCRIPTION.WESTERN.PRINT', '门诊西药处方打印', 'PRESCRIPTION', 'Prescription', 'PRESCRIPTION', 'RHN.PRINT.OUTPATIENT_PRESCRIPTION.V1', 1, '["PATIENT_COPY","ARCHIVE_COPY"]', 0, 'ACTIVE', current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_TASK_DEF values (270000000000303, 0, 'OP.APPLICATION.LAB.PRINT', '检验申请单打印', 'APPLICATION', 'ServiceRequest', 'SERVICE_REQUEST', 'RHN.PRINT.LABORATORY_APPLICATION.V1', 1, '["CLINICAL_USE","PATIENT_COPY","ARCHIVE_COPY"]', 0, 'ACTIVE', current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_TASK_DEF values (270000000000304, 0, 'OP.APPLICATION.EXAM.PRINT', '检查申请单打印', 'APPLICATION', 'ServiceRequest', 'SERVICE_REQUEST', 'RHN.PRINT.EXAMINATION_APPLICATION.V1', 1, '["CLINICAL_USE","PATIENT_COPY","ARCHIVE_COPY"]', 0, 'ACTIVE', current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_TASK_DEF values (270000000000305, 0, 'OP.APPLICATION.TREATMENT.PRINT', '治疗申请单打印', 'APPLICATION', 'ServiceRequest', 'SERVICE_REQUEST', 'RHN.PRINT.TREATMENT_APPLICATION.V1', 1, '["CLINICAL_USE","PATIENT_COPY","ARCHIVE_COPY"]', 0, 'ACTIVE', current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_TASK_DEF values (270000000000306, 0, 'TREATMENT.ORAL_MEDICATION_CARD.PRINT', '口服药卡打印', 'CARD', 'MedicationExecutionTask', 'TREATMENT_EXECUTION', 'RHN.PRINT.ORAL_MEDICATION_CARD.V1', 1, '["CLINICAL_USE"]', 1, 'ACTIVE', current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_TASK_DEF values (270000000000307, 0, 'TREATMENT.INFUSION_LABEL.PRINT', '输液瓶签打印', 'LABEL', 'MedicationExecutionTask', 'TREATMENT_EXECUTION', 'RHN.PRINT.INFUSION_LABEL.V1', 1, '["CLINICAL_USE"]', 1, 'ACTIVE', current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_TASK_DEF values (270000000000308, 0, 'TREATMENT.INFUSION_PATROL_CARD.PRINT', '输液巡视卡打印', 'CARD', 'MedicationExecutionTask', 'TREATMENT_EXECUTION', 'RHN.PRINT.INFUSION_PATROL_CARD.V1', 1, '["CLINICAL_USE"]', 1, 'ACTIVE', current_timestamp, null, current_timestamp, null);

insert into RHN_META_PRINT_IMPL values (270000000000401, 0, null, 'PLATFORM_OUTPATIENT_NOTE', '平台门诊病历实现', 'INTERNAL_TEMPLATE', 'RHN_INTERNAL_PDF', 270000000000001, 'RHN.PRINT.OUTPATIENT_NOTE.V1', 'PDF', '{}', 'ACTIVE', current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_IMPL values (270000000000402, 0, null, 'PLATFORM_OUTPATIENT_PRESCRIPTION', '平台门诊处方实现', 'INTERNAL_TEMPLATE', 'RHN_INTERNAL_PDF', 270000000000002, 'RHN.PRINT.OUTPATIENT_PRESCRIPTION.V1', 'PDF', '{}', 'ACTIVE', current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_IMPL values (270000000000403, 0, null, 'PLATFORM_LAB_APPLICATION', '平台检验申请单实现', 'INTERNAL_TEMPLATE', 'RHN_INTERNAL_PDF', 270000000000006, 'RHN.PRINT.LABORATORY_APPLICATION.V1', 'PDF', '{}', 'ACTIVE', current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_IMPL values (270000000000404, 0, null, 'PLATFORM_EXAM_APPLICATION', '平台检查申请单实现', 'INTERNAL_TEMPLATE', 'RHN_INTERNAL_PDF', 270000000000007, 'RHN.PRINT.EXAMINATION_APPLICATION.V1', 'PDF', '{}', 'ACTIVE', current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_IMPL values (270000000000405, 0, null, 'PLATFORM_TREATMENT_APPLICATION', '平台治疗申请单实现', 'INTERNAL_TEMPLATE', 'RHN_INTERNAL_PDF', 270000000000008, 'RHN.PRINT.TREATMENT_APPLICATION.V1', 'PDF', '{}', 'ACTIVE', current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_IMPL values (270000000000406, 0, null, 'PLATFORM_ORAL_MEDICATION_CARD', '平台口服药卡实现', 'INTERNAL_TEMPLATE', 'RHN_INTERNAL_PDF', 270000000000003, 'RHN.PRINT.ORAL_MEDICATION_CARD.V1', 'PDF', '{}', 'ACTIVE', current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_IMPL values (270000000000407, 0, null, 'PLATFORM_INFUSION_LABEL', '平台输液瓶签实现', 'INTERNAL_TEMPLATE', 'RHN_INTERNAL_PDF', 270000000000004, 'RHN.PRINT.INFUSION_LABEL.V1', 'PDF', '{}', 'ACTIVE', current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_IMPL values (270000000000408, 0, null, 'PLATFORM_INFUSION_PATROL_CARD', '平台输液巡视卡实现', 'INTERNAL_TEMPLATE', 'RHN_INTERNAL_PDF', 270000000000005, 'RHN.PRINT.INFUSION_PATROL_CARD.V1', 'PDF', '{}', 'ACTIVE', current_timestamp, null, current_timestamp, null);

insert into RHN_META_PRINT_IMPL_BIND values (270000000000501, 0, null, null, null, 270000000000301, '*', 270000000000401, 'PLATFORM', 'FAIL_CLOSED', current_timestamp, null, 'ACTIVE', current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_IMPL_BIND values (270000000000502, 0, null, null, null, 270000000000302, '*', 270000000000402, 'PLATFORM', 'FAIL_CLOSED', current_timestamp, null, 'ACTIVE', current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_IMPL_BIND values (270000000000503, 0, null, null, null, 270000000000303, '*', 270000000000403, 'PLATFORM', 'FAIL_CLOSED', current_timestamp, null, 'ACTIVE', current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_IMPL_BIND values (270000000000504, 0, null, null, null, 270000000000304, '*', 270000000000404, 'PLATFORM', 'FAIL_CLOSED', current_timestamp, null, 'ACTIVE', current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_IMPL_BIND values (270000000000505, 0, null, null, null, 270000000000305, '*', 270000000000405, 'PLATFORM', 'FAIL_CLOSED', current_timestamp, null, 'ACTIVE', current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_IMPL_BIND values (270000000000506, 0, null, null, null, 270000000000306, '*', 270000000000406, 'PLATFORM', 'PLATFORM_DEFAULT', current_timestamp, null, 'ACTIVE', current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_IMPL_BIND values (270000000000507, 0, null, null, null, 270000000000307, '*', 270000000000407, 'PLATFORM', 'PLATFORM_DEFAULT', current_timestamp, null, 'ACTIVE', current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_IMPL_BIND values (270000000000508, 0, null, null, null, 270000000000308, '*', 270000000000408, 'PLATFORM', 'PLATFORM_DEFAULT', current_timestamp, null, 'ACTIVE', current_timestamp, null, current_timestamp, null);

update RHN_SYS_PRINT_OUTPUT set ID_PRINT_TASK_DEF = case SD_DOC_TYPE
    when 'OUTPATIENT_NOTE' then 270000000000301 when 'OUTPATIENT_PRESCRIPTION' then 270000000000302
    when 'LABORATORY_APPLICATION' then 270000000000303 when 'EXAMINATION_APPLICATION' then 270000000000304
    when 'TREATMENT_APPLICATION' then 270000000000305 when 'ORAL_MEDICATION_CARD' then 270000000000306
    when 'INFUSION_LABEL' then 270000000000307 when 'INFUSION_PATROL_CARD' then 270000000000308 end,
    CD_PRINT_TASK = case SD_DOC_TYPE
    when 'OUTPATIENT_NOTE' then 'OP.MEDICAL_RECORD.PRINT' when 'OUTPATIENT_PRESCRIPTION' then 'OP.PRESCRIPTION.WESTERN.PRINT'
    when 'LABORATORY_APPLICATION' then 'OP.APPLICATION.LAB.PRINT' when 'EXAMINATION_APPLICATION' then 'OP.APPLICATION.EXAM.PRINT'
    when 'TREATMENT_APPLICATION' then 'OP.APPLICATION.TREATMENT.PRINT' when 'ORAL_MEDICATION_CARD' then 'TREATMENT.ORAL_MEDICATION_CARD.PRINT'
    when 'INFUSION_LABEL' then 'TREATMENT.INFUSION_LABEL.PRINT' when 'INFUSION_PATROL_CARD' then 'TREATMENT.INFUSION_PATROL_CARD.PRINT' end,
    ID_PRINT_IMPL = case SD_DOC_TYPE
    when 'OUTPATIENT_NOTE' then 270000000000401 when 'OUTPATIENT_PRESCRIPTION' then 270000000000402
    when 'LABORATORY_APPLICATION' then 270000000000403 when 'EXAMINATION_APPLICATION' then 270000000000404
    when 'TREATMENT_APPLICATION' then 270000000000405 when 'ORAL_MEDICATION_CARD' then 270000000000406
    when 'INFUSION_LABEL' then 270000000000407 when 'INFUSION_PATROL_CARD' then 270000000000408 end,
    ID_PRINT_IMPL_BIND = case SD_DOC_TYPE
    when 'OUTPATIENT_NOTE' then 270000000000501 when 'OUTPATIENT_PRESCRIPTION' then 270000000000502
    when 'LABORATORY_APPLICATION' then 270000000000503 when 'EXAMINATION_APPLICATION' then 270000000000504
    when 'TREATMENT_APPLICATION' then 270000000000505 when 'ORAL_MEDICATION_CARD' then 270000000000506
    when 'INFUSION_LABEL' then 270000000000507 when 'INFUSION_PATROL_CARD' then 270000000000508 end,
    CD_PAYLOAD_SCHEMA = case SD_DOC_TYPE
    when 'OUTPATIENT_NOTE' then 'RHN.PRINT.OUTPATIENT_NOTE.V1' when 'OUTPATIENT_PRESCRIPTION' then 'RHN.PRINT.OUTPATIENT_PRESCRIPTION.V1'
    when 'LABORATORY_APPLICATION' then 'RHN.PRINT.LABORATORY_APPLICATION.V1' when 'EXAMINATION_APPLICATION' then 'RHN.PRINT.EXAMINATION_APPLICATION.V1'
    when 'TREATMENT_APPLICATION' then 'RHN.PRINT.TREATMENT_APPLICATION.V1' when 'ORAL_MEDICATION_CARD' then 'RHN.PRINT.ORAL_MEDICATION_CARD.V1'
    when 'INFUSION_LABEL' then 'RHN.PRINT.INFUSION_LABEL.V1' when 'INFUSION_PATROL_CARD' then 'RHN.PRINT.INFUSION_PATROL_CARD.V1' end;

comment on table RHN_META_PRINT_TASK_DEF is '标准打印任务定义；一行代表一个业务模块稳定依赖的打印任务';
comment on column RHN_META_PRINT_TASK_DEF.ID_PRINT_TASK_DEF is '标准打印任务主键';
comment on column RHN_META_PRINT_TASK_DEF.REVISION is '乐观锁修订号';
comment on column RHN_META_PRINT_TASK_DEF.CD_TASK is '稳定打印任务编码';
comment on column RHN_META_PRINT_TASK_DEF.NA_TASK is '打印任务名称';
comment on column RHN_META_PRINT_TASK_DEF.SD_CATEGORY is '打印任务分类';
comment on column RHN_META_PRINT_TASK_DEF.SD_SOURCE_TYPE is '业务数据源类型';
comment on column RHN_META_PRINT_TASK_DEF.CD_DATA_PROVIDER is '数据提供器编码';
comment on column RHN_META_PRINT_TASK_DEF.CD_PAYLOAD_SCHEMA is '打印数据契约编码';
comment on column RHN_META_PRINT_TASK_DEF.SN_SCHEMA_VER is '数据契约版本号';
comment on column RHN_META_PRINT_TASK_DEF.JSON_PURPOSES is '允许的打印用途集合';
comment on column RHN_META_PRINT_TASK_DEF.FG_BATCH is '是否支持批量打印';
comment on column RHN_META_PRINT_TASK_DEF.SD_STATUS is '任务状态';
comment on column RHN_META_PRINT_TASK_DEF.DT_CREATED is '创建时间';
comment on column RHN_META_PRINT_TASK_DEF.ID_USER_CREATED is '创建人标识';
comment on column RHN_META_PRINT_TASK_DEF.DT_UPDATED is '更新时间';
comment on column RHN_META_PRINT_TASK_DEF.ID_USER_UPDATED is '更新人标识';

comment on table RHN_META_PRINT_IMPL is '打印实现注册；一行代表一个内部模板或受控外部报表实现';
comment on column RHN_META_PRINT_IMPL.ID_PRINT_IMPL is '打印实现主键';
comment on column RHN_META_PRINT_IMPL.REVISION is '乐观锁修订号';
comment on column RHN_META_PRINT_IMPL.ID_TNT is '所属租户标识，为空表示平台实现';
comment on column RHN_META_PRINT_IMPL.CD_IMPL is '打印实现编码';
comment on column RHN_META_PRINT_IMPL.NA_IMPL is '打印实现名称';
comment on column RHN_META_PRINT_IMPL.SD_RENDERER is '渲染器类型';
comment on column RHN_META_PRINT_IMPL.CD_ADAPTER is '渲染适配器编码';
comment on column RHN_META_PRINT_IMPL.ID_PRINT_TMPL is '内部打印模板标识';
comment on column RHN_META_PRINT_IMPL.CD_PAYLOAD_SCHEMA is '适用的数据契约编码';
comment on column RHN_META_PRINT_IMPL.SD_OUTPUT_FORMAT is '输出格式';
comment on column RHN_META_PRINT_IMPL.JSON_CONFIG is '实现扩展配置';
comment on column RHN_META_PRINT_IMPL.SD_STATUS is '实现状态';
comment on column RHN_META_PRINT_IMPL.DT_CREATED is '创建时间';
comment on column RHN_META_PRINT_IMPL.ID_USER_CREATED is '创建人标识';
comment on column RHN_META_PRINT_IMPL.DT_UPDATED is '更新时间';
comment on column RHN_META_PRINT_IMPL.ID_USER_UPDATED is '更新人标识';

comment on table RHN_META_PRINT_IMPL_BIND is '打印实现绑定；一行代表一条平台、租户、机构或科室级解析规则';
comment on column RHN_META_PRINT_IMPL_BIND.ID_PRINT_IMPL_BIND is '打印实现绑定主键';
comment on column RHN_META_PRINT_IMPL_BIND.REVISION is '乐观锁修订号';
comment on column RHN_META_PRINT_IMPL_BIND.ID_TNT is '租户标识';
comment on column RHN_META_PRINT_IMPL_BIND.ID_ORG is '机构标识';
comment on column RHN_META_PRINT_IMPL_BIND.ID_DEPT is '科室标识';
comment on column RHN_META_PRINT_IMPL_BIND.ID_PRINT_TASK_DEF is '标准打印任务标识';
comment on column RHN_META_PRINT_IMPL_BIND.SD_PURPOSE is '打印用途';
comment on column RHN_META_PRINT_IMPL_BIND.ID_PRINT_IMPL is '打印实现标识';
comment on column RHN_META_PRINT_IMPL_BIND.SD_SCOPE is '覆盖范围层级';
comment on column RHN_META_PRINT_IMPL_BIND.SD_FALLBACK is '回退策略';
comment on column RHN_META_PRINT_IMPL_BIND.DT_VALID_FROM is '生效时间';
comment on column RHN_META_PRINT_IMPL_BIND.DT_VALID_TO is '失效时间';
comment on column RHN_META_PRINT_IMPL_BIND.SD_STATUS is '绑定状态';
comment on column RHN_META_PRINT_IMPL_BIND.DT_CREATED is '创建时间';
comment on column RHN_META_PRINT_IMPL_BIND.ID_USER_CREATED is '创建人标识';
comment on column RHN_META_PRINT_IMPL_BIND.DT_UPDATED is '更新时间';
comment on column RHN_META_PRINT_IMPL_BIND.ID_USER_UPDATED is '更新人标识';

comment on column RHN_SYS_PRINT_OUTPUT.ID_PRINT_TASK_DEF is '生成输出时冻结的标准打印任务标识';
comment on column RHN_SYS_PRINT_OUTPUT.CD_PRINT_TASK is '生成输出时冻结的标准打印任务编码';
comment on column RHN_SYS_PRINT_OUTPUT.ID_PRINT_IMPL is '生成输出时冻结的打印实现标识';
comment on column RHN_SYS_PRINT_OUTPUT.ID_PRINT_IMPL_BIND is '生成输出时冻结的实现绑定标识';
comment on column RHN_SYS_PRINT_OUTPUT.CD_PAYLOAD_SCHEMA is '生成输出时冻结的数据契约编码';
