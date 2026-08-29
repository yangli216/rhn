create table departments (
    id number(19) primary key,
    tenant_id number(19) not null,
    organization_id number(19) not null,
    parent_id number(19),
    merged_to_id number(19),
    code varchar2(64 char) not null,
    name varchar2(200 char) not null,
    short_name varchar2(100 char),
    description varchar2(1000 char),
    department_type varchar2(128 char) not null,
    department_property varchar2(32 char),
    virtual number(1) default 0 not null,
    sort_order number(10) default 0 not null,
    status varchar2(32 char) not null,
    valid_from date not null,
    valid_to date,
    created_at timestamp with time zone not null,
    created_by number(19),
    updated_at timestamp with time zone not null,
    updated_by number(19),
    revision number(19) default 0 not null,
    constraint fk_department_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_department_organization foreign key (tenant_id, organization_id)
        references organizations(tenant_id, id),
    constraint uk_department_tenant_id unique (tenant_id, id),
    constraint uk_department_org_id unique (tenant_id, organization_id, id),
    constraint uk_department_code unique (tenant_id, organization_id, code),
    constraint ck_department_virtual check (virtual in (0, 1)),
    constraint ck_department_period check (valid_to is null or valid_to >= valid_from),
    constraint ck_department_parent_self check (parent_id is null or parent_id <> id),
    constraint ck_department_merge_self check (merged_to_id is null or merged_to_id <> id)
);

alter table departments add constraint fk_department_parent
    foreign key (tenant_id, organization_id, parent_id)
    references departments(tenant_id, organization_id, id);
alter table departments add constraint fk_department_merged_to
    foreign key (tenant_id, organization_id, merged_to_id)
    references departments(tenant_id, organization_id, id);
create index idx_department_tree on departments (tenant_id, organization_id, parent_id, sort_order, code);
create index idx_department_type on departments (tenant_id, department_type, status);

