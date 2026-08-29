alter table laboratory_services add column revision bigint default 0 not null;
alter table laboratory_services add column created_at timestamp with time zone default current_timestamp not null;
alter table laboratory_services add column created_by bigint;
alter table laboratory_services add column updated_at timestamp with time zone default current_timestamp not null;
alter table laboratory_services add column updated_by bigint;

alter table laboratory_service_specimens add column revision bigint default 0 not null;
alter table laboratory_service_specimens add column created_at timestamp with time zone default current_timestamp not null;
alter table laboratory_service_specimens add column created_by bigint;
alter table laboratory_service_specimens add column updated_at timestamp with time zone default current_timestamp not null;
alter table laboratory_service_specimens add column updated_by bigint;

alter table examination_services add column revision bigint default 0 not null;
alter table examination_services add column created_at timestamp with time zone default current_timestamp not null;
alter table examination_services add column created_by bigint;
alter table examination_services add column updated_at timestamp with time zone default current_timestamp not null;
alter table examination_services add column updated_by bigint;

alter table service_variants add column revision bigint default 0 not null;
alter table service_variants add column created_at timestamp with time zone default current_timestamp not null;
alter table service_variants add column created_by bigint;
alter table service_variants add column updated_at timestamp with time zone default current_timestamp not null;
alter table service_variants add column updated_by bigint;

insert into item_types values
    (362387869801001, 0, 'PLATFORM', 'PLATFORM', null, 362387869797001, 'SUPPLY', '医用耗材与器械', '医疗耗材、器械和可经营物资。', 'CATALOG_ITEM', 30, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869801002, 0, 'PLATFORM', 'PLATFORM', null, 362387869801001, 'SUPPLY.CONSUMABLE', '医用耗材', null, 'CATALOG_ITEM', 10, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869801003, 0, 'PLATFORM', 'PLATFORM', null, 362387869801001, 'SUPPLY.DEVICE', '医疗器械', null, 'CATALOG_ITEM', 20, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222);

create table supply_items (
    catalog_item_id bigint primary key,
    tenant_id bigint not null,
    udi_di varchar(128),
    generic_code varchar(128),
    generic_name varchar(300),
    model_name varchar(300),
    specification varchar(500),
    material_type varchar(64),
    device_class varchar(32),
    high_value boolean default false not null,
    implant boolean default false not null,
    intervention boolean default false not null,
    sterile boolean default false not null,
    single_use boolean default false not null,
    registration_code varchar(128),
    registration_name varchar(500),
    registrant_name varchar(300),
    registration_from date,
    registration_to date,
    manufacturer_id bigint,
    structure_description varchar(4000),
    scope_description varchar(4000),
    instruction text,
    constraint fk_supply_catalog foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint fk_supply_manufacturer foreign key (tenant_id, manufacturer_id) references manufacturers(tenant_id, id),
    constraint uk_supply_tenant_id unique (tenant_id, catalog_item_id),
    constraint uk_supply_udi unique (tenant_id, udi_di),
    constraint ck_supply_registration_period check (registration_to is null or registration_from is null or registration_to >= registration_from),
    constraint ck_supply_device_class check (device_class is null or device_class in ('I', 'II', 'III'))
);
create index idx_supply_registration on supply_items (tenant_id, registration_code);
create index idx_supply_generic on supply_items (tenant_id, generic_code, generic_name);

