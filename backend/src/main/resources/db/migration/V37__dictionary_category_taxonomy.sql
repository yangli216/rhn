-- Product dictionary taxonomy. Root categories define stable governance domains;
-- dictionaries are assigned only to leaf categories so counts remain actionable.

insert into dictionary_categories values (
    362387869840000, 0, 'PLATFORM', 'PLATFORM', null, null,
    'PLATFORM_GOVERNANCE', '平台治理',
    '平台参数、组织机构、科室与人员任职等公共治理字典的上级目录。',
    100, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into dictionary_categories values (
    362387869840001, 0, 'PLATFORM', 'PLATFORM', null, 362387869840000,
    'PARAMETER_GOVERNANCE', '参数配置',
    '参数作用域、值类型、录入控件、安全策略、状态与变更审计等受控值。',
    10, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into dictionary_categories values (
    362387869840002, 0, 'PLATFORM', 'PLATFORM', null, 362387869840000,
    'ORGANIZATION_GOVERNANCE', '组织机构',
    '机构类别、性质、标识、联系方式、关系、能力、责任人与生命周期等受控值。',
    20, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into dictionary_categories values (
    362387869840003, 0, 'PLATFORM', 'PLATFORM', null, 362387869840000,
    'DEPARTMENT_GOVERNANCE', '科室管理',
    '科室类型、属性、关系、服务能力及责任人等受控值。',
    30, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into dictionary_categories values (
    362387869840004, 0, 'PLATFORM', 'PLATFORM', null, 362387869840000,
    'PERSONNEL_GOVERNANCE', '人员与任职',
    '从业人员属性、业务状态、聘用、岗位和任职等受控值。',
    40, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into dictionary_categories values (
    362387869840005, 0, 'PLATFORM', 'PLATFORM', null, 362387869796000,
    'MASTER_DATA_GOVERNANCE', '基础数据治理',
    '基础数据生命周期、临床概念类型与别名类型等跨目录治理受控值。',
    10, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into dictionary_categories values (
    362387869840006, 0, 'PLATFORM', 'PLATFORM', null, 362387869796000,
    'CLINICAL_SERVICE', '诊疗项目',
    '目录项目、诊疗服务类型、适用场景及重复开立策略等受控值。',
    20, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into dictionary_categories values (
    362387869840007, 0, 'PLATFORM', 'PLATFORM', null, 362387869796000,
    'MEDICATION', '药品知识',
    '药品分类、剂型、储藏方式及抗菌药物分级等知识层受控值。',
    30, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into dictionary_categories values (
    362387869840008, 0, 'PLATFORM', 'PLATFORM', null, 362387869796000,
    'PRODUCT_SUPPLY', '厂家与产品',
    '生产主体、生产地、上市状态、有效期、包装用途及目录价格等受控值。',
    40, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into dictionary_categories values (
    362387869840009, 0, 'PLATFORM', 'PLATFORM', null, 362387869796000,
    'DIAGNOSTICS', '检查检验',
    '检验标本、容器、检测方法、检查类型及检查变体方式等受控值。',
    50, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

update dictionary_categories
set revision = revision + 1,
    description = '诊疗项目、药品知识、厂家产品与检查检验等基础数据受控值的上级目录。',
    updated_at = current_timestamp,
    updated_by = 362387869790222
where id = 362387869796000;

-- Record the planned dictionary moves before applying them. This keeps migration
-- activity visible in the same append-only change history as interactive moves.
insert into dictionary_changes (
    id, tenant_id, dictionary_id, item_id, change_type, target_type,
    before_json, after_json, reason, request_code, changed_at, changed_by, category_id
)
select 362387869840100 + row_number() over (order by planned.dictionary_id),
       planned.tenant_id, planned.dictionary_id, null, 'MOVE_DICT', 'DICT',
       '{"categoryId":"' || cast(planned.previous_category_id as varchar) || '"}',
       '{"categoryId":"' || cast(planned.planned_category_id as varchar) ||
           '","categoryCode":"' || planned.planned_category_code || '"}',
       '按平台字典分类规划调整归属', 'baseline-v37:' || planned.code,
       current_timestamp, 362387869790222, planned.planned_category_id
from (
    select definition.id as dictionary_id, definition.tenant_id,
           definition.category_id as previous_category_id, definition.code,
           case
               when definition.code like 'PARAM_%' then 362387869840001
               when definition.code in (
                   'ORG_KIND', 'ORG_TYPE', 'ORG_STATUS', 'ORG_PROPERTY',
                   'ORG_IDENTIFIER_TYPE', 'ORG_CONTACT_TYPE', 'ORG_CONTACT_USE',
                   'ORG_ADDRESS_TYPE', 'ORG_RELATION_TYPE', 'ORG_CAPABILITY_TYPE',
                   'ORG_RESPONSIBILITY_TYPE', 'ORG_VERIFY_STATUS', 'ORG_DETAIL_STATUS'
               ) then 362387869840002
               when definition.code in (
                   'ORG_DEPARTMENT_TYPE', 'DEPT_TYPE', 'DEPT_PROPERTY',
                   'DEPT_RELATION_TYPE', 'DEPT_CAPABILITY_TYPE', 'DEPT_RESPONSIBILITY_TYPE'
               ) then 362387869840003
               when definition.code in (
                   'PRACT_GENDER', 'PERSONNEL_STATUS', 'EMPLOYMENT_TYPE',
                   'POSITION_TYPE', 'ASSIGNMENT_TYPE'
               ) then 362387869840004
               when definition.code in ('BD_MASTER_STATUS', 'BD_CONCEPT_TYPE', 'BD_ALIAS_TYPE')
                   then 362387869840005
               when definition.code in (
                   'BD_ITEM_TYPE', 'BD_SERVICE_TYPE', 'BD_SERVICE_USE', 'BD_SERVICE_DUPLICATE_RULE'
               ) then 362387869840006
               when definition.code in (
                   'BD_MEDICATION_TYPE', 'BD_DOSE_FORM', 'BD_STORAGE_TYPE', 'BD_ANTIMICROBIAL_LEVEL'
               ) then 362387869840007
               when definition.code in (
                   'BD_MANUFACTURER_TYPE', 'BD_PRODUCTION_PLACE', 'BD_PRODUCT_MARKET_STATUS',
                   'BD_SHELF_LIFE_UNIT', 'BD_PACKAGE_USE', 'BD_PRICE_TYPE'
               ) then 362387869840008
               when definition.code in (
                   'BD_SPECIMEN_TYPE', 'BD_SPECIMEN_CONTAINER', 'BD_LAB_METHOD',
                   'BD_EXAM_TYPE', 'BD_SERVICE_VARIANT_METHOD'
               ) then 362387869840009
           end as planned_category_id,
           case
               when definition.code like 'PARAM_%' then 'PARAMETER_GOVERNANCE'
               when definition.code in (
                   'ORG_KIND', 'ORG_TYPE', 'ORG_STATUS', 'ORG_PROPERTY',
                   'ORG_IDENTIFIER_TYPE', 'ORG_CONTACT_TYPE', 'ORG_CONTACT_USE',
                   'ORG_ADDRESS_TYPE', 'ORG_RELATION_TYPE', 'ORG_CAPABILITY_TYPE',
                   'ORG_RESPONSIBILITY_TYPE', 'ORG_VERIFY_STATUS', 'ORG_DETAIL_STATUS'
               ) then 'ORGANIZATION_GOVERNANCE'
               when definition.code in (
                   'ORG_DEPARTMENT_TYPE', 'DEPT_TYPE', 'DEPT_PROPERTY',
                   'DEPT_RELATION_TYPE', 'DEPT_CAPABILITY_TYPE', 'DEPT_RESPONSIBILITY_TYPE'
               ) then 'DEPARTMENT_GOVERNANCE'
               when definition.code in (
                   'PRACT_GENDER', 'PERSONNEL_STATUS', 'EMPLOYMENT_TYPE',
                   'POSITION_TYPE', 'ASSIGNMENT_TYPE'
               ) then 'PERSONNEL_GOVERNANCE'
               when definition.code in ('BD_MASTER_STATUS', 'BD_CONCEPT_TYPE', 'BD_ALIAS_TYPE')
                   then 'MASTER_DATA_GOVERNANCE'
               when definition.code in (
                   'BD_ITEM_TYPE', 'BD_SERVICE_TYPE', 'BD_SERVICE_USE', 'BD_SERVICE_DUPLICATE_RULE'
               ) then 'CLINICAL_SERVICE'
               when definition.code in (
                   'BD_MEDICATION_TYPE', 'BD_DOSE_FORM', 'BD_STORAGE_TYPE', 'BD_ANTIMICROBIAL_LEVEL'
               ) then 'MEDICATION'
               when definition.code in (
                   'BD_MANUFACTURER_TYPE', 'BD_PRODUCTION_PLACE', 'BD_PRODUCT_MARKET_STATUS',
                   'BD_SHELF_LIFE_UNIT', 'BD_PACKAGE_USE', 'BD_PRICE_TYPE'
               ) then 'PRODUCT_SUPPLY'
               when definition.code in (
                   'BD_SPECIMEN_TYPE', 'BD_SPECIMEN_CONTAINER', 'BD_LAB_METHOD',
                   'BD_EXAM_TYPE', 'BD_SERVICE_VARIANT_METHOD'
               ) then 'DIAGNOSTICS'
           end as planned_category_code
    from dictionary_definitions definition
    where definition.scope_code = 'PLATFORM'
) planned
where planned.planned_category_id is not null
  and planned.previous_category_id <> planned.planned_category_id;

update dictionary_definitions
set category_id = 362387869840001, revision = revision + 1,
    updated_at = current_timestamp
where scope_code = 'PLATFORM' and code like 'PARAM_%';

update dictionary_definitions
set category_id = 362387869840002, revision = revision + 1,
    updated_at = current_timestamp
where scope_code = 'PLATFORM' and code in (
    'ORG_KIND', 'ORG_TYPE', 'ORG_STATUS', 'ORG_PROPERTY',
    'ORG_IDENTIFIER_TYPE', 'ORG_CONTACT_TYPE', 'ORG_CONTACT_USE',
    'ORG_ADDRESS_TYPE', 'ORG_RELATION_TYPE', 'ORG_CAPABILITY_TYPE',
    'ORG_RESPONSIBILITY_TYPE', 'ORG_VERIFY_STATUS', 'ORG_DETAIL_STATUS'
);

update dictionary_definitions
set category_id = 362387869840003, revision = revision + 1,
    updated_at = current_timestamp
where scope_code = 'PLATFORM' and code in (
    'ORG_DEPARTMENT_TYPE', 'DEPT_TYPE', 'DEPT_PROPERTY',
    'DEPT_RELATION_TYPE', 'DEPT_CAPABILITY_TYPE', 'DEPT_RESPONSIBILITY_TYPE'
);

update dictionary_definitions
set category_id = 362387869840004, revision = revision + 1,
    updated_at = current_timestamp
where scope_code = 'PLATFORM' and code in (
    'PRACT_GENDER', 'PERSONNEL_STATUS', 'EMPLOYMENT_TYPE', 'POSITION_TYPE', 'ASSIGNMENT_TYPE'
);

update dictionary_definitions
set category_id = 362387869840005, revision = revision + 1,
    updated_at = current_timestamp
where scope_code = 'PLATFORM' and code in ('BD_MASTER_STATUS', 'BD_CONCEPT_TYPE', 'BD_ALIAS_TYPE');

update dictionary_definitions
set category_id = 362387869840006, revision = revision + 1,
    updated_at = current_timestamp
where scope_code = 'PLATFORM' and code in (
    'BD_ITEM_TYPE', 'BD_SERVICE_TYPE', 'BD_SERVICE_USE', 'BD_SERVICE_DUPLICATE_RULE'
);

update dictionary_definitions
set category_id = 362387869840007, revision = revision + 1,
    updated_at = current_timestamp
where scope_code = 'PLATFORM' and code in (
    'BD_MEDICATION_TYPE', 'BD_DOSE_FORM', 'BD_STORAGE_TYPE', 'BD_ANTIMICROBIAL_LEVEL'
);

update dictionary_definitions
set category_id = 362387869840008, revision = revision + 1,
    updated_at = current_timestamp
where scope_code = 'PLATFORM' and code in (
    'BD_MANUFACTURER_TYPE', 'BD_PRODUCTION_PLACE', 'BD_PRODUCT_MARKET_STATUS',
    'BD_SHELF_LIFE_UNIT', 'BD_PACKAGE_USE', 'BD_PRICE_TYPE'
);

update dictionary_definitions
set category_id = 362387869840009, revision = revision + 1,
    updated_at = current_timestamp
where scope_code = 'PLATFORM' and code in (
    'BD_SPECIMEN_TYPE', 'BD_SPECIMEN_CONTAINER', 'BD_LAB_METHOD',
    'BD_EXAM_TYPE', 'BD_SERVICE_VARIANT_METHOD'
);

insert into dictionary_changes (
    id, tenant_id, dictionary_id, item_id, change_type, target_type,
    before_json, after_json, reason, request_code, changed_at, changed_by, category_id
) values (
    362387869840211, null, null, null, 'UPDATE_CATEGORY', 'CATEGORY',
    '{"description":"诊疗项目、药品知识、厂家产品、包装、机构目录与价格使用的受控值。"}',
    '{"description":"诊疗项目、药品知识、厂家产品与检查检验等基础数据受控值的上级目录。"}',
    '按平台字典分类规划明确上级目录职责', 'baseline-v37-category:MASTER_DATA',
    current_timestamp, 362387869790222, 362387869796000
);

insert into dictionary_changes (
    id, tenant_id, dictionary_id, item_id, change_type, target_type,
    before_json, after_json, reason, request_code, changed_at, changed_by, category_id
)
select 362387869840200 + row_number() over (order by category.id),
       null, null, null, 'CREATE_CATEGORY', 'CATEGORY', null,
       '{"categoryId":"' || cast(category.id as varchar) || '","code":"' || category.code ||
           '","name":"' || category.name || '"}',
       '建立平台字典分类规划', 'baseline-v37-category:' || category.code,
       current_timestamp, 362387869790222, category.id
from dictionary_categories category
where category.id between 362387869840000 and 362387869840009;
