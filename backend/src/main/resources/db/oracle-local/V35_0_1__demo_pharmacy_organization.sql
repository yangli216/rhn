insert all
into departments (id, tenant_id, organization_id, parent_id, merged_to_id, code, name, short_name, description,
    department_type, department_property, virtual, sort_order, status, valid_from, valid_to,
    created_at, created_by, updated_at, updated_by, revision)
values (362387869799101, 362387869790209, 362387869790211, null, null, 'PHARMACY_DEPT', '药学部', '药学部',
    '医疗机构药学专业的统一管理科室', 'MED_PHARMACY', 'MEDICAL_TECHNOLOGY', 0, 200, 'ACTIVE',
    date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0)
into departments (id, tenant_id, organization_id, parent_id, merged_to_id, code, name, short_name, description,
    department_type, department_property, virtual, sort_order, status, valid_from, valid_to,
    created_at, created_by, updated_at, updated_by, revision)
values (362387869799102, 362387869790209, 362387869790211, 362387869799101, null, 'DRUG_WAREHOUSE', '中心药库', '药库',
    '承担药品验收、储存、养护和配送', 'MED_PHARMACY_WAREHOUSE', 'MEDICAL_TECHNOLOGY', 0, 210, 'ACTIVE',
    date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0)
into departments (id, tenant_id, organization_id, parent_id, merged_to_id, code, name, short_name, description,
    department_type, department_property, virtual, sort_order, status, valid_from, valid_to,
    created_at, created_by, updated_at, updated_by, revision)
values (362387869799103, 362387869790209, 362387869790211, 362387869799101, null, 'OUTPATIENT_PHARMACY', '门诊药房', '门诊药房',
    '承担门诊处方审核、调剂和发药', 'MED_PHARMACY_OUTPATIENT', 'MEDICAL_TECHNOLOGY', 0, 220, 'ACTIVE',
    date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0)
into departments (id, tenant_id, organization_id, parent_id, merged_to_id, code, name, short_name, description,
    department_type, department_property, virtual, sort_order, status, valid_from, valid_to,
    created_at, created_by, updated_at, updated_by, revision)
values (362387869799104, 362387869790209, 362387869790211, 362387869799101, null, 'INPATIENT_PHARMACY', '住院药房', '住院药房',
    '承担住院医嘱审核、摆药和发药', 'MED_PHARMACY_INPATIENT', 'MEDICAL_TECHNOLOGY', 0, 230, 'ACTIVE',
    date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0)
into departments (id, tenant_id, organization_id, parent_id, merged_to_id, code, name, short_name, description,
    department_type, department_property, virtual, sort_order, status, valid_from, valid_to,
    created_at, created_by, updated_at, updated_by, revision)
values (362387869799105, 362387869790209, 362387869790211, 362387869799101, null, 'TCM_PHARMACY', '中药房', '中药房',
    '承担中药饮片审方、调剂和发药', 'MED_PHARMACY_TCM', 'MEDICAL_TECHNOLOGY', 0, 240, 'ACTIVE',
    date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0)
select 1 from dual;

insert all
into department_capabilities (id, tenant_id, department_id, capability_type, qualification_basis_code,
    capability_scope, valid_from, valid_to, verify_status, status)
values (362387869799111, 362387869790209, 362387869799101, 'PHARMACY', null, '药事管理与药学服务', date '2026-01-01', null, 'VERIFIED', 'ACTIVE')
into department_capabilities (id, tenant_id, department_id, capability_type, qualification_basis_code,
    capability_scope, valid_from, valid_to, verify_status, status)
values (362387869799112, 362387869790209, 362387869799102, 'PHARMACY', null, '药品验收、储存、养护与配送', date '2026-01-01', null, 'VERIFIED', 'ACTIVE')
into department_capabilities (id, tenant_id, department_id, capability_type, qualification_basis_code,
    capability_scope, valid_from, valid_to, verify_status, status)
values (362387869799113, 362387869790209, 362387869799103, 'PHARMACY', null, '门诊处方审核、调剂与发药', date '2026-01-01', null, 'VERIFIED', 'ACTIVE')
into department_capabilities (id, tenant_id, department_id, capability_type, qualification_basis_code,
    capability_scope, valid_from, valid_to, verify_status, status)
values (362387869799114, 362387869790209, 362387869799104, 'PHARMACY', null, '住院医嘱审核、摆药与发药', date '2026-01-01', null, 'VERIFIED', 'ACTIVE')
into department_capabilities (id, tenant_id, department_id, capability_type, qualification_basis_code,
    capability_scope, valid_from, valid_to, verify_status, status)
values (362387869799115, 362387869790209, 362387869799105, 'PHARMACY', null, '中药饮片审方、调剂与发药', date '2026-01-01', null, 'VERIFIED', 'ACTIVE')
select 1 from dual;

insert all
into positions (id, tenant_id, code, name, position_type, duty_description, status,
    created_at, created_by, updated_at, updated_by, revision)
values (362387869799201, 362387869790209, 'PHARMACY_DIRECTOR', '药学部主任', 'PHARMACY', '负责药事管理和药学服务质量', 'ACTIVE',
    current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0)
into positions (id, tenant_id, code, name, position_type, duty_description, status,
    created_at, created_by, updated_at, updated_by, revision)
values (362387869799202, 362387869790209, 'PHARMACIST', '药师', 'PHARMACY', '承担审方、调剂、发药和用药指导', 'ACTIVE',
    current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0)
