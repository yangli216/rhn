alter table service_requests add column service_type_snapshot varchar(32);
alter table service_requests add column specimen_type_snapshot varchar(64);
alter table service_requests add column examination_type_snapshot varchar(64);

update service_requests
set service_type_snapshot = (
    select si.service_type
    from care_requests cr
    join service_items si on si.tenant_id = cr.tenant_id and si.catalog_item_id = cr.catalog_item_id
    where cr.tenant_id = service_requests.tenant_id and cr.id = service_requests.request_id
);
update service_requests
set specimen_type_snapshot = (
    select si.specimen_type
    from care_requests cr
    join service_items si on si.tenant_id = cr.tenant_id and si.catalog_item_id = cr.catalog_item_id
    where cr.tenant_id = service_requests.tenant_id and cr.id = service_requests.request_id
);
update service_requests
set examination_type_snapshot = (
    select si.examination_type
    from care_requests cr
    join service_items si on si.tenant_id = cr.tenant_id and si.catalog_item_id = cr.catalog_item_id
    where cr.tenant_id = service_requests.tenant_id and cr.id = service_requests.request_id
);
update service_requests set service_type_snapshot = 'OTHER' where service_type_snapshot is null;
alter table service_requests alter column service_type_snapshot set not null;

create table external_messages (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    organization_id bigint not null,
    department_id bigint not null,
    endpoint_code varchar(64) not null,
    direction varchar(8) not null,
    message_type varchar(64) not null,
    business_message_id varchar(128) not null,
    correlation_id varchar(128),
    status varchar(32) not null,
    payload_json text not null,
    payload_digest_algorithm varchar(32) not null,
    payload_digest varchar(128) not null,
    related_resource_type varchar(80),
    related_resource_id bigint,
    related_resource_version bigint,
    created_at timestamp with time zone not null,
    sent_at timestamp with time zone,
    received_at timestamp with time zone,
    processed_at timestamp with time zone,
    error_code varchar(64),
    error_message varchar(1000),
    constraint fk_external_message_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_external_message_organization foreign key (tenant_id, organization_id)
        references organizations(tenant_id, id),
    constraint fk_external_message_department foreign key (tenant_id, organization_id, department_id)
        references departments(tenant_id, organization_id, id),
    constraint uk_external_message_tenant_id unique (tenant_id, id),
    constraint uk_external_message_business unique (tenant_id, endpoint_code, direction, business_message_id),
    constraint ck_external_message_direction check (direction in ('INBOUND', 'OUTBOUND')),
    constraint ck_external_message_status check (status in (
        'PENDING', 'SENT', 'FAILED', 'ACKNOWLEDGED', 'REJECTED', 'RECEIVED', 'PROCESSED')),
    constraint ck_external_message_related check (
        (related_resource_type is null and related_resource_id is null and related_resource_version is null) or
        (related_resource_type is not null and related_resource_id is not null and related_resource_version is not null)
    )
);
create index idx_external_message_queue on external_messages (
    tenant_id, organization_id, department_id, endpoint_code, direction, status, created_at);
create index idx_external_message_correlation on external_messages (tenant_id, endpoint_code, correlation_id);

