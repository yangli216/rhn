create table conditions (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    resident_id bigint not null,
    term_id bigint,
    condition_key varchar(240) not null,
    code_system_uri varchar(300) not null,
    code_release varchar(64),
    condition_code varchar(128) not null,
    condition_name varchar(300) not null,
    clinical_status varchar(32) not null,
    verification_status varchar(32) not null,
    onset_at timestamp with time zone,
    abatement_at timestamp with time zone,
    recorded_at timestamp with time zone not null,
    recorder_practitioner_id bigint not null,
    recorder_user_id bigint not null,
    constraint fk_condition_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_condition_resident foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_condition_term foreign key (term_id) references concepts(id),
    constraint fk_condition_practitioner foreign key (tenant_id, recorder_practitioner_id)
        references practitioners(tenant_id, id),
    constraint fk_condition_user foreign key (tenant_id, recorder_user_id) references user_accounts(tenant_id, id),
    constraint uk_condition_tenant_id unique (tenant_id, id),
    constraint uk_condition_key unique (tenant_id, condition_key),
    constraint ck_condition_clinical_status check (clinical_status in ('ACTIVE', 'RECURRENCE', 'RELAPSE', 'INACTIVE', 'REMISSION', 'RESOLVED')),
    constraint ck_condition_verification check (verification_status in ('UNCONFIRMED', 'SUSPECTED', 'PROVISIONAL', 'DIFFERENTIAL', 'CONFIRMED', 'REFUTED', 'ENTERED_IN_ERROR')),
    constraint ck_condition_period check (abatement_at is null or onset_at is null or abatement_at >= onset_at)
);
create index idx_condition_resident on conditions (tenant_id, resident_id, clinical_status, recorded_at);
create index idx_condition_code on conditions (tenant_id, condition_code, verification_status, clinical_status);

create table care_tasks (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    resident_id bigint not null,
    encounter_id bigint,
    care_plan_id bigint,
    request_id bigint,
    report_event_id bigint,
    condition_id bigint,
    task_code varchar(128) not null,
    task_type varchar(32) not null,
    status varchar(32) not null,
    priority varchar(32) not null,
    owner_practitioner_id bigint,
    owner_organization_id bigint,
    owner_department_id bigint,
    due_at timestamp with time zone,
    escalation_rule_code varchar(128),
    title varchar(300) not null,
    description varchar(2000),
    created_at timestamp with time zone not null,
    creator_practitioner_id bigint not null,
    creator_user_id bigint not null,
    constraint fk_care_task_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_care_task_resident foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_care_task_encounter foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint fk_care_task_condition foreign key (tenant_id, condition_id) references conditions(tenant_id, id),
    constraint fk_care_task_owner_pract foreign key (tenant_id, owner_practitioner_id)
        references practitioners(tenant_id, id),
    constraint fk_care_task_owner_org foreign key (tenant_id, owner_organization_id)
        references organizations(tenant_id, id),
    constraint fk_care_task_owner_dept foreign key (tenant_id, owner_organization_id, owner_department_id)
        references departments(tenant_id, organization_id, id),
    constraint fk_care_task_creator_pract foreign key (tenant_id, creator_practitioner_id)
        references practitioners(tenant_id, id),
    constraint fk_care_task_creator_user foreign key (tenant_id, creator_user_id)
        references user_accounts(tenant_id, id),
    constraint uk_care_task_tenant_id unique (tenant_id, id),
    constraint uk_care_task_code unique (tenant_id, task_code),
    constraint ck_care_task_type check (task_type in ('FOLLOWUP', 'RECHECK', 'REFERRAL_RETURN', 'PUBLIC_HEALTH_REPORT', 'EDUCATION', 'PATIENT_COMMUNICATION', 'CRITICAL_VALUE')),
    constraint ck_care_task_status check (status in ('PLANNED', 'READY', 'IN_PROGRESS', 'WAITING_EXTERNAL', 'COMPLETED', 'CANCELLED', 'OVERDUE', 'ESCALATED')),
    constraint ck_care_task_priority check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    constraint ck_care_task_owner_context check (
        (owner_department_id is null) or (owner_organization_id is not null)
    )
);
create index idx_care_task_queue on care_tasks (tenant_id, owner_organization_id, owner_department_id, status, due_at);
create index idx_care_task_resident on care_tasks (tenant_id, resident_id, task_type, status, due_at);
create index idx_care_task_encounter on care_tasks (tenant_id, encounter_id, status);

create table care_task_events (
    id bigint primary key,
    tenant_id bigint not null,
    care_task_id bigint not null,
    event_type varchar(32) not null,
    status_from varchar(32),
    status_to varchar(32) not null,
    actor_practitioner_id bigint,
    actor_user_id bigint,
    command_code varchar(128) not null,
    result_description varchar(2000),
    rule_code varchar(128),
    rule_version varchar(64),
    evidence_json text,
    evidence_hash varchar(64),
    occurred_at timestamp with time zone not null,
    constraint fk_care_task_event_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_care_task_event_task foreign key (tenant_id, care_task_id) references care_tasks(tenant_id, id),
    constraint fk_care_task_event_pract foreign key (tenant_id, actor_practitioner_id)
        references practitioners(tenant_id, id),
    constraint fk_care_task_event_user foreign key (tenant_id, actor_user_id) references user_accounts(tenant_id, id),
    constraint uk_care_task_event_command unique (tenant_id, care_task_id, command_code),
    constraint ck_care_task_event_status_to check (status_to in ('PLANNED', 'READY', 'IN_PROGRESS', 'WAITING_EXTERNAL', 'COMPLETED', 'CANCELLED', 'OVERDUE', 'ESCALATED')),
    constraint ck_care_task_event_actor check (actor_practitioner_id is not null or actor_user_id is not null),
    constraint ck_care_task_event_evidence check (
        (evidence_json is null and evidence_hash is null) or
        (evidence_json is not null and evidence_hash is not null and rule_code is not null and rule_version is not null)
    )
);
create index idx_care_task_event_time on care_task_events (tenant_id, care_task_id, occurred_at);
create index idx_care_task_event_rule on care_task_events (tenant_id, rule_code, rule_version, occurred_at);