into positions (id, tenant_id, code, name, position_type, duty_description, status,
    created_at, created_by, updated_at, updated_by, revision)
values (362387869799203, 362387869790209, 'PHARMACY_STOREKEEPER', '药库管理药师', 'PHARMACY', '承担药品验收、库存与配送管理', 'ACTIVE',
    current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0)
select 1 from dual;

insert into practitioners (id, tenant_id, code, full_name, gender, identity_hash, status,
    created_at, created_by, updated_at, updated_by, revision)
values (362387869799301, 362387869790209, 'P-DEMO-PHARMACIST', '示范药师', null, null, 'ACTIVE',
    current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);

insert into employments (id, tenant_id, practitioner_id, organization_id, code, employment_type,
    primary_employment, hire_date, leave_date, status, created_at, created_by, updated_at, updated_by, revision)
values (362387869799302, 362387869790209, 362387869799301, 362387869790211, 'EMP-DEMO-PHARMACIST',
    'PERMANENT', 1, date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 0);

insert all
into staff_assignments (id, tenant_id, employment_id, organization_id, department_id, position_id, code,
    assignment_type, specialty_code, primary_assignment, workload_percent, status,
    valid_from, valid_to, created_at, created_by, updated_at, updated_by, revision)
values (362387869799303, 362387869790209, 362387869799302, 362387869790211, 362387869799103,
    362387869799202, 'ASN-DEMO-OUTPATIENT-PHARM', 'PRIMARY', null, 1, 80, 'ACTIVE', date '2026-01-01', null,
    current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0)
into staff_assignments (id, tenant_id, employment_id, organization_id, department_id, position_id, code,
    assignment_type, specialty_code, primary_assignment, workload_percent, status,
    valid_from, valid_to, created_at, created_by, updated_at, updated_by, revision)
values (362387869799304, 362387869790209, 362387869799302, 362387869790211, 362387869799102,
    362387869799203, 'ASN-DEMO-DRUG-WAREHOUSE', 'PART_TIME', null, 0, 20, 'ACTIVE', date '2026-01-01', null,
    current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0)
select 1 from dual;

insert all
into user_role_assignments (id, tenant_id, user_id, role_id, organization_id, department_id, data_scope_type,
    valid_from, valid_to, granted_by, created_at)
values (362387869799401, 362387869790209, 362387869790222, 362387869796001, 362387869790211, 362387869799101, 'DEPARTMENT', current_timestamp, null, 362387869790222, current_timestamp)
into user_role_assignments (id, tenant_id, user_id, role_id, organization_id, department_id, data_scope_type,
    valid_from, valid_to, granted_by, created_at)
values (362387869799402, 362387869790209, 362387869790222, 362387869796001, 362387869790211, 362387869799102, 'DEPARTMENT', current_timestamp, null, 362387869790222, current_timestamp)
into user_role_assignments (id, tenant_id, user_id, role_id, organization_id, department_id, data_scope_type,
    valid_from, valid_to, granted_by, created_at)
values (362387869799403, 362387869790209, 362387869790222, 362387869796001, 362387869790211, 362387869799103, 'DEPARTMENT', current_timestamp, null, 362387869790222, current_timestamp)
into user_role_assignments (id, tenant_id, user_id, role_id, organization_id, department_id, data_scope_type,
    valid_from, valid_to, granted_by, created_at)
values (362387869799404, 362387869790209, 362387869790222, 362387869796001, 362387869790211, 362387869799104, 'DEPARTMENT', current_timestamp, null, 362387869790222, current_timestamp)
into user_role_assignments (id, tenant_id, user_id, role_id, organization_id, department_id, data_scope_type,
    valid_from, valid_to, granted_by, created_at)
values (362387869799405, 362387869790209, 362387869790222, 362387869796001, 362387869790211, 362387869799105, 'DEPARTMENT', current_timestamp, null, 362387869790222, current_timestamp)
select 1 from dual;

insert all
into stock_sites (id, revision, tenant_id, organization_id, department_id, code, name, site_type, service_scope,
    active, valid_from, valid_to, created_at, created_by, updated_at, updated_by)
values (362387869799501, 0, 362387869790209, 362387869790211, 362387869799102, 'CENTRAL-WH', '中心药库', 'WAREHOUSE', 'MIXED', 1, date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222)
into stock_sites (id, revision, tenant_id, organization_id, department_id, code, name, site_type, service_scope,
    active, valid_from, valid_to, created_at, created_by, updated_at, updated_by)
values (362387869799502, 0, 362387869790209, 362387869790211, 362387869799103, 'OP-PHARM', '门诊药房', 'PHARMACY', 'OUTPATIENT', 1, date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222)
into stock_sites (id, revision, tenant_id, organization_id, department_id, code, name, site_type, service_scope,
    active, valid_from, valid_to, created_at, created_by, updated_at, updated_by)
values (362387869799503, 0, 362387869790209, 362387869790211, 362387869799104, 'IP-PHARM', '住院药房', 'PHARMACY', 'INPATIENT', 1, date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222)
into stock_sites (id, revision, tenant_id, organization_id, department_id, code, name, site_type, service_scope,
    active, valid_from, valid_to, created_at, created_by, updated_at, updated_by)
values (362387869799504, 0, 362387869790209, 362387869790211, 362387869799105, 'TCM-PHARM', '中药房', 'PHARMACY', 'MIXED', 1, date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222)
select 1 from dual;