create table diagnostic_reports (
    id bigint primary key,
    tenant_id bigint not null,
    resident_id bigint not null,
    encounter_id bigint not null,
    request_id bigint not null,
    endpoint_code varchar(64) not null,
    external_report_id varchar(128) not null,
    report_version int not null,
    replaces_report_id bigint,
    report_type varchar(32) not null,
    status varchar(32) not null,
    report_code varchar(128) not null,
    report_name varchar(300) not null,
    issued_at timestamp with time zone not null,
    received_at timestamp with time zone not null,
    conclusion text,
    author_code varchar(64),
    author_name varchar(100),
    content_digest_algorithm varchar(32) not null,
    content_digest varchar(128) not null,
    inbound_message_id bigint not null,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    constraint fk_diagnostic_report_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_diagnostic_report_resident foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_diagnostic_report_encounter foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint fk_diagnostic_report_request foreign key (tenant_id, request_id) references care_requests(tenant_id, id),
    constraint uk_diagnostic_report_tenant_id unique (tenant_id, id),
    constraint fk_diagnostic_report_replaces foreign key (tenant_id, replaces_report_id)
        references diagnostic_reports(tenant_id, id),
    constraint fk_diagnostic_report_message foreign key (tenant_id, inbound_message_id)
        references external_messages(tenant_id, id),
    constraint uk_diagnostic_report_external unique (tenant_id, endpoint_code, external_report_id, report_version),
    constraint ck_diagnostic_report_version check (report_version > 0),
    constraint ck_diagnostic_report_type check (report_type in ('LABORATORY', 'IMAGING')),
    constraint ck_diagnostic_report_status check (status in ('PRELIMINARY', 'FINAL', 'CORRECTED', 'CANCELLED')),
    constraint ck_diagnostic_report_replacement check (
        (report_version = 1 and replaces_report_id is null) or
        (report_version > 1 and replaces_report_id is not null)
    )
);
create index idx_diagnostic_report_request on diagnostic_reports (tenant_id, request_id, report_version);
create index idx_diagnostic_report_encounter on diagnostic_reports (tenant_id, encounter_id, issued_at);

create table observations (
    id bigint primary key,
    tenant_id bigint not null,
    resident_id bigint not null,
    encounter_id bigint,
    code_system_uri varchar(300) not null,
    code_release varchar(64),
    observation_code varchar(128) not null,
    observation_name varchar(300) not null,
    status varchar(32) not null,
    value_type varchar(32) not null,
    effective_at timestamp with time zone not null,
    value_string varchar(1000),
    value_number decimal(28,8),
    value_boolean boolean,
    value_code varchar(128),
    value_datetime timestamp with time zone,
    unit_code varchar(64),
    reference_range_low decimal(28,8),
    reference_range_high decimal(28,8),
    interpretation_code varchar(32),
    performer_code varchar(64),
    performer_name varchar(100),
    created_at timestamp with time zone not null,
    constraint fk_observation_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_observation_resident foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_observation_encounter foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint uk_observation_tenant_id unique (tenant_id, id),
    constraint ck_observation_status check (status in ('PRELIMINARY', 'FINAL', 'CORRECTED', 'CANCELLED')),
    constraint ck_observation_value_type check (value_type in ('STRING', 'NUMBER', 'BOOLEAN', 'CODE', 'DATETIME')),
    constraint ck_observation_value check (
        (value_type = 'STRING' and value_string is not null and value_number is null and value_boolean is null and value_code is null and value_datetime is null) or
        (value_type = 'NUMBER' and value_string is null and value_number is not null and value_boolean is null and value_code is null and value_datetime is null) or
        (value_type = 'BOOLEAN' and value_string is null and value_number is null and value_boolean is not null and value_code is null and value_datetime is null) or
        (value_type = 'CODE' and value_string is null and value_number is null and value_boolean is null and value_code is not null and value_datetime is null) or
        (value_type = 'DATETIME' and value_string is null and value_number is null and value_boolean is null and value_code is null and value_datetime is not null)
    )
);
create index idx_observation_resident on observations (tenant_id, resident_id, observation_code, effective_at);
create index idx_observation_encounter on observations (tenant_id, encounter_id, observation_code);

create table diagnostic_report_results (
    tenant_id bigint not null,
    report_id bigint not null,
    observation_id bigint not null,
    sort_order int not null,
    primary key (tenant_id, report_id, observation_id),
    constraint fk_report_result_report foreign key (tenant_id, report_id) references diagnostic_reports(tenant_id, id),
    constraint fk_report_result_observation foreign key (tenant_id, observation_id) references observations(tenant_id, id),
    constraint uk_report_result_order unique (tenant_id, report_id, sort_order),
    constraint ck_report_result_order check (sort_order > 0)
);
