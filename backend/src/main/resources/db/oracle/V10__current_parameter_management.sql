create table parameter_categories (
    id number(19,0) primary key,
    parent_id number(19,0),
    code varchar2(64 char) not null,
    name varchar2(200 char) not null,
    description varchar2(1000 char),
    sort_order number(10,0) default 0 not null,
    active number(1,0) default 1 not null,
    revision number(19,0) default 0 not null,
    created_at timestamp with time zone not null,
    created_by number(19,0) not null,
    updated_at timestamp with time zone not null,
    updated_by number(19,0) not null,
    constraint uk_parameter_category_code unique (code),
    constraint fk_parameter_category_parent foreign key (parent_id) references parameter_categories(id),
    constraint ck_parameter_category_parent check (parent_id is null or parent_id <> id),
    constraint ck_parameter_category_sort check (sort_order >= 0)
);

create table parameter_definitions (
    id number(19,0) primary key,
    category_id number(19,0) not null,
    parameter_key varchar2(160 char) not null,
    name varchar2(200 char) not null,
    description varchar2(1000 char),
    value_type varchar2(24 char) not null,
    control_type varchar2(32 char) not null,
    json_schema clob,
    default_value_json clob,
    example_value_json clob,
    unit varchar2(32 char),
    dictionary_code varchar2(64 char),
    scope_json clob not null,
    parameter_category varchar2(24 char) not null,
    inheritance_enabled number(1,0) default 1 not null,
    cache_enabled number(1,0) default 1 not null,
    nullable_value number(1,0) default 0 not null,
    sensitivity varchar2(24 char) not null,
    display_policy varchar2(24 char) not null,
    status varchar2(16 char) not null,
    revision number(19,0) default 0 not null,
    created_at timestamp with time zone not null,
    created_by number(19,0) not null,
    updated_at timestamp with time zone not null,
    updated_by number(19,0) not null,
    constraint uk_parameter_definition_key unique (parameter_key),
    constraint fk_parameter_definition_category foreign key (category_id) references parameter_categories(id),
    constraint ck_parameter_definition_category check (parameter_category in ('SYSTEM', 'BUSINESS')),
    constraint ck_parameter_definition_status check (status in ('ACTIVE', 'INACTIVE')),
    constraint ck_parameter_definition_sensitivity check (sensitivity in ('NORMAL', 'SENSITIVE', 'SECRET')),
    constraint ck_parameter_definition_display check (display_policy in ('PLAIN', 'MASKED', 'HIDDEN'))
);

create table parameter_values (
    id number(19,0) primary key,
    definition_id number(19,0) not null,
    tenant_id number(19,0),
    scope_type varchar2(24 char) not null,
    scope_id number(19,0),
    scope_reference varchar2(128 char),
    scope_code varchar2(200 char) not null,
    value_mode varchar2(24 char) not null,
    value_json clob,
    secret_ref varchar2(500 char),
    active number(1,0) default 1 not null,
    revision number(19,0) default 0 not null,
    created_at timestamp with time zone not null,
    created_by number(19,0) not null,
    updated_at timestamp with time zone not null,
    updated_by number(19,0) not null,
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
    id number(19,0) primary key,
    tenant_id number(19,0),
    definition_id number(19,0) not null,
    value_id number(19,0),
    target_type varchar2(24 char) not null,
    change_type varchar2(24 char) not null,
    before_json clob,
    after_json clob,
    change_reason varchar2(1000 char),
    request_code varchar2(128 char) not null,
    changed_at timestamp with time zone not null,
    changed_by number(19,0) not null,
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
