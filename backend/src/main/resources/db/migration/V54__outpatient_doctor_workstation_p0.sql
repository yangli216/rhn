-- Outpatient doctor workstation P0 aligned with nextgen 1.11-outpatient-p1.
-- Existing encounter, document and request aggregates remain authoritative; this migration
-- adds the missing business facts and immutable histories required by the workstation.

alter table encounter_diagnoses add column revision bigint default 0 not null;
alter table encounter_diagnoses add column business_version_no integer default 1 not null;
alter table encounter_diagnoses add column verification_status varchar(32) default 'CONFIRMED' not null;
alter table encounter_diagnoses add column diagnosis_status varchar(32) default 'ACTIVE' not null;
alter table encounter_diagnoses add column clinical_note varchar(1000);
alter table encounter_diagnoses add column updated_at timestamp with time zone;
alter table encounter_diagnoses add column updated_by bigint;
alter table encounter_diagnoses add constraint fk_enc_diag_updated_user
    foreign key (tenant_id, updated_by) references user_accounts(tenant_id, id);
alter table encounter_diagnoses add constraint ck_enc_diag_verification
    check (verification_status in ('PROVISIONAL', 'CONFIRMED', 'REFUTED'));
alter table encounter_diagnoses add constraint ck_enc_diag_status
    check (diagnosis_status in ('ACTIVE', 'EXCLUDED', 'ENTERED_IN_ERROR'));
create index idx_enc_diag_current on encounter_diagnoses
    (tenant_id, encounter_id, diagnosis_status, diagnosis_type, recorded_at);

create table encounter_identity_checks (
    id bigint primary key,
    tenant_id bigint not null,
    resident_id bigint not null,
    encounter_id bigint not null,
    check_scenario varchar(32) not null,
    factor_results_json text not null,
    result varchar(16) not null,
    practitioner_id bigint,
    user_id bigint,
    terminal_code varchar(128),
    command_code varchar(128) not null,
    occurred_at timestamp with time zone not null,
    constraint fk_enc_id_check_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_enc_id_check_resident foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_enc_id_check_encounter foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint fk_enc_id_check_pract foreign key (tenant_id, practitioner_id) references practitioners(tenant_id, id),
    constraint fk_enc_id_check_user foreign key (tenant_id, user_id) references user_accounts(tenant_id, id),
    constraint uk_enc_id_check_command unique (tenant_id, encounter_id, command_code),
    constraint ck_enc_id_check_scenario check (check_scenario in ('START', 'RESUME', 'PATIENT_SWITCH', 'HIGH_RISK')),
    constraint ck_enc_id_check_result check (result in ('PASS', 'FAIL'))
);
create index idx_enc_id_check_time on encounter_identity_checks (tenant_id, encounter_id, occurred_at);

create table encounter_status_events (
    id bigint primary key,
    tenant_id bigint not null,
    encounter_id bigint not null,
    status_from varchar(32),
    status_to varchar(32) not null,
    expected_revision bigint not null,
    practitioner_id bigint,
    user_id bigint,
    organization_id bigint not null,
    department_id bigint not null,
    command_code varchar(128) not null,
    reason varchar(1000),
    occurred_at timestamp with time zone not null,
    constraint fk_enc_status_evt_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_enc_status_evt_encounter foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint fk_enc_status_evt_pract foreign key (tenant_id, practitioner_id) references practitioners(tenant_id, id),
    constraint fk_enc_status_evt_user foreign key (tenant_id, user_id) references user_accounts(tenant_id, id),
    constraint fk_enc_status_evt_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_enc_status_evt_dept foreign key (tenant_id, organization_id, department_id)
        references departments(tenant_id, organization_id, id),
    constraint uk_enc_status_evt_command unique (tenant_id, encounter_id, command_code)
);
create index idx_enc_status_evt_time on encounter_status_events (tenant_id, encounter_id, occurred_at);