create table item_groups (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    organization_id bigint,
    execution_department_id bigint,
    code varchar(64) not null,
    name varchar(300) not null,
    group_type varchar(32) not null,
    usage_type varchar(32),
    point_of_care boolean default false not null,
    status varchar(32) not null,
    valid_from date not null,
    valid_to date,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_item_group_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_item_group_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_item_group_dept foreign key (tenant_id, organization_id, execution_department_id) references departments(tenant_id, organization_id, id),
    constraint uk_item_group_tenant_id unique (tenant_id, id),
    constraint uk_item_group_code unique (tenant_id, organization_id, code),
    constraint ck_item_group_type check (group_type in ('LIS', 'PACS', 'ORDER_SET', 'PACKAGE')),
    constraint ck_item_group_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_item_group_lookup on item_groups (tenant_id, organization_id, execution_department_id, group_type, status);

create table item_group_members (
    id bigint primary key,
    tenant_id bigint not null,
    item_group_id bigint not null,
    catalog_item_id bigint not null,
    sort_order integer not null,
    quantity decimal(28,8) not null,
    unit_code varchar(64),
    required_member boolean default true not null,
    member_description varchar(1000),
    constraint fk_item_group_member_group foreign key (tenant_id, item_group_id) references item_groups(tenant_id, id),
    constraint fk_item_group_member_item foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint uk_item_group_member unique (tenant_id, item_group_id, catalog_item_id),
    constraint uk_item_group_member_order unique (tenant_id, item_group_id, sort_order),
    constraint ck_item_group_member_quantity check (quantity > 0)
);
create index idx_item_group_member_item on item_group_members (tenant_id, catalog_item_id);

create table unit_definitions (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    code varchar(64) not null,
    name varchar(160) not null,
    symbol varchar(32),
    dimension varchar(32) not null,
    decimal_scale integer default 4 not null,
    status varchar(32) not null,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_unit_tenant foreign key (tenant_id) references tenants(id),
    constraint uk_unit_tenant_id unique (tenant_id, id),
    constraint uk_unit_code unique (tenant_id, code),
    constraint ck_unit_dimension check (dimension in ('COUNT', 'MASS', 'VOLUME', 'TIME', 'LENGTH', 'AREA', 'ACTIVITY', 'TEMPERATURE', 'OTHER')),
    constraint ck_unit_scale check (decimal_scale between 0 and 12)
);
create index idx_unit_lookup on unit_definitions (tenant_id, dimension, status, name);

create table unit_conversions (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    catalog_item_id bigint,
    scope_code varchar(96) not null,
    from_unit_id bigint not null,
    to_unit_id bigint not null,
    factor decimal(28,12) not null,
    offset_value decimal(28,12) default 0 not null,
    valid_from date not null,
    valid_to date,
    status varchar(32) not null,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_unit_conversion_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_unit_conversion_item foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint fk_unit_conversion_from foreign key (tenant_id, from_unit_id) references unit_definitions(tenant_id, id),
    constraint fk_unit_conversion_to foreign key (tenant_id, to_unit_id) references unit_definitions(tenant_id, id),
    constraint uk_unit_conversion_tenant_id unique (tenant_id, id),
    constraint uk_unit_conversion_period unique (tenant_id, scope_code, from_unit_id, to_unit_id, valid_from),
    constraint ck_unit_conversion_scope check ((catalog_item_id is null and scope_code = 'GLOBAL') or (catalog_item_id is not null and scope_code <> 'GLOBAL')),
    constraint ck_unit_conversion_factor check (factor > 0),
    constraint ck_unit_conversion_direction check (from_unit_id <> to_unit_id),
    constraint ck_unit_conversion_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_unit_conversion_lookup on unit_conversions (tenant_id, scope_code, from_unit_id, to_unit_id, status, valid_from);

insert into unit_definitions values
    (362387869801101, 0, 362387869790209, 'EA', '个', '个', 'COUNT', 0, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869801102, 0, 362387869790209, 'BOX', '盒', '盒', 'COUNT', 0, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869801103, 0, 362387869790209, 'ML', '毫升', 'mL', 'VOLUME', 3, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869801104, 0, 362387869790209, 'L', '升', 'L', 'VOLUME', 3, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869801105, 0, 362387869790209, 'MG', '毫克', 'mg', 'MASS', 3, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869801106, 0, 362387869790209, 'G', '克', 'g', 'MASS', 3, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869801107, 0, 362387869790209, 'MIN', '分钟', 'min', 'TIME', 2, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869801108, 0, 362387869790209, 'H', '小时', 'h', 'TIME', 2, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222);

insert into unit_conversions values
    (362387869801201, 0, 362387869790209, null, 'GLOBAL', 362387869801104, 362387869801103, 1000, 0, date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869801202, 0, 362387869790209, null, 'GLOBAL', 362387869801106, 362387869801105, 1000, 0, date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869801203, 0, 362387869790209, null, 'GLOBAL', 362387869801108, 362387869801107, 60, 0, date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222);
