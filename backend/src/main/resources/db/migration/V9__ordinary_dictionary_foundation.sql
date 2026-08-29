create table dictionary_definitions (
    id bigint primary key,
    revision bigint not null default 0,
    scope_type varchar(16) not null,
    scope_code varchar(80) not null,
    tenant_id bigint,
    code varchar(64) not null,
    name varchar(200) not null,
    description varchar(1000),
    status varchar(32) not null,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_dictionary_definition_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_dictionary_definition_created_by foreign key (created_by) references user_accounts(id),
    constraint fk_dictionary_definition_updated_by foreign key (updated_by) references user_accounts(id),
    constraint uk_dictionary_definition_scope_code unique (scope_code, code),
    constraint ck_dictionary_definition_scope check (
        (scope_type = 'PLATFORM' and tenant_id is null and scope_code = 'PLATFORM') or
        (scope_type = 'TENANT' and tenant_id is not null)
    ),
    constraint ck_dictionary_definition_status check (status in ('ACTIVE', 'INACTIVE'))
);

create index idx_dictionary_definition_scope on dictionary_definitions (scope_type, tenant_id);
create index idx_dictionary_definition_tenant_status on dictionary_definitions (tenant_id, status);

create table dictionary_items (
    id bigint primary key,
    dictionary_id bigint not null,
    code varchar(128) not null,
    name varchar(300) not null,
    description varchar(1000),
    sort_order integer not null,
    status varchar(32) not null,
    constraint fk_dictionary_item_definition foreign key (dictionary_id) references dictionary_definitions(id),
    constraint uk_dictionary_item_code unique (dictionary_id, code),
    constraint ck_dictionary_item_sort check (sort_order >= 0),
    constraint ck_dictionary_item_status check (status in ('ACTIVE', 'INACTIVE'))
);

create index idx_dictionary_item_sort on dictionary_items (dictionary_id, sort_order, code);

create table dictionary_changes (
    id bigint primary key,
    tenant_id bigint,
    dictionary_id bigint not null,
    item_id bigint,
    change_type varchar(32) not null,
    target_type varchar(16) not null,
    before_json text,
    after_json text,
    reason varchar(1000),
    request_code varchar(128) not null,
    changed_at timestamp with time zone not null,
    changed_by bigint not null,
    constraint fk_dictionary_change_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_dictionary_change_definition foreign key (dictionary_id) references dictionary_definitions(id),
    constraint fk_dictionary_change_item foreign key (item_id) references dictionary_items(id),
    constraint fk_dictionary_change_user foreign key (changed_by) references user_accounts(id),
    constraint uk_dictionary_change_request unique (request_code),
    constraint ck_dictionary_change_snapshot check (before_json is not null or after_json is not null),
    constraint ck_dictionary_change_target check (
        (target_type = 'DICT' and item_id is null) or
        (target_type = 'ITEM' and item_id is not null)
    ),
    constraint ck_dictionary_change_type check (change_type in (
        'CREATE_DICT', 'UPDATE_DICT', 'ENABLE_DICT', 'DISABLE_DICT',
        'ADD_ITEM', 'UPDATE_ITEM', 'ENABLE_ITEM', 'DISABLE_ITEM'
    ))
);

create index idx_dictionary_change_dictionary_time on dictionary_changes (dictionary_id, changed_at);
create index idx_dictionary_change_tenant_time on dictionary_changes (tenant_id, changed_at);

