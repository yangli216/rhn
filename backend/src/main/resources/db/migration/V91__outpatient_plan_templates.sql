create table outpatient_plan_templates (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    organization_id bigint not null,
    department_id bigint not null,
    scope_type varchar(16) not null,
    owner_id bigint not null,
    template_name varchar(100) not null,
    description varchar(500),
    status varchar(16) not null,
    sort_order integer default 0 not null,
    use_count bigint default 0 not null,
    last_used_at timestamp with time zone,
    created_by bigint not null,
    created_at timestamp with time zone not null,
    updated_by bigint not null,
    updated_at timestamp with time zone not null,
    constraint fk_opt_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_opt_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_opt_dept foreign key (tenant_id, organization_id, department_id)
        references departments(tenant_id, organization_id, id),
    constraint fk_opt_created_user foreign key (tenant_id, created_by) references user_accounts(tenant_id, id),
    constraint fk_opt_updated_user foreign key (tenant_id, updated_by) references user_accounts(tenant_id, id),
    constraint uk_opt_tenant_id unique (tenant_id, id),
    constraint uk_opt_owner_name unique (tenant_id, organization_id, scope_type, owner_id, template_name),
    constraint ck_opt_scope check (scope_type in ('PERSONAL', 'DEPARTMENT')),
    constraint ck_opt_status check (status in ('ACTIVE', 'INACTIVE'))
);
create index idx_opt_visible on outpatient_plan_templates
    (tenant_id, organization_id, department_id, scope_type, owner_id, status, sort_order);

create table outpatient_plan_diagnoses (
    id bigint primary key,
    tenant_id bigint not null,
    template_id bigint not null,
    line_no integer not null,
    diagnosis_code varchar(64) not null,
    diagnosis_name varchar(200) not null,
    diagnosis_type varchar(24) not null,
    constraint fk_opd_template foreign key (tenant_id, template_id)
        references outpatient_plan_templates(tenant_id, id),
    constraint uk_opd_line unique (tenant_id, template_id, line_no),
    constraint ck_opd_type check (diagnosis_type in ('PRIMARY', 'SECONDARY'))
);

create table outpatient_plan_medications (
    id bigint primary key,
    tenant_id bigint not null,
    template_id bigint not null,
    line_no integer not null,
    medication_id bigint not null,
    catalog_item_id bigint,
    package_id bigint,
    category_code varchar(32) not null,
    medication_code varchar(64) not null,
    medication_name varchar(200) not null,
    preparation_spec varchar(200),
    product_name varchar(200),
    dose_value decimal(18,6),
    dose_unit varchar(64),
    route_code varchar(64),
    frequency_code varchar(64),
    duration_value decimal(18,6),
    duration_unit varchar(32),
    quantity decimal(18,6) not null,
    quantity_unit varchar(64),
    substitution_allowed boolean not null,
    self_provided boolean not null,
    medication_instruction varchar(1000),
    price_type varchar(32),
    pricing_required boolean not null,
    reason_text varchar(1000),
    constraint fk_opm_template foreign key (tenant_id, template_id)
        references outpatient_plan_templates(tenant_id, id),
    constraint uk_opm_line unique (tenant_id, template_id, line_no)
);

create table outpatient_plan_services (
    id bigint primary key,
    tenant_id bigint not null,
    template_id bigint not null,
    line_no integer not null,
    catalog_item_id bigint not null,
    item_code varchar(64) not null,
    item_name varchar(200) not null,
    service_type varchar(32) not null,
    quantity decimal(18,6) not null,
    unit_code varchar(64),
    price_type varchar(32),
    pricing_required boolean not null,
    reason_text varchar(1000),
    clinical_description varchar(2000),
    constraint fk_ops_template foreign key (tenant_id, template_id)
        references outpatient_plan_templates(tenant_id, id),
    constraint uk_ops_line unique (tenant_id, template_id, line_no)
);
