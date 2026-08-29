insert into dictionary_categories values (
    362387869840011, 0, 'PLATFORM', 'PLATFORM', null, 362387869840000,
    'COMMON_DICTIONARIES', '通用字典',
    '跨业务模块复用的是非、启停、有效性与可见性等基础受控值。',
    5, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, category_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values
    (362387869853001, 0, 'PLATFORM', 'PLATFORM', null, 362387869840011,
     'COMMON_YES_NO', '是否', '通用的二值是否选项；业务字段保存 YES 或 NO。',
     true, 'ACTIVE', current_timestamp, null, current_timestamp, null),
    (362387869853002, 0, 'PLATFORM', 'PLATFORM', null, 362387869840011,
     'COMMON_ENABLE_STATUS', '启用状态', '表示配置、功能或业务对象是否开放使用。',
     true, 'ACTIVE', current_timestamp, null, current_timestamp, null),
    (362387869853003, 0, 'PLATFORM', 'PLATFORM', null, 362387869840011,
     'COMMON_VALIDITY_STATUS', '有效状态', '表示业务对象在当前时间或规则下是否有效。',
     true, 'ACTIVE', current_timestamp, null, current_timestamp, null),
    (362387869853004, 0, 'PLATFORM', 'PLATFORM', null, 362387869840011,
     'COMMON_VISIBILITY_STATUS', '可见状态', '表示页面、字段或配置项是否对用户展示。',
     true, 'ACTIVE', current_timestamp, null, current_timestamp, null);

insert into dictionary_items values
    (362387869853101, 362387869853001, 'YES', '是', '肯定、选中或条件成立', 10, 'ACTIVE'),
    (362387869853102, 362387869853001, 'NO', '否', '否定、未选中或条件不成立', 20, 'ACTIVE'),

    (362387869853111, 362387869853002, 'ENABLED', '启用', '允许用于当前业务', 10, 'ACTIVE'),
    (362387869853112, 362387869853002, 'DISABLED', '禁用', '不允许用于新业务，历史数据保留', 20, 'ACTIVE'),

    (362387869853121, 362387869853003, 'VALID', '有效', '当前时间或规则下有效', 10, 'ACTIVE'),
    (362387869853122, 362387869853003, 'INVALID', '无效', '当前时间或规则下无效', 20, 'ACTIVE'),

    (362387869853131, 362387869853004, 'VISIBLE', '显示', '对用户可见', 10, 'ACTIVE'),
    (362387869853132, 362387869853004, 'HIDDEN', '隐藏', '对用户不可见', 20, 'ACTIVE');
