create table tenants (
    id number(19,0) primary key,
    code varchar2(64 char) not null,
    name varchar2(200 char) not null,
    timezone_code varchar2(64 char) default 'Asia/Shanghai' not null,
    status varchar2(24 char) not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    revision number(19,0) default 0 not null,
    constraint uk_tenant_code unique (code)
);

create table organizations (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    parent_id number(19,0),
    merged_to_id number(19,0),
    code varchar2(64 char) not null,
    name varchar2(200 char) not null,
    organization_kind varchar2(32 char) not null,
    organization_type varchar2(64 char) not null,
    status varchar2(24 char) not null,
    valid_from date not null,
    valid_to date,
    created_at timestamp with time zone not null,
    created_by number(19,0),
    updated_at timestamp with time zone not null,
    updated_by number(19,0),
    revision number(19,0) default 0 not null,
    constraint fk_organization_tenant foreign key (tenant_id) references tenants(id),
    constraint uk_organization_tenant_id unique (tenant_id, id),
    constraint fk_organization_parent_tenant foreign key (tenant_id, parent_id)
        references organizations(tenant_id, id),
    constraint fk_organization_merged_to_tenant foreign key (tenant_id, merged_to_id)
        references organizations(tenant_id, id),
    constraint uk_organization_code unique (tenant_id, code)
);

create index idx_organization_parent on organizations (tenant_id, parent_id);
create index idx_organization_kind_status on organizations (tenant_id, organization_kind, status);

create table practitioners (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    code varchar2(64 char) not null,
    full_name varchar2(100 char) not null,
    gender varchar2(32 char),
    identity_hash varchar2(128 char),
    status varchar2(24 char) not null,
    created_at timestamp with time zone not null,
    created_by number(19,0),
    updated_at timestamp with time zone not null,
    updated_by number(19,0),
    revision number(19,0) default 0 not null,
    constraint fk_practitioner_tenant foreign key (tenant_id) references tenants(id),
    constraint uk_practitioner_tenant_id unique (tenant_id, id),
    constraint uk_practitioner_code unique (tenant_id, code)
);

create index idx_practitioner_identity_hash on practitioners (tenant_id, identity_hash);

create table employments (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    practitioner_id number(19,0) not null,
    organization_id number(19,0) not null,
    code varchar2(64 char) not null,
    employment_type varchar2(32 char) not null,
    primary_employment number(1,0) not null,
    hire_date date not null,
    leave_date date,
    status varchar2(24 char) not null,
    created_at timestamp with time zone not null,
    created_by number(19,0),
    updated_at timestamp with time zone not null,
    updated_by number(19,0),
    revision number(19,0) default 0 not null,
    constraint fk_employment_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_employment_practitioner_tenant foreign key (tenant_id, practitioner_id)
        references practitioners(tenant_id, id),
    constraint fk_employment_organization_tenant foreign key (tenant_id, organization_id)
        references organizations(tenant_id, id),
    constraint uk_employment_tenant_id unique (tenant_id, id),
    constraint uk_employment_code unique (tenant_id, code),
    constraint uk_employment_period unique (tenant_id, practitioner_id, organization_id, hire_date)
);

create index idx_employment_practitioner on employments (tenant_id, practitioner_id, status, primary_employment);

create table positions (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    code varchar2(64 char) not null,
    name varchar2(128 char) not null,
    position_type varchar2(32 char) not null,
    duty_description varchar2(1000 char),
    status varchar2(24 char) not null,
    created_at timestamp with time zone not null,
    created_by number(19,0),
    updated_at timestamp with time zone not null,
    updated_by number(19,0),
    revision number(19,0) default 0 not null,
    constraint fk_position_tenant foreign key (tenant_id) references tenants(id),
    constraint uk_position_tenant_id unique (tenant_id, id),
    constraint uk_position_code unique (tenant_id, code)
);