create table department_contacts (
    id number(19) primary key,
    tenant_id number(19) not null,
    department_id number(19) not null,
    contact_type varchar2(32 char) not null,
    contact_value varchar2(300 char) not null,
    contact_use varchar2(32 char) not null,
    primary_contact number(1) default 0 not null,
    sort_order number(10) default 0 not null,
    valid_from date not null,
    valid_to date,
    status varchar2(32 char) not null,
    constraint fk_dept_contact_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_dept_contact_department foreign key (tenant_id, department_id)
        references departments(tenant_id, id),
    constraint uk_dept_contact_tenant_id unique (tenant_id, id),
    constraint uk_dept_contact_value unique (tenant_id, department_id, contact_type, contact_value),
    constraint ck_dept_contact_primary check (primary_contact in (0, 1)),
    constraint ck_dept_contact_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_dept_contact_status on department_contacts (tenant_id, department_id, status, sort_order);

create table department_relations (
    id number(19) primary key,
    tenant_id number(19) not null,
    source_department_id number(19) not null,
    target_department_id number(19) not null,
    relation_type varchar2(32 char) not null,
    primary_relation number(1) default 0 not null,
    description varchar2(500 char),
    valid_from date not null,
    valid_to date,
    status varchar2(32 char) not null,
    constraint fk_dept_rel_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_dept_rel_source foreign key (tenant_id, source_department_id)
        references departments(tenant_id, id),
    constraint fk_dept_rel_target foreign key (tenant_id, target_department_id)
        references departments(tenant_id, id),
    constraint uk_dept_rel_tenant_id unique (tenant_id, id),
    constraint uk_dept_relation unique
        (tenant_id, source_department_id, target_department_id, relation_type, valid_from),
    constraint ck_dept_relation_primary check (primary_relation in (0, 1)),
    constraint ck_dept_relation_self check (source_department_id <> target_department_id),
    constraint ck_dept_relation_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_dept_relation_target on department_relations
    (tenant_id, target_department_id, relation_type, status);

create table department_capabilities (
    id number(19) primary key,
    tenant_id number(19) not null,
    department_id number(19) not null,
    capability_type varchar2(64 char) not null,
    qualification_basis_code varchar2(128 char),
    capability_scope varchar2(1000 char),
    valid_from date not null,
    valid_to date,
    verify_status varchar2(32 char) not null,
    status varchar2(32 char) not null,
    constraint fk_dept_cap_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_dept_cap_department foreign key (tenant_id, department_id)
        references departments(tenant_id, id),
    constraint uk_dept_cap_tenant_id unique (tenant_id, id),
    constraint uk_dept_capability unique (tenant_id, department_id, capability_type, valid_from),
    constraint ck_dept_capability_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_dept_capability_type on department_capabilities (tenant_id, capability_type, status);

create table department_responsibilities (
    id number(19) primary key,
    tenant_id number(19) not null,
    department_id number(19) not null,
    assignment_id number(19),
    external_responsible_name varchar2(100 char),
    responsibility_type varchar2(32 char) not null,
    primary_responsibility number(1) default 0 not null,
    valid_from date not null,
    valid_to date,
    status varchar2(32 char) not null,
    constraint fk_dept_resp_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_dept_resp_department foreign key (tenant_id, department_id)
        references departments(tenant_id, id),
    constraint fk_dept_resp_assignment foreign key (tenant_id, assignment_id)
        references staff_assignments(tenant_id, id),
    constraint uk_dept_resp_tenant_id unique (tenant_id, id),
    constraint uk_dept_resp_assignment_period
        unique (tenant_id, department_id, responsibility_type, assignment_id, valid_from),
    constraint ck_dept_resp_primary check (primary_responsibility in (0, 1)),
    constraint ck_dept_resp_subject check (
        (assignment_id is not null and external_responsible_name is null) or
        (assignment_id is null and external_responsible_name is not null)
    ),
    constraint ck_dept_resp_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_dept_resp_status on department_responsibilities
    (tenant_id, department_id, responsibility_type, status);

insert into departments (
    id, tenant_id, organization_id, parent_id, merged_to_id, code, name, short_name, description,
    department_type, department_property, virtual, sort_order, status, valid_from, valid_to,
    created_at, created_by, updated_at, updated_by, revision
)
with organization_path as (
    select connect_by_root id unit_id, connect_by_root tenant_id tenant_id,
           id ancestor_id, organization_kind ancestor_kind, level depth
    from organizations
    start with organization_kind = 'ORG_UNIT'
    connect by nocycle prior tenant_id = tenant_id and prior parent_id = id
), organization_roots as (
    select tenant_id, unit_id, ancestor_id,
           row_number() over (partition by tenant_id, unit_id order by depth) root_order
    from organization_path where ancestor_kind = 'LEGAL_ORGANIZATION'
)
select u.id, u.tenant_id, r.ancestor_id,
       case when p.organization_kind = 'ORG_UNIT' then u.parent_id else null end,
       case when m.organization_kind = 'ORG_UNIT' then u.merged_to_id else null end,
       u.code, u.name, u.short_name, u.description,
       nvl(u.department_type_code, 'CUSTOM_OTHER'),
       case u.organization_type
           when 'CLINICAL_DEPARTMENT' then 'CLINICAL'
           when 'ADMINISTRATIVE_DEPARTMENT' then 'ADMINISTRATIVE'
           when 'MEDICAL_TECHNOLOGY_DEPARTMENT' then 'MEDICAL_TECHNOLOGY'
           when 'NURSING_UNIT' then 'NURSING'
           else 'OTHER' end,
       u.virtual, u.sort_order, u.status, u.valid_from, u.valid_to,
       u.created_at, u.created_by, u.updated_at, u.updated_by, u.revision
from organizations u
join organization_roots r on r.tenant_id = u.tenant_id and r.unit_id = u.id and r.root_order = 1
left join organizations p on p.tenant_id = u.tenant_id and p.id = u.parent_id
left join organizations m on m.tenant_id = u.tenant_id and m.id = u.merged_to_id
where u.organization_kind = 'ORG_UNIT';

insert into department_contacts
select c.* from organization_contacts c
join departments d on d.tenant_id = c.tenant_id and d.id = c.organization_id;

insert into department_capabilities
select c.* from organization_capabilities c
join departments d on d.tenant_id = c.tenant_id and d.id = c.organization_id;

insert into department_responsibilities
select r.* from organization_responsibilities r
join departments d on d.tenant_id = r.tenant_id and d.id = r.organization_id;

insert into department_relations
select r.id, r.tenant_id, r.source_organization_id, r.target_organization_id,
       r.relation_type, r.primary_relation, r.description, r.valid_from, r.valid_to, r.status
from organization_relations r
join departments source on source.tenant_id = r.tenant_id and source.id = r.source_organization_id
join departments target on target.tenant_id = r.tenant_id and target.id = r.target_organization_id;

alter table staff_assignments add department_id number(19);
update staff_assignments a set department_id = organization_id
where exists (select 1 from departments d where d.tenant_id = a.tenant_id and d.id = a.organization_id);
update staff_assignments a set organization_id = (
    select d.organization_id from departments d
    where d.tenant_id = a.tenant_id and d.id = a.department_id
) where department_id is not null;
alter table staff_assignments modify department_id not null;
alter table staff_assignments drop constraint fk_assignment_organization_tenant;
alter table staff_assignments drop constraint uk_assignment_period;
alter table staff_assignments add constraint fk_assignment_organization_tenant
    foreign key (tenant_id, organization_id) references organizations(tenant_id, id);
alter table staff_assignments add constraint fk_assignment_department_tenant
    foreign key (tenant_id, organization_id, department_id)
    references departments(tenant_id, organization_id, id);
alter table staff_assignments add constraint uk_assignment_period
    unique (tenant_id, employment_id, organization_id, department_id, position_id, valid_from);
create index idx_assignment_department on staff_assignments
    (tenant_id, department_id, status, primary_assignment);

alter table encounters drop constraint fk_encounter_department_tenant;
alter table encounters add constraint fk_encounter_department_tenant
    foreign key (tenant_id, organization_id, department_id)
    references departments(tenant_id, organization_id, id);

alter table clinical_documents drop constraint fk_clinical_document_department_tenant;
alter table clinical_documents add constraint fk_clinical_document_department_tenant
    foreign key (tenant_id, organization_id, department_id)
    references departments(tenant_id, organization_id, id);

alter table user_role_assignments drop constraint fk_user_role_department_tenant;
alter table user_role_assignments add constraint fk_user_role_department_tenant
    foreign key (tenant_id, organization_id, department_id)
    references departments(tenant_id, organization_id, id);
