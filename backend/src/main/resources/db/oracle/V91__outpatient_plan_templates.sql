create table outpatient_plan_templates (
    id number(19,0) primary key,
    revision number(19,0) default 0 not null,
    tenant_id number(19,0) not null,
    organization_id number(19,0) not null,
    department_id number(19,0) not null,
    scope_type varchar2(16 char) not null,
    owner_id number(19,0) not null,
    template_name varchar2(100 char) not null,
    description varchar2(500 char),
    status varchar2(16 char) not null,
    sort_order number(10,0) default 0 not null,
    use_count number(19,0) default 0 not null,
    last_used_at timestamp with time zone,
    created_by number(19,0) not null,
    created_at timestamp with time zone not null,
    updated_by number(19,0) not null,
    updated_at timestamp with time zone not null,
    constraint fk_opt_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_opt_org foreign key (tenant_id,organization_id) references organizations(tenant_id,id),
    constraint fk_opt_dept foreign key (tenant_id,organization_id,department_id) references departments(tenant_id,organization_id,id),
    constraint fk_opt_created_user foreign key (tenant_id,created_by) references user_accounts(tenant_id,id),
    constraint fk_opt_updated_user foreign key (tenant_id,updated_by) references user_accounts(tenant_id,id),
    constraint uk_opt_tenant_id unique (tenant_id,id),
    constraint uk_opt_owner_name unique (tenant_id,organization_id,scope_type,owner_id,template_name),
    constraint ck_opt_scope check (scope_type in ('PERSONAL','DEPARTMENT')),
    constraint ck_opt_status check (status in ('ACTIVE','INACTIVE'))
);
create index idx_opt_visible on outpatient_plan_templates
    (tenant_id,organization_id,department_id,scope_type,owner_id,status,sort_order);

create table outpatient_plan_diagnoses (
    id number(19,0) primary key, tenant_id number(19,0) not null, template_id number(19,0) not null,
    line_no number(10,0) not null, diagnosis_code varchar2(64 char) not null,
    diagnosis_name varchar2(200 char) not null, diagnosis_type varchar2(24 char) not null,
    constraint fk_opd_template foreign key (tenant_id,template_id) references outpatient_plan_templates(tenant_id,id),
    constraint uk_opd_line unique (tenant_id,template_id,line_no),
    constraint ck_opd_type check (diagnosis_type in ('PRIMARY','SECONDARY'))
);

create table outpatient_plan_medications (
    id number(19,0) primary key, tenant_id number(19,0) not null, template_id number(19,0) not null,
    line_no number(10,0) not null, medication_id number(19,0) not null, catalog_item_id number(19,0), package_id number(19,0),
    category_code varchar2(32 char) not null, medication_code varchar2(64 char) not null,
    medication_name varchar2(200 char) not null, preparation_spec varchar2(200 char), product_name varchar2(200 char),
    dose_value number(18,6), dose_unit varchar2(64 char), route_code varchar2(64 char), frequency_code varchar2(64 char),
    duration_value number(18,6), duration_unit varchar2(32 char), quantity number(18,6) not null,
    quantity_unit varchar2(64 char), substitution_allowed number(1,0) not null, self_provided number(1,0) not null,
    medication_instruction varchar2(1000 char), price_type varchar2(32 char), pricing_required number(1,0) not null,
    reason_text varchar2(1000 char),
    constraint fk_opm_template foreign key (tenant_id,template_id) references outpatient_plan_templates(tenant_id,id),
    constraint uk_opm_line unique (tenant_id,template_id,line_no),
    constraint ck_opm_substitution check (substitution_allowed in (0,1)),
    constraint ck_opm_self_provided check (self_provided in (0,1)),
    constraint ck_opm_pricing check (pricing_required in (0,1))
);

create table outpatient_plan_services (
    id number(19,0) primary key, tenant_id number(19,0) not null, template_id number(19,0) not null,
    line_no number(10,0) not null, catalog_item_id number(19,0) not null, item_code varchar2(64 char) not null,
    item_name varchar2(200 char) not null, service_type varchar2(32 char) not null, quantity number(18,6) not null,
    unit_code varchar2(64 char), price_type varchar2(32 char), pricing_required number(1,0) not null,
    reason_text varchar2(1000 char), clinical_description varchar2(2000 char),
    constraint fk_ops_template foreign key (tenant_id,template_id) references outpatient_plan_templates(tenant_id,id),
    constraint uk_ops_line unique (tenant_id,template_id,line_no),
    constraint ck_ops_pricing check (pricing_required in (0,1))
);
