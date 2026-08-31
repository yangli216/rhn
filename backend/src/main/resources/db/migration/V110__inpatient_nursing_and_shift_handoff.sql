-- Append-only inpatient nursing facts and formally signed ward shift handoffs.
create table inpatient_nursing_records (
    id bigint primary key,
    tenant_id bigint not null,
    organization_id bigint not null,
    department_id bigint not null,
    episode_id bigint not null,
    encounter_id bigint not null,
    resident_id bigint not null,
    occurred_at timestamp with time zone not null,
    record_type varchar(32) not null,
    content_json clob not null,
    observation_summary_json clob,
    content_schema varchar(128) not null,
    command_code varchar(128) not null,
    request_hash varchar(64) not null,
    recorded_by_subject_id bigint not null,
    recorded_by_practitioner_id bigint,
    recorder_name varchar(300) not null,
    recorded_at timestamp with time zone not null,
    content_digest_algorithm varchar(64) not null,
    content_digest varchar(512) not null,
    integrity_evidence_id bigint not null,
    constraint fk_inr_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inr_department foreign key (tenant_id, organization_id, department_id)
        references departments(tenant_id, organization_id, id),
    constraint fk_inr_episode foreign key (tenant_id, episode_id) references care_episodes(tenant_id, id),
    constraint fk_inr_encounter foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint fk_inr_evidence foreign key (tenant_id, integrity_evidence_id)
        references cryptographic_evidence(tenant_id, id),
    constraint uk_inr_tenant_id unique (tenant_id, id),
    constraint uk_inr_command unique (tenant_id, command_code),
    constraint uk_inr_evidence unique (integrity_evidence_id),
    constraint ck_inr_type check (record_type in (
        'ROUTINE', 'CONDITION', 'INTERVENTION', 'MEDICATION', 'SAFETY', 'EDUCATION', 'OTHER'
    ))
);

create index idx_inr_episode_time on inpatient_nursing_records
    (tenant_id, episode_id, occurred_at, id);
create index idx_inr_ward_time on inpatient_nursing_records
    (tenant_id, organization_id, department_id, occurred_at, id);

create table inpatient_shift_handoffs (
    id bigint primary key,
    revision bigint not null,
    tenant_id bigint not null,
    organization_id bigint not null,
    department_id bigint not null,
    shift_from timestamp with time zone not null,
    shift_to timestamp with time zone not null,
    ward_summary varchar(2000) not null,
    general_items_json clob not null,
    status varchar(32) not null,
    create_command_code varchar(128) not null,
    create_request_hash varchar(64) not null,
    created_by_subject_id bigint not null,
    created_by_practitioner_id bigint,
    creator_name varchar(300) not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    content_schema varchar(128) not null,
    content_digest_algorithm varchar(64) not null,
    content_digest varchar(512) not null,
    integrity_evidence_id bigint not null,
    constraint fk_ish_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_ish_department foreign key (tenant_id, organization_id, department_id)
        references departments(tenant_id, organization_id, id),
    constraint fk_ish_evidence foreign key (tenant_id, integrity_evidence_id)
        references cryptographic_evidence(tenant_id, id),
    constraint uk_ish_tenant_id unique (tenant_id, id),
    constraint uk_ish_command unique (tenant_id, create_command_code),
    constraint uk_ish_evidence unique (integrity_evidence_id),
    constraint ck_ish_status check (status in ('DRAFT', 'SUBMITTED', 'ACCEPTED')),
    constraint ck_ish_shift check (shift_to > shift_from)
);

create index idx_ish_ward_shift on inpatient_shift_handoffs
    (tenant_id, organization_id, department_id, shift_from, shift_to, status);

create table inpatient_shift_handoff_items (
    id bigint primary key,
    tenant_id bigint not null,
    handoff_id bigint not null,
    episode_id bigint not null,
    encounter_id bigint not null,
    resident_id bigint not null,
    resident_name_snapshot varchar(300) not null,
    bed_no_snapshot varchar(100),
    situation varchar(2000) not null,
    pending_actions_json clob not null,
    risk_flags_json clob not null,
    sort_order integer not null,
    constraint fk_ishi_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_ishi_handoff foreign key (tenant_id, handoff_id)
        references inpatient_shift_handoffs(tenant_id, id),
    constraint fk_ishi_episode foreign key (tenant_id, episode_id) references care_episodes(tenant_id, id),
    constraint fk_ishi_encounter foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint uk_ishi_tenant_id unique (tenant_id, id),
    constraint uk_ishi_episode unique (tenant_id, handoff_id, episode_id)
);

create index idx_ishi_handoff on inpatient_shift_handoff_items
    (tenant_id, handoff_id, sort_order, id);

create table inpatient_shift_handoff_signatures (
    id bigint primary key,
    tenant_id bigint not null,
    handoff_id bigint not null,
    stage varchar(32) not null,
    signature_meaning varchar(64) not null,
    signer_subject_id bigint not null,
    signer_practitioner_id bigint,
    signer_name varchar(300) not null,
    signed_at timestamp with time zone not null,
    signature_evidence_id bigint not null,
    command_code varchar(128) not null,
    request_hash varchar(64) not null,
    constraint fk_ishs_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_ishs_handoff foreign key (tenant_id, handoff_id)
        references inpatient_shift_handoffs(tenant_id, id),
    constraint fk_ishs_evidence foreign key (tenant_id, signature_evidence_id)
        references cryptographic_evidence(tenant_id, id),
    constraint uk_ishs_tenant_id unique (tenant_id, id),
    constraint uk_ishs_stage unique (tenant_id, handoff_id, stage),
    constraint uk_ishs_command unique (tenant_id, command_code),
    constraint uk_ishs_evidence unique (signature_evidence_id),
    constraint ck_ishs_stage check (stage in ('HANDOVER', 'TAKEOVER'))
);
