alter table service_variants add constraint uk_service_variant_tenant_id unique (tenant_id, id);

create table item_attribute_definitions (
    id bigint primary key,
    revision bigint default 0 not null,
    scope_type varchar(16) not null,
    scope_code varchar(80) not null,
    tenant_id bigint,
    code varchar(128) not null,
    name varchar(200) not null,
    description varchar(1000) not null,
    data_type varchar(32) not null,
    cardinality varchar(16) not null,
    dictionary_id bigint,
    unit_code varchar(64),
    schema_json text not null,
    default_json text,
    variability varchar(32) not null,
    override_policy varchar(32) not null,
    allowed_scope_json text not null,
    context_basis varchar(32) not null,
    storage_mode varchar(16) not null,
    projection_field varchar(256),
    validation_rule_id bigint,
    sensitivity varchar(32) not null,
    status varchar(32) not null,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_item_attr_def_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_item_attr_def_dictionary foreign key (dictionary_id) references dictionary_definitions(id),
    constraint uk_item_attr_def_scope_code unique (scope_code, code),
    constraint uk_item_attr_def_tenant_id unique (tenant_id, id),
    constraint ck_item_attr_def_scope check (
        (scope_type = 'PLATFORM' and scope_code = 'PLATFORM' and tenant_id is null) or
        (scope_type = 'TENANT' and tenant_id is not null)
    ),
    constraint ck_item_attr_def_data_type check (data_type in (
        'BOOLEAN', 'INTEGER', 'DECIMAL', 'TEXT', 'ENUM', 'DATE', 'DATETIME',
        'DURATION', 'DICT_REF', 'TERM_REF', 'OBJECT'
    )),
    constraint ck_item_attr_def_cardinality check (cardinality in ('SINGLE', 'MULTIPLE')),
    constraint ck_item_attr_def_variability check (variability in ('BASE_ONLY', 'SCOPE_OVERRIDE', 'LOCAL_ONLY')),
    constraint ck_item_attr_def_override check (override_policy in ('ANY', 'RESTRICTIVE_ONLY', 'NO_OVERRIDE')),
    constraint ck_item_attr_def_context check (context_basis in ('NONE', 'ORDERING', 'EXECUTING', 'DISPENSING', 'STOCKING')),
    constraint ck_item_attr_def_storage check (
        (storage_mode = 'EXTENSION' and projection_field is null) or
        (storage_mode = 'PROJECTED' and projection_field is not null)
    ),
    constraint ck_item_attr_def_variability_override check (
        (variability = 'SCOPE_OVERRIDE' and override_policy <> 'NO_OVERRIDE') or
        (variability <> 'SCOPE_OVERRIDE' and override_policy = 'NO_OVERRIDE')
    )
);
create index idx_item_attr_def_resolution on item_attribute_definitions (variability, context_basis, status);

create table item_type_attributes (
    id bigint primary key,
    revision bigint default 0 not null,
    item_type_id bigint not null,
    attribute_definition_id bigint not null,
    required_value boolean default false not null,
    default_json text,
    widget_type varchar(32) not null,
    group_name varchar(200),
    group_sort_order integer not null,
    attribute_sort_order integer not null,
    visible_condition_json text,
    required_condition_json text,
    searchable boolean default false not null,
    list_display boolean default false not null,
    status varchar(32) not null,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_item_type_attr_type foreign key (item_type_id) references item_types(id),
    constraint fk_item_type_attr_def foreign key (attribute_definition_id) references item_attribute_definitions(id),
    constraint uk_item_type_attribute unique (item_type_id, attribute_definition_id),
    constraint uk_item_type_attribute_order unique (item_type_id, group_sort_order, attribute_sort_order)
);
create index idx_item_type_attr_definition on item_type_attributes (attribute_definition_id, status);

create table item_attribute_subjects (
    id bigint primary key,
    tenant_id bigint,
    subject_type varchar(32) not null,
    subject_key varchar(256) not null,
    item_master_id bigint,
    medication_id bigint,
    catalog_item_id bigint,
    service_variant_id bigint,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    constraint fk_item_attr_subject_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_item_attr_subject_master foreign key (item_master_id) references item_masters(id),
    constraint fk_item_attr_subject_med foreign key (tenant_id, medication_id) references medications(tenant_id, id),
    constraint fk_item_attr_subject_catalog foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint fk_item_attr_subject_variant foreign key (tenant_id, service_variant_id) references service_variants(tenant_id, id),
    constraint uk_item_attr_subject_key unique (subject_key),
    constraint uk_item_attr_subject_tenant_id unique (tenant_id, id),
    constraint ck_item_attr_subject_target check (
        (case when item_master_id is null then 0 else 1 end) +
        (case when medication_id is null then 0 else 1 end) +
        (case when catalog_item_id is null then 0 else 1 end) +
        (case when service_variant_id is null then 0 else 1 end) = 1
    ),
    constraint ck_item_attr_subject_scope check (
        (subject_type = 'ITEM_MASTER' and tenant_id is null and item_master_id is not null) or
        (subject_type = 'MEDICATION' and tenant_id is not null and medication_id is not null) or
        (subject_type = 'CATALOG_ITEM' and tenant_id is not null and catalog_item_id is not null) or
        (subject_type = 'SERVICE_VARIANT' and tenant_id is not null and service_variant_id is not null)
    )
);
create index idx_item_attr_subject_master on item_attribute_subjects (item_master_id);
create index idx_item_attr_subject_med on item_attribute_subjects (tenant_id, medication_id);
create index idx_item_attr_subject_catalog on item_attribute_subjects (tenant_id, catalog_item_id);
create index idx_item_attr_subject_variant on item_attribute_subjects (tenant_id, service_variant_id);