create table staff_assignments (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    employment_id number(19,0) not null,
    organization_id number(19,0) not null,
    position_id number(19,0) not null,
    code varchar2(64 char) not null,
    assignment_type varchar2(32 char) not null,
    specialty_code varchar2(64 char),
    primary_assignment number(1,0) not null,
    workload_percent number(5,2),
    status varchar2(24 char) not null,
    valid_from date not null,
    valid_to date,
    created_at timestamp with time zone not null,
    created_by number(19,0),
    updated_at timestamp with time zone not null,
    updated_by number(19,0),
    revision number(19,0) default 0 not null,
    constraint fk_assignment_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_assignment_employment_tenant foreign key (tenant_id, employment_id)
        references employments(tenant_id, id),
    constraint fk_assignment_organization_tenant foreign key (tenant_id, organization_id)
        references organizations(tenant_id, id),
    constraint fk_assignment_position_tenant foreign key (tenant_id, position_id)
        references positions(tenant_id, id),
    constraint uk_staff_assignment_tenant_id unique (tenant_id, id),
    constraint uk_assignment_code unique (tenant_id, code),
    constraint uk_assignment_period unique
        (tenant_id, employment_id, organization_id, position_id, valid_from),
    constraint ck_assignment_workload check
        (workload_percent is null or (workload_percent >= 0 and workload_percent <= 100))
);

create index idx_assignment_employment on staff_assignments
    (tenant_id, employment_id, status, primary_assignment);
create index idx_assignment_organization on staff_assignments
    (tenant_id, organization_id, status, primary_assignment);

create table code_systems (
    id number(19,0) primary key,
    scope_type varchar2(24 char) not null,
    scope_id number(19,0) not null,
    code varchar2(100 char) not null,
    name varchar2(200 char) not null,
    canonical_uri varchar2(500 char),
    version_code varchar2(64 char) not null,
    status varchar2(24 char) not null,
    effective_from date not null,
    effective_to date,
    created_at timestamp with time zone not null,
    constraint uk_code_system_version unique (scope_type, scope_id, code, version_code)
);

create table concepts (
    id number(19,0) primary key,
    code_system_id number(19,0) not null,
    code varchar2(100 char) not null,
    display varchar2(300 char) not null,
    definition varchar2(1000 char),
    status varchar2(24 char) not null,
    effective_from date not null,
    effective_to date,
    created_at timestamp with time zone not null,
    constraint fk_concept_code_system foreign key (code_system_id) references code_systems(id),
    constraint uk_concept_code unique (code_system_id, code)
);

create index idx_concept_display on concepts (code_system_id, display);

create table value_sets (
    id number(19,0) primary key,
    scope_type varchar2(24 char) not null,
    scope_id number(19,0) not null,
    code varchar2(100 char) not null,
    name varchar2(200 char) not null,
    version_code varchar2(64 char) not null,
    status varchar2(24 char) not null,
    effective_from date not null,
    effective_to date,
    created_at timestamp with time zone not null,
    constraint uk_value_set_version unique (scope_type, scope_id, code, version_code)
);

create table value_set_members (
    id number(19,0) primary key,
    value_set_id number(19,0) not null,
    concept_id number(19,0) not null,
    sort_order number(10,0) not null,
    created_at timestamp with time zone not null,
    constraint fk_value_set_member_set foreign key (value_set_id) references value_sets(id),
    constraint fk_value_set_member_concept foreign key (concept_id) references concepts(id),
    constraint uk_value_set_member unique (value_set_id, concept_id)
);

create table concept_mappings (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    source_system varchar2(100 char) not null,
    source_code varchar2(100 char) not null,
    target_concept_id number(19,0) not null,
    equivalence varchar2(24 char) not null,
    status varchar2(24 char) not null,
    valid_from date not null,
    valid_to date,
    created_at timestamp with time zone not null,
    constraint fk_mapping_concept foreign key (target_concept_id) references concepts(id),
    constraint uk_concept_mapping unique (tenant_id, source_system, source_code, valid_from)
);

create table configuration_definitions (
    id number(19,0) primary key,
    config_key varchar2(160 char) not null,
    name varchar2(200 char) not null,
    description varchar2(1000 char),
    value_type varchar2(24 char) not null,
    default_value_json clob,
    allowed_scopes varchar2(200 char) not null,
    status varchar2(24 char) not null,
    created_at timestamp with time zone not null,
    constraint uk_configuration_key unique (config_key)
);

