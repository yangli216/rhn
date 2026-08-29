-- Resident profile completion: current demographics plus effective-dated contact facts.

alter table residents add column deceased boolean default false not null;
alter table residents add column deceased_at timestamp with time zone;
alter table residents add column updated_by varchar(100) default 'system' not null;
alter table residents add constraint ck_resident_deceased_time check (deceased = true or deceased_at is null);

create table resident_demographic_profiles (
    resident_id bigint primary key,
    tenant_id bigint not null,
    nationality_code varchar(32),
    ethnicity_code varchar(32),
    marital_status_code varchar(32),
    education_code varchar(32),
    occupation_code varchar(64),
    blood_type_code varchar(16),
    rh_type_code varchar(16),
    updated_at timestamp with time zone not null,
    updated_by varchar(100) not null,
    constraint fk_resident_demo_resident foreign key (tenant_id, resident_id)
        references residents(tenant_id, id)
);

create table resident_addresses (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    resident_id bigint not null,
    use_code varchar(32) not null,
    province_code varchar(32),
    city_code varchar(32),
    district_code varchar(32),
    street_code varchar(32),
    address_text varchar(1000) not null,
    postal_code varchar(16),
    primary_flag boolean default false not null,
    valid_from date not null,
    valid_to date,
    status varchar(24) not null,
    created_at timestamp with time zone not null,
    created_by varchar(100) not null,
    updated_at timestamp with time zone not null,
    updated_by varchar(100) not null,
    constraint uk_resident_address_tenant_id unique (tenant_id, id),
    constraint fk_resident_address_resident foreign key (tenant_id, resident_id)
        references residents(tenant_id, id),
    constraint ck_resident_address_period check (valid_to is null or valid_to >= valid_from),
    constraint ck_resident_address_status check (status in ('ACTIVE', 'INACTIVE'))
);
create index idx_resident_address_current on resident_addresses (tenant_id, resident_id, status, primary_flag);

create table resident_related_persons (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    resident_id bigint not null,
    full_name varchar(100) not null,
    relationship_code varchar(32) not null,
    phone varchar(32),
    address_text varchar(1000),
    guardian_flag boolean default false not null,
    emergency_contact_flag boolean default false not null,
    valid_from date not null,
    valid_to date,
    status varchar(24) not null,
    created_at timestamp with time zone not null,
    created_by varchar(100) not null,
    updated_at timestamp with time zone not null,
    updated_by varchar(100) not null,
    constraint uk_resident_related_tenant_id unique (tenant_id, id),
    constraint fk_resident_related_resident foreign key (tenant_id, resident_id)
        references residents(tenant_id, id),
    constraint ck_resident_related_period check (valid_to is null or valid_to >= valid_from),
    constraint ck_resident_related_status check (status in ('ACTIVE', 'INACTIVE'))
);
create index idx_resident_related_current on resident_related_persons (tenant_id, resident_id, status);

create table resident_coverages (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    resident_id bigint not null,
    coverage_type_code varchar(32) not null,
    payer_name varchar(200) not null,
    member_no varchar(100),
    primary_flag boolean default false not null,
    valid_from date not null,
    valid_to date,
    status varchar(24) not null,
    created_at timestamp with time zone not null,
    created_by varchar(100) not null,
    updated_at timestamp with time zone not null,
    updated_by varchar(100) not null,
    constraint uk_resident_coverage_tenant_id unique (tenant_id, id),
    constraint fk_resident_coverage_resident foreign key (tenant_id, resident_id)
        references residents(tenant_id, id),
    constraint ck_resident_coverage_period check (valid_to is null or valid_to >= valid_from),
    constraint ck_resident_coverage_status check (status in ('ACTIVE', 'INACTIVE'))
);
create index idx_resident_coverage_current on resident_coverages (tenant_id, resident_id, status, primary_flag);

-- Patient-domain ordinary dictionaries follow the PI/INS naming allocation.
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
    '居民人口学档案中的当前婚姻状况', false, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869841000);
insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by, category_id
) values (362387869841102, 0, 'PLATFORM', 'PLATFORM', null, 'PI_BLOOD_TYPE', 'ABO 血型',
    '居民人口学档案中的 ABO 血型', false, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869841000);
insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by, category_id
) values (362387869841103, 0, 'PLATFORM', 'PLATFORM', null, 'PI_RH_TYPE', 'Rh 血型',
    '居民人口学档案中的 Rh 血型', false, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869841000);
insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by, category_id
) values (362387869841104, 0, 'PLATFORM', 'PLATFORM', null, 'PI_ADDRESS_USE', '居民地址用途',
    '区分户籍、现住和通信地址', false, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869841000);
insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by, category_id
) values (362387869841105, 0, 'PLATFORM', 'PLATFORM', null, 'PI_RELATED_PERSON_RELATIONSHIP', '联系人关系',
    '居民联系人、家属和监护人与本人的关系', false, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869841000);
insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by, category_id
) values (362387869841106, 0, 'PLATFORM', 'PLATFORM', null, 'INS_COVERAGE_TYPE', '保障类型',
    '居民参保待遇或支付保障的类型', false, 'ACTIVE', current_timestamp, 362387869790222,
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
