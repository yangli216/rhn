-- Comprehensive representative residents dataset for outpatient/inpatient/chronic care demo.

-- 1. Residents master index
insert into residents (
    id, tenant_id, health_record_no, full_name, national_id, gender, birth_date,
    phone, deceased, deceased_at, created_at, created_by, status, merged_into_id,
    updated_at, updated_by, version
) values
    (362387869900101, 362387869790209, 'HR3301020001', '张建国', '330102195403151218', 'MALE', date '1954-03-15',
     '13805710001', false, null, current_timestamp, 'seed-demo', 'ACTIVE', null, current_timestamp, 'seed-demo', 0),
    (362387869900102, 362387869790209, 'HR3301020002', '李晓丽', '330102199806202425', 'FEMALE', date '1998-06-20',
     '13958012345', false, null, current_timestamp, 'seed-demo', 'ACTIVE', null, current_timestamp, 'seed-demo', 0),
    (362387869900103, 362387869790209, 'HR3301020003', '陈明远', '330102202009103612', 'MALE', date '2020-09-10',
     '13735518888', false, null, current_timestamp, 'seed-demo', 'ACTIVE', null, current_timestamp, 'seed-demo', 0),
    (362387869900104, 362387869790209, 'HR3301020004', '王桂珍', '330102195811084226', 'FEMALE', date '1958-11-08',
     '13605719999', false, null, current_timestamp, 'seed-demo', 'ACTIVE', null, current_timestamp, 'seed-demo', 0),
    (362387869900105, 362387869790209, 'HR3301020005', '赵强', '330102198104125519', 'MALE', date '1981-04-12',
     '13588886666', false, null, current_timestamp, 'seed-demo', 'ACTIVE', null, current_timestamp, 'seed-demo', 0),
    (362387869900106, 362387869790209, 'HR3501020006', '林清玄', '350102199008182013', 'MALE', date '1990-08-18',
     '13305910088', false, null, current_timestamp, 'seed-demo', 'ACTIVE', null, current_timestamp, 'seed-demo', 0),
    (362387869900107, 362387869790209, 'HR3301020007', '周子涵', '33010220260301112X', 'FEMALE', date '2026-03-01',
     '13967112233', false, null, current_timestamp, 'seed-demo', 'ACTIVE', null, current_timestamp, 'seed-demo', 0),
    (362387869900108, 362387869790209, 'HR3301020008', '孙玉英', '330102194412253321', 'FEMALE', date '1944-12-25',
     '13105710089', false, null, current_timestamp, 'seed-demo', 'ACTIVE', null, current_timestamp, 'seed-demo', 0);

-- 2. Resident Identifiers (National ID, Health Card, Social Security Card)
insert into resident_identifiers (
    id, tenant_id, resident_id, identifier_system, identifier_value, normalized_value,
    use_type, status, source_organization_id, valid_from, valid_to, created_at
) values
    (362387869900201, 362387869790209, 362387869900101, 'NATIONAL_ID', '330102195403151218', '330102195403151218',
     'OFFICIAL', 'ACTIVE', 362387869790211, date '1954-03-15', null, current_timestamp),
    (362387869900202, 362387869790209, 362387869900101, 'HEALTH_CARD', 'E3301020001', 'E3301020001',
     'SECONDARY', 'ACTIVE', 362387869790211, date '2020-01-01', null, current_timestamp),

    (362387869900203, 362387869790209, 362387869900102, 'NATIONAL_ID', '330102199806202425', '330102199806202425',
     'OFFICIAL', 'ACTIVE', 362387869790211, date '1998-06-20', null, current_timestamp),
    (362387869900204, 362387869790209, 362387869900102, 'HEALTH_CARD', 'E3301020002', 'E3301020002',
     'SECONDARY', 'ACTIVE', 362387869790211, date '2020-01-01', null, current_timestamp),

    (362387869900205, 362387869790209, 362387869900103, 'NATIONAL_ID', '330102202009103612', '330102202009103612',
     'OFFICIAL', 'ACTIVE', 362387869790211, date '2020-09-10', null, current_timestamp),

    (362387869900206, 362387869790209, 362387869900104, 'NATIONAL_ID', '330102195811084226', '330102195811084226',
     'OFFICIAL', 'ACTIVE', 362387869790211, date '1958-11-08', null, current_timestamp),

    (362387869900207, 362387869790209, 362387869900105, 'NATIONAL_ID', '330102198104125519', '330102198104125519',
     'OFFICIAL', 'ACTIVE', 362387869790211, date '1981-04-12', null, current_timestamp),

    (362387869900208, 362387869790209, 362387869900106, 'NATIONAL_ID', '350102199008182013', '350102199008182013',
     'OFFICIAL', 'ACTIVE', 362387869790211, date '1990-08-18', null, current_timestamp),

    (362387869900209, 362387869790209, 362387869900107, 'NATIONAL_ID', '33010220260301112X', '33010220260301112X',
     'OFFICIAL', 'ACTIVE', 362387869790211, date '2026-03-01', null, current_timestamp),

    (362387869900210, 362387869790209, 362387869900108, 'NATIONAL_ID', '330102194412253321', '330102194412253321',
     'OFFICIAL', 'ACTIVE', 362387869790211, date '1944-12-25', null, current_timestamp);

