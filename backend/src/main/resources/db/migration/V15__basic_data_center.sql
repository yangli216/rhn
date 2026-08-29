alter table code_systems add column system_type varchar(32) default 'COMMON' not null;
alter table code_systems add column publisher varchar(300);
alter table code_systems add column description varchar(2000);
alter table code_systems add column source_type varchar(32) default 'MANUAL' not null;
alter table code_systems add column revision bigint default 0 not null;
alter table code_systems add column updated_at timestamp with time zone default current_timestamp not null;

alter table concepts add column concept_type varchar(32) default 'CONCEPT' not null;
alter table concepts add column short_display varchar(300);
alter table concepts add column chapter_code varchar(64);
alter table concepts add column chapter_name varchar(300);
alter table concepts add column search_code varchar(128);
alter table concepts add column source_type varchar(32) default 'MANUAL' not null;
alter table concepts add column replacement_concept_id bigint;
alter table concepts add column revision bigint default 0 not null;
alter table concepts add column updated_at timestamp with time zone default current_timestamp not null;
alter table concepts add constraint fk_concept_replacement foreign key (replacement_concept_id) references concepts(id);
create index idx_concept_type_search on concepts (code_system_id, concept_type, status, display);

create table concept_aliases (
    id bigint primary key,
    concept_id bigint not null,
    alias_type varchar(32) not null,
    alias_name varchar(300) not null,
    search_code varchar(128),
    status varchar(32) not null,
    constraint fk_concept_alias_concept foreign key (concept_id) references concepts(id),
    constraint uk_concept_alias unique (concept_id, alias_type, alias_name)
);
create index idx_concept_alias_search on concept_aliases (alias_name, status);

