-- Complete the primary-care resident registration slice without mixing temporal clinical facts into the MPI.

alter table resident_demographic_profiles add column residency_type_code varchar(32);

create table resident_employments (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    resident_id bigint not null,
    employer_name varchar(200) not null,
    occupation_code varchar(64),
    phone varchar(32),
    postal_code varchar(16),
    address_text varchar(1000),
    primary_flag boolean default false not null,
    valid_from date not null,
    valid_to date,
    status varchar(24) not null,
    created_at timestamp with time zone not null,
    created_by varchar(100) not null,
    updated_at timestamp with time zone not null,
    updated_by varchar(100) not null,
    constraint uk_resident_employment_tenant_id unique (tenant_id, id),
    constraint fk_resident_employment_resident foreign key (tenant_id, resident_id)
        references residents(tenant_id, id),
    constraint ck_resident_employment_period check (valid_to is null or valid_to >= valid_from),
    constraint ck_resident_employment_status check (status in ('ACTIVE', 'INACTIVE'))
);
create index idx_resident_employment_current
    on resident_employments (tenant_id, resident_id, status, primary_flag);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by, category_id
) values (362387869841107, 0, 'PLATFORM', 'PLATFORM', null, 'PI_IDENTIFIER_TYPE', '居民标识类型',
    '用于居民主索引去重和跨系统识别的证件或卡类型', false, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869841000);
insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by, category_id
) values (362387869841108, 0, 'PLATFORM', 'PLATFORM', null, 'PI_RESIDENCY_TYPE', '常住类型',
    '基层居民管理中的户籍、非户籍常住和流动人口分类', false, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869841000);
insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by, category_id
) values (362387869841109, 0, 'PLATFORM', 'PLATFORM', null, 'PI_EDUCATION_LEVEL', '文化程度',
    '居民当前文化程度的轻量受控分类', false, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869841000);
insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by, category_id
) values (362387869841110, 0, 'PLATFORM', 'PLATFORM', null, 'PI_OCCUPATION_TYPE', '职业类别',
    '居民基本资料和工作单位使用的基层适用职业大类', false, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869841000);

insert into dictionary_items values (362387869841260, 362387869841107, 'NATIONAL_ID', '居民身份证', null, 10, 'ACTIVE');
insert into dictionary_items values (362387869841261, 362387869841107, 'SOCIAL_SECURITY_CARD', '社会保障卡', null, 20, 'ACTIVE');
insert into dictionary_items values (362387869841262, 362387869841107, 'HEALTH_CARD', '居民健康卡', null, 30, 'ACTIVE');
insert into dictionary_items values (362387869841263, 362387869841107, 'MEDICAL_INSURANCE_NO', '医保人员编号', null, 40, 'ACTIVE');
insert into dictionary_items values (362387869841264, 362387869841107, 'PASSPORT', '护照', null, 50, 'ACTIVE');
insert into dictionary_items values (362387869841265, 362387869841107, 'BIRTH_CERTIFICATE', '出生医学证明', null, 60, 'ACTIVE');
insert into dictionary_items values (362387869841266, 362387869841107, 'OTHER', '其他有效标识', null, 90, 'ACTIVE');
insert into dictionary_items values (362387869841267, 362387869841107, 'HOSPITAL_MRN', '医疗机构病案号', null, 70, 'ACTIVE');

insert into dictionary_items values (362387869841270, 362387869841108, 'HOUSEHOLD', '户籍人口', null, 10, 'ACTIVE');
insert into dictionary_items values (362387869841271, 362387869841108, 'NON_HOUSEHOLD', '非户籍常住人口', null, 20, 'ACTIVE');
insert into dictionary_items values (362387869841272, 362387869841108, 'MOBILE', '流动人口', null, 30, 'ACTIVE');
insert into dictionary_items values (362387869841273, 362387869841108, 'UNKNOWN', '未说明', null, 90, 'ACTIVE');

insert into dictionary_items values (362387869841280, 362387869841109, 'NONE', '文盲或半文盲', null, 10, 'ACTIVE');
insert into dictionary_items values (362387869841281, 362387869841109, 'PRIMARY', '小学', null, 20, 'ACTIVE');
insert into dictionary_items values (362387869841282, 362387869841109, 'JUNIOR_HIGH', '初中', null, 30, 'ACTIVE');
insert into dictionary_items values (362387869841283, 362387869841109, 'SENIOR_HIGH', '高中', null, 40, 'ACTIVE');
insert into dictionary_items values (362387869841284, 362387869841109, 'TECHNICAL', '技工学校或中专', null, 50, 'ACTIVE');
insert into dictionary_items values (362387869841285, 362387869841109, 'COLLEGE', '大学专科', null, 60, 'ACTIVE');
insert into dictionary_items values (362387869841286, 362387869841109, 'BACHELOR', '大学本科', null, 70, 'ACTIVE');
insert into dictionary_items values (362387869841287, 362387869841109, 'POSTGRADUATE', '研究生', null, 80, 'ACTIVE');
insert into dictionary_items values (362387869841288, 362387869841109, 'UNKNOWN', '未说明', null, 90, 'ACTIVE');

insert into dictionary_items values (362387869841300, 362387869841110, 'PRESCHOOL', '学龄前儿童', null, 10, 'ACTIVE');
insert into dictionary_items values (362387869841301, 362387869841110, 'STUDENT', '学生', null, 20, 'ACTIVE');
insert into dictionary_items values (362387869841302, 362387869841110, 'AGRICULTURE', '农林牧渔劳动者', null, 30, 'ACTIVE');
insert into dictionary_items values (362387869841303, 362387869841110, 'WORKER', '生产运输及相关人员', null, 40, 'ACTIVE');
insert into dictionary_items values (362387869841304, 362387869841110, 'PROFESSIONAL', '专业技术人员', null, 50, 'ACTIVE');
insert into dictionary_items values (362387869841305, 362387869841110, 'SERVICE', '商业及服务业人员', null, 60, 'ACTIVE');
insert into dictionary_items values (362387869841306, 362387869841110, 'OFFICE', '办事及管理人员', null, 70, 'ACTIVE');
insert into dictionary_items values (362387869841307, 362387869841110, 'RETIRED', '离退休人员', null, 80, 'ACTIVE');
insert into dictionary_items values (362387869841308, 362387869841110, 'UNEMPLOYED', '无业或待业', null, 90, 'ACTIVE');
insert into dictionary_items values (362387869841309, 362387869841110, 'OTHER', '其他', null, 100, 'ACTIVE');
insert into dictionary_items values (362387869841310, 362387869841110, 'UNKNOWN', '未说明', null, 110, 'ACTIVE');
