create table tenants (
    id bigint primary key,
    code varchar(64) not null,
    name varchar(200) not null,
    timezone_code varchar(64) not null default 'Asia/Shanghai',
    status varchar(24) not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    revision bigint not null default 0,
    constraint uk_tenant_code unique (code)
);

create table organizations (
    id bigint primary key,
    tenant_id bigint not null,
    parent_id bigint,
    merged_to_id bigint,
    code varchar(64) not null,
    name varchar(200) not null,
    organization_kind varchar(32) not null,
    organization_type varchar(64) not null,
    status varchar(24) not null,
    valid_from date not null,
    valid_to date,
    created_at timestamp with time zone not null,
    created_by bigint,
    updated_at timestamp with time zone not null,
    updated_by bigint,
    revision bigint not null default 0,
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
    id bigint primary key,
    tenant_id bigint not null,
    code varchar(64) not null,
    full_name varchar(100) not null,
    gender varchar(32),
    identity_hash varchar(128),
    status varchar(24) not null,
    created_at timestamp with time zone not null,
    created_by bigint,
    updated_at timestamp with time zone not null,
    updated_by bigint,
    revision bigint not null default 0,
    constraint fk_practitioner_tenant foreign key (tenant_id) references tenants(id),
    constraint uk_practitioner_tenant_id unique (tenant_id, id),
    constraint uk_practitioner_code unique (tenant_id, code)
);

create index idx_practitioner_identity_hash on practitioners (tenant_id, identity_hash);

create table employments (
    id bigint primary key,
    tenant_id bigint not null,
    practitioner_id bigint not null,
    organization_id bigint not null,
    code varchar(64) not null,
    employment_type varchar(32) not null,
    primary_employment boolean not null,
    hire_date date not null,
    leave_date date,
    status varchar(24) not null,
    created_at timestamp with time zone not null,
    created_by bigint,
    updated_at timestamp with time zone not null,
    updated_by bigint,
    revision bigint not null default 0,
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
    id bigint primary key,
    tenant_id bigint not null,
    code varchar(64) not null,
    name varchar(128) not null,
    position_type varchar(32) not null,
    duty_description varchar(1000),
    status varchar(24) not null,
    created_at timestamp with time zone not null,
    created_by bigint,
    updated_at timestamp with time zone not null,
    updated_by bigint,
    revision bigint not null default 0,
    constraint fk_position_tenant foreign key (tenant_id) references tenants(id),
    constraint uk_position_tenant_id unique (tenant_id, id),
    constraint uk_position_code unique (tenant_id, code)
);

create table staff_assignments (
    id bigint primary key,
    tenant_id bigint not null,
    employment_id bigint not null,
    organization_id bigint not null,
    position_id bigint not null,
    code varchar(64) not null,
    assignment_type varchar(32) not null,
    specialty_code varchar(64),
    primary_assignment boolean not null,
    workload_percent decimal(5,2),
    status varchar(24) not null,
    valid_from date not null,
    valid_to date,
    created_at timestamp with time zone not null,
    created_by bigint,
    updated_at timestamp with time zone not null,
    updated_by bigint,
    revision bigint not null default 0,
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
    id bigint primary key,
    scope_type varchar(24) not null,
    scope_id bigint not null,
    code varchar(100) not null,
    name varchar(200) not null,
    canonical_uri varchar(500),
    version_code varchar(64) not null,
    status varchar(24) not null,
    effective_from date not null,
    effective_to date,
    created_at timestamp with time zone not null,
    constraint uk_code_system_version unique (scope_type, scope_id, code, version_code)
);

create table concepts (
    id bigint primary key,
    code_system_id bigint not null,
    code varchar(100) not null,
    display varchar(300) not null,
    definition varchar(1000),
    status varchar(24) not null,
    effective_from date not null,
    effective_to date,
    created_at timestamp with time zone not null,
    constraint fk_concept_code_system foreign key (code_system_id) references code_systems(id),
    constraint uk_concept_code unique (code_system_id, code)
);

create index idx_concept_display on concepts (code_system_id, display);

create table value_sets (
    id bigint primary key,
    scope_type varchar(24) not null,
    scope_id bigint not null,
    code varchar(100) not null,
    name varchar(200) not null,
    version_code varchar(64) not null,
    status varchar(24) not null,
    effective_from date not null,
    effective_to date,
    created_at timestamp with time zone not null,
    constraint uk_value_set_version unique (scope_type, scope_id, code, version_code)
);