create table encounter_work_sessions (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    encounter_id bigint not null,
    practitioner_id bigint,
    user_id bigint,
    terminal_code varchar(128),
    status varchar(16) not null,
    started_at timestamp with time zone not null,
    heartbeat_at timestamp with time zone not null,
    closed_at timestamp with time zone,
    close_reason varchar(32),
    constraint fk_enc_work_session_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_enc_work_session_encounter foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint fk_enc_work_session_pract foreign key (tenant_id, practitioner_id) references practitioners(tenant_id, id),
    constraint fk_enc_work_session_user foreign key (tenant_id, user_id) references user_accounts(tenant_id, id),
    constraint ck_enc_work_session_status check (status in ('ACTIVE', 'CLOSED', 'EXPIRED')),
    constraint ck_enc_work_session_close check (
        (status = 'ACTIVE' and closed_at is null and close_reason is null) or
        (status in ('CLOSED', 'EXPIRED') and closed_at is not null and close_reason is not null)
    )
);
create index idx_enc_work_session_current on encounter_work_sessions (tenant_id, encounter_id, status, heartbeat_at);

create table encounter_diagnosis_revisions (
    id bigint primary key,
    tenant_id bigint not null,
    encounter_diagnosis_id bigint not null,
    encounter_id bigint not null,
    business_version_no integer not null,
    change_type varchar(24) not null,
    diagnosis_type varchar(24) not null,
    verification_status varchar(32) not null,
    diagnosis_status varchar(32) not null,
    code_snapshot varchar(64) not null,
    display_snapshot varchar(200) not null,
    clinical_note varchar(1000),
    change_reason varchar(1000) not null,
    practitioner_id bigint,
    user_id bigint,
    occurred_at timestamp with time zone not null,
    constraint fk_enc_diag_rev_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_enc_diag_rev_diag foreign key (tenant_id, encounter_diagnosis_id)
        references encounter_diagnoses(tenant_id, id),
    constraint fk_enc_diag_rev_encounter foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint fk_enc_diag_rev_pract foreign key (tenant_id, practitioner_id) references practitioners(tenant_id, id),
    constraint fk_enc_diag_rev_user foreign key (tenant_id, user_id) references user_accounts(tenant_id, id),
    constraint uk_enc_diag_rev_version unique (tenant_id, encounter_diagnosis_id, business_version_no),
    constraint ck_enc_diag_rev_change check (change_type in ('ADDED', 'UPDATED', 'REORDERED', 'EXCLUDED', 'RESTORED'))
);
create index idx_enc_diag_rev_history on encounter_diagnosis_revisions
    (tenant_id, encounter_id, occurred_at);

create table encounter_completion_checks (
    id bigint primary key,
    tenant_id bigint not null,
    encounter_id bigint not null,
    expected_revision bigint not null,
    result varchar(16) not null,
    command_code varchar(128) not null,
    practitioner_id bigint,
    user_id bigint,
    checked_at timestamp with time zone not null,
    constraint fk_enc_completion_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_enc_completion_encounter foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint fk_enc_completion_pract foreign key (tenant_id, practitioner_id) references practitioners(tenant_id, id),
    constraint fk_enc_completion_user foreign key (tenant_id, user_id) references user_accounts(tenant_id, id),
    constraint uk_enc_completion_tenant_id unique (tenant_id, id),
    constraint uk_enc_completion_command unique (tenant_id, encounter_id, command_code),
    constraint ck_enc_completion_result check (result in ('PASS', 'BLOCKED'))
);
create index idx_enc_completion_latest on encounter_completion_checks (tenant_id, encounter_id, checked_at);

create table encounter_completion_issues (
    id bigint primary key,
    tenant_id bigint not null,
    completion_check_id bigint not null,
    issue_code varchar(64) not null,
    severity varchar(16) not null,
    description varchar(1000) not null,
    constraint fk_enc_completion_issue_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_enc_completion_issue_check foreign key (tenant_id, completion_check_id)
        references encounter_completion_checks(tenant_id, id),
    constraint uk_enc_completion_issue unique (tenant_id, completion_check_id, issue_code),
    constraint ck_enc_completion_severity check (severity in ('BLOCKER', 'WARNING'))
);