-- 3. Resident Demographic Profiles
insert into resident_demographic_profiles (
    resident_id, tenant_id, nationality_code, ethnicity_code, residency_type_code,
    marital_status_code, education_code, occupation_code, blood_type_code, rh_type_code,
    updated_at, updated_by
) values
    (362387869900101, 362387869790209, '156', '01', 'RESIDENT_LOCAL', 'MARRIED', 'HIGH_SCHOOL', 'RETIRED', 'A', 'POSITIVE', current_timestamp, 'seed-demo'),
    (362387869900102, 362387869790209, '156', '01', 'RESIDENT_LOCAL', 'UNMARRIED', 'COLLEGE', 'PROFESSIONAL', 'B', 'POSITIVE', current_timestamp, 'seed-demo'),
    (362387869900103, 362387869790209, '156', '01', 'RESIDENT_LOCAL', 'UNMARRIED', 'PRIMARY', 'STUDENT', 'O', 'POSITIVE', current_timestamp, 'seed-demo'),
    (362387869900104, 362387869790209, '156', '01', 'RESIDENT_LOCAL', 'MARRIED', 'HIGH_SCHOOL', 'RETIRED', 'AB', 'POSITIVE', current_timestamp, 'seed-demo'),
    (362387869900105, 362387869790209, '156', '01', 'RESIDENT_LOCAL', 'MARRIED', 'COLLEGE', 'PROFESSIONAL', 'A', 'POSITIVE', current_timestamp, 'seed-demo'),
    (362387869900106, 362387869790209, '156', '01', 'RESIDENT_MIGRANT', 'MARRIED', 'MASTER', 'PROFESSIONAL', 'O', 'POSITIVE', current_timestamp, 'seed-demo'),
    (362387869900107, 362387869790209, '156', '01', 'RESIDENT_LOCAL', 'UNMARRIED', null, null, 'B', 'POSITIVE', current_timestamp, 'seed-demo'),
    (362387869900108, 362387869790209, '156', '01', 'RESIDENT_LOCAL', 'WIDOWED', 'PRIMARY', 'RETIRED', 'O', 'POSITIVE', current_timestamp, 'seed-demo');

-- 4. Resident Coverages (Medical Insurance / Self Pay)
insert into resident_coverages (
    id, revision, tenant_id, resident_id, coverage_type_code, payer_name, member_no,
    primary_flag, valid_from, valid_to, status, created_at, created_by, updated_at, updated_by
) values
    (362387869900301, 0, 362387869790209, 362387869900101, 'EMPLOYEE_BASIC', '城镇职工基本医疗保险', 'YB33010001',
     true, date '2020-01-01', date '2035-12-31', 'ACTIVE', current_timestamp, 'seed-demo', current_timestamp, 'seed-demo'),
    (362387869900302, 0, 362387869790209, 362387869900102, 'EMPLOYEE_BASIC', '城镇职工基本医疗保险', 'YB33010002',
     true, date '2020-01-01', date '2035-12-31', 'ACTIVE', current_timestamp, 'seed-demo', current_timestamp, 'seed-demo'),
    (362387869900303, 0, 362387869790209, 362387869900103, 'RESIDENT_BASIC', '城乡居民基本医疗保险（少儿医保）', 'YB33010003',
     true, date '2020-01-01', date '2035-12-31', 'ACTIVE', current_timestamp, 'seed-demo', current_timestamp, 'seed-demo'),
    (362387869900304, 0, 362387869790209, 362387869900104, 'RESIDENT_BASIC', '城乡居民基本医疗保险', 'YB33010004',
     true, date '2020-01-01', date '2035-12-31', 'ACTIVE', current_timestamp, 'seed-demo', current_timestamp, 'seed-demo'),
    (362387869900305, 0, 362387869790209, 362387869900105, 'EMPLOYEE_BASIC', '城镇职工基本医疗保险', 'YB33010005',
     true, date '2020-01-01', date '2035-12-31', 'ACTIVE', current_timestamp, 'seed-demo', current_timestamp, 'seed-demo'),
    (362387869900306, 0, 362387869790209, 362387869900106, 'SELF_PAY', '自费（无本地医保）', null,
     true, date '2020-01-01', date '2035-12-31', 'ACTIVE', current_timestamp, 'seed-demo', current_timestamp, 'seed-demo'),
    (362387869900307, 0, 362387869790209, 362387869900107, 'RESIDENT_BASIC', '城乡居民基本医疗保险', 'YB33010007',
     true, date '2026-03-01', date '2035-12-31', 'ACTIVE', current_timestamp, 'seed-demo', current_timestamp, 'seed-demo'),
    (362387869900308, 0, 362387869790209, 362387869900108, 'RESIDENT_BASIC', '城乡居民基本医疗保险（特困救助）', 'YB33010008',
     true, date '2020-01-01', date '2035-12-31', 'ACTIVE', current_timestamp, 'seed-demo', current_timestamp, 'seed-demo');