create table value_set_members (
    id bigint primary key,
    value_set_id bigint not null,
    concept_id bigint not null,
    sort_order integer not null,
    created_at timestamp with time zone not null,
    constraint fk_value_set_member_set foreign key (value_set_id) references value_sets(id),
    constraint fk_value_set_member_concept foreign key (concept_id) references concepts(id),
    constraint uk_value_set_member unique (value_set_id, concept_id)
);

create table concept_mappings (
    id bigint primary key,
    tenant_id bigint not null,
    source_system varchar(100) not null,
    source_code varchar(100) not null,
    target_concept_id bigint not null,
    equivalence varchar(24) not null,
    status varchar(24) not null,
    valid_from date not null,
    valid_to date,
    created_at timestamp with time zone not null,
    constraint fk_mapping_concept foreign key (target_concept_id) references concepts(id),
    constraint uk_concept_mapping unique (tenant_id, source_system, source_code, valid_from)
);

create table configuration_definitions (
    id bigint primary key,
    config_key varchar(160) not null,
    name varchar(200) not null,
    description varchar(1000),
    value_type varchar(24) not null,
    default_value_json text,
    allowed_scopes varchar(200) not null,
    status varchar(24) not null,
    created_at timestamp with time zone not null,
    constraint uk_configuration_key unique (config_key)
);

create table configuration_revisions (
    id bigint primary key,
    definition_id bigint not null,
    scope_type varchar(24) not null,
    scope_id bigint not null,
    revision integer not null,
    value_json text not null,
    status varchar(24) not null,
    effective_from timestamp with time zone,
    effective_to timestamp with time zone,
    change_reason varchar(500) not null,
    created_by varchar(100) not null,
    created_at timestamp with time zone not null,
    published_by varchar(100),
    published_at timestamp with time zone,
    constraint fk_configuration_definition foreign key (definition_id) references configuration_definitions(id),
    constraint uk_configuration_revision unique (definition_id, scope_type, scope_id, revision)
);

create index idx_configuration_resolve on configuration_revisions
    (definition_id, scope_type, scope_id, status, effective_from);

create table outbox_events (
    event_id bigint primary key,
    tenant_id bigint not null,
    organization_id bigint,
    event_type varchar(160) not null,
    event_version integer not null,
    aggregate_type varchar(100) not null,
    aggregate_id bigint not null,
    aggregate_version bigint not null,
    subject_id bigint,
    occurred_at timestamp with time zone not null,
    recorded_at timestamp with time zone not null,
    actor varchar(100) not null,
    source varchar(100) not null,
    correlation_id varchar(64) not null,
    causation_id bigint,
    payload_json text not null,
    schema_version integer not null,
    publication_status varchar(24) not null,
    published_at timestamp with time zone,
    attempt_count integer not null default 0,
    last_error varchar(1000)
);

create index idx_outbox_pending on outbox_events (publication_status, recorded_at);
create index idx_outbox_aggregate on outbox_events (tenant_id, aggregate_type, aggregate_id, aggregate_version);

alter table health_events add column source_event_id bigint;
alter table health_events add column event_version integer not null default 1;
alter table health_events add column source varchar(100) not null default 'legacy';
alter table health_events add column correlation_id varchar(64) not null default '';
create unique index uk_health_event_source_event on health_events (source_event_id);

insert into code_systems (
    id, scope_type, scope_id, code, name, canonical_uri, version_code, status, effective_from, effective_to, created_at
) values (
    '362387869790214', 'PRODUCT', '0',
    'RHN.GENDER', 'RHN 性别代码', 'urn:rhn:codesystem:gender', '1.0', 'ACTIVE', '2026-01-01', null, current_timestamp
);

insert into concepts (id, code_system_id, code, display, definition, status, effective_from, effective_to, created_at) values
    ('362387869790215', '362387869790214', 'MALE', '男', null, 'ACTIVE', '2026-01-01', null, current_timestamp),
    ('362387869790216', '362387869790214', 'FEMALE', '女', null, 'ACTIVE', '2026-01-01', null, current_timestamp),
    ('362387869790217', '362387869790214', 'UNKNOWN', '未知', null, 'ACTIVE', '2026-01-01', null, current_timestamp);

insert into value_sets (
    id, scope_type, scope_id, code, name, version_code, status, effective_from, effective_to, created_at
) values (
    '362387869790218', 'PRODUCT', '0',
    'RHN.RESIDENT.GENDER', '居民性别值域', '1.0', 'ACTIVE', '2026-01-01', null, current_timestamp
);

insert into value_set_members (id, value_set_id, concept_id, sort_order, created_at) values
    ('362387869790219', '362387869790218', '362387869790215', 10, current_timestamp),
    ('362387869790220', '362387869790218', '362387869790216', 20, current_timestamp),
    ('362387869790221', '362387869790218', '362387869790217', 30, current_timestamp);
