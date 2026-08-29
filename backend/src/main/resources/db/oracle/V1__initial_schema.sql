create table residents (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    health_record_no varchar2(32 char) not null,
    full_name varchar2(100 char) not null,
    national_id varchar2(32 char) not null,
    gender varchar2(16 char) not null,
    birth_date date not null,
    phone varchar2(32 char),
    created_at timestamp with time zone not null,
    created_by varchar2(100 char) not null,
    constraint uk_resident_national_id unique (tenant_id, national_id),
    constraint uk_resident_record_no unique (tenant_id, health_record_no)
);

create index idx_resident_tenant_name on residents (tenant_id, full_name);

create table encounters (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    resident_id number(19,0) not null,
    encounter_no varchar2(32 char) not null,
    organization_id number(19,0) not null,
    department_id number(19,0) not null,
    clinician_id varchar2(100 char),
    status varchar2(24 char) not null,
    chief_complaint varchar2(1000 char),
    systolic number(10,0),
    diastolic number(10,0),
    registered_at timestamp with time zone not null,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    version number(19,0) default 0 not null,
    constraint fk_encounter_resident foreign key (resident_id) references residents(id),
    constraint uk_encounter_no unique (tenant_id, encounter_no)
);

create index idx_encounter_resident on encounters (tenant_id, resident_id, registered_at);

create table encounter_diagnoses (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    encounter_id number(19,0) not null,
    code varchar2(64 char) not null,
    display varchar2(200 char) not null,
    diagnosis_type varchar2(24 char) not null,
    recorded_at timestamp with time zone not null,
    constraint fk_diagnosis_encounter foreign key (encounter_id) references encounters(id)
);

create index idx_diagnosis_encounter on encounter_diagnoses (tenant_id, encounter_id);

create table health_events (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    resident_id number(19,0) not null,
    encounter_id number(19,0),
    event_type varchar2(64 char) not null,
    summary varchar2(500 char) not null,
    payload_json clob not null,
    occurred_at timestamp with time zone not null,
    recorded_at timestamp with time zone not null,
    recorded_by varchar2(100 char) not null,
    constraint fk_health_event_resident foreign key (resident_id) references residents(id)
);

create index idx_health_event_timeline on health_events (tenant_id, resident_id, occurred_at desc);

create table audit_logs (
    id number(19,0) primary key,
    tenant_id number(19,0),
    actor varchar2(100 char) not null,
    http_method varchar2(16 char) not null,
    request_path varchar2(500 char) not null,
    response_status number(10,0) not null,
    correlation_id varchar2(64 char) not null,
    occurred_at timestamp with time zone not null
);

create index idx_audit_tenant_time on audit_logs (tenant_id, occurred_at desc);

