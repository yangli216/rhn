insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791111, 0, 'PLATFORM', 'PLATFORM', null, 'DEPT_TYPE', '科室类型',
    '国家诊疗科目及医疗机构常见行政、医辅、护理和跨学科科室类型',
    false, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
select id + 2000, 362387869791111, code, name, description, sort_order, status
from dictionary_items where dictionary_id = 362387869791101;

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791112, 0, 'PLATFORM', 'PLATFORM', null, 'DEPT_PROPERTY', '科室属性',
    '科室在机构内的管理和业务属性', false, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items values (362387869793286, 362387869791112, 'CLINICAL', '临床科室', '直接提供诊疗服务', 10, 'ACTIVE');
insert into dictionary_items values (362387869793287, 362387869791112, 'ADMINISTRATIVE', '行政科室', '承担行政管理职责', 20, 'ACTIVE');
insert into dictionary_items values (362387869793288, 362387869791112, 'MEDICAL_TECHNOLOGY', '医技科室', '提供检验、检查等医技服务', 30, 'ACTIVE');
insert into dictionary_items values (362387869793289, 362387869791112, 'NURSING', '护理单元', '承担护理管理和护理服务', 40, 'ACTIVE');
insert into dictionary_items values (362387869793290, 362387869791112, 'OTHER', '其他', '其他科室属性', 50, 'ACTIVE');

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791113, 0, 'PLATFORM', 'PLATFORM', null, 'DEPT_RELATION_TYPE', '科室关系类型',
    '不改变科室权威父树的业务关系', false, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items values (362387869793291, 362387869791113, 'BUSINESS_MANAGEMENT', '业务管理', '科室间业务管理关系', 10, 'ACTIVE');
insert into dictionary_items values (362387869793292, 362387869791113, 'CLINICAL_SUPPORT', '临床支撑', '科室间临床或医技支撑关系', 20, 'ACTIVE');
insert into dictionary_items values (362387869793293, 362387869791113, 'COLLABORATION', '协作', '科室间协作关系', 30, 'ACTIVE');
insert into dictionary_items values (362387869793294, 362387869791113, 'REFERRAL', '转诊', '科室间转诊关系', 40, 'ACTIVE');

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791114, 0, 'PLATFORM', 'PLATFORM', null, 'DEPT_CAPABILITY_TYPE', '科室能力类型',
    '科室可承担的主要业务能力', false, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items (id, dictionary_id, code, name, description, sort_order, status)
select id + 1000, 362387869791114, code, name,
       replace(description, '组织', '科室'), sort_order, status
from dictionary_items where dictionary_id = 362387869791107;

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by
) values (
    362387869791115, 0, 'PLATFORM', 'PLATFORM', null, 'DEPT_RESPONSIBILITY_TYPE', '科室负责人类型',
    '科主任、副主任、护士长及专项责任人', false, 'ACTIVE', current_timestamp, null, current_timestamp, null
);

insert into dictionary_items values (362387869793295, 362387869791115, 'DIRECTOR', '科主任', '科室主要负责人', 10, 'ACTIVE');
insert into dictionary_items values (362387869793296, 362387869791115, 'DEPUTY_DIRECTOR', '科副主任', '科室副职负责人', 20, 'ACTIVE');
insert into dictionary_items values (362387869793297, 362387869791115, 'NURSE_MANAGER', '护士长', '科室护理负责人', 30, 'ACTIVE');
insert into dictionary_items values (362387869793298, 362387869791115, 'BUSINESS_OWNER', '业务负责人', '科室专项业务负责人', 40, 'ACTIVE');
insert into dictionary_items values (362387869793299, 362387869791115, 'SAFETY_OWNER', '安全责任人', '科室安全责任人', 50, 'ACTIVE');

update dictionary_definitions set name = '机构负责人类型', description = '机构法定代表人、主要负责人和专项责任人'
where id = 362387869791108;
update dictionary_items set status = 'INACTIVE'
where dictionary_id = 362387869791108 and code in ('DIRECTOR', 'NURSE_MANAGER');
insert into dictionary_items values (362387869793300, 362387869791108, 'PRINCIPAL', '主要负责人', '机构主要负责人', 20, 'ACTIVE');
