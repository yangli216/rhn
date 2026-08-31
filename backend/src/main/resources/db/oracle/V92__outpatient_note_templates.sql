create table outpatient_note_templates (
    id number(19,0) primary key,
    revision number(19,0) default 0 not null,
    tenant_id number(19,0) not null,
    organization_id number(19,0) not null,
    department_id number(19,0) not null,
    scope_type varchar2(16 char) not null,
    owner_id number(19,0) not null,
    specialty_code varchar2(64 char) not null,
    document_type varchar2(64 char) not null,
    content_schema varchar2(100 char) not null,
    template_name varchar2(100 char) not null,
    description varchar2(500 char),
    content_json clob not null,
    status varchar2(16 char) not null,
    sort_order number(10,0) default 0 not null,
    use_count number(19,0) default 0 not null,
    last_used_at timestamp with time zone,
    created_by number(19,0) not null,
    created_at timestamp with time zone not null,
    updated_by number(19,0) not null,
    updated_at timestamp with time zone not null,
    constraint fk_ont_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_ont_org foreign key (tenant_id,organization_id)
        references organizations(tenant_id,id),
    constraint fk_ont_dept foreign key (tenant_id,organization_id,department_id)
        references departments(tenant_id,organization_id,id),
    constraint fk_ont_created_user foreign key (tenant_id,created_by)
        references user_accounts(tenant_id,id),
    constraint fk_ont_updated_user foreign key (tenant_id,updated_by)
        references user_accounts(tenant_id,id),
    constraint uk_ont_tenant_id unique (tenant_id,id),
    constraint uk_ont_owner_name unique
        (tenant_id,organization_id,scope_type,owner_id,specialty_code,document_type,template_name),
    constraint ck_ont_scope check (scope_type in ('PERSONAL','DEPARTMENT')),
    constraint ck_ont_status check (status in ('ACTIVE','INACTIVE'))
);

create index idx_ont_visible on outpatient_note_templates
    (tenant_id,organization_id,department_id,specialty_code,document_type,
     scope_type,owner_id,status,sort_order);