create table organization_concepts (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    organization_id bigint not null,
    concept_id bigint not null,
    local_code varchar(64),
    local_name varchar(300),
    selectable boolean default true not null,
    frequent boolean default false not null,
    status varchar(32) not null,
    valid_from date not null,
    valid_to date,
    created_at timestamp with time zone not null,
    created_by bigint,
    updated_at timestamp with time zone not null,
    updated_by bigint,
    constraint fk_org_concept_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_org_concept_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_org_concept_concept foreign key (concept_id) references concepts(id),
    constraint uk_org_concept_tenant_id unique (tenant_id, id),
    constraint uk_org_concept_period unique (tenant_id, organization_id, concept_id, valid_from),
    constraint ck_org_concept_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_org_concept_lookup on organization_concepts (tenant_id, organization_id, status, selectable, concept_id);

create table catalog_items (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    code varchar(64) not null,
    name varchar(300) not null,
    item_type varchar(32) not null,
    unit_code varchar(64),
    orderable boolean default false not null,
    chargeable boolean default false not null,
    stocked boolean default false not null,
    status varchar(32) not null,
    valid_from date not null,
    valid_to date,
    created_at timestamp with time zone not null,
    created_by bigint,
    updated_at timestamp with time zone not null,
    updated_by bigint,
    constraint fk_catalog_item_tenant foreign key (tenant_id) references tenants(id),
    constraint uk_catalog_item_tenant_id unique (tenant_id, id),
    constraint uk_catalog_item_code unique (tenant_id, code),
    constraint ck_catalog_item_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_catalog_item_search on catalog_items (tenant_id, item_type, status, name);

create table item_aliases (
    id bigint primary key,
    tenant_id bigint not null,
    catalog_item_id bigint not null,
    alias_type varchar(32) not null,
    alias_name varchar(300) not null,
    pinyin_code varchar(128),
    wubi_code varchar(128),
    mnemonic_code varchar(128),
    primary_alias boolean default false not null,
    status varchar(32) not null,
    constraint fk_item_alias_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_item_alias_item foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint uk_item_alias unique (tenant_id, catalog_item_id, alias_type, alias_name)
);
create index idx_item_alias_pinyin on item_aliases (tenant_id, pinyin_code);
create index idx_item_alias_name on item_aliases (tenant_id, alias_name, status);

create table manufacturers (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    code varchar(64) not null,
    name varchar(300) not null,
    short_name varchar(160),
    manufacturer_type varchar(32) not null,
    production_place varchar(32),
    country_code varchar(32),
    address varchar(1000),
    status varchar(32) not null,
    created_at timestamp with time zone not null,
    created_by bigint,
    updated_at timestamp with time zone not null,
    updated_by bigint,
    constraint fk_manufacturer_tenant foreign key (tenant_id) references tenants(id),
    constraint uk_manufacturer_tenant_id unique (tenant_id, id),
    constraint uk_manufacturer_code unique (tenant_id, code)
);
create index idx_manufacturer_name on manufacturers (tenant_id, name, status);

create table medications (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    code varchar(64) not null,
    name varchar(300) not null,
    alias_name varchar(300),
    medication_type varchar(32) not null,
    dose_form varchar(64),
    preparation_spec varchar(300),
    preparation_unit varchar(64),
    strength_value decimal(28,8),
    strength_unit varchar(64),
    storage_type varchar(32),
    prescription_drug boolean default false not null,
    essential_drug boolean default false not null,
    antimicrobial boolean default false not null,
    antimicrobial_level varchar(64),
    skin_test_required boolean default false not null,
    default_dose decimal(28,8),
    default_dose_unit varchar(64),
    default_route varchar(64),
    default_frequency varchar(64),
    chronic_disease_drug boolean default false not null,
    single_order boolean default true not null,
    status varchar(32) not null,
    created_at timestamp with time zone not null,
    created_by bigint,
    updated_at timestamp with time zone not null,
    updated_by bigint,
    constraint fk_medication_tenant foreign key (tenant_id) references tenants(id),
    constraint uk_medication_tenant_id unique (tenant_id, id),
    constraint uk_medication_code unique (tenant_id, code)
);
create index idx_medication_search on medications (tenant_id, status, name, dose_form);

create table medication_products (
    catalog_item_id bigint primary key,
    tenant_id bigint not null,
    medication_id bigint not null,
    manufacturer_id bigint not null,
    trade_name varchar(300),
    approval_code varchar(128),
    approval_from date,
    approval_to date,
    registration_code varchar(128),
    registration_from date,
    registration_to date,
    purchase_code varchar(128),
    market_status varchar(32),
    production_place varchar(32),
    otc boolean default false not null,
    central_purchase boolean default false not null,
    import_allowed boolean default false not null,
    trace_split_required boolean default false not null,
    shelf_life_value decimal(12,3),
    shelf_life_unit varchar(32),
    indication varchar(4000),
    instruction text,
    constraint fk_med_product_item foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint fk_med_product_med foreign key (tenant_id, medication_id) references medications(tenant_id, id),
    constraint fk_med_product_mfr foreign key (tenant_id, manufacturer_id) references manufacturers(tenant_id, id)
);
create index idx_med_product_med on medication_products (tenant_id, medication_id, manufacturer_id, approval_code);

create table item_packages (
    id bigint primary key,
    tenant_id bigint not null,
    catalog_item_id bigint not null,
    base_package_id bigint,
    unit_code varchar(64) not null,
    unit_name varchar(160) not null,
    package_spec varchar(300),
    quantity_factor decimal(28,8) not null,
    usage_type varchar(32),
    barcode varchar(256),
    default_purchase boolean default false not null,
    default_sale boolean default false not null,
    default_dispense boolean default false not null,
    status varchar(32) not null,
    valid_from date not null,
    valid_to date,
    constraint fk_item_package_item foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint fk_item_package_base foreign key (base_package_id) references item_packages(id),
    constraint uk_item_package_tenant_id unique (tenant_id, id),
    constraint uk_item_package_unit unique (tenant_id, catalog_item_id, unit_code, valid_from),
    constraint ck_item_package_factor check (quantity_factor > 0),
    constraint ck_item_package_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_item_package_barcode on item_packages (tenant_id, barcode);

create table service_items (
    catalog_item_id bigint primary key,
    tenant_id bigint not null,
    service_type varchar(64) not null,
    service_subtype varchar(64),
    usage_type varchar(32) not null,
    medical_technology boolean default false not null,
    combination_item boolean default false not null,
    single_order boolean default true not null,
    specimen_type varchar(64),
    examination_type varchar(64),
    accounting_category varchar(64),
    duplicate_rule varchar(64),
    multi_site_price decimal(24,6),
    free_site_count integer,
    max_body_site_count integer,
    mutual_recognition_code varchar(128),
    pregnancy_alert boolean default false not null,
    attention varchar(2000),
    examination_notes varchar(2000),
    constraint fk_service_item_item foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id)
);
create index idx_service_item_type on service_items (tenant_id, service_type, service_subtype);

create table organization_catalog_items (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    organization_id bigint not null,
    catalog_item_id bigint not null,
    default_department_id bigint,
    local_code varchar(64),
    local_name varchar(300),
    orderable boolean default false not null,
    executable boolean default false not null,
    chargeable boolean default false not null,
    purchasable boolean default false not null,
    stocked boolean default false not null,
    dispensable boolean default false not null,
    returnable boolean default false not null,
    status varchar(32) not null,
    valid_from date not null,
    valid_to date,
    created_at timestamp with time zone not null,
    created_by bigint,
    updated_at timestamp with time zone not null,
    updated_by bigint,
    constraint fk_org_item_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_org_item_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_org_item_catalog foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint fk_org_item_dept foreign key (tenant_id, organization_id, default_department_id) references departments(tenant_id, organization_id, id),
    constraint uk_org_item_tenant_id unique (tenant_id, id),
    constraint uk_org_item_period unique (tenant_id, organization_id, catalog_item_id, valid_from),
    constraint ck_org_item_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_org_item_lookup on organization_catalog_items (tenant_id, organization_id, status, catalog_item_id);

create table catalog_prices (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    catalog_item_id bigint not null,
    organization_id bigint,
    package_id bigint,
    price_type varchar(32) not null,
    price decimal(24,6) not null,
    currency_code varchar(16) not null,
    price_document_code varchar(128),
    price_reason varchar(1000),
    valid_from date not null,
    valid_to date,
    status varchar(32) not null,
    created_at timestamp with time zone not null,
    created_by bigint,
    updated_at timestamp with time zone not null,
    updated_by bigint,
    constraint fk_catalog_price_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_catalog_price_item foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint fk_catalog_price_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_catalog_price_package foreign key (tenant_id, package_id) references item_packages(tenant_id, id),
    constraint uk_catalog_price_tenant_id unique (tenant_id, id),
    constraint uk_catalog_price_period unique (tenant_id, catalog_item_id, organization_id, package_id, price_type, valid_from),
    constraint ck_catalog_price_value check (price >= 0),
    constraint ck_catalog_price_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_catalog_price_current on catalog_prices (tenant_id, organization_id, status, valid_from);
