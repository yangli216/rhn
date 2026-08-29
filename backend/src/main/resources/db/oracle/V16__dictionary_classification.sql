create table dictionary_categories (
    id number(19,0) primary key,
    revision number(19,0) default 0 not null,
    scope_type varchar2(16 char) not null,
    scope_code varchar2(80 char) not null,
    tenant_id number(19,0),
    parent_id number(19,0),
    code varchar2(64 char) not null,
    name varchar2(200 char) not null,
    description varchar2(1000 char),
    sort_order number(10,0) default 0 not null,
    status varchar2(32 char) not null,
    created_at timestamp with time zone not null,
    created_by number(19,0) not null,
    updated_at timestamp with time zone not null,
    updated_by number(19,0) not null,
    constraint fk_dictionary_category_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_dictionary_category_parent foreign key (parent_id) references dictionary_categories(id),
    constraint uk_dictionary_category_scope_code unique (scope_code, code),
    constraint ck_dictionary_category_scope check (
        (scope_type = 'PLATFORM' and tenant_id is null and scope_code = 'PLATFORM') or
        (scope_type = 'TENANT' and tenant_id is not null and scope_code = 'TENANT:' || to_char(tenant_id))
    ),
    constraint ck_dictionary_category_parent check (parent_id is null or parent_id <> id),
    constraint ck_dictionary_category_sort check (sort_order >= 0),
    constraint ck_dictionary_category_status check (status in ('ACTIVE', 'INACTIVE'))
);

create index idx_dictionary_category_parent on dictionary_categories (scope_code, parent_id, sort_order, name);
create index idx_dictionary_category_status on dictionary_categories (scope_code, status);

insert into dictionary_categories values (
    9223372036854775807, 0, 'PLATFORM', 'PLATFORM', null, null, 'UNCATEGORIZED', '未分类',
    '历史字典迁移兜底分类；新增字典应优先选择正式业务分类。',
    9990, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into dictionary_categories (
    id, revision, scope_type, scope_code, tenant_id, parent_id, code, name, description,
    sort_order, status, created_at, created_by, updated_at, updated_by
)
select 9223372036854775807 - id, 0, 'TENANT', 'TENANT:' || to_char(id), id, null,
       'UNCATEGORIZED', '未分类', '历史字典迁移兜底分类；新增字典应优先选择正式业务分类。',
       9990, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222
from tenants;

alter table dictionary_definitions add (category_id number(19,0));
update dictionary_definitions definition
set category_id = (
    select category.id from dictionary_categories category
    where category.scope_code = definition.scope_code and category.code = 'UNCATEGORIZED'
);
alter table dictionary_definitions modify category_id not null;
alter table dictionary_definitions add constraint fk_dictionary_definition_category
    foreign key (category_id) references dictionary_categories(id);
create index idx_dictionary_definition_category on dictionary_definitions (category_id, status, name);

alter table dictionary_changes add (category_id number(19,0));
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
alter table dictionary_changes modify dictionary_id null;
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
