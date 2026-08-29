-- Oracle variant of resident profile completion.

alter table residents add deceased number(1,0) default 0 not null;
alter table residents add deceased_at timestamp with time zone;
alter table residents add updated_by varchar2(100 char) default 'system' not null;
alter table residents add constraint ck_resident_deceased_time check (deceased = 1 or deceased_at is null);

create table resident_demographic_profiles (
    resident_id number(19) primary key,
    tenant_id number(19) not null,
    nationality_code varchar2(32 char),
    ethnicity_code varchar2(32 char),
    marital_status_code varchar2(32 char),
    education_code varchar2(32 char),
    occupation_code varchar2(64 char),
    blood_type_code varchar2(16 char),
    rh_type_code varchar2(16 char),
    updated_at timestamp with time zone not null,
    updated_by varchar2(100 char) not null,
    constraint fk_resident_demo_resident foreign key (tenant_id, resident_id)
        references residents(tenant_id, id)
);

create table resident_addresses (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    resident_id number(19) not null,
    use_code varchar2(32 char) not null,
    province_code varchar2(32 char),
    city_code varchar2(32 char),
    district_code varchar2(32 char),
    street_code varchar2(32 char),
    address_text varchar2(1000 char) not null,
    postal_code varchar2(16 char),
    primary_flag number(1,0) default 0 not null,
    valid_from date not null,
    valid_to date,
    status varchar2(24 char) not null,
    created_at timestamp with time zone not null,
    created_by varchar2(100 char) not null,
    updated_at timestamp with time zone not null,
    updated_by varchar2(100 char) not null,
    constraint uk_resident_address_tenant_id unique (tenant_id, id),
    constraint fk_resident_address_resident foreign key (tenant_id, resident_id)
        references residents(tenant_id, id),
    constraint ck_resident_address_period check (valid_to is null or valid_to >= valid_from),
    constraint ck_resident_address_status check (status in ('ACTIVE', 'INACTIVE'))
);
create index idx_resident_address_current on resident_addresses (tenant_id, resident_id, status, primary_flag);

create table resident_related_persons (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    resident_id number(19) not null,
    full_name varchar2(100 char) not null,
    relationship_code varchar2(32 char) not null,
    phone varchar2(32 char),
    address_text varchar2(1000 char),
    guardian_flag number(1,0) default 0 not null,
    emergency_contact_flag number(1,0) default 0 not null,
    valid_from date not null,
    valid_to date,
    status varchar2(24 char) not null,
    created_at timestamp with time zone not null,
    created_by varchar2(100 char) not null,
    updated_at timestamp with time zone not null,
    updated_by varchar2(100 char) not null,
    constraint uk_resident_related_tenant_id unique (tenant_id, id),
    constraint fk_resident_related_resident foreign key (tenant_id, resident_id)
        references residents(tenant_id, id),
    constraint ck_resident_related_period check (valid_to is null or valid_to >= valid_from),
    constraint ck_resident_related_status check (status in ('ACTIVE', 'INACTIVE'))
);
create index idx_resident_related_current on resident_related_persons (tenant_id, resident_id, status);

create table resident_coverages (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    resident_id number(19) not null,
    coverage_type_code varchar2(32 char) not null,
    payer_name varchar2(200 char) not null,
    member_no varchar2(100 char),
    primary_flag number(1,0) default 0 not null,
    valid_from date not null,
    valid_to date,
    status varchar2(24 char) not null,
    created_at timestamp with time zone not null,
    created_by varchar2(100 char) not null,
    updated_at timestamp with time zone not null,
    updated_by varchar2(100 char) not null,
    constraint uk_resident_coverage_tenant_id unique (tenant_id, id),
    constraint fk_resident_coverage_resident foreign key (tenant_id, resident_id)
        references residents(tenant_id, id),
    constraint ck_resident_coverage_period check (valid_to is null or valid_to >= valid_from),
    constraint ck_resident_coverage_status check (status in ('ACTIVE', 'INACTIVE'))
);
create index idx_resident_coverage_current on resident_coverages (tenant_id, resident_id, status, primary_flag);

insert into dictionary_categories (
    id, revision, scope_type, scope_code, tenant_id, parent_id, code, name, description,
    sort_order, status, created_at, created_by, updated_at, updated_by
) values (
    362387869841000, 0, 'PLATFORM', 'PLATFORM', null, null, 'PATIENT_MANAGEMENT', '居民与患者',
    '居民主索引、人口学、地址、联系人和保障信息使用的轻量受控值。',
    200, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by, category_id
) values (362387869841101, 0, 'PLATFORM', 'PLATFORM', null, 'PI_MARITAL_STATUS', '婚姻状况',
    '居民人口学档案中的当前婚姻状况', 0, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869841000);
insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by, category_id
) values (362387869841102, 0, 'PLATFORM', 'PLATFORM', null, 'PI_BLOOD_TYPE', 'ABO 血型',
    '居民人口学档案中的 ABO 血型', 0, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869841000);
insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by, category_id
) values (362387869841103, 0, 'PLATFORM', 'PLATFORM', null, 'PI_RH_TYPE', 'Rh 血型',
    '居民人口学档案中的 Rh 血型', 0, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869841000);
insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by, category_id
) values (362387869841104, 0, 'PLATFORM', 'PLATFORM', null, 'PI_ADDRESS_USE', '居民地址用途',
    '区分户籍、现住和通信地址', 0, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869841000);
insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by, category_id
) values (362387869841105, 0, 'PLATFORM', 'PLATFORM', null, 'PI_RELATED_PERSON_RELATIONSHIP', '联系人关系',
    '居民联系人、家属和监护人与本人的关系', 0, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869841000);
insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by, category_id
) values (362387869841106, 0, 'PLATFORM', 'PLATFORM', null, 'INS_COVERAGE_TYPE', '保障类型',
    '居民参保待遇或支付保障的类型', 0, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869841000);

insert into dictionary_items values (362387869841201, 362387869841101, 'UNMARRIED', '未婚', null, 10, 'ACTIVE');
insert into dictionary_items values (362387869841202, 362387869841101, 'MARRIED', '已婚', null, 20, 'ACTIVE');
insert into dictionary_items values (362387869841203, 362387869841101, 'DIVORCED', '离婚', null, 30, 'ACTIVE');
insert into dictionary_items values (362387869841204, 362387869841101, 'WIDOWED', '丧偶', null, 40, 'ACTIVE');
insert into dictionary_items values (362387869841205, 362387869841101, 'UNKNOWN', '未说明', null, 90, 'ACTIVE');
insert into dictionary_items values (362387869841211, 362387869841102, 'A', 'A 型', null, 10, 'ACTIVE');
insert into dictionary_items values (362387869841212, 362387869841102, 'B', 'B 型', null, 20, 'ACTIVE');
insert into dictionary_items values (362387869841213, 362387869841102, 'AB', 'AB 型', null, 30, 'ACTIVE');
insert into dictionary_items values (362387869841214, 362387869841102, 'O', 'O 型', null, 40, 'ACTIVE');
insert into dictionary_items values (362387869841215, 362387869841102, 'UNKNOWN', '未查', null, 90, 'ACTIVE');
insert into dictionary_items values (362387869841221, 362387869841103, 'POSITIVE', 'Rh 阳性', null, 10, 'ACTIVE');
insert into dictionary_items values (362387869841222, 362387869841103, 'NEGATIVE', 'Rh 阴性', null, 20, 'ACTIVE');
insert into dictionary_items values (362387869841223, 362387869841103, 'UNKNOWN', '未查', null, 90, 'ACTIVE');
insert into dictionary_items values (362387869841231, 362387869841104, 'REGISTERED', '户籍地址', null, 10, 'ACTIVE');
insert into dictionary_items values (362387869841232, 362387869841104, 'HOME', '现住地址', null, 20, 'ACTIVE');
insert into dictionary_items values (362387869841233, 362387869841104, 'CONTACT', '通信地址', null, 30, 'ACTIVE');
insert into dictionary_items values (362387869841241, 362387869841105, 'SPOUSE', '配偶', null, 10, 'ACTIVE');
insert into dictionary_items values (362387869841242, 362387869841105, 'PARENT', '父母', null, 20, 'ACTIVE');
insert into dictionary_items values (362387869841243, 362387869841105, 'CHILD', '子女', null, 30, 'ACTIVE');
insert into dictionary_items values (362387869841244, 362387869841105, 'SIBLING', '兄弟姐妹', null, 40, 'ACTIVE');
insert into dictionary_items values (362387869841245, 362387869841105, 'GUARDIAN', '监护人', null, 50, 'ACTIVE');
insert into dictionary_items values (362387869841246, 362387869841105, 'OTHER', '其他', null, 90, 'ACTIVE');
insert into dictionary_items values (362387869841251, 362387869841106, 'EMPLOYEE_BASIC', '职工基本医疗保险', null, 10, 'ACTIVE');
insert into dictionary_items values (362387869841252, 362387869841106, 'RESIDENT_BASIC', '城乡居民基本医疗保险', null, 20, 'ACTIVE');
insert into dictionary_items values (362387869841253, 362387869841106, 'COMMERCIAL', '商业保险', null, 30, 'ACTIVE');
insert into dictionary_items values (362387869841254, 362387869841106, 'SELF_PAY', '自费', null, 40, 'ACTIVE');
insert into dictionary_items values (362387869841255, 362387869841106, 'OTHER', '其他保障', null, 90, 'ACTIVE');
