create table outpatient_note_form_versions (
    id bigint primary key,
    tenant_id bigint not null,
    organization_id bigint not null,
    department_id bigint not null,
    form_code varchar(64) not null,
    version_number integer not null,
    specialty_code varchar(64) not null,
    form_name varchar(100) not null,
    description varchar(500),
    definition_schema varchar(100) not null,
    definition_json clob not null,
    status varchar(16) not null,
    published_by bigint not null,
    published_at timestamp with time zone not null,
    retired_at timestamp with time zone,
    constraint fk_onfv_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_onfv_org foreign key (tenant_id, organization_id)
        references organizations(tenant_id, id),
    constraint fk_onfv_dept foreign key (tenant_id, organization_id, department_id)
        references departments(tenant_id, organization_id, id),
    constraint fk_onfv_user foreign key (tenant_id, published_by)
        references user_accounts(tenant_id, id),
    constraint uk_onfv_tenant_id unique (tenant_id, id),
    constraint uk_onfv_form_version unique
        (tenant_id, organization_id, department_id, form_code, version_number),
    constraint ck_onfv_version check (version_number > 0),
    constraint ck_onfv_status check (status in ('PUBLISHED', 'RETIRED'))
);

create index idx_onfv_visible on outpatient_note_form_versions
    (tenant_id, organization_id, department_id, specialty_code, status, form_code, version_number);
