-- Oracle form of append-only inpatient nursing facts and signed ward shift handoffs.
create table inpatient_nursing_records (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    organization_id number(19,0) not null,
    department_id number(19,0) not null,
    episode_id number(19,0) not null,
    encounter_id number(19,0) not null,
    resident_id number(19,0) not null,
    occurred_at timestamp with time zone not null,
    record_type varchar2(32 char) not null,
    content_json clob not null,
    observation_summary_json clob,
    content_schema varchar2(128 char) not null,
    command_code varchar2(128 char) not null,
    request_hash varchar2(64 char) not null,
    recorded_by_subject_id number(19,0) not null,
    recorded_by_practitioner_id number(19,0),
    recorder_name varchar2(300 char) not null,
    recorded_at timestamp with time zone not null,
    content_digest_algorithm varchar2(64 char) not null,
    content_digest varchar2(512 char) not null,
    integrity_evidence_id number(19,0) not null,
    constraint fk_inr_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inr_department foreign key (tenant_id,organization_id,department_id)
        references departments(tenant_id,organization_id,id),
    constraint fk_inr_episode foreign key (tenant_id,episode_id) references care_episodes(tenant_id,id),
    constraint fk_inr_encounter foreign key (tenant_id,encounter_id) references encounters(tenant_id,id),
    constraint fk_inr_evidence foreign key (tenant_id,integrity_evidence_id) references cryptographic_evidence(tenant_id,id),
    constraint uk_inr_tenant_id unique (tenant_id,id),
    constraint uk_inr_command unique (tenant_id,command_code),
    constraint uk_inr_evidence unique (integrity_evidence_id),
    constraint ck_inr_type check (record_type in (
        'ROUTINE','CONDITION','INTERVENTION','MEDICATION','SAFETY','EDUCATION','OTHER'
    ))
);
create index idx_inr_episode_time on inpatient_nursing_records (tenant_id,episode_id,occurred_at,id);
create index idx_inr_ward_time on inpatient_nursing_records (tenant_id,organization_id,department_id,occurred_at,id);

create table inpatient_shift_handoffs (
    id number(19,0) primary key,
    revision number(19,0) not null,
    tenant_id number(19,0) not null,
    organization_id number(19,0) not null,
    department_id number(19,0) not null,
    shift_from timestamp with time zone not null,
    shift_to timestamp with time zone not null,
    ward_summary varchar2(2000 char) not null,
    general_items_json clob not null,
    status varchar2(32 char) not null,
    create_command_code varchar2(128 char) not null,
    create_request_hash varchar2(64 char) not null,
    created_by_subject_id number(19,0) not null,
    created_by_practitioner_id number(19,0),
    creator_name varchar2(300 char) not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    content_schema varchar2(128 char) not null,
    content_digest_algorithm varchar2(64 char) not null,
    content_digest varchar2(512 char) not null,
    integrity_evidence_id number(19,0) not null,
    constraint fk_ish_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_ish_department foreign key (tenant_id,organization_id,department_id)
        references departments(tenant_id,organization_id,id),
    constraint fk_ish_evidence foreign key (tenant_id,integrity_evidence_id) references cryptographic_evidence(tenant_id,id),
    constraint uk_ish_tenant_id unique (tenant_id,id),
    constraint uk_ish_command unique (tenant_id,create_command_code),
    constraint uk_ish_evidence unique (integrity_evidence_id),
    constraint ck_ish_status check (status in ('DRAFT','SUBMITTED','ACCEPTED')),
    constraint ck_ish_shift check (shift_to > shift_from)
);
create index idx_ish_ward_shift on inpatient_shift_handoffs
    (tenant_id,organization_id,department_id,shift_from,shift_to,status);

create table inpatient_shift_handoff_items (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    handoff_id number(19,0) not null,
    episode_id number(19,0) not null,
    encounter_id number(19,0) not null,
    resident_id number(19,0) not null,
    resident_name_snapshot varchar2(300 char) not null,
    bed_no_snapshot varchar2(100 char),
    situation varchar2(2000 char) not null,
    pending_actions_json clob not null,
    risk_flags_json clob not null,
    sort_order number(10,0) not null,
    constraint fk_ishi_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_ishi_handoff foreign key (tenant_id,handoff_id) references inpatient_shift_handoffs(tenant_id,id),
    constraint fk_ishi_episode foreign key (tenant_id,episode_id) references care_episodes(tenant_id,id),
    constraint fk_ishi_encounter foreign key (tenant_id,encounter_id) references encounters(tenant_id,id),
    constraint uk_ishi_tenant_id unique (tenant_id,id),
    constraint uk_ishi_episode unique (tenant_id,handoff_id,episode_id)
);
create index idx_ishi_handoff on inpatient_shift_handoff_items (tenant_id,handoff_id,sort_order,id);

create table inpatient_shift_handoff_signatures (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    handoff_id number(19,0) not null,
    stage varchar2(32 char) not null,
    signature_meaning varchar2(64 char) not null,
    signer_subject_id number(19,0) not null,
    signer_practitioner_id number(19,0),
    signer_name varchar2(300 char) not null,
    signed_at timestamp with time zone not null,
    signature_evidence_id number(19,0) not null,
    command_code varchar2(128 char) not null,
    request_hash varchar2(64 char) not null,
    constraint fk_ishs_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_ishs_handoff foreign key (tenant_id,handoff_id) references inpatient_shift_handoffs(tenant_id,id),
    constraint fk_ishs_evidence foreign key (tenant_id,signature_evidence_id) references cryptographic_evidence(tenant_id,id),
    constraint uk_ishs_tenant_id unique (tenant_id,id),
    constraint uk_ishs_stage unique (tenant_id,handoff_id,stage),
    constraint uk_ishs_command unique (tenant_id,command_code),
    constraint uk_ishs_evidence unique (signature_evidence_id),
    constraint ck_ishs_stage check (stage in ('HANDOVER','TAKEOVER'))
);
