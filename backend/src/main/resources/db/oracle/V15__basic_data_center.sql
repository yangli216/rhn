alter table code_systems add system_type varchar2(32 char) default 'COMMON' not null;
alter table code_systems add publisher varchar2(300 char);
alter table code_systems add description varchar2(2000 char);
alter table code_systems add source_type varchar2(32 char) default 'MANUAL' not null;
alter table code_systems add revision number(19) default 0 not null;
alter table code_systems add updated_at timestamp with time zone default current_timestamp not null;

alter table concepts add concept_type varchar2(32 char) default 'CONCEPT' not null;
alter table concepts add short_display varchar2(300 char);
alter table concepts add chapter_code varchar2(64 char);
alter table concepts add chapter_name varchar2(300 char);
alter table concepts add search_code varchar2(128 char);
alter table concepts add source_type varchar2(32 char) default 'MANUAL' not null;
alter table concepts add replacement_concept_id number(19);
alter table concepts add revision number(19) default 0 not null;
alter table concepts add updated_at timestamp with time zone default current_timestamp not null;
alter table concepts add constraint fk_concept_replacement foreign key (replacement_concept_id) references concepts(id);
create index idx_concept_type_search on concepts (code_system_id, concept_type, status, display);

create table concept_aliases (
    id number(19) primary key,
    concept_id number(19) not null,
    alias_type varchar2(32 char) not null,
    alias_name varchar2(300 char) not null,
    search_code varchar2(128 char),
    status varchar2(32 char) not null,
    constraint fk_concept_alias_concept foreign key (concept_id) references concepts(id),
    constraint uk_concept_alias unique (concept_id, alias_type, alias_name)
);
create index idx_concept_alias_search on concept_aliases (alias_name, status);

