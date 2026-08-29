alter table organizations add short_name varchar2(100 char);
alter table organizations add description varchar2(1000 char);
alter table organizations add organization_property varchar2(32 char);
alter table organizations add virtual number(1,0) default 0 not null;
alter table organizations add sort_order number(10,0) default 0 not null;
alter table organizations add timezone_code varchar2(64 char);
alter table organizations add department_type_code varchar2(128 char);

create index idx_organization_tree_sort on organizations (tenant_id, parent_id, sort_order, code);
create index idx_organization_department_type on organizations (tenant_id, department_type_code, status);

create table organization_identifiers (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    organization_id number(19,0) not null,
    identifier_system varchar2(300 char) not null,
    identifier_code varchar2(128 char) not null,
    identifier_type varchar2(64 char) not null,
    issuer_organization_id number(19,0),
    primary_identifier number(1,0) default 0 not null,
    valid_from date not null,
    valid_to date,
    verify_status varchar2(32 char) not null,
    verified_at timestamp with time zone,
    verified_by number(19,0),
    status varchar2(32 char) not null,
    constraint fk_org_ident_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_org_ident_issuer foreign key (tenant_id, issuer_organization_id) references organizations(tenant_id, id),
    constraint uk_org_ident_system_code unique (tenant_id, identifier_system, identifier_code),
    constraint ck_org_ident_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_org_ident_org_status on organization_identifiers (tenant_id, organization_id, status);

create table organization_contacts (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    organization_id number(19,0) not null,
    contact_type varchar2(32 char) not null,
    contact_value varchar2(300 char) not null,
    contact_use varchar2(32 char) not null,
    primary_contact number(1,0) default 0 not null,
    sort_order number(10,0) default 0 not null,
    valid_from date not null,
    valid_to date,
    status varchar2(32 char) not null,
    constraint fk_org_contact_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint uk_org_contact_value unique (tenant_id, organization_id, contact_type, contact_value),
    constraint ck_org_contact_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_org_contact_org_status on organization_contacts (tenant_id, organization_id, status, sort_order);

create table organization_addresses (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    organization_id number(19,0) not null,
    address_type varchar2(32 char) not null,
    country_code varchar2(32 char) not null,
    province_code varchar2(32 char),
    city_code varchar2(32 char),
    district_code varchar2(32 char),
    street_address varchar2(500 char) not null,
    postal_code varchar2(32 char),
    valid_from date not null,
    valid_to date,
    status varchar2(32 char) not null,
    constraint fk_org_address_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint uk_org_address_type_date unique (tenant_id, organization_id, address_type, valid_from),
    constraint ck_org_address_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_org_address_district on organization_addresses (tenant_id, district_code, status);

create table organization_relations (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    source_organization_id number(19,0) not null,
    target_organization_id number(19,0) not null,
    relation_type varchar2(32 char) not null,
    primary_relation number(1,0) default 0 not null,
    description varchar2(500 char),
    valid_from date not null,
    valid_to date,
    status varchar2(32 char) not null,
    constraint fk_org_rel_source foreign key (tenant_id, source_organization_id) references organizations(tenant_id, id),
    constraint fk_org_rel_target foreign key (tenant_id, target_organization_id) references organizations(tenant_id, id),
    constraint uk_org_relation unique (tenant_id, source_organization_id, target_organization_id, relation_type, valid_from),
    constraint ck_org_relation_self check (source_organization_id <> target_organization_id),
    constraint ck_org_relation_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_org_relation_target on organization_relations (tenant_id, target_organization_id, relation_type, status);

create table organization_capabilities (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    organization_id number(19,0) not null,
    capability_type varchar2(64 char) not null,
    qualification_basis_code varchar2(128 char),
    capability_scope varchar2(1000 char),
    valid_from date not null,
    valid_to date,
    verify_status varchar2(32 char) not null,
    status varchar2(32 char) not null,
    constraint fk_org_capability_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint uk_org_capability unique (tenant_id, organization_id, capability_type, valid_from),
    constraint ck_org_capability_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_org_capability_type on organization_capabilities (tenant_id, capability_type, status);

create table organization_responsibilities (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    organization_id number(19,0) not null,
    assignment_id number(19,0),
    external_responsible_name varchar2(100 char),
    responsibility_type varchar2(32 char) not null,
    primary_responsibility number(1,0) default 0 not null,
    valid_from date not null,
    valid_to date,
    status varchar2(32 char) not null,
    constraint fk_org_responsibility_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_org_responsibility_asg foreign key (tenant_id, assignment_id) references staff_assignments(tenant_id, id),
    constraint ck_org_responsibility_subject check (
        (assignment_id is not null and external_responsible_name is null) or
        (assignment_id is null and external_responsible_name is not null)
    ),
    constraint ck_org_responsibility_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_org_responsibility_org on organization_responsibilities (tenant_id, organization_id, responsibility_type, status);

alter table dictionary_definitions drop constraint ck_dictionary_definition_management;
alter table dictionary_definitions add constraint ck_dictionary_definition_management check (
    (system_managed = 1 and created_by is null and updated_by is null) or
    (system_managed = 0 and ((created_by is null and updated_by is null) or
                            (created_by is not null and updated_by is not null)))
);
