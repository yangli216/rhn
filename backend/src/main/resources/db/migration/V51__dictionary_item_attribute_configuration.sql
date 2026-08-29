create table dictionary_attribute_definitions (
    id bigint primary key,
    revision bigint default 0 not null,
    dictionary_id bigint not null,
    code varchar(64) not null,
    name varchar(200) not null,
    description varchar(1000) not null,
    data_type varchar(32) not null,
    cardinality varchar(16) not null,
    reference_dictionary_id bigint,
    schema_json text not null,
    minimum_scope varchar(32) not null,
    override_policy varchar(32) not null,
    required_value boolean not null,
    searchable boolean not null,
    status varchar(32) not null,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_dict_attr_definition foreign key (dictionary_id) references dictionary_definitions(id),
    constraint fk_dict_attr_reference_dictionary foreign key (reference_dictionary_id) references dictionary_definitions(id),
    constraint fk_dict_attr_created_by foreign key (created_by) references user_accounts(id),
    constraint fk_dict_attr_updated_by foreign key (updated_by) references user_accounts(id),
    constraint uk_dict_attr_code unique (dictionary_id, code),
    constraint ck_dict_attr_data_type check (data_type in (
        'BOOLEAN', 'INTEGER', 'DECIMAL', 'TEXT', 'CODE', 'DATE', 'DATETIME', 'DICT_REF'
    )),
    constraint ck_dict_attr_cardinality check (cardinality in ('SINGLE', 'MULTIPLE')),
    constraint ck_dict_attr_reference check (
        (data_type = 'DICT_REF' and reference_dictionary_id is not null) or
        (data_type <> 'DICT_REF' and reference_dictionary_id is null)
    ),
    constraint ck_dict_attr_min_scope check (minimum_scope in ('PLATFORM', 'TENANT', 'ORGANIZATION', 'DEPARTMENT')),
    constraint ck_dict_attr_override_policy check (override_policy in ('ANY', 'NO_OVERRIDE')),
    constraint ck_dict_attr_status check (status in ('ACTIVE', 'INACTIVE'))
);
create index idx_dict_attr_definition on dictionary_attribute_definitions (dictionary_id, status, name);
create index idx_dict_attr_reference on dictionary_attribute_definitions (reference_dictionary_id, status);

create table dictionary_item_attribute_values (
    id bigint primary key,
    dictionary_item_id bigint not null,
    attribute_definition_id bigint not null,
    scope_type varchar(32) not null,
    scope_code varchar(512) not null,
    tenant_id bigint,
    organization_id bigint,
    department_id bigint,
    value_order integer not null,
    value_mode varchar(32) not null,
    boolean_value boolean,
    integer_value bigint,
    decimal_value decimal(28,8),
    text_value varchar(4000),
    code_value varchar(256),
    date_value date,
    datetime_value timestamp with time zone,
    reference_item_id bigint,
    status varchar(32) not null,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_dict_item_attr_item foreign key (dictionary_item_id) references dictionary_items(id),
    constraint fk_dict_item_attr_definition foreign key (attribute_definition_id) references dictionary_attribute_definitions(id),
    constraint fk_dict_item_attr_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_dict_item_attr_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_dict_item_attr_dept foreign key (tenant_id, department_id) references departments(tenant_id, id),
    constraint fk_dict_item_attr_reference foreign key (reference_item_id) references dictionary_items(id),
    constraint fk_dict_item_attr_created_by foreign key (created_by) references user_accounts(id),
    constraint fk_dict_item_attr_updated_by foreign key (updated_by) references user_accounts(id),
    constraint uk_dict_item_attr_order unique (dictionary_item_id, attribute_definition_id, scope_code, value_order),
    constraint ck_dict_item_attr_scope check (
        (scope_type = 'PLATFORM' and tenant_id is null and organization_id is null and department_id is null) or
        (scope_type = 'TENANT' and tenant_id is not null and organization_id is null and department_id is null) or
        (scope_type = 'ORGANIZATION' and tenant_id is not null and organization_id is not null and department_id is null) or
        (scope_type = 'DEPARTMENT' and tenant_id is not null and organization_id is not null and department_id is not null)
    ),
    constraint ck_dict_item_attr_order check (value_order >= 0),
    constraint ck_dict_item_attr_mode check (value_mode in ('OVERRIDE', 'EXPLICIT_EMPTY')),
    constraint ck_dict_item_attr_status check (status in ('ACTIVE', 'INACTIVE')),
    constraint ck_dict_item_attr_empty check (
        value_mode = 'OVERRIDE' or (value_order = 0 and boolean_value is null and integer_value is null
        and decimal_value is null and text_value is null and code_value is null and date_value is null
        and datetime_value is null and reference_item_id is null)
    )
);
create index idx_dict_item_attr_resolve on dictionary_item_attribute_values
    (attribute_definition_id, scope_code, status);
