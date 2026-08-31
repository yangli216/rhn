create table outpatient_note_templates (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    organization_id bigint not null,
    department_id bigint not null,
    scope_type varchar(16) not null,
    owner_id bigint not null,
    specialty_code varchar(64) not null,
    document_type varchar(64) not null,
    content_schema varchar(100) not null,
    template_name varchar(100) not null,
    description varchar(500),
    content_json clob not null,
    status varchar(16) not null,
    sort_order integer default 0 not null,
    use_count bigint default 0 not null,
    last_used_at timestamp with time zone,
    created_by bigint not null,
    created_at timestamp with time zone not null,
    updated_by bigint not null,
    updated_at timestamp with time zone not null,
    constraint fk_ont_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_ont_org foreign key (tenant_id, organization_id)
        references organizations(tenant_id, id),
    constraint fk_ont_dept foreign key (tenant_id, organization_id, department_id)
        references departments(tenant_id, organization_id, id),
    constraint fk_ont_created_user foreign key (tenant_id, created_by)
        references user_accounts(tenant_id, id),
    constraint fk_ont_updated_user foreign key (tenant_id, updated_by)
        references user_accounts(tenant_id, id),
    constraint uk_ont_tenant_id unique (tenant_id, id),
    constraint uk_ont_owner_name unique
        (tenant_id, organization_id, scope_type, owner_id, specialty_code, document_type, template_name),
    constraint ck_ont_scope check (scope_type in ('PERSONAL', 'DEPARTMENT')),
    constraint ck_ont_status check (status in ('ACTIVE', 'INACTIVE'))
);

create index idx_ont_visible on outpatient_note_templates
    (tenant_id, organization_id, department_id, specialty_code, document_type,
     scope_type, owner_id, status, sort_order);
