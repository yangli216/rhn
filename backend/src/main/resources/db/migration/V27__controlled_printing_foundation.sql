create table print_templates (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint,
    template_code varchar(100) not null,
    template_name varchar(200) not null,
    document_type varchar(80) not null,
    status varchar(24) not null,
    current_version integer not null,
    created_at timestamp with time zone not null,
    created_by bigint,
    updated_at timestamp with time zone not null,
    updated_by bigint,
    constraint fk_print_template_tenant foreign key (tenant_id) references tenants(id),
    constraint ck_print_template_status check (status in ('ACTIVE', 'INACTIVE')),
    constraint ck_print_template_version check (current_version > 0),
    constraint uk_print_template_scope_code unique (tenant_id, template_code)
);
create index idx_print_template_resolve on print_templates (tenant_id, document_type, status, updated_at);

create table print_template_versions (
    id bigint primary key,
    template_id bigint not null,
    version_no integer not null,
    layout_schema varchar(80) not null,
    config_json text not null,
    content_digest_algorithm varchar(32) not null,
    content_digest varchar(256) not null,
    published_at timestamp with time zone not null,
    published_by bigint,
    constraint fk_print_template_version_template foreign key (template_id) references print_templates(id),
    constraint uk_print_template_version unique (template_id, version_no),
    constraint ck_print_template_version_no check (version_no > 0)
);

create table print_outputs (
    id bigint primary key,
    tenant_id bigint not null,
    template_id bigint not null,
    template_version_id bigint not null,
    source_type varchar(80) not null,
    source_id bigint not null,
    source_version bigint not null,
    document_type varchar(80) not null,
    resident_id bigint,
    encounter_id bigint,
    organization_id bigint,
    department_id bigint,
    purpose varchar(40) not null,
    snapshot_json text not null,
    file_name varchar(300) not null,
    media_type varchar(100) not null,
    content_base64 text not null,
    content_digest_algorithm varchar(32) not null,
    content_digest varchar(256) not null,
    generated_at timestamp with time zone not null,
    generated_by bigint not null,
    constraint fk_print_output_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_print_output_template foreign key (template_id) references print_templates(id),
    constraint fk_print_output_template_version foreign key (template_version_id) references print_template_versions(id),
    constraint fk_print_output_resident foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_print_output_encounter foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint fk_print_output_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_print_output_dept foreign key (tenant_id, department_id) references departments(tenant_id, id),
    constraint fk_print_output_actor foreign key (tenant_id, generated_by) references user_accounts(tenant_id, id),
    constraint uk_print_output_tenant_id unique (tenant_id, id),
    constraint ck_print_output_source_version check (source_version > 0),
    constraint ck_print_output_purpose check (purpose in ('CLINICAL_USE', 'PATIENT_COPY', 'ARCHIVE_COPY'))
);
create index idx_print_output_source on print_outputs (tenant_id, source_type, source_id, generated_at);

create table print_jobs (
    id bigint primary key,
    tenant_id bigint not null,
    output_id bigint not null,
    original_job_id bigint,
    request_type varchar(24) not null,
    copies integer not null,
    status varchar(24) not null,
    requested_at timestamp with time zone not null,
    requested_by bigint not null,
    correlation_id varchar(64) not null,
    constraint uk_print_job_tenant_id unique (tenant_id, id),
    constraint fk_print_job_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_print_job_output foreign key (tenant_id, output_id) references print_outputs(tenant_id, id),
    constraint fk_print_job_original foreign key (tenant_id, original_job_id) references print_jobs(tenant_id, id),
    constraint fk_print_job_actor foreign key (tenant_id, requested_by) references user_accounts(tenant_id, id),
    constraint ck_print_job_type check (request_type in ('ORIGINAL', 'REPRINT')),
    constraint ck_print_job_copies check (copies between 1 and 10),
    constraint ck_print_job_status check (status in ('GENERATED', 'FAILED'))
);
create index idx_print_job_output on print_jobs (tenant_id, output_id, requested_at);

insert into print_templates (id, revision, tenant_id, template_code, template_name, document_type, status,
                             current_version, created_at, created_by, updated_at, updated_by)
values (270000000000001, 0, null, 'OUTPATIENT_NOTE_A4', '门诊病历 A4 标准模板', 'OUTPATIENT_NOTE',
        'ACTIVE', 1, current_timestamp, null, current_timestamp, null);
insert into print_template_versions (id, template_id, version_no, layout_schema, config_json,
                                     content_digest_algorithm, content_digest, published_at, published_by)
values (270000000000011, 270000000000001, 1, 'RHN_PRINT_LAYOUT_V1',
        '{"renderer":"OUTPATIENT_NOTE","paper":"A4","orientation":"PORTRAIT","marginMm":18}',
        'SHA-256', '98B6E3FB8F479ECE7CCF710AA930991551611217DB641759F7ABCCEC2E335F6B', current_timestamp, null);

insert into print_templates (id, revision, tenant_id, template_code, template_name, document_type, status,
                             current_version, created_at, created_by, updated_at, updated_by)
values (270000000000002, 0, null, 'OUTPATIENT_PRESCRIPTION_A4', '门诊处方 A4 标准模板',
        'OUTPATIENT_PRESCRIPTION', 'ACTIVE', 1, current_timestamp, null, current_timestamp, null);
insert into print_template_versions (id, template_id, version_no, layout_schema, config_json,
                                     content_digest_algorithm, content_digest, published_at, published_by)
values (270000000000012, 270000000000002, 1, 'RHN_PRINT_LAYOUT_V1',
        '{"renderer":"OUTPATIENT_PRESCRIPTION","paper":"A4","orientation":"PORTRAIT","marginMm":18}',
        'SHA-256', 'D444BF491D3014CE3720294480372591122B25406398B10B2306295948F655BA', current_timestamp, null);
