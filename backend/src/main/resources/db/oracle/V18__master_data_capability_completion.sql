insert into dictionary_categories (
    id, revision, scope_type, scope_code, tenant_id, parent_id, code, name, description,
    sort_order, status, created_at, created_by, updated_at, updated_by
) values (
    362387869796000, 0, 'PLATFORM', 'PLATFORM', null, null, 'MASTER_DATA', '基础数据',
    '诊疗项目、药品知识、厂家产品、包装、机构目录与价格使用的受控值。',
    300, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

update dictionary_definitions
set category_id = 362387869796000
where scope_code = 'PLATFORM' and code like 'BD_%';

insert all
    into dictionary_definitions (
        id, revision, scope_type, scope_code, tenant_id, category_id, code, name, description,
        system_managed, status, created_at, created_by, updated_at, updated_by
    ) values (362387869796001, 0, 'PLATFORM', 'PLATFORM', null, 362387869796000, 'BD_STORAGE_TYPE', '药品储藏方式', '药品知识层的推荐储藏环境。', 1, 'ACTIVE', current_timestamp, null, current_timestamp, null)
    into dictionary_definitions (
        id, revision, scope_type, scope_code, tenant_id, category_id, code, name, description,
        system_managed, status, created_at, created_by, updated_at, updated_by
    ) values (362387869796002, 0, 'PLATFORM', 'PLATFORM', null, 362387869796000, 'BD_ANTIMICROBIAL_LEVEL', '抗菌药物等级', '抗菌药物分级管理等级。', 1, 'ACTIVE', current_timestamp, null, current_timestamp, null)
    into dictionary_definitions (
        id, revision, scope_type, scope_code, tenant_id, category_id, code, name, description,
        system_managed, status, created_at, created_by, updated_at, updated_by
    ) values (362387869796003, 0, 'PLATFORM', 'PLATFORM', null, 362387869796000, 'BD_SERVICE_DUPLICATE_RULE', '诊疗项目重复开立规则', '同一就诊或时间窗口内重复开立诊疗项目时的处理策略。', 1, 'ACTIVE', current_timestamp, null, current_timestamp, null)
    into dictionary_definitions (
        id, revision, scope_type, scope_code, tenant_id, category_id, code, name, description,
        system_managed, status, created_at, created_by, updated_at, updated_by
    ) values (362387869796004, 0, 'PLATFORM', 'PLATFORM', null, 362387869796000, 'BD_PRODUCT_MARKET_STATUS', '药品产品上市状态', '厂家产品当前上市及供应状态。', 1, 'ACTIVE', current_timestamp, null, current_timestamp, null)
    into dictionary_definitions (
        id, revision, scope_type, scope_code, tenant_id, category_id, code, name, description,
        system_managed, status, created_at, created_by, updated_at, updated_by
    ) values (362387869796005, 0, 'PLATFORM', 'PLATFORM', null, 362387869796000, 'BD_PRODUCTION_PLACE', '生产地类别', '生产企业或厂家产品的生产地属性。', 1, 'ACTIVE', current_timestamp, null, current_timestamp, null)
    into dictionary_definitions (
        id, revision, scope_type, scope_code, tenant_id, category_id, code, name, description,
        system_managed, status, created_at, created_by, updated_at, updated_by
    ) values (362387869796006, 0, 'PLATFORM', 'PLATFORM', null, 362387869796000, 'BD_SHELF_LIFE_UNIT', '产品有效期单位', '厂家产品有效期数值对应的时间单位。', 1, 'ACTIVE', current_timestamp, null, current_timestamp, null)
select 1 from dual;

insert all
    into dictionary_items values (362387869796101, 362387869796001, 'ROOM_TEMPERATURE', '常温', '按常温条件储藏。', 10, 'ACTIVE')
    into dictionary_items values (362387869796102, 362387869796001, 'COOL', '阴凉', '按阴凉条件储藏。', 20, 'ACTIVE')
    into dictionary_items values (362387869796103, 362387869796001, 'REFRIGERATED', '冷藏', '通常在 2–8℃ 条件储藏。', 30, 'ACTIVE')
    into dictionary_items values (362387869796104, 362387869796001, 'FROZEN', '冷冻', '按冷冻条件储藏。', 40, 'ACTIVE')
    into dictionary_items values (362387869796111, 362387869796002, 'NON_RESTRICTED', '非限制使用级', null, 10, 'ACTIVE')
    into dictionary_items values (362387869796112, 362387869796002, 'RESTRICTED', '限制使用级', null, 20, 'ACTIVE')
    into dictionary_items values (362387869796113, 362387869796002, 'SPECIAL', '特殊使用级', null, 30, 'ACTIVE')
    into dictionary_items values (362387869796121, 362387869796003, 'ALLOW', '允许', '允许重复开立。', 10, 'ACTIVE')
    into dictionary_items values (362387869796122, 362387869796003, 'WARN', '提醒后允许', '提示重复风险，确认后可继续。', 20, 'ACTIVE')
    into dictionary_items values (362387869796123, 362387869796003, 'BLOCK', '禁止', '命中重复条件时禁止继续开立。', 30, 'ACTIVE')
    into dictionary_items values (362387869796131, 362387869796004, 'MARKETED', '已上市', null, 10, 'ACTIVE')
    into dictionary_items values (362387869796132, 362387869796004, 'SUSPENDED', '暂停供应', null, 20, 'ACTIVE')
    into dictionary_items values (362387869796133, 362387869796004, 'WITHDRAWN', '已退市', null, 30, 'ACTIVE')
    into dictionary_items values (362387869796141, 362387869796005, 'DOMESTIC', '境内生产', null, 10, 'ACTIVE')
    into dictionary_items values (362387869796142, 362387869796005, 'JOINT_VENTURE', '境内合资', null, 20, 'ACTIVE')
    into dictionary_items values (362387869796143, 362387869796005, 'IMPORTED', '境外生产', null, 30, 'ACTIVE')
    into dictionary_items values (362387869796151, 362387869796006, 'DAY', '天', null, 10, 'ACTIVE')
    into dictionary_items values (362387869796152, 362387869796006, 'MONTH', '月', null, 20, 'ACTIVE')
    into dictionary_items values (362387869796153, 362387869796006, 'YEAR', '年', null, 30, 'ACTIVE')
select 1 from dual;

alter table medications add constraint ck_medication_default_dose check (
    (default_dose is null and default_dose_unit is null) or
    (default_dose is not null and default_dose > 0 and default_dose_unit is not null)
);
alter table medications add constraint ck_medication_antimicrobial_level check (
    antimicrobial = 1 or antimicrobial_level is null
);

alter table medication_products add constraint ck_med_product_registration_period check (
    registration_to is null or (registration_from is not null and registration_to >= registration_from)
);
alter table medication_products add constraint ck_med_product_shelf_life check (
    (shelf_life_value is null and shelf_life_unit is null) or
    (shelf_life_value is not null and shelf_life_value > 0 and shelf_life_unit is not null)
);

alter table service_items add constraint ck_service_multi_site_price check (
    multi_site_price is null or multi_site_price >= 0
);
alter table service_items add constraint ck_service_site_count check (
    (free_site_count is null or free_site_count >= 0) and
    (max_body_site_count is null or max_body_site_count > 0) and
    (free_site_count is null or max_body_site_count is null or free_site_count <= max_body_site_count)
);
