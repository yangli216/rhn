alter table service_requests add (service_type_snapshot varchar2(32 char));
alter table service_requests add (specimen_type_snapshot varchar2(64 char));
alter table service_requests add (examination_type_snapshot varchar2(64 char));

update service_requests sr
set service_type_snapshot = (
    select si.service_type
    from care_requests cr
    join service_items si on si.tenant_id = cr.tenant_id and si.catalog_item_id = cr.catalog_item_id
    where cr.tenant_id = sr.tenant_id and cr.id = sr.request_id
);
update service_requests sr
set specimen_type_snapshot = (
    select si.specimen_type
    from care_requests cr
    join service_items si on si.tenant_id = cr.tenant_id and si.catalog_item_id = cr.catalog_item_id
    where cr.tenant_id = sr.tenant_id and cr.id = sr.request_id
);
update service_requests sr
set examination_type_snapshot = (
    select si.examination_type
    from care_requests cr
    join service_items si on si.tenant_id = cr.tenant_id and si.catalog_item_id = cr.catalog_item_id
    where cr.tenant_id = sr.tenant_id and cr.id = sr.request_id
);
update service_requests set service_type_snapshot = 'OTHER' where service_type_snapshot is null;
alter table service_requests modify (service_type_snapshot not null);

create table external_messages (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    organization_id number(19) not null,
    department_id number(19) not null,
    endpoint_code varchar2(64 char) not null,
    direction varchar2(8 char) not null,
    message_type varchar2(64 char) not null,
    business_message_id varchar2(128 char) not null,
    correlation_id varchar2(128 char),
    status varchar2(32 char) not null,
    payload_json clob not null,
    payload_digest_algorithm varchar2(32 char) not null,
    payload_digest varchar2(128 char) not null,
    related_resource_type varchar2(80 char),
    related_resource_id number(19),
    related_resource_version number(19),
    created_at timestamp with time zone not null,
    sent_at timestamp with time zone,
    received_at timestamp with time zone,
    processed_at timestamp with time zone,
    error_code varchar2(64 char),
    error_message varchar2(1000 char),
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
    id number(19) primary key,
    tenant_id number(19) not null,
    resident_id number(19) not null,
    encounter_id number(19) not null,
    request_id number(19) not null,
    endpoint_code varchar2(64 char) not null,
    external_report_id varchar2(128 char) not null,
    report_version number(10) not null,
    replaces_report_id number(19),
    report_type varchar2(32 char) not null,
    status varchar2(32 char) not null,
    report_code varchar2(128 char) not null,
    report_name varchar2(300 char) not null,
    issued_at timestamp with time zone not null,
    received_at timestamp with time zone not null,
    conclusion clob,
    author_code varchar2(64 char),
    author_name varchar2(100 char),
    content_digest_algorithm varchar2(32 char) not null,
    content_digest varchar2(128 char) not null,
    inbound_message_id number(19) not null,
    created_at timestamp with time zone not null,
    created_by number(19) not null,
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
    id number(19) primary key,
    tenant_id number(19) not null,
    resident_id number(19) not null,
    encounter_id number(19),
    code_system_uri varchar2(300 char) not null,
    code_release varchar2(64 char),
    observation_code varchar2(128 char) not null,
    observation_name varchar2(300 char) not null,
    status varchar2(32 char) not null,
    value_type varchar2(32 char) not null,
    effective_at timestamp with time zone not null,
    value_string varchar2(1000 char),
    value_number number(28,8),
    value_boolean number(1),
    value_code varchar2(128 char),
    value_datetime timestamp with time zone,
    unit_code varchar2(64 char),
    reference_range_low number(28,8),
    reference_range_high number(28,8),
    interpretation_code varchar2(32 char),
    performer_code varchar2(64 char),
    performer_name varchar2(100 char),
    created_at timestamp with time zone not null,
    constraint fk_observation_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_observation_resident foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_observation_encounter foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint uk_observation_tenant_id unique (tenant_id, id),
    constraint ck_observation_status check (status in ('PRELIMINARY', 'FINAL', 'CORRECTED', 'CANCELLED')),
    constraint ck_observation_value_type check (value_type in ('STRING', 'NUMBER', 'BOOLEAN', 'CODE', 'DATETIME')),
    constraint ck_observation_boolean check (value_boolean is null or value_boolean in (0, 1)),
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
    tenant_id number(19) not null,
    report_id number(19) not null,
    observation_id number(19) not null,
    sort_order number(10) not null,
    primary key (tenant_id, report_id, observation_id),
    constraint fk_report_result_report foreign key (tenant_id, report_id) references diagnostic_reports(tenant_id, id),
    constraint fk_report_result_observation foreign key (tenant_id, observation_id) references observations(tenant_id, id),
    constraint uk_report_result_order unique (tenant_id, report_id, sort_order),
    constraint ck_report_result_order check (sort_order > 0)
);