create table organization_concepts (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    organization_id number(19) not null,
    concept_id number(19) not null,
    local_code varchar2(64 char),
    local_name varchar2(300 char),
    selectable number(1) default 1 not null,
    frequent number(1) default 0 not null,
    status varchar2(32 char) not null,
    valid_from date not null,
    valid_to date,
    created_at timestamp with time zone not null,
    created_by number(19),
    updated_at timestamp with time zone not null,
    updated_by number(19),
    constraint fk_org_concept_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_org_concept_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_org_concept_concept foreign key (concept_id) references concepts(id),
    constraint uk_org_concept_tenant_id unique (tenant_id, id),
    constraint uk_org_concept_period unique (tenant_id, organization_id, concept_id, valid_from),
    constraint ck_org_concept_select check (selectable in (0, 1)),
    constraint ck_org_concept_freq check (frequent in (0, 1)),
    constraint ck_org_concept_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_org_concept_lookup on organization_concepts (tenant_id, organization_id, status, selectable, concept_id);

create table catalog_items (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    code varchar2(64 char) not null,
    name varchar2(300 char) not null,
    item_type varchar2(32 char) not null,
    unit_code varchar2(64 char),
    orderable number(1) default 0 not null,
    chargeable number(1) default 0 not null,
    stocked number(1) default 0 not null,
    status varchar2(32 char) not null,
    valid_from date not null,
    valid_to date,
    created_at timestamp with time zone not null,
    created_by number(19),
    updated_at timestamp with time zone not null,
    updated_by number(19),
    constraint fk_catalog_item_tenant foreign key (tenant_id) references tenants(id),
    constraint uk_catalog_item_tenant_id unique (tenant_id, id),
    constraint uk_catalog_item_code unique (tenant_id, code),
    constraint ck_catalog_item_flags check (orderable in (0, 1) and chargeable in (0, 1) and stocked in (0, 1)),
    constraint ck_catalog_item_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_catalog_item_search on catalog_items (tenant_id, item_type, status, name);

create table item_aliases (
    id number(19) primary key,
    tenant_id number(19) not null,
    catalog_item_id number(19) not null,
    alias_type varchar2(32 char) not null,
    alias_name varchar2(300 char) not null,
    pinyin_code varchar2(128 char),
    wubi_code varchar2(128 char),
    mnemonic_code varchar2(128 char),
    primary_alias number(1) default 0 not null,
    status varchar2(32 char) not null,
    constraint fk_item_alias_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_item_alias_item foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint uk_item_alias unique (tenant_id, catalog_item_id, alias_type, alias_name),
    constraint ck_item_alias_primary check (primary_alias in (0, 1))
);
create index idx_item_alias_pinyin on item_aliases (tenant_id, pinyin_code);
create index idx_item_alias_name on item_aliases (tenant_id, alias_name, status);

create table manufacturers (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    code varchar2(64 char) not null,
    name varchar2(300 char) not null,
    short_name varchar2(160 char),
    manufacturer_type varchar2(32 char) not null,
    production_place varchar2(32 char),
    country_code varchar2(32 char),
    address varchar2(1000 char),
    status varchar2(32 char) not null,
    created_at timestamp with time zone not null,
    created_by number(19),
    updated_at timestamp with time zone not null,
    updated_by number(19),
    constraint fk_manufacturer_tenant foreign key (tenant_id) references tenants(id),
    constraint uk_manufacturer_tenant_id unique (tenant_id, id),
    constraint uk_manufacturer_code unique (tenant_id, code)
);
create index idx_manufacturer_name on manufacturers (tenant_id, name, status);

create table medications (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    code varchar2(64 char) not null,
    name varchar2(300 char) not null,
    alias_name varchar2(300 char),
    medication_type varchar2(32 char) not null,
    dose_form varchar2(64 char),
    preparation_spec varchar2(300 char),
    preparation_unit varchar2(64 char),
    strength_value number(28,8),
    strength_unit varchar2(64 char),
    storage_type varchar2(32 char),
    prescription_drug number(1) default 0 not null,
    essential_drug number(1) default 0 not null,
    antimicrobial number(1) default 0 not null,
    antimicrobial_level varchar2(64 char),
    skin_test_required number(1) default 0 not null,
    default_dose number(28,8),
    default_dose_unit varchar2(64 char),
    default_route varchar2(64 char),
    default_frequency varchar2(64 char),
    chronic_disease_drug number(1) default 0 not null,
    single_order number(1) default 1 not null,
    status varchar2(32 char) not null,
    created_at timestamp with time zone not null,
    created_by number(19),
    updated_at timestamp with time zone not null,
    updated_by number(19),
    constraint fk_medication_tenant foreign key (tenant_id) references tenants(id),
    constraint uk_medication_tenant_id unique (tenant_id, id),
    constraint uk_medication_code unique (tenant_id, code),
    constraint ck_medication_flags check (prescription_drug in (0, 1) and essential_drug in (0, 1)
        and antimicrobial in (0, 1) and skin_test_required in (0, 1)
        and chronic_disease_drug in (0, 1) and single_order in (0, 1))
);
create index idx_medication_search on medications (tenant_id, status, name, dose_form);

create table medication_products (
    catalog_item_id number(19) primary key,
    tenant_id number(19) not null,
    medication_id number(19) not null,
    manufacturer_id number(19) not null,
    trade_name varchar2(300 char),
    approval_code varchar2(128 char),
    approval_from date,
    approval_to date,
    registration_code varchar2(128 char),
    registration_from date,
    registration_to date,
    purchase_code varchar2(128 char),
    market_status varchar2(32 char),
    production_place varchar2(32 char),
    otc number(1) default 0 not null,
    central_purchase number(1) default 0 not null,
    import_allowed number(1) default 0 not null,
    trace_split_required number(1) default 0 not null,
    shelf_life_value number(12,3),
    shelf_life_unit varchar2(32 char),
    indication varchar2(4000 char),
    instruction clob,
    constraint fk_med_product_item foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint fk_med_product_med foreign key (tenant_id, medication_id) references medications(tenant_id, id),
    constraint fk_med_product_mfr foreign key (tenant_id, manufacturer_id) references manufacturers(tenant_id, id),
    constraint ck_med_product_flags check (otc in (0, 1) and central_purchase in (0, 1)
        and import_allowed in (0, 1) and trace_split_required in (0, 1))
);
create index idx_med_product_med on medication_products (tenant_id, medication_id, manufacturer_id, approval_code);

create table item_packages (
    id number(19) primary key,
    tenant_id number(19) not null,
    catalog_item_id number(19) not null,
    base_package_id number(19),
    unit_code varchar2(64 char) not null,
    unit_name varchar2(160 char) not null,
    package_spec varchar2(300 char),
    quantity_factor number(28,8) not null,
    usage_type varchar2(32 char),
    barcode varchar2(256 char),
    default_purchase number(1) default 0 not null,
    default_sale number(1) default 0 not null,
    default_dispense number(1) default 0 not null,
    status varchar2(32 char) not null,
    valid_from date not null,
    valid_to date,
    constraint fk_item_package_item foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint fk_item_package_base foreign key (base_package_id) references item_packages(id),
    constraint uk_item_package_tenant_id unique (tenant_id, id),
    constraint uk_item_package_unit unique (tenant_id, catalog_item_id, unit_code, valid_from),
    constraint ck_item_package_flags check (default_purchase in (0, 1) and default_sale in (0, 1) and default_dispense in (0, 1)),
    constraint ck_item_package_factor check (quantity_factor > 0),
    constraint ck_item_package_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_item_package_barcode on item_packages (tenant_id, barcode);

create table service_items (
    catalog_item_id number(19) primary key,
    tenant_id number(19) not null,
    service_type varchar2(64 char) not null,
    service_subtype varchar2(64 char),
    usage_type varchar2(32 char) not null,
    medical_technology number(1) default 0 not null,
    combination_item number(1) default 0 not null,
    single_order number(1) default 1 not null,
    specimen_type varchar2(64 char),
    examination_type varchar2(64 char),
    accounting_category varchar2(64 char),
    duplicate_rule varchar2(64 char),
    multi_site_price number(24,6),
    free_site_count number(10),
    max_body_site_count number(10),
    mutual_recognition_code varchar2(128 char),
    pregnancy_alert number(1) default 0 not null,
    attention varchar2(2000 char),
    examination_notes varchar2(2000 char),
    constraint fk_service_item_item foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint ck_service_item_flags check (medical_technology in (0, 1) and combination_item in (0, 1)
        and single_order in (0, 1) and pregnancy_alert in (0, 1))
);
create index idx_service_item_type on service_items (tenant_id, service_type, service_subtype);

create table organization_catalog_items (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    organization_id number(19) not null,
    catalog_item_id number(19) not null,
    default_department_id number(19),
    local_code varchar2(64 char),
    local_name varchar2(300 char),
    orderable number(1) default 0 not null,
    executable number(1) default 0 not null,
    chargeable number(1) default 0 not null,
    purchasable number(1) default 0 not null,
    stocked number(1) default 0 not null,
    dispensable number(1) default 0 not null,
    returnable number(1) default 0 not null,
    status varchar2(32 char) not null,
    valid_from date not null,
    valid_to date,
    created_at timestamp with time zone not null,
    created_by number(19),
    updated_at timestamp with time zone not null,
    updated_by number(19),
    constraint fk_org_item_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_org_item_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_org_item_catalog foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint fk_org_item_dept foreign key (tenant_id, organization_id, default_department_id) references departments(tenant_id, organization_id, id),
    constraint uk_org_item_tenant_id unique (tenant_id, id),
    constraint uk_org_item_period unique (tenant_id, organization_id, catalog_item_id, valid_from),
    constraint ck_org_item_flags check (orderable in (0, 1) and executable in (0, 1) and chargeable in (0, 1)
        and purchasable in (0, 1) and stocked in (0, 1) and dispensable in (0, 1) and returnable in (0, 1)),
    constraint ck_org_item_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_org_item_lookup on organization_catalog_items (tenant_id, organization_id, status, catalog_item_id);

create table catalog_prices (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    catalog_item_id number(19) not null,
    organization_id number(19),
    package_id number(19),
    price_type varchar2(32 char) not null,
    price number(24,6) not null,
    currency_code varchar2(16 char) not null,
    price_document_code varchar2(128 char),
    price_reason varchar2(1000 char),
    valid_from date not null,
    valid_to date,
    status varchar2(32 char) not null,
    created_at timestamp with time zone not null,
    created_by number(19),
    updated_at timestamp with time zone not null,
    updated_by number(19),
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
