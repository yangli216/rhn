create table conditions (
    id number(19) primary key, revision number(19) default 0 not null, tenant_id number(19) not null,
    resident_id number(19) not null, term_id number(19), condition_key varchar2(240 char) not null,
    code_system_uri varchar2(300 char) not null, code_release varchar2(64 char),
    condition_code varchar2(128 char) not null, condition_name varchar2(300 char) not null,
    clinical_status varchar2(32 char) not null, verification_status varchar2(32 char) not null,
    onset_at timestamp with time zone, abatement_at timestamp with time zone,
    recorded_at timestamp with time zone not null, recorder_practitioner_id number(19) not null,
    recorder_user_id number(19) not null,
    constraint fk_condition_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_condition_resident foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_condition_term foreign key (term_id) references concepts(id),
    constraint fk_condition_practitioner foreign key (tenant_id, recorder_practitioner_id) references practitioners(tenant_id, id),
    constraint fk_condition_user foreign key (tenant_id, recorder_user_id) references user_accounts(tenant_id, id),
    constraint uk_condition_tenant_id unique (tenant_id, id), constraint uk_condition_key unique (tenant_id, condition_key),
    constraint ck_condition_clinical_status check (clinical_status in ('ACTIVE', 'RECURRENCE', 'RELAPSE', 'INACTIVE', 'REMISSION', 'RESOLVED')),
    constraint ck_condition_verification check (verification_status in ('UNCONFIRMED', 'SUSPECTED', 'PROVISIONAL', 'DIFFERENTIAL', 'CONFIRMED', 'REFUTED', 'ENTERED_IN_ERROR')),
    constraint ck_condition_period check (abatement_at is null or onset_at is null or abatement_at >= onset_at)
);
create index idx_condition_resident on conditions (tenant_id, resident_id, clinical_status, recorded_at);
create index idx_condition_code on conditions (tenant_id, condition_code, verification_status, clinical_status);

create table care_tasks (
    id number(19) primary key, revision number(19) default 0 not null, tenant_id number(19) not null,
    resident_id number(19) not null, encounter_id number(19), care_plan_id number(19), request_id number(19),
    report_event_id number(19), condition_id number(19), task_code varchar2(128 char) not null,
    task_type varchar2(32 char) not null, status varchar2(32 char) not null, priority varchar2(32 char) not null,
    owner_practitioner_id number(19), owner_organization_id number(19), owner_department_id number(19),
    due_at timestamp with time zone, escalation_rule_code varchar2(128 char), title varchar2(300 char) not null,
    description varchar2(2000 char), created_at timestamp with time zone not null,
    creator_practitioner_id number(19) not null, creator_user_id number(19) not null,
    constraint fk_care_task_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_care_task_resident foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_care_task_encounter foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint fk_care_task_condition foreign key (tenant_id, condition_id) references conditions(tenant_id, id),
    constraint fk_care_task_owner_pract foreign key (tenant_id, owner_practitioner_id) references practitioners(tenant_id, id),
    constraint fk_care_task_owner_org foreign key (tenant_id, owner_organization_id) references organizations(tenant_id, id),
    constraint fk_care_task_owner_dept foreign key (tenant_id, owner_organization_id, owner_department_id) references departments(tenant_id, organization_id, id),
    constraint fk_care_task_creator_pract foreign key (tenant_id, creator_practitioner_id) references practitioners(tenant_id, id),
    constraint fk_care_task_creator_user foreign key (tenant_id, creator_user_id) references user_accounts(tenant_id, id),
    constraint uk_care_task_tenant_id unique (tenant_id, id), constraint uk_care_task_code unique (tenant_id, task_code),
    constraint ck_care_task_type check (task_type in ('FOLLOWUP', 'RECHECK', 'REFERRAL_RETURN', 'PUBLIC_HEALTH_REPORT', 'EDUCATION', 'PATIENT_COMMUNICATION', 'CRITICAL_VALUE')),
    constraint ck_care_task_status check (status in ('PLANNED', 'READY', 'IN_PROGRESS', 'WAITING_EXTERNAL', 'COMPLETED', 'CANCELLED', 'OVERDUE', 'ESCALATED')),
    constraint ck_care_task_priority check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    constraint ck_care_task_owner_context check (owner_department_id is null or owner_organization_id is not null)
);
create index idx_care_task_queue on care_tasks (tenant_id, owner_organization_id, owner_department_id, status, due_at);
create index idx_care_task_resident on care_tasks (tenant_id, resident_id, task_type, status, due_at);
create index idx_care_task_encounter on care_tasks (tenant_id, encounter_id, status);

create table care_task_events (
    id number(19) primary key, tenant_id number(19) not null, care_task_id number(19) not null,
    event_type varchar2(32 char) not null, status_from varchar2(32 char), status_to varchar2(32 char) not null,
    actor_practitioner_id number(19), actor_user_id number(19), command_code varchar2(128 char) not null,
    result_description varchar2(2000 char), rule_code varchar2(128 char), rule_version varchar2(64 char),
    evidence_json clob, evidence_hash varchar2(64 char), occurred_at timestamp with time zone not null,
    constraint fk_care_task_event_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_care_task_event_task foreign key (tenant_id, care_task_id) references care_tasks(tenant_id, id),
    constraint fk_care_task_event_pract foreign key (tenant_id, actor_practitioner_id) references practitioners(tenant_id, id),
    constraint fk_care_task_event_user foreign key (tenant_id, actor_user_id) references user_accounts(tenant_id, id),
    constraint uk_care_task_event_command unique (tenant_id, care_task_id, command_code),
    constraint ck_care_task_event_status_to check (status_to in ('PLANNED', 'READY', 'IN_PROGRESS', 'WAITING_EXTERNAL', 'COMPLETED', 'CANCELLED', 'OVERDUE', 'ESCALATED')),
    constraint ck_care_task_event_actor check (actor_practitioner_id is not null or actor_user_id is not null),
    constraint ck_care_task_event_evidence check ((evidence_json is null and evidence_hash is null) or (evidence_json is not null and evidence_hash is not null and rule_code is not null and rule_version is not null))
);
create index idx_care_task_event_time on care_task_events (tenant_id, care_task_id, occurred_at);
create index idx_care_task_event_rule on care_task_events (tenant_id, rule_code, rule_version, occurred_at);