-- 5. Resident Addresses
insert into resident_addresses (
    id, revision, tenant_id, resident_id, use_code, province_code, city_code, district_code,
    street_code, community_code, address_text, postal_code, primary_flag, valid_from, valid_to,
    status, created_at, created_by, updated_at, updated_by
) values
    (362387869900401, 0, 362387869790209, 362387869900101, 'HOME', '330000', '330100', '330102',
     '330102001', '330102001001', '浙江省杭州市上城区清波街道劳动路18号2单元301室', '310002', true, date '2020-01-01', null,
     'ACTIVE', current_timestamp, 'seed-demo', current_timestamp, 'seed-demo'),
    (362387869900402, 0, 362387869790209, 362387869900102, 'HOME', '330000', '330100', '330106',
     '330106002', '330106002003', '浙江省杭州市西湖区翠苑街道文一路88号5幢1202室', '310012', true, date '2020-01-01', null,
     'ACTIVE', current_timestamp, 'seed-demo', current_timestamp, 'seed-demo'),
    (362387869900403, 0, 362387869790209, 362387869900103, 'HOME', '330000', '330100', '330105',
     '330105003', '330105003001', '浙江省杭州市拱墅区小河街道莫干山路600号', '310011', true, date '2020-01-01', null,
     'ACTIVE', current_timestamp, 'seed-demo', current_timestamp, 'seed-demo'),
    (362387869900404, 0, 362387869790209, 362387869900104, 'HOME', '330000', '330100', '330102',
     '330102004', '330102004002', '浙江省杭州市上城区湖滨街道延安路102号', '310006', true, date '2020-01-01', null,
     'ACTIVE', current_timestamp, 'seed-demo', current_timestamp, 'seed-demo'),
    (362387869900405, 0, 362387869790209, 362387869900105, 'HOME', '330000', '330100', '330108',
     '330108001', '330108001005', '浙江省杭州市滨江区长河街道江南大道123号', '310051', true, date '2020-01-01', null,
     'ACTIVE', current_timestamp, 'seed-demo', current_timestamp, 'seed-demo'),
    (362387869900406, 0, 362387869790209, 362387869900106, 'HOME', '350000', '350100', '350102',
     '350102001', '350102001001', '福建省福州市鼓楼区东街口街道八一七北路1号', '350001', true, date '2020-01-01', null,
     'ACTIVE', current_timestamp, 'seed-demo', current_timestamp, 'seed-demo'),
    (362387869900407, 0, 362387869790209, 362387869900107, 'HOME', '330000', '330100', '330102',
     '330102005', '330102005003', '浙江省杭州市上城区南星街道复兴南街28号', '310008', true, date '2026-03-01', null,
     'ACTIVE', current_timestamp, 'seed-demo', current_timestamp, 'seed-demo'),
    (362387869900408, 0, 362387869790209, 362387869900108, 'HOME', '330000', '330100', '330102',
     '330102002', '330102002004', '浙江省杭州市上城区紫阳街道大井巷15号', '310002', true, date '2020-01-01', null,
     'ACTIVE', current_timestamp, 'seed-demo', current_timestamp, 'seed-demo');

-- 6. Resident Related Persons (Guardians & Emergency Contacts)
insert into resident_related_persons (
    id, revision, tenant_id, resident_id, full_name, relationship_code, phone,
    address_text, guardian_flag, emergency_contact_flag, valid_from, valid_to,
    status, created_at, created_by, updated_at, updated_by
) values
    (362387869900501, 0, 362387869790209, 362387869900103, '陈志强', 'FATHER', '13735518888',
     '浙江省杭州市拱墅区小河街道莫干山路600号', true, true, date '2020-01-01', null,
     'ACTIVE', current_timestamp, 'seed-demo', current_timestamp, 'seed-demo'),
    (362387869900502, 0, 362387869790209, 362387869900107, '刘婷', 'MOTHER', '13967112233',
     '浙江省杭州市上城区南星街道复兴南街28号', true, true, date '2026-03-01', null,
     'ACTIVE', current_timestamp, 'seed-demo', current_timestamp, 'seed-demo'),
    (362387869900503, 0, 362387869790209, 362387869900108, '李社区', 'OTHER', '13800000001',
     '浙江省杭州市上城区紫阳街道大井巷社区服务中心', false, true, date '2020-01-01', null,
     'ACTIVE', current_timestamp, 'seed-demo', current_timestamp, 'seed-demo');