create table configuration_revisions (
    id number(19,0) primary key,
    definition_id number(19,0) not null,
    scope_type varchar2(24 char) not null,
    scope_id number(19,0) not null,
    revision number(10,0) not null,
    value_json clob not null,
    status varchar2(24 char) not null,
    effective_from timestamp with time zone,
    effective_to timestamp with time zone,
    change_reason varchar2(500 char) not null,
    created_by varchar2(100 char) not null,
    created_at timestamp with time zone not null,
    published_by varchar2(100 char),
    published_at timestamp with time zone,
    constraint fk_configuration_definition foreign key (definition_id) references configuration_definitions(id),
    constraint uk_configuration_revision unique (definition_id, scope_type, scope_id, revision)
);

create index idx_configuration_resolve on configuration_revisions
    (definition_id, scope_type, scope_id, status, effective_from);

create table outbox_events (
    event_id number(19,0) primary key,
    tenant_id number(19,0) not null,
    organization_id number(19,0),
    event_type varchar2(160 char) not null,
    event_version number(10,0) not null,
    aggregate_type varchar2(100 char) not null,
    aggregate_id number(19,0) not null,
    aggregate_version number(19,0) not null,
    subject_id number(19,0),
    occurred_at timestamp with time zone not null,
    recorded_at timestamp with time zone not null,
    actor varchar2(100 char) not null,
    source varchar2(100 char) not null,
    correlation_id varchar2(64 char) not null,
    causation_id number(19,0),
    payload_json clob not null,
    schema_version number(10,0) not null,
    publication_status varchar2(24 char) not null,
    published_at timestamp with time zone,
    attempt_count number(10,0) default 0 not null,
    last_error varchar2(1000 char)
);

create index idx_outbox_pending on outbox_events (publication_status, recorded_at);
create index idx_outbox_aggregate on outbox_events (tenant_id, aggregate_type, aggregate_id, aggregate_version);

alter table health_events add source_event_id number(19,0);
alter table health_events add event_version number(10,0) default 1 not null;
alter table health_events add source varchar2(100 char) default 'legacy' not null;
alter table health_events add correlation_id varchar2(64 char) default 'legacy' not null;
create unique index uk_health_event_source_event on health_events (source_event_id);

insert into code_systems (
    id, scope_type, scope_id, code, name, canonical_uri, version_code, status, effective_from, effective_to, created_at
) values (
    '362387869790214', 'PRODUCT', '0',
    'RHN.GENDER', 'RHN 性别代码', 'urn:rhn:codesystem:gender', '1.0', 'ACTIVE', date '2026-01-01', null, current_timestamp
);

insert all
    into concepts (id, code_system_id, code, display, definition, status, effective_from, effective_to, created_at)
        values ('362387869790215', '362387869790214', 'MALE', '男', null, 'ACTIVE', date '2026-01-01', null, current_timestamp)
    into concepts (id, code_system_id, code, display, definition, status, effective_from, effective_to, created_at)
        values ('362387869790216', '362387869790214', 'FEMALE', '女', null, 'ACTIVE', date '2026-01-01', null, current_timestamp)
    into concepts (id, code_system_id, code, display, definition, status, effective_from, effective_to, created_at)
        values ('362387869790217', '362387869790214', 'UNKNOWN', '未知', null, 'ACTIVE', date '2026-01-01', null, current_timestamp)
select 1 from dual;

insert into value_sets (
    id, scope_type, scope_id, code, name, version_code, status, effective_from, effective_to, created_at
) values (
    '362387869790218', 'PRODUCT', '0',
    'RHN.RESIDENT.GENDER', '居民性别值域', '1.0', 'ACTIVE', date '2026-01-01', null, current_timestamp
);

insert all
    into value_set_members (id, value_set_id, concept_id, sort_order, created_at)
        values ('362387869790219', '362387869790218', '362387869790215', 10, current_timestamp)
    into value_set_members (id, value_set_id, concept_id, sort_order, created_at)
        values ('362387869790220', '362387869790218', '362387869790216', 20, current_timestamp)
    into value_set_members (id, value_set_id, concept_id, sort_order, created_at)
        values ('362387869790221', '362387869790218', '362387869790217', 30, current_timestamp)
select 1 from dual;