create index idx_dict_item_attr_scope on dictionary_item_attribute_values
    (tenant_id, organization_id, department_id, status);
create index idx_dict_item_attr_reference on dictionary_item_attribute_values
    (reference_item_id, attribute_definition_id, scope_code, status);
create index idx_dict_item_attr_code on dictionary_item_attribute_values
    (code_value, attribute_definition_id, scope_code, status);

alter table dictionary_changes add column attribute_definition_id bigint;
alter table dictionary_changes add constraint fk_dictionary_change_attribute
    foreign key (attribute_definition_id) references dictionary_attribute_definitions(id);
create index idx_dictionary_change_attribute_time on dictionary_changes (attribute_definition_id, changed_at);
alter table dictionary_changes drop constraint ck_dictionary_change_target;
alter table dictionary_changes drop constraint ck_dictionary_change_type;
alter table dictionary_changes add constraint ck_dictionary_change_target check (
    (target_type = 'CATEGORY' and category_id is not null and dictionary_id is null and item_id is null and attribute_definition_id is null) or
    (target_type = 'DICT' and category_id is not null and dictionary_id is not null and item_id is null and attribute_definition_id is null) or
    (target_type = 'ITEM' and category_id is not null and dictionary_id is not null and item_id is not null and attribute_definition_id is null) or
    (target_type = 'ATTR_DEFINITION' and category_id is not null and dictionary_id is not null and item_id is null and attribute_definition_id is not null) or
    (target_type = 'ITEM_ATTRIBUTE' and category_id is not null and dictionary_id is not null and item_id is not null and attribute_definition_id is not null)
);
alter table dictionary_changes add constraint ck_dictionary_change_type check (change_type in (
    'CREATE_CATEGORY', 'UPDATE_CATEGORY', 'MOVE_CATEGORY', 'ENABLE_CATEGORY', 'DISABLE_CATEGORY',
    'CREATE_DICT', 'UPDATE_DICT', 'MOVE_DICT', 'ENABLE_DICT', 'DISABLE_DICT',
    'ADD_ITEM', 'UPDATE_ITEM', 'ENABLE_ITEM', 'DISABLE_ITEM',
    'CREATE_ATTRIBUTE', 'UPDATE_ATTRIBUTE', 'ENABLE_ATTRIBUTE', 'DISABLE_ATTRIBUTE',
    'SET_ITEM_ATTRIBUTE', 'CLEAR_ITEM_ATTRIBUTE'
));

