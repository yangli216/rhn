alter table organizations add short_name varchar(100);
alter table organizations add description varchar(1000);
alter table organizations add organization_property varchar(32);
alter table organizations add virtual boolean default false not null;
alter table organizations add sort_order integer default 0 not null;
alter table organizations add timezone_code varchar(64);
alter table organizations add department_type_code varchar(128);

create index idx_organization_tree_sort on organizations (tenant_id, parent_id, sort_order, code);
create index idx_organization_department_type on organizations (tenant_id, department_type_code, status);

create table organization_identifiers (
    id bigint primary key,
    tenant_id bigint not null,
    organization_id bigint not null,
    identifier_system varchar(300) not null,
    identifier_code varchar(128) not null,
    identifier_type varchar(64) not null,
    issuer_organization_id bigint,
    primary_identifier boolean default false not null,
    valid_from date not null,
    valid_to date,
    verify_status varchar(32) not null,
    verified_at timestamp with time zone,
    verified_by bigint,
    status varchar(32) not null,
    constraint fk_org_ident_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_org_ident_issuer foreign key (tenant_id, issuer_organization_id) references organizations(tenant_id, id),
    constraint uk_org_ident_system_code unique (tenant_id, identifier_system, identifier_code),
    constraint ck_org_ident_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_org_ident_org_status on organization_identifiers (tenant_id, organization_id, status);

create table organization_contacts (
    id bigint primary key,
    tenant_id bigint not null,
    organization_id bigint not null,
    contact_type varchar(32) not null,
    contact_value varchar(300) not null,
    contact_use varchar(32) not null,
    primary_contact boolean default false not null,
    sort_order integer default 0 not null,
    valid_from date not null,
    valid_to date,
    status varchar(32) not null,
    constraint fk_org_contact_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint uk_org_contact_value unique (tenant_id, organization_id, contact_type, contact_value),
    constraint ck_org_contact_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_org_contact_org_status on organization_contacts (tenant_id, organization_id, status, sort_order);

create table organization_addresses (
    id bigint primary key,
    tenant_id bigint not null,
    organization_id bigint not null,
    address_type varchar(32) not null,
    country_code varchar(32) not null,
    province_code varchar(32),
    city_code varchar(32),
    district_code varchar(32),
    street_address varchar(500) not null,
    postal_code varchar(32),
    valid_from date not null,
    valid_to date,
    status varchar(32) not null,
    constraint fk_org_address_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint uk_org_address_type_date unique (tenant_id, organization_id, address_type, valid_from),
    constraint ck_org_address_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_org_address_district on organization_addresses (tenant_id, district_code, status);

create table organization_relations (
    id bigint primary key,
    tenant_id bigint not null,
    source_organization_id bigint not null,
    target_organization_id bigint not null,
    relation_type varchar(32) not null,
    primary_relation boolean default false not null,
    description varchar(500),
    valid_from date not null,
    valid_to date,
    status varchar(32) not null,
    constraint fk_org_rel_source foreign key (tenant_id, source_organization_id) references organizations(tenant_id, id),
    constraint fk_org_rel_target foreign key (tenant_id, target_organization_id) references organizations(tenant_id, id),
    constraint uk_org_relation unique (tenant_id, source_organization_id, target_organization_id, relation_type, valid_from),
    constraint ck_org_relation_self check (source_organization_id <> target_organization_id),
    constraint ck_org_relation_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_org_relation_target on organization_relations (tenant_id, target_organization_id, relation_type, status);

create table organization_capabilities (
    id bigint primary key,
    tenant_id bigint not null,
    organization_id bigint not null,
    capability_type varchar(64) not null,
    qualification_basis_code varchar(128),
    capability_scope varchar(1000),
    valid_from date not null,
    valid_to date,
    verify_status varchar(32) not null,
    status varchar(32) not null,
    constraint fk_org_capability_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint uk_org_capability unique (tenant_id, organization_id, capability_type, valid_from),
    constraint ck_org_capability_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_org_capability_type on organization_capabilities (tenant_id, capability_type, status);

create table organization_responsibilities (
    id bigint primary key,
    tenant_id bigint not null,
    organization_id bigint not null,
    assignment_id bigint,
    external_responsible_name varchar(100),
    responsibility_type varchar(32) not null,
    primary_responsibility boolean default false not null,
    valid_from date not null,
    valid_to date,
    status varchar(32) not null,
    constraint fk_org_responsibility_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_org_responsibility_asg foreign key (tenant_id, assignment_id) references staff_assignments(tenant_id, id),
    constraint ck_org_responsibility_subject check (
        (assignment_id is not null and external_responsible_name is null) or
        (assignment_id is null and external_responsible_name is not null)
    ),
    constraint ck_org_responsibility_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_org_responsibility_org on organization_responsibilities (tenant_id, organization_id, responsibility_type, status);

-- Product-delivered ordinary dictionaries may be initialized by Flyway without fabricating a user account.
alter table dictionary_definitions drop constraint ck_dictionary_definition_management;
alter table dictionary_definitions add constraint ck_dictionary_definition_management check (
    (system_managed = true and created_by is null and updated_by is null) or
    (system_managed = false and ((created_by is null and updated_by is null) or
                                 (created_by is not null and updated_by is not null)))
);
