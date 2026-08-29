create table residents (
    id bigint primary key,
    tenant_id bigint not null,
    health_record_no varchar(32) not null,
    full_name varchar(100) not null,
    national_id varchar(32) not null,
    gender varchar(16) not null,
    birth_date date not null,
    phone varchar(32),
    created_at timestamp with time zone not null,
    created_by varchar(100) not null,
    constraint uk_resident_national_id unique (tenant_id, national_id),
    constraint uk_resident_record_no unique (tenant_id, health_record_no)
);

create index idx_resident_tenant_name on residents (tenant_id, full_name);

create table encounters (
    id bigint primary key,
    tenant_id bigint not null,
    resident_id bigint not null,
    encounter_no varchar(32) not null,
    organization_id bigint not null,
    department_id bigint not null,
    clinician_id varchar(100),
    status varchar(24) not null,
    chief_complaint varchar(1000),
    systolic integer,
    diastolic integer,
    registered_at timestamp with time zone not null,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    version bigint not null default 0,
    constraint fk_encounter_resident foreign key (resident_id) references residents(id),
    constraint uk_encounter_no unique (tenant_id, encounter_no)
);

create index idx_encounter_resident on encounters (tenant_id, resident_id, registered_at);

create table encounter_diagnoses (
    id bigint primary key,
    tenant_id bigint not null,
    encounter_id bigint not null,
    code varchar(64) not null,
    display varchar(200) not null,
    diagnosis_type varchar(24) not null,
    recorded_at timestamp with time zone not null,
    constraint fk_diagnosis_encounter foreign key (encounter_id) references encounters(id)
);

create index idx_diagnosis_encounter on encounter_diagnoses (tenant_id, encounter_id);

create table health_events (
    id bigint primary key,
    tenant_id bigint not null,
    resident_id bigint not null,
    encounter_id bigint,
    event_type varchar(64) not null,
    summary varchar(500) not null,
    payload_json text not null,
    occurred_at timestamp with time zone not null,
    recorded_at timestamp with time zone not null,
    recorded_by varchar(100) not null,
    constraint fk_health_event_resident foreign key (resident_id) references residents(id)
);

create index idx_health_event_timeline on health_events (tenant_id, resident_id, occurred_at desc);

create table audit_logs (
    id bigint primary key,
    tenant_id bigint,
    actor varchar(100) not null,
    http_method varchar(16) not null,
    request_path varchar(500) not null,
    response_status integer not null,
    correlation_id varchar(64) not null,
    occurred_at timestamp with time zone not null
);

create index idx_audit_tenant_time on audit_logs (tenant_id, occurred_at desc);

