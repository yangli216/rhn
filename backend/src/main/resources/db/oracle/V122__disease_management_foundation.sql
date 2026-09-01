alter table code_systems add (diagnosis_domain varchar2(32 char));
update code_systems set diagnosis_domain = 'WESTERN_MEDICINE' where system_type = 'DISEASE';
alter table code_systems add constraint ck_code_system_diagnosis_domain check (
    diagnosis_domain is null or diagnosis_domain in ('WESTERN_MEDICINE', 'TCM_DISEASE', 'TCM_SYNDROME')
);

create table disease_management_programs (
    id number(19) primary key,
    revision number(19) default 0 not null,
    scope_type varchar2(24 char) not null,
    scope_id number(19) not null,
    code varchar2(64 char) not null,
    name varchar2(200 char) not null,
    management_type varchar2(32 char) not null,
    trigger_action varchar2(32 char) not null,
    description varchar2(1000 char),
    report_card_type varchar2(64 char),
    report_deadline_hours number(10),
    status varchar2(24 char) not null,
    effective_from date not null,
    effective_to date,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    constraint uk_disease_management_program unique (scope_type, scope_id, code),
    constraint ck_disease_management_scope check (scope_type in ('PRODUCT', 'TENANT')),
    constraint ck_disease_management_type check (management_type in ('CHRONIC_CARE', 'DISEASE_REPORT', 'SPECIAL_REGISTRY')),
    constraint ck_disease_management_action check (trigger_action in ('PROMPT_CONFIRMATION', 'CREATE_FOLLOW_UP_TASK', 'CREATE_REPORT_DRAFT')),
    constraint ck_disease_management_deadline check (report_deadline_hours is null or report_deadline_hours > 0)
);
create index idx_disease_management_program_lookup on disease_management_programs
    (scope_type, scope_id, status, effective_from, effective_to);

create table disease_management_members (
    id number(19) primary key,
    program_id number(19) not null,
    concept_id number(19) not null,
    status varchar2(24 char) not null,
    effective_from date not null,
    effective_to date,
    note varchar2(500 char),
    created_at timestamp with time zone not null,
    constraint fk_disease_management_member_program foreign key (program_id) references disease_management_programs(id),
    constraint fk_disease_management_member_concept foreign key (concept_id) references concepts(id),
    constraint uk_disease_management_member unique (program_id, concept_id)
);
create index idx_disease_management_member_concept on disease_management_members
    (concept_id, status, effective_from, effective_to);

alter table encounter_diagnoses add (
    concept_id number(19),
    code_system_code_snapshot varchar2(100 char),
    code_system_version_snapshot varchar2(64 char),
    diagnosis_domain varchar2(32 char) default 'WESTERN_MEDICINE' not null,
    diagnosis_group_id varchar2(64 char),
    management_snapshot_json clob
);
alter table encounter_diagnoses add constraint fk_enc_diag_concept foreign key (concept_id) references concepts(id);
alter table encounter_diagnoses add constraint ck_enc_diag_domain check (
    diagnosis_domain in ('WESTERN_MEDICINE', 'TCM_DISEASE', 'TCM_SYNDROME')
);
create index idx_enc_diag_terminology on encounter_diagnoses
    (tenant_id, code_system_code_snapshot, code, diagnosis_status);

alter table encounter_diagnosis_revisions add (
    concept_id number(19),
    code_system_code_snapshot varchar2(100 char),
    code_system_version_snapshot varchar2(64 char),
    diagnosis_domain varchar2(32 char) default 'WESTERN_MEDICINE' not null,
    diagnosis_group_id varchar2(64 char),
    management_snapshot_json clob
);

insert all
    into dictionary_definitions (id, revision, scope_type, scope_code, tenant_id, category_id, code, name, description, system_managed, status, created_at, created_by, updated_at, updated_by)
    values (362387870122001, 0, 'PLATFORM', 'PLATFORM', null, 362387869840005, 'BD_DIAGNOSIS_DOMAIN', '诊断体系', '区分西医诊断、中医病名和中医证候', 1, 'ACTIVE', current_timestamp, null, current_timestamp, null)
    into dictionary_definitions (id, revision, scope_type, scope_code, tenant_id, category_id, code, name, description, system_managed, status, created_at, created_by, updated_at, updated_by)
    values (362387870122002, 0, 'PLATFORM', 'PLATFORM', null, 362387869840005, 'BD_DISEASE_MANAGEMENT_TYPE', '疾病管理类别', '疾病进入慢病管理、疾病报告或专项登记的业务类别', 1, 'ACTIVE', current_timestamp, null, current_timestamp, null)
    into dictionary_definitions (id, revision, scope_type, scope_code, tenant_id, category_id, code, name, description, system_managed, status, created_at, created_by, updated_at, updated_by)
    values (362387870122003, 0, 'PLATFORM', 'PLATFORM', null, 362387869840005, 'BD_DISEASE_TRIGGER_ACTION', '疾病管理触发动作', '医生开立诊断后产生的受控业务动作', 1, 'ACTIVE', current_timestamp, null, current_timestamp, null)
select 1 from dual;

insert all
    into dictionary_items values (362387870122101, 362387870122001, 'WESTERN_MEDICINE', '西医诊断', '西医疾病、症状和健康状态诊断', 10, 'ACTIVE')
    into dictionary_items values (362387870122102, 362387870122001, 'TCM_DISEASE', '中医病名', '中医疾病名称', 20, 'ACTIVE')
    into dictionary_items values (362387870122103, 362387870122001, 'TCM_SYNDROME', '中医证候', '中医证候或证型', 30, 'ACTIVE')
    into dictionary_items values (362387870122111, 362387870122002, 'CHRONIC_CARE', '慢病管理', '纳入公共卫生慢性病管理候选', 10, 'ACTIVE')
    into dictionary_items values (362387870122112, 362387870122002, 'DISEASE_REPORT', '疾病报告', '触发法定或机构疾病报告流程', 20, 'ACTIVE')
    into dictionary_items values (362387870122113, 362387870122002, 'SPECIAL_REGISTRY', '专项登记', '肿瘤、出生缺陷等专项登记', 30, 'ACTIVE')
    into dictionary_items values (362387870122121, 362387870122003, 'PROMPT_CONFIRMATION', '提示确认', '提示医生确认是否进入后续管理', 10, 'ACTIVE')
    into dictionary_items values (362387870122122, 362387870122003, 'CREATE_FOLLOW_UP_TASK', '创建随访候选', '生成待公卫人员接收的随访候选', 20, 'ACTIVE')
    into dictionary_items values (362387870122123, 362387870122003, 'CREATE_REPORT_DRAFT', '创建报卡草稿', '生成待医生确认和提交的报卡草稿', 30, 'ACTIVE')
select 1 from dual;
