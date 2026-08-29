create table dictionary_definitions (
    id number(19,0) primary key,
    revision number(19,0) default 0 not null,
    scope_type varchar2(16 char) not null,
    scope_code varchar2(80 char) not null,
    tenant_id number(19,0),
    code varchar2(64 char) not null,
    name varchar2(200 char) not null,
    description varchar2(1000 char),
    status varchar2(32 char) not null,
    created_at timestamp with time zone not null,
    created_by number(19,0) not null,
    updated_at timestamp with time zone not null,
    updated_by number(19,0) not null,
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
    id number(19,0) primary key,
    dictionary_id number(19,0) not null,
    code varchar2(128 char) not null,
    name varchar2(300 char) not null,
    description varchar2(1000 char),
    sort_order number(10,0) not null,
    status varchar2(32 char) not null,
    constraint fk_dictionary_item_definition foreign key (dictionary_id) references dictionary_definitions(id),
    constraint uk_dictionary_item_code unique (dictionary_id, code),
    constraint ck_dictionary_item_sort check (sort_order >= 0),
    constraint ck_dictionary_item_status check (status in ('ACTIVE', 'INACTIVE'))
);

create index idx_dictionary_item_sort on dictionary_items (dictionary_id, sort_order, code);

create table dictionary_changes (
    id number(19,0) primary key,
    tenant_id number(19,0),
    dictionary_id number(19,0) not null,
    item_id number(19,0),
    change_type varchar2(32 char) not null,
    target_type varchar2(16 char) not null,
    before_json clob,
    after_json clob,
    reason varchar2(1000 char),
    request_code varchar2(128 char) not null,
    changed_at timestamp with time zone not null,
    changed_by number(19,0) not null,
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

