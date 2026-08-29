create table parameter_categories (
    id bigint primary key,
    parent_id bigint,
    code varchar(64) not null,
    name varchar(200) not null,
    description varchar(1000),
    sort_order integer not null default 0,
    active boolean not null default true,
    revision bigint not null default 0,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint uk_parameter_category_code unique (code),
    constraint fk_parameter_category_parent foreign key (parent_id) references parameter_categories(id),
    constraint ck_parameter_category_parent check (parent_id is null or parent_id <> id),
    constraint ck_parameter_category_sort check (sort_order >= 0)
);

create table parameter_definitions (
    id bigint primary key,
    category_id bigint not null,
    parameter_key varchar(160) not null,
    name varchar(200) not null,
    description varchar(1000),
    value_type varchar(24) not null,
    control_type varchar(32) not null,
    json_schema text,
    default_value_json text,
    example_value_json text,
    unit varchar(32),
    dictionary_code varchar(64),
    scope_json text not null,
    parameter_category varchar(24) not null,
    inheritance_enabled boolean not null default true,
    cache_enabled boolean not null default true,
    nullable_value boolean not null default false,
    sensitivity varchar(24) not null,
    display_policy varchar(24) not null,
    status varchar(16) not null,
    revision bigint not null default 0,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint uk_parameter_definition_key unique (parameter_key),
    constraint fk_parameter_definition_category foreign key (category_id) references parameter_categories(id),
    constraint ck_parameter_definition_category check (parameter_category in ('SYSTEM', 'BUSINESS')),
    constraint ck_parameter_definition_status check (status in ('ACTIVE', 'INACTIVE')),
    constraint ck_parameter_definition_sensitivity check (sensitivity in ('NORMAL', 'SENSITIVE', 'SECRET')),
    constraint ck_parameter_definition_display check (display_policy in ('PLAIN', 'MASKED', 'HIDDEN'))
);

create table parameter_values (
    id bigint primary key,
    definition_id bigint not null,
    tenant_id bigint,
    scope_type varchar(24) not null,
    scope_id bigint,
    scope_reference varchar(128),
    scope_code varchar(200) not null,
    value_mode varchar(24) not null,
    value_json text,
    secret_ref varchar(500),
    active boolean not null default true,
    revision bigint not null default 0,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint uk_parameter_value_scope unique (definition_id, scope_code),
    constraint fk_parameter_value_definition foreign key (definition_id) references parameter_definitions(id),
    constraint fk_parameter_value_tenant foreign key (tenant_id) references tenants(id),
    constraint ck_parameter_value_mode check (value_mode in ('INHERIT', 'OVERRIDE', 'RESET_DEFAULT', 'EXPLICIT_NULL')),
    constraint ck_parameter_value_scope_tenant check (
        (scope_type = 'PLATFORM' and tenant_id is null)
        or (scope_type in ('TENANT', 'ORGANIZATION', 'DEPARTMENT', 'USER', 'PRODUCT', 'MODULE', 'ENVIRONMENT')
            and tenant_id is not null)
    ),
    constraint ck_parameter_value_scope_identity check (
        (scope_type = 'PLATFORM' and scope_id is null and scope_reference is null)
        or (scope_type in ('TENANT', 'ORGANIZATION', 'DEPARTMENT', 'USER') and scope_id is not null and scope_reference is null)
        or (scope_type in ('PRODUCT', 'MODULE', 'ENVIRONMENT') and scope_id is null and scope_reference is not null)
    ),
    constraint ck_parameter_value_content check (
        (value_mode = 'OVERRIDE' and ((value_json is not null and secret_ref is null)
            or (value_json is null and secret_ref is not null)))
        or (value_mode <> 'OVERRIDE' and value_json is null and secret_ref is null)
    )
);

create table parameter_changes (
    id bigint primary key,
    tenant_id bigint,
    definition_id bigint not null,
    value_id bigint,
    target_type varchar(24) not null,
    change_type varchar(24) not null,
    before_json text,
    after_json text,
    change_reason varchar(1000),
    request_code varchar(128) not null,
    changed_at timestamp with time zone not null,
    changed_by bigint not null,
    constraint uk_parameter_change_request unique (request_code),
    constraint fk_parameter_change_definition foreign key (definition_id) references parameter_definitions(id),
    constraint fk_parameter_change_value foreign key (value_id) references parameter_values(id),
    constraint fk_parameter_change_tenant foreign key (tenant_id) references tenants(id),
    constraint ck_parameter_change_target check (target_type in ('DEFINITION', 'VALUE')),
    constraint ck_parameter_change_type check (change_type in ('CREATE', 'UPDATE', 'ENABLE', 'DISABLE', 'RESET', 'ROLLBACK')),
    constraint ck_parameter_change_snapshot check (before_json is not null or after_json is not null),
    constraint ck_parameter_change_value_target check (
        (target_type = 'DEFINITION' and value_id is null)
        or (target_type = 'VALUE' and value_id is not null)
    )
);

create index idx_parameter_category_parent on parameter_categories(parent_id, sort_order, name);
create index idx_parameter_definition_category on parameter_definitions(category_id, status, name);
create index idx_parameter_value_resolve on parameter_values(definition_id, tenant_id, scope_type, scope_code, active);
create index idx_parameter_change_definition on parameter_changes(definition_id, changed_at desc);