create table item_attribute_values (
    id bigint primary key,
    revision bigint default 0 not null,
    scope_type varchar(16) not null,
    scope_code varchar(80) not null,
    tenant_id bigint,
    attribute_subject_id bigint not null,
    attribute_definition_id bigint not null,
    value_json text not null,
    valid_from date not null,
    valid_to date,
    status varchar(32) not null,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_item_attr_value_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_item_attr_value_subject foreign key (attribute_subject_id) references item_attribute_subjects(id),
    constraint fk_item_attr_value_def foreign key (attribute_definition_id) references item_attribute_definitions(id),
    constraint uk_item_attr_value_period unique (scope_code, attribute_subject_id, attribute_definition_id, valid_from),
    constraint ck_item_attr_value_scope check (
        (scope_type = 'PLATFORM' and scope_code = 'PLATFORM' and tenant_id is null) or
        (scope_type = 'TENANT' and tenant_id is not null)
    ),
    constraint ck_item_attr_value_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_item_attr_value_resolution on item_attribute_values (tenant_id, attribute_definition_id, status, valid_from);

create table item_attribute_overrides (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    attribute_subject_id bigint not null,
    attribute_definition_id bigint not null,
    scope_type varchar(32) not null,
    scope_key varchar(512) not null,
    organization_id bigint,
    department_id bigint,
    value_mode varchar(32) not null,
    value_json text,
    valid_from date not null,
    valid_to date,
    status varchar(32) not null,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_item_attr_override_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_item_attr_override_subject foreign key (tenant_id, attribute_subject_id) references item_attribute_subjects(tenant_id, id),
    constraint fk_item_attr_override_def foreign key (attribute_definition_id) references item_attribute_definitions(id),
    constraint fk_item_attr_override_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_item_attr_override_dept foreign key (tenant_id, organization_id, department_id) references departments(tenant_id, organization_id, id),
    constraint uk_item_attr_override_period unique (
        tenant_id, attribute_subject_id, attribute_definition_id, scope_key, valid_from
    ),
    constraint ck_item_attr_override_scope check (
        (scope_type = 'TENANT' and organization_id is null and department_id is null) or
        (scope_type = 'ORGANIZATION' and organization_id is not null and department_id is null) or
        (scope_type = 'DEPARTMENT' and organization_id is not null and department_id is not null)
    ),
    constraint ck_item_attr_override_value check (
        (value_mode = 'OVERRIDE' and value_json is not null) or
        (value_mode = 'EXPLICIT_NULL' and value_json is null)
    ),
    constraint ck_item_attr_override_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_item_attr_override_scope on item_attribute_overrides (
    tenant_id, organization_id, department_id, status, valid_from
);
create index idx_item_attr_override_definition on item_attribute_overrides (
    tenant_id, attribute_definition_id, scope_type, status
);

create table item_attribute_changes (
    id bigint primary key,
    tenant_id bigint,
    attribute_definition_id bigint not null,
    item_type_id bigint,
    item_type_attribute_id bigint,
    attribute_subject_id bigint,
    attribute_value_id bigint,
    attribute_override_id bigint,
    target_type varchar(32) not null,
    change_type varchar(32) not null,
    scope_key varchar(512),
    before_json text,
    after_json text,
    change_reason varchar(1000) not null,
    request_code varchar(128) not null,
    changed_at timestamp with time zone not null,
    changed_by bigint not null,
    constraint fk_item_attr_change_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_item_attr_change_def foreign key (attribute_definition_id) references item_attribute_definitions(id),
    constraint fk_item_attr_change_type foreign key (item_type_id) references item_types(id),
    constraint fk_item_attr_change_assignment foreign key (item_type_attribute_id) references item_type_attributes(id),
    constraint fk_item_attr_change_subject foreign key (attribute_subject_id) references item_attribute_subjects(id),
    constraint fk_item_attr_change_value foreign key (attribute_value_id) references item_attribute_values(id),
    constraint fk_item_attr_change_override foreign key (attribute_override_id) references item_attribute_overrides(id),
    constraint uk_item_attr_change_request unique (request_code),
    constraint ck_item_attr_change_target check (target_type in ('DEFINITION', 'TYPE_ASSIGNMENT', 'BASE_VALUE', 'SCOPE_OVERRIDE')),
    constraint ck_item_attr_change_type_value check (change_type in ('CREATE', 'UPDATE', 'ENABLE', 'DISABLE', 'RESET', 'ROLLBACK'))
);
create index idx_item_attr_change_def on item_attribute_changes (attribute_definition_id, changed_at);
create index idx_item_attr_change_subject on item_attribute_changes (tenant_id, attribute_subject_id, changed_at);
create index idx_item_attr_change_override on item_attribute_changes (attribute_override_id, changed_at);