insert into dictionary_categories values (
    362387869840010, 0, 'PLATFORM', 'PLATFORM', null, 362387869840000,
    'BILLING_CONFIGURATION', '收费与支付',
    '收费、结算、支付、退费和终端适用场景等平台受控字典。',
    50, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, category_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values
    (362387869852001, 0, 'PLATFORM', 'PLATFORM', null, 362387869840010,
     'PAY_METHOD', '支付方式', '医疗收费支持的支付方式及其业务适用场景。',
     false, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869852002, 0, 'PLATFORM', 'PLATFORM', null, 362387869840010,
     'PAY_USE_SCENE', '支付使用场景', '支付方式可用的结算入口和终端场景。',
     true, 'ACTIVE', current_timestamp, null, current_timestamp, null);

insert into dictionary_items values
    (362387869852101, 362387869852001, 'CASH', '现金', '现金收款', 10, 'ACTIVE'),
    (362387869852102, 362387869852001, 'BANK_CARD', '银行卡', '银行卡或银行卡聚合支付', 20, 'ACTIVE'),
    (362387869852103, 362387869852001, 'WECHAT', '微信支付', '微信支付渠道', 30, 'ACTIVE'),
    (362387869852104, 362387869852001, 'ALIPAY', '支付宝', '支付宝支付渠道', 40, 'ACTIVE'),
    (362387869852105, 362387869852001, 'MEDICAL_INSURANCE', '医保支付', '医保个人账户或统筹支付', 50, 'ACTIVE'),
    (362387869852106, 362387869852001, 'OTHER', '其他', '经授权的其他支付方式', 90, 'ACTIVE'),
    (362387869852111, 362387869852002, 'CLINIC_SETTLE', '诊间结算', '医生工作站或诊间完成结算', 10, 'ACTIVE'),
    (362387869852112, 362387869852002, 'CASHIER', '收费处', '人工收费窗口完成结算', 20, 'ACTIVE'),
    (362387869852113, 362387869852002, 'SELF_SERVICE', '自助终端', '院内自助机或自助服务终端完成结算', 30, 'ACTIVE');

insert into dictionary_attribute_definitions values (
    362387869852201, 0, 362387869852001, 'AVAILABLE_SCENE', '可用场景',
    '限定支付方式可用于哪些结算入口；下级作用域可按本地业务自由覆盖。',
    'DICT_REF', 'MULTIPLE', 362387869852002, '{"type":"array","uniqueItems":true}',
    'ORGANIZATION', 'ANY', true, true, 'ACTIVE',
    current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into dictionary_item_attribute_values (
    id, dictionary_item_id, attribute_definition_id, scope_type, scope_code,
    tenant_id, organization_id, department_id, value_order, value_mode, reference_item_id,
    status, created_at, created_by, updated_at, updated_by
) values
    (362387869852301, 362387869852101, 362387869852201, 'PLATFORM', 'PLATFORM', null, null, null, 1, 'OVERRIDE', 362387869852111, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869852302, 362387869852101, 362387869852201, 'PLATFORM', 'PLATFORM', null, null, null, 2, 'OVERRIDE', 362387869852112, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869852303, 362387869852102, 362387869852201, 'PLATFORM', 'PLATFORM', null, null, null, 1, 'OVERRIDE', 362387869852111, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869852304, 362387869852102, 362387869852201, 'PLATFORM', 'PLATFORM', null, null, null, 2, 'OVERRIDE', 362387869852112, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869852305, 362387869852102, 362387869852201, 'PLATFORM', 'PLATFORM', null, null, null, 3, 'OVERRIDE', 362387869852113, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869852306, 362387869852103, 362387869852201, 'PLATFORM', 'PLATFORM', null, null, null, 1, 'OVERRIDE', 362387869852111, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869852307, 362387869852103, 362387869852201, 'PLATFORM', 'PLATFORM', null, null, null, 2, 'OVERRIDE', 362387869852112, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869852308, 362387869852103, 362387869852201, 'PLATFORM', 'PLATFORM', null, null, null, 3, 'OVERRIDE', 362387869852113, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869852309, 362387869852104, 362387869852201, 'PLATFORM', 'PLATFORM', null, null, null, 1, 'OVERRIDE', 362387869852111, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869852310, 362387869852104, 362387869852201, 'PLATFORM', 'PLATFORM', null, null, null, 2, 'OVERRIDE', 362387869852112, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869852311, 362387869852104, 362387869852201, 'PLATFORM', 'PLATFORM', null, null, null, 3, 'OVERRIDE', 362387869852113, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869852312, 362387869852105, 362387869852201, 'PLATFORM', 'PLATFORM', null, null, null, 1, 'OVERRIDE', 362387869852111, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869852313, 362387869852105, 362387869852201, 'PLATFORM', 'PLATFORM', null, null, null, 2, 'OVERRIDE', 362387869852112, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869852314, 362387869852106, 362387869852201, 'PLATFORM', 'PLATFORM', null, null, null, 1, 'OVERRIDE', 362387869852112, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222);
