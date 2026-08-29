create table dictionary_categories (
    id bigint primary key,
    revision bigint not null default 0,
    scope_type varchar(16) not null,
    scope_code varchar(80) not null,
    tenant_id bigint,
    parent_id bigint,
    code varchar(64) not null,
    name varchar(200) not null,
    description varchar(1000),
    sort_order integer not null default 0,
    status varchar(32) not null,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_dictionary_category_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_dictionary_category_parent foreign key (parent_id) references dictionary_categories(id),
    constraint uk_dictionary_category_scope_code unique (scope_code, code),
    constraint ck_dictionary_category_scope check (
        (scope_type = 'PLATFORM' and tenant_id is null and scope_code = 'PLATFORM') or
        (scope_type = 'TENANT' and tenant_id is not null and scope_code = 'TENANT:' || cast(tenant_id as varchar))
    ),
    constraint ck_dictionary_category_parent check (parent_id is null or parent_id <> id),
    constraint ck_dictionary_category_sort check (sort_order >= 0),
    constraint ck_dictionary_category_status check (status in ('ACTIVE', 'INACTIVE'))
);

create index idx_dictionary_category_parent on dictionary_categories (scope_code, parent_id, sort_order, name);
create index idx_dictionary_category_status on dictionary_categories (scope_code, status);

insert into dictionary_categories (
    id, revision, scope_type, scope_code, tenant_id, parent_id, code, name, description,
    sort_order, status, created_at, created_by, updated_at, updated_by
) values (
    9223372036854775807, 0, 'PLATFORM', 'PLATFORM', null, null, 'UNCATEGORIZED', '未分类',
    '历史字典迁移兜底分类；新增字典应优先选择正式业务分类。',
    9990, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into dictionary_categories (
    id, revision, scope_type, scope_code, tenant_id, parent_id, code, name, description,
    sort_order, status, created_at, created_by, updated_at, updated_by
)
select 9223372036854775807 - id, 0, 'TENANT', 'TENANT:' || cast(id as varchar), id, null,
       'UNCATEGORIZED', '未分类', '历史字典迁移兜底分类；新增字典应优先选择正式业务分类。',
       9990, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222
from tenants;

alter table dictionary_definitions add column category_id bigint;
update dictionary_definitions definition
set category_id = (
    select category.id from dictionary_categories category
    where category.scope_code = definition.scope_code and category.code = 'UNCATEGORIZED'
);
alter table dictionary_definitions alter column category_id set not null;
alter table dictionary_definitions add constraint fk_dictionary_definition_category
    foreign key (category_id) references dictionary_categories(id);
create index idx_dictionary_definition_category on dictionary_definitions (category_id, status, name);

alter table dictionary_changes add column category_id bigint;
update dictionary_changes chg
set category_id = (
    select definition.category_id from dictionary_definitions definition
    where definition.id = chg.dictionary_id
);
alter table dictionary_changes add constraint fk_dictionary_change_category
    foreign key (category_id) references dictionary_categories(id);
create index idx_dictionary_change_category_time on dictionary_changes (category_id, changed_at);

alter table dictionary_changes drop constraint uk_dictionary_change_request;
create index idx_dictionary_change_request on dictionary_changes (request_code);
alter table dictionary_changes drop constraint ck_dictionary_change_target;
alter table dictionary_changes drop constraint ck_dictionary_change_type;
alter table dictionary_changes alter column dictionary_id drop not null;
alter table dictionary_changes add constraint ck_dictionary_change_target check (
    (target_type = 'CATEGORY' and category_id is not null and dictionary_id is null and item_id is null) or
    (target_type = 'DICT' and category_id is not null and dictionary_id is not null and item_id is null) or
    (target_type = 'ITEM' and category_id is not null and dictionary_id is not null and item_id is not null)
);
alter table dictionary_changes add constraint ck_dictionary_change_type check (change_type in (
    'CREATE_CATEGORY', 'UPDATE_CATEGORY', 'MOVE_CATEGORY', 'ENABLE_CATEGORY', 'DISABLE_CATEGORY',
    'CREATE_DICT', 'UPDATE_DICT', 'MOVE_DICT', 'ENABLE_DICT', 'DISABLE_DICT',
    'ADD_ITEM', 'UPDATE_ITEM', 'ENABLE_ITEM', 'DISABLE_ITEM'
));
