-- Rich and representative outpatient schedule dataset for oracle-local profile.

-- 1. Departments
insert into departments (
    id, tenant_id, organization_id, parent_id, merged_to_id, code, name, short_name, description,
    department_type, department_property, virtual, sort_order, status, valid_from, valid_to,
    created_at, created_by, updated_at, updated_by, revision
) values
    (362387869899004, 362387869790209, 362387869790211, null, null,
     'PEDIATRICS', '儿科门诊', '儿科', '承担儿童常见病、呼吸道感染与健康随访',
     'CLIN_PEDIATRICS', 'CLINICAL', 0, 30, 'ACTIVE', date '2026-01-01', null,
     current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);

insert into departments (
    id, tenant_id, organization_id, parent_id, merged_to_id, code, name, short_name, description,
    department_type, department_property, virtual, sort_order, status, valid_from, valid_to,
    created_at, created_by, updated_at, updated_by, revision
) values
    (362387869899005, 362387869790209, 362387869790211, null, null,
     'SURGERY', '外科门诊', '外科', '承担普外科、浅表肿物、小创伤急救处理',
     'CLIN_GENERAL_SURGERY', 'CLINICAL', 0, 40, 'ACTIVE', date '2026-01-01', null,
     current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);

insert into departments (
    id, tenant_id, organization_id, parent_id, merged_to_id, code, name, short_name, description,
    department_type, department_property, virtual, sort_order, status, valid_from, valid_to,
    created_at, created_by, updated_at, updated_by, revision
) values
    (362387869899006, 362387869790209, 362387869790211, null, null,
     'TCM', '中医科', '中医科', '名中医传承、辩证论治、针灸推拿特色诊疗',
     'CLIN_TCM', 'CLINICAL', 0, 50, 'ACTIVE', date '2026-01-01', null,
     current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);

insert into departments (
    id, tenant_id, organization_id, parent_id, merged_to_id, code, name, short_name, description,
    department_type, department_property, virtual, sort_order, status, valid_from, valid_to,
    created_at, created_by, updated_at, updated_by, revision
) values
    (362387869899007, 362387869790209, 362387869790211, null, null,
     'OBGYN', '妇产科门诊', '妇科', '妇科常见病诊疗及育龄妇女健康管理',
     'CLIN_OBSTETRICS_GYNECOLOGY', 'CLINICAL', 0, 60, 'ACTIVE', date '2026-01-01', null,
     current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);

-- 2. Practitioners
insert into practitioners (id, tenant_id, code, full_name, gender, identity_hash, status, created_at, created_by, updated_at, updated_by, revision)
values (362387869899011, 362387869790209, 'P-DEMO-WANG', '王建国', 'MALE', 'hash-wang-jg', 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);
insert into practitioners (id, tenant_id, code, full_name, gender, identity_hash, status, created_at, created_by, updated_at, updated_by, revision)
values (362387869899012, 362387869790209, 'P-DEMO-CHEN-XY', '陈秀英', 'FEMALE', 'hash-chen-xy', 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);
insert into practitioners (id, tenant_id, code, full_name, gender, identity_hash, status, created_at, created_by, updated_at, updated_by, revision)
values (362387869899013, 362387869790209, 'P-DEMO-ZHANG-M', '张敏', 'FEMALE', 'hash-zhang-m', 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);
insert into practitioners (id, tenant_id, code, full_name, gender, identity_hash, status, created_at, created_by, updated_at, updated_by, revision)
values (362387869899014, 362387869790209, 'P-DEMO-LIU-HP', '刘海平', 'MALE', 'hash-liu-hp', 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);
insert into practitioners (id, tenant_id, code, full_name, gender, identity_hash, status, created_at, created_by, updated_at, updated_by, revision)
values (362387869899015, 362387869790209, 'P-DEMO-CHEN-GH', '陈国华', 'MALE', 'hash-chen-gh', 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);
insert into practitioners (id, tenant_id, code, full_name, gender, identity_hash, status, created_at, created_by, updated_at, updated_by, revision)
values (362387869899016, 362387869790209, 'P-DEMO-ZHAO-XM', '赵雪梅', 'FEMALE', 'hash-zhao-xm', 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);

-- 3. Positions
insert into positions (id, tenant_id, code, name, position_type, duty_description, status, created_at, created_by, updated_at, updated_by, revision)
values (362387869899021, 362387869790209, 'CHIEF_PHYSICIAN_IM', '内科主任医师', 'CLINICAL', '心血管与疑难慢性病专家门诊', 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);
insert into positions (id, tenant_id, code, name, position_type, duty_description, status, created_at, created_by, updated_at, updated_by, revision)
values (362387869899022, 362387869790209, 'ATTENDING_PED', '儿科主治医师', 'CLINICAL', '儿科门诊及儿童保健随访', 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);
insert into positions (id, tenant_id, code, name, position_type, duty_description, status, created_at, created_by, updated_at, updated_by, revision)
values (362387869899023, 362387869790209, 'ASSOCIATE_SURGEON', '外科副主任医师', 'CLINICAL', '普外科与外伤处理门诊', 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);
insert into positions (id, tenant_id, code, name, position_type, duty_description, status, created_at, created_by, updated_at, updated_by, revision)
values (362387869899024, 362387869790209, 'CHIEF_TCM', '中医主任医师', 'CLINICAL', '中医科专家门诊与针灸特色治疗', 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);
insert into positions (id, tenant_id, code, name, position_type, duty_description, status, created_at, created_by, updated_at, updated_by, revision)
values (362387869899025, 362387869790209, 'ATTENDING_GYN', '妇科主治医师', 'CLINICAL', '妇科常见病与围产期保健', 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);

-- 4. Employments
insert into employments (id, tenant_id, practitioner_id, organization_id, code, employment_type, primary_employment, hire_date, leave_date, status, created_at, created_by, updated_at, updated_by, revision)
values (362387869899031, 362387869790209, 362387869899011, 362387869790211, 'EMP-DEMO-WANG', 'PERMANENT', 1, date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);
insert into employments (id, tenant_id, practitioner_id, organization_id, code, employment_type, primary_employment, hire_date, leave_date, status, created_at, created_by, updated_at, updated_by, revision)
values (362387869899032, 362387869790209, 362387869899012, 362387869790211, 'EMP-DEMO-CHEN-XY', 'PERMANENT', 1, date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);
insert into employments (id, tenant_id, practitioner_id, organization_id, code, employment_type, primary_employment, hire_date, leave_date, status, created_at, created_by, updated_at, updated_by, revision)
values (362387869899033, 362387869790209, 362387869899013, 362387869790211, 'EMP-DEMO-ZHANG-M', 'PERMANENT', 1, date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);
insert into employments (id, tenant_id, practitioner_id, organization_id, code, employment_type, primary_employment, hire_date, leave_date, status, created_at, created_by, updated_at, updated_by, revision)
values (362387869899034, 362387869790209, 362387869899014, 362387869790211, 'EMP-DEMO-LIU-HP', 'PERMANENT', 1, date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);
insert into employments (id, tenant_id, practitioner_id, organization_id, code, employment_type, primary_employment, hire_date, leave_date, status, created_at, created_by, updated_at, updated_by, revision)
values (362387869899035, 362387869790209, 362387869899015, 362387869790211, 'EMP-DEMO-CHEN-GH', 'PERMANENT', 1, date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);
insert into employments (id, tenant_id, practitioner_id, organization_id, code, employment_type, primary_employment, hire_date, leave_date, status, created_at, created_by, updated_at, updated_by, revision)
values (362387869899036, 362387869790209, 362387869899016, 362387869790211, 'EMP-DEMO-ZHAO-XM', 'PERMANENT', 1, date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);

-- 5. Staff Assignments
insert into staff_assignments (id, tenant_id, employment_id, organization_id, department_id, position_id, code, assignment_type, specialty_code, primary_assignment, workload_percent, status, valid_from, valid_to, created_at, created_by, updated_at, updated_by, revision)
values (362387869899041, 362387869790209, 362387869899031, 362387869790211, 362387869899001, 362387869899021, 'ASN-DEMO-WANG', 'PRIMARY', 'INTERNAL_MEDICINE', 1, 100, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);
insert into staff_assignments (id, tenant_id, employment_id, organization_id, department_id, position_id, code, assignment_type, specialty_code, primary_assignment, workload_percent, status, valid_from, valid_to, created_at, created_by, updated_at, updated_by, revision)
values (362387869899042, 362387869790209, 362387869899032, 362387869790211, 362387869899001, 362387869899021, 'ASN-DEMO-CHEN-XY', 'PRIMARY', 'INTERNAL_MEDICINE', 1, 100, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);
insert into staff_assignments (id, tenant_id, employment_id, organization_id, department_id, position_id, code, assignment_type, specialty_code, primary_assignment, workload_percent, status, valid_from, valid_to, created_at, created_by, updated_at, updated_by, revision)
values (362387869899043, 362387869790209, 362387869899033, 362387869790211, 362387869899004, 362387869899022, 'ASN-DEMO-ZHANG-M', 'PRIMARY', 'PEDIATRICS', 1, 100, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);
insert into staff_assignments (id, tenant_id, employment_id, organization_id, department_id, position_id, code, assignment_type, specialty_code, primary_assignment, workload_percent, status, valid_from, valid_to, created_at, created_by, updated_at, updated_by, revision)
values (362387869899044, 362387869790209, 362387869899034, 362387869790211, 362387869899005, 362387869899023, 'ASN-DEMO-LIU-HP', 'PRIMARY', 'SURGERY', 1, 100, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);
insert into staff_assignments (id, tenant_id, employment_id, organization_id, department_id, position_id, code, assignment_type, specialty_code, primary_assignment, workload_percent, status, valid_from, valid_to, created_at, created_by, updated_at, updated_by, revision)
values (362387869899045, 362387869790209, 362387869899035, 362387869790211, 362387869899006, 362387869899024, 'ASN-DEMO-CHEN-GH', 'PRIMARY', 'TCM', 1, 100, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);
insert into staff_assignments (id, tenant_id, employment_id, organization_id, department_id, position_id, code, assignment_type, specialty_code, primary_assignment, workload_percent, status, valid_from, valid_to, created_at, created_by, updated_at, updated_by, revision)
values (362387869899046, 362387869790209, 362387869899036, 362387869790211, 362387869899007, 362387869899025, 'ASN-DEMO-ZHAO-XM', 'PRIMARY', 'OBGYN', 1, 100, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0);

-- 6. Catalog Items & Service Items
insert into catalog_items (id, revision, tenant_id, code, name, item_type, unit_code, orderable, chargeable, stocked, status, valid_from, valid_to, created_at, created_by, updated_at, updated_by, item_type_id, item_master_id)
values (362387869899051, 0, 362387869790209, 'SRV-OPD-IM-EXP', '内科专家门诊诊查', 'SERVICE', '次', 1, 1, 0, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222, 362387869797005, null);
insert into catalog_items (id, revision, tenant_id, code, name, item_type, unit_code, orderable, chargeable, stocked, status, valid_from, valid_to, created_at, created_by, updated_at, updated_by, item_type_id, item_master_id)
values (362387869899052, 0, 362387869790209, 'SRV-OPD-IM', '内科门诊诊查', 'SERVICE', '次', 1, 1, 0, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222, 362387869797005, null);
insert into catalog_items (id, revision, tenant_id, code, name, item_type, unit_code, orderable, chargeable, stocked, status, valid_from, valid_to, created_at, created_by, updated_at, updated_by, item_type_id, item_master_id)
values (362387869899053, 0, 362387869790209, 'SRV-OPD-PED', '儿科门诊诊查', 'SERVICE', '次', 1, 1, 0, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222, 362387869797005, null);
insert into catalog_items (id, revision, tenant_id, code, name, item_type, unit_code, orderable, chargeable, stocked, status, valid_from, valid_to, created_at, created_by, updated_at, updated_by, item_type_id, item_master_id)
values (362387869899054, 0, 362387869790209, 'SRV-OPD-SUR', '外科门诊诊查', 'SERVICE', '次', 1, 1, 0, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222, 362387869797005, null);
insert into catalog_items (id, revision, tenant_id, code, name, item_type, unit_code, orderable, chargeable, stocked, status, valid_from, valid_to, created_at, created_by, updated_at, updated_by, item_type_id, item_master_id)
values (362387869899055, 0, 362387869790209, 'SRV-OPD-TCM-EXP', '中医名医门诊诊查', 'SERVICE', '次', 1, 1, 0, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222, 362387869797005, null);
insert into catalog_items (id, revision, tenant_id, code, name, item_type, unit_code, orderable, chargeable, stocked, status, valid_from, valid_to, created_at, created_by, updated_at, updated_by, item_type_id, item_master_id)
values (362387869899056, 0, 362387869790209, 'SRV-OPD-GYN', '妇科门诊诊查', 'SERVICE', '次', 1, 1, 0, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222, 362387869797005, null);

insert into service_items (catalog_item_id, tenant_id, service_type, service_subtype, usage_type, medical_technology, combination_item, single_order, specimen_type, examination_type, accounting_category, pregnancy_alert, attention, examination_notes)
values (362387869899051, 362387869790209, 'PROCEDURE', 'OUTPATIENT_VISIT', 'OUTPATIENT', 0, 0, 1, null, null, 'REGISTRATION', 0, '内科心血管专家挂号', null);
insert into service_items (catalog_item_id, tenant_id, service_type, service_subtype, usage_type, medical_technology, combination_item, single_order, specimen_type, examination_type, accounting_category, pregnancy_alert, attention, examination_notes)
values (362387869899052, 362387869790209, 'PROCEDURE', 'OUTPATIENT_VISIT', 'OUTPATIENT', 0, 0, 1, null, null, 'REGISTRATION', 0, '内科普通门诊挂号', null);
insert into service_items (catalog_item_id, tenant_id, service_type, service_subtype, usage_type, medical_technology, combination_item, single_order, specimen_type, examination_type, accounting_category, pregnancy_alert, attention, examination_notes)
values (362387869899053, 362387869790209, 'PROCEDURE', 'OUTPATIENT_VISIT', 'OUTPATIENT', 0, 0, 1, null, null, 'REGISTRATION', 0, '儿科门诊挂号', null);
insert into service_items (catalog_item_id, tenant_id, service_type, service_subtype, usage_type, medical_technology, combination_item, single_order, specimen_type, examination_type, accounting_category, pregnancy_alert, attention, examination_notes)
values (362387869899054, 362387869790209, 'PROCEDURE', 'OUTPATIENT_VISIT', 'OUTPATIENT', 0, 0, 1, null, null, 'REGISTRATION', 0, '外科门诊挂号', null);
insert into service_items (catalog_item_id, tenant_id, service_type, service_subtype, usage_type, medical_technology, combination_item, single_order, specimen_type, examination_type, accounting_category, pregnancy_alert, attention, examination_notes)
values (362387869899055, 362387869790209, 'PROCEDURE', 'OUTPATIENT_VISIT', 'OUTPATIENT', 0, 0, 1, null, null, 'REGISTRATION', 0, '名老中医专家门诊挂号', null);
insert into service_items (catalog_item_id, tenant_id, service_type, service_subtype, usage_type, medical_technology, combination_item, single_order, specimen_type, examination_type, accounting_category, pregnancy_alert, attention, examination_notes)
values (362387869899056, 362387869790209, 'PROCEDURE', 'OUTPATIENT_VISIT', 'OUTPATIENT', 0, 0, 1, null, null, 'REGISTRATION', 0, '妇产科门诊挂号', null);

-- 7. Organization Catalog Items
insert into organization_catalog_items (id, revision, tenant_id, organization_id, catalog_item_id, default_department_id, local_code, local_name, orderable, executable, chargeable, purchasable, stocked, dispensable, returnable, status, valid_from, valid_to, created_at, created_by, updated_at, updated_by)
values (362387869899061, 0, 362387869790209, 362387869790211, 362387869899051, 362387869899001, 'OPD-IM-EXP', '内科专家门诊', 1, 1, 1, 0, 0, 0, 0, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222);
insert into organization_catalog_items (id, revision, tenant_id, organization_id, catalog_item_id, default_department_id, local_code, local_name, orderable, executable, chargeable, purchasable, stocked, dispensable, returnable, status, valid_from, valid_to, created_at, created_by, updated_at, updated_by)
values (362387869899062, 0, 362387869790209, 362387869790211, 362387869899052, 362387869899001, 'OPD-IM', '内科普通门诊', 1, 1, 1, 0, 0, 0, 0, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222);
insert into organization_catalog_items (id, revision, tenant_id, organization_id, catalog_item_id, default_department_id, local_code, local_name, orderable, executable, chargeable, purchasable, stocked, dispensable, returnable, status, valid_from, valid_to, created_at, created_by, updated_at, updated_by)
values (362387869899063, 0, 362387869790209, 362387869790211, 362387869899053, 362387869899004, 'OPD-PED', '儿科门诊', 1, 1, 1, 0, 0, 0, 0, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222);
insert into organization_catalog_items (id, revision, tenant_id, organization_id, catalog_item_id, default_department_id, local_code, local_name, orderable, executable, chargeable, purchasable, stocked, dispensable, returnable, status, valid_from, valid_to, created_at, created_by, updated_at, updated_by)
values (362387869899064, 0, 362387869790209, 362387869790211, 362387869899054, 362387869899005, 'OPD-SUR', '外科门诊', 1, 1, 1, 0, 0, 0, 0, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222);
insert into organization_catalog_items (id, revision, tenant_id, organization_id, catalog_item_id, default_department_id, local_code, local_name, orderable, executable, chargeable, purchasable, stocked, dispensable, returnable, status, valid_from, valid_to, created_at, created_by, updated_at, updated_by)
values (362387869899065, 0, 362387869790209, 362387869790211, 362387869899055, 362387869899006, 'OPD-TCM-EXP', '中医名医门诊', 1, 1, 1, 0, 0, 0, 0, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222);
insert into organization_catalog_items (id, revision, tenant_id, organization_id, catalog_item_id, default_department_id, local_code, local_name, orderable, executable, chargeable, purchasable, stocked, dispensable, returnable, status, valid_from, valid_to, created_at, created_by, updated_at, updated_by)
values (362387869899066, 0, 362387869790209, 362387869790211, 362387869899056, 362387869899007, 'OPD-GYN', '妇产科门诊', 1, 1, 1, 0, 0, 0, 0, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222);

-- 8. Catalog Prices
insert into catalog_prices (id, revision, tenant_id, catalog_item_id, organization_id, package_id, price_type, price, currency_code, price_document_code, price_reason, valid_from, valid_to, status, created_at, created_by, updated_at, updated_by)
values (362387869899071, 0, 362387869790209, 362387869899051, 362387869790211, null, 'SALE', 25.00, 'CNY', 'DEMO-PRICE-IM-EXP', '内科专家门诊诊查费', date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222);
insert into catalog_prices (id, revision, tenant_id, catalog_item_id, organization_id, package_id, price_type, price, currency_code, price_document_code, price_reason, valid_from, valid_to, status, created_at, created_by, updated_at, updated_by)
values (362387869899072, 0, 362387869790209, 362387869899052, 362387869790211, null, 'SALE', 15.00, 'CNY', 'DEMO-PRICE-IM', '内科普通门诊诊查费', date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222);
insert into catalog_prices (id, revision, tenant_id, catalog_item_id, organization_id, package_id, price_type, price, currency_code, price_document_code, price_reason, valid_from, valid_to, status, created_at, created_by, updated_at, updated_by)
values (362387869899073, 0, 362387869790209, 362387869899053, 362387869790211, null, 'SALE', 15.00, 'CNY', 'DEMO-PRICE-PED', '儿科门诊诊查费', date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222);
insert into catalog_prices (id, revision, tenant_id, catalog_item_id, organization_id, package_id, price_type, price, currency_code, price_document_code, price_reason, valid_from, valid_to, status, created_at, created_by, updated_at, updated_by)
values (362387869899074, 0, 362387869790209, 362387869899054, 362387869790211, null, 'SALE', 15.00, 'CNY', 'DEMO-PRICE-SUR', '外科门诊诊查费', date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222);
insert into catalog_prices (id, revision, tenant_id, catalog_item_id, organization_id, package_id, price_type, price, currency_code, price_document_code, price_reason, valid_from, valid_to, status, created_at, created_by, updated_at, updated_by)
values (362387869899075, 0, 362387869790209, 362387869899055, 362387869790211, null, 'SALE', 30.00, 'CNY', 'DEMO-PRICE-TCM-EXP', '中医名医专家门诊诊查费', date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222);
insert into catalog_prices (id, revision, tenant_id, catalog_item_id, organization_id, package_id, price_type, price, currency_code, price_document_code, price_reason, valid_from, valid_to, status, created_at, created_by, updated_at, updated_by)
values (362387869899076, 0, 362387869790209, 362387869899056, 362387869790211, null, 'SALE', 15.00, 'CNY', 'DEMO-PRICE-GYN', '妇科门诊诊查费', date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222);

-- 9. Service Resources
-- 全科资源及当日班次由既有业务数据维护；Oracle 持久库可能已经存在，避免演示迁移覆盖或重复创建。
insert into service_resources (id, revision, tenant_id, organization_id, department_id, practitioner_id, assignment_id, catalog_item_id, resource_code, resource_name, service_code_snapshot, service_name_snapshot, status, created_at, created_by, updated_at, updated_by)
values (362387869899082, 0, 362387869790209, 362387869790211, 362387869899001, 362387869899011, 362387869899041, 362387869899051, 'RES-IM-WANG', '王建国-内科专家门诊', 'SRV-OPD-IM-EXP', '内科门诊（心血管）', 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222);
insert into service_resources (id, revision, tenant_id, organization_id, department_id, practitioner_id, assignment_id, catalog_item_id, resource_code, resource_name, service_code_snapshot, service_name_snapshot, status, created_at, created_by, updated_at, updated_by)
values (362387869899083, 0, 362387869790209, 362387869790211, 362387869899001, 362387869899012, 362387869899042, 362387869899052, 'RES-IM-CHEN', '陈秀英-内科普通门诊', 'SRV-OPD-IM', '内科门诊（慢病）', 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222);
insert into service_resources (id, revision, tenant_id, organization_id, department_id, practitioner_id, assignment_id, catalog_item_id, resource_code, resource_name, service_code_snapshot, service_name_snapshot, status, created_at, created_by, updated_at, updated_by)
values (362387869899084, 0, 362387869790209, 362387869790211, 362387869899004, 362387869899013, 362387869899043, 362387869899053, 'RES-PED-ZHANG', '张敏-儿科门诊', 'SRV-OPD-PED', '儿科门诊', 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222);
insert into service_resources (id, revision, tenant_id, organization_id, department_id, practitioner_id, assignment_id, catalog_item_id, resource_code, resource_name, service_code_snapshot, service_name_snapshot, status, created_at, created_by, updated_at, updated_by)
values (362387869899085, 0, 362387869790209, 362387869790211, 362387869899005, 362387869899014, 362387869899044, 362387869899054, 'RES-SUR-LIU', '刘海平-外科门诊', 'SRV-OPD-SUR', '外科门诊', 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222);
insert into service_resources (id, revision, tenant_id, organization_id, department_id, practitioner_id, assignment_id, catalog_item_id, resource_code, resource_name, service_code_snapshot, service_name_snapshot, status, created_at, created_by, updated_at, updated_by)
values (362387869899086, 0, 362387869790209, 362387869790211, 362387869899006, 362387869899015, 362387869899045, 362387869899055, 'RES-TCM-CHEN', '陈国华-中医名医门诊', 'SRV-OPD-TCM-EXP', '中医科（针灸推拿）', 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222);
insert into service_resources (id, revision, tenant_id, organization_id, department_id, practitioner_id, assignment_id, catalog_item_id, resource_code, resource_name, service_code_snapshot, service_name_snapshot, status, created_at, created_by, updated_at, updated_by)
values (362387869899087, 0, 362387869790209, 362387869790211, 362387869899007, 362387869899016, 362387869899046, 362387869899056, 'RES-GYN-ZHAO', '赵雪梅-妇科门诊', 'SRV-OPD-GYN', '妇产科门诊', 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222);

-- 10. Schedule Templates
insert into schedule_templates (id, revision, tenant_id, resource_id, template_code, template_name, management_mode, timezone_code, valid_from, valid_to, status, created_at, created_by, updated_at, updated_by)
values (362387869899092, 0, 362387869790209, 362387869899082, 'ST-DEMO-IM-EXP', '内科专家排班模版', 'SIMPLE', 'Asia/Shanghai', date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222);
insert into schedule_templates (id, revision, tenant_id, resource_id, template_code, template_name, management_mode, timezone_code, valid_from, valid_to, status, created_at, created_by, updated_at, updated_by)
values (362387869899093, 0, 362387869790209, 362387869899083, 'ST-DEMO-IM', '内科普通排班模版', 'SIMPLE', 'Asia/Shanghai', date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222);
insert into schedule_templates (id, revision, tenant_id, resource_id, template_code, template_name, management_mode, timezone_code, valid_from, valid_to, status, created_at, created_by, updated_at, updated_by)
values (362387869899094, 0, 362387869790209, 362387869899084, 'ST-DEMO-PED', '儿科常规排班模版', 'SIMPLE', 'Asia/Shanghai', date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222);
insert into schedule_templates (id, revision, tenant_id, resource_id, template_code, template_name, management_mode, timezone_code, valid_from, valid_to, status, created_at, created_by, updated_at, updated_by)
values (362387869899095, 0, 362387869790209, 362387869899085, 'ST-DEMO-SUR', '外科常规排班模版', 'SIMPLE', 'Asia/Shanghai', date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222);
insert into schedule_templates (id, revision, tenant_id, resource_id, template_code, template_name, management_mode, timezone_code, valid_from, valid_to, status, created_at, created_by, updated_at, updated_by)
values (362387869899096, 0, 362387869790209, 362387869899086, 'ST-DEMO-TCM', '中医名医排班模版', 'SIMPLE', 'Asia/Shanghai', date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222);
insert into schedule_templates (id, revision, tenant_id, resource_id, template_code, template_name, management_mode, timezone_code, valid_from, valid_to, status, created_at, created_by, updated_at, updated_by)
values (362387869899097, 0, 362387869790209, 362387869899087, 'ST-DEMO-GYN', '妇科常规排班模版', 'SIMPLE', 'Asia/Shanghai', date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222);

-- 11. Schedule Template Periods
insert into schedule_template_periods (id, tenant_id, template_id, day_of_week, day_part, minute_start, minute_end, default_capacity, slot_mode, active)
values (362387869899103, 362387869790209, 362387869899092, 2, 'MORNING', 510, 690, 20, 'POOL', 1);
insert into schedule_template_periods (id, tenant_id, template_id, day_of_week, day_part, minute_start, minute_end, default_capacity, slot_mode, active)
values (362387869899104, 362387869790209, 362387869899093, 2, 'AFTERNOON', 840, 1020, 20, 'POOL', 1);
insert into schedule_template_periods (id, tenant_id, template_id, day_of_week, day_part, minute_start, minute_end, default_capacity, slot_mode, active)
values (362387869899105, 362387869790209, 362387869899094, 2, 'MORNING', 510, 720, 25, 'POOL', 1);
insert into schedule_template_periods (id, tenant_id, template_id, day_of_week, day_part, minute_start, minute_end, default_capacity, slot_mode, active)
values (362387869899106, 362387869790209, 362387869899094, 2, 'AFTERNOON', 840, 1050, 25, 'POOL', 1);
insert into schedule_template_periods (id, tenant_id, template_id, day_of_week, day_part, minute_start, minute_end, default_capacity, slot_mode, active)
values (362387869899107, 362387869790209, 362387869899095, 2, 'MORNING', 480, 720, 20, 'POOL', 1);
insert into schedule_template_periods (id, tenant_id, template_id, day_of_week, day_part, minute_start, minute_end, default_capacity, slot_mode, active)
values (362387869899108, 362387869790209, 362387869899096, 2, 'MORNING', 480, 690, 15, 'POOL', 1);
insert into schedule_template_periods (id, tenant_id, template_id, day_of_week, day_part, minute_start, minute_end, default_capacity, slot_mode, active)
values (362387869899109, 362387869790209, 362387869899096, 2, 'AFTERNOON', 840, 1020, 15, 'POOL', 1);
insert into schedule_template_periods (id, tenant_id, template_id, day_of_week, day_part, minute_start, minute_end, default_capacity, slot_mode, active)
values (362387869899110, 362387869790209, 362387869899097, 2, 'AFTERNOON', 840, 1050, 20, 'POOL', 1);

-- 12. Schedule Generation Runs
insert into schedule_generation_runs (id, revision, tenant_id, template_id, idempotency_code, date_from, date_to, trigger_type, status, generated_count, skipped_count, request_json, started_at, completed_at, error_message, triggered_by)
values (362387869899121, 0, 362387869790209, 362387869899092, 'GEN-DEMO-2026-RICH-01', date '2026-09-01', date '2026-09-01', 'QUICK_CREATE', 'COMPLETED', 8, 0, '{"demo":true}', current_timestamp, current_timestamp, null, 362387869790222);

-- 13. Service Schedules
insert into service_schedules (id, revision, tenant_id, resource_id, template_id, template_period_id, generation_run_id, organization_id, department_id, practitioner_id, assignment_id, catalog_item_id, schedule_code, management_mode, schedule_type, booking_policy, day_part, practitioner_name_snapshot, service_code_snapshot, service_name_snapshot, location_name, timezone_code, service_date, start_at, end_at, total_capacity, status, created_at, created_by, updated_at, updated_by)
values (362387869899203, 0, 362387869790209, 362387869899082, 362387869899092, 362387869899103, 362387869899121, 362387869790211, 362387869899001, 362387869899011, 362387869899041, 362387869899051, 'SCH-20260901-IM-WANG', 'SIMPLE', 'OUTPATIENT', 'SHARED', 'MORNING', '王建国 (主任医师)', 'SRV-OPD-IM-EXP', '内科门诊（心血管专病）', '门诊楼2层 201专家诊室', 'Asia/Shanghai', date '2026-09-01', to_timestamp_tz('2026-09-01 08:30:00+08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), to_timestamp_tz('2026-09-01 11:30:00+08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 20, 'PUBLISHED', current_timestamp, 362387869790222, current_timestamp, 362387869790222);

insert into service_schedules (id, revision, tenant_id, resource_id, template_id, template_period_id, generation_run_id, organization_id, department_id, practitioner_id, assignment_id, catalog_item_id, schedule_code, management_mode, schedule_type, booking_policy, day_part, practitioner_name_snapshot, service_code_snapshot, service_name_snapshot, location_name, timezone_code, service_date, start_at, end_at, total_capacity, status, created_at, created_by, updated_at, updated_by)
values (362387869899204, 0, 362387869790209, 362387869899083, 362387869899093, 362387869899104, 362387869899121, 362387869790211, 362387869899001, 362387869899012, 362387869899042, 362387869899052, 'SCH-20260901-IM-CHEN', 'SIMPLE', 'OUTPATIENT', 'SHARED', 'AFTERNOON', '陈秀英 (副主任医师)', 'SRV-OPD-IM', '内科门诊（呼吸与慢病）', '门诊楼2层 202内科诊室', 'Asia/Shanghai', date '2026-09-01', to_timestamp_tz('2026-09-01 14:00:00+08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), to_timestamp_tz('2026-09-01 17:00:00+08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 20, 'PUBLISHED', current_timestamp, 362387869790222, current_timestamp, 362387869790222);

insert into service_schedules (id, revision, tenant_id, resource_id, template_id, template_period_id, generation_run_id, organization_id, department_id, practitioner_id, assignment_id, catalog_item_id, schedule_code, management_mode, schedule_type, booking_policy, day_part, practitioner_name_snapshot, service_code_snapshot, service_name_snapshot, location_name, timezone_code, service_date, start_at, end_at, total_capacity, status, created_at, created_by, updated_at, updated_by)
values (362387869899205, 0, 362387869790209, 362387869899084, 362387869899094, 362387869899105, 362387869899121, 362387869790211, 362387869899004, 362387869899013, 362387869899043, 362387869899053, 'SCH-20260901-PED-AM', 'SIMPLE', 'OUTPATIENT', 'SHARED', 'MORNING', '张敏 (主治医师)', 'SRV-OPD-PED', '儿科门诊', '门诊楼1层 105儿科诊室', 'Asia/Shanghai', date '2026-09-01', to_timestamp_tz('2026-09-01 08:30:00+08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), to_timestamp_tz('2026-09-01 12:00:00+08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 25, 'PUBLISHED', current_timestamp, 362387869790222, current_timestamp, 362387869790222);

insert into service_schedules (id, revision, tenant_id, resource_id, template_id, template_period_id, generation_run_id, organization_id, department_id, practitioner_id, assignment_id, catalog_item_id, schedule_code, management_mode, schedule_type, booking_policy, day_part, practitioner_name_snapshot, service_code_snapshot, service_name_snapshot, location_name, timezone_code, service_date, start_at, end_at, total_capacity, status, created_at, created_by, updated_at, updated_by)
values (362387869899206, 0, 362387869790209, 362387869899084, 362387869899094, 362387869899106, 362387869899121, 362387869790211, 362387869899004, 362387869899013, 362387869899043, 362387869899053, 'SCH-20260901-PED-PM', 'SIMPLE', 'OUTPATIENT', 'SHARED', 'AFTERNOON', '张敏 (主治医师)', 'SRV-OPD-PED', '儿科门诊', '门诊楼1层 105儿科诊室', 'Asia/Shanghai', date '2026-09-01', to_timestamp_tz('2026-09-01 14:00:00+08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), to_timestamp_tz('2026-09-01 17:30:00+08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 25, 'PUBLISHED', current_timestamp, 362387869790222, current_timestamp, 362387869790222);

insert into service_schedules (id, revision, tenant_id, resource_id, template_id, template_period_id, generation_run_id, organization_id, department_id, practitioner_id, assignment_id, catalog_item_id, schedule_code, management_mode, schedule_type, booking_policy, day_part, practitioner_name_snapshot, service_code_snapshot, service_name_snapshot, location_name, timezone_code, service_date, start_at, end_at, total_capacity, status, created_at, created_by, updated_at, updated_by)
values (362387869899207, 0, 362387869790209, 362387869899085, 362387869899095, 362387869899107, 362387869899121, 362387869790211, 362387869899005, 362387869899014, 362387869899044, 362387869899054, 'SCH-20260901-SUR-AM', 'SIMPLE', 'OUTPATIENT', 'SHARED', 'MORNING', '刘海平 (副主任医师)', 'SRV-OPD-SUR', '外科门诊（创伤与普外）', '门诊楼1层 108外科诊室', 'Asia/Shanghai', date '2026-09-01', to_timestamp_tz('2026-09-01 08:00:00+08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), to_timestamp_tz('2026-09-01 12:00:00+08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 20, 'PUBLISHED', current_timestamp, 362387869790222, current_timestamp, 362387869790222);

insert into service_schedules (id, revision, tenant_id, resource_id, template_id, template_period_id, generation_run_id, organization_id, department_id, practitioner_id, assignment_id, catalog_item_id, schedule_code, management_mode, schedule_type, booking_policy, day_part, practitioner_name_snapshot, service_code_snapshot, service_name_snapshot, location_name, timezone_code, service_date, start_at, end_at, total_capacity, status, created_at, created_by, updated_at, updated_by)
values (362387869899208, 0, 362387869790209, 362387869899086, 362387869899096, 362387869899108, 362387869899121, 362387869790211, 362387869899006, 362387869899015, 362387869899045, 362387869899055, 'SCH-20260901-TCM-AM', 'SIMPLE', 'OUTPATIENT', 'SHARED', 'MORNING', '陈国华 (名老中医)', 'SRV-OPD-TCM-EXP', '中医科（名医针灸馆）', '门诊楼3层 301名医馆', 'Asia/Shanghai', date '2026-09-01', to_timestamp_tz('2026-09-01 08:00:00+08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), to_timestamp_tz('2026-09-01 11:30:00+08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 15, 'PUBLISHED', current_timestamp, 362387869790222, current_timestamp, 362387869790222);

insert into service_schedules (id, revision, tenant_id, resource_id, template_id, template_period_id, generation_run_id, organization_id, department_id, practitioner_id, assignment_id, catalog_item_id, schedule_code, management_mode, schedule_type, booking_policy, day_part, practitioner_name_snapshot, service_code_snapshot, service_name_snapshot, location_name, timezone_code, service_date, start_at, end_at, total_capacity, status, created_at, created_by, updated_at, updated_by)
values (362387869899209, 0, 362387869790209, 362387869899086, 362387869899096, 362387869899109, 362387869899121, 362387869790211, 362387869899006, 362387869899015, 362387869899045, 362387869899055, 'SCH-20260901-TCM-PM', 'SIMPLE', 'OUTPATIENT', 'SHARED', 'AFTERNOON', '陈国华 (名老中医)', 'SRV-OPD-TCM-EXP', '中医科（辨证调理）', '门诊楼3层 301名医馆', 'Asia/Shanghai', date '2026-09-01', to_timestamp_tz('2026-09-01 14:00:00+08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), to_timestamp_tz('2026-09-01 17:00:00+08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 15, 'PUBLISHED', current_timestamp, 362387869790222, current_timestamp, 362387869790222);

insert into service_schedules (id, revision, tenant_id, resource_id, template_id, template_period_id, generation_run_id, organization_id, department_id, practitioner_id, assignment_id, catalog_item_id, schedule_code, management_mode, schedule_type, booking_policy, day_part, practitioner_name_snapshot, service_code_snapshot, service_name_snapshot, location_name, timezone_code, service_date, start_at, end_at, total_capacity, status, created_at, created_by, updated_at, updated_by)
values (362387869899210, 0, 362387869790209, 362387869899087, 362387869899097, 362387869899110, 362387869899121, 362387869790211, 362387869899007, 362387869899016, 362387869899046, 362387869899056, 'SCH-20260901-GYN-PM', 'SIMPLE', 'OUTPATIENT', 'SHARED', 'AFTERNOON', '赵雪梅 (主治医师)', 'SRV-OPD-GYN', '妇产科门诊', '门诊楼2层 205妇科诊室', 'Asia/Shanghai', date '2026-09-01', to_timestamp_tz('2026-09-01 14:00:00+08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), to_timestamp_tz('2026-09-01 17:30:00+08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 20, 'PUBLISHED', current_timestamp, 362387869790222, current_timestamp, 362387869790222);

-- 14. Schedule Slot Pools
insert into schedule_slot_pools (id, revision, tenant_id, schedule_id, pool_code, slot_mode, quota_mode, total_count, held_count, occupied_count, frozen_count, status, created_at, updated_at)
values (362387869899303, 0, 362387869790209, 362387869899203, 'SP-362387869899303', 'POOL', 'SHARED', 20, 0, 18, 0, 'ACTIVE', current_timestamp, current_timestamp);
insert into schedule_slot_pools (id, revision, tenant_id, schedule_id, pool_code, slot_mode, quota_mode, total_count, held_count, occupied_count, frozen_count, status, created_at, updated_at)
values (362387869899304, 0, 362387869790209, 362387869899204, 'SP-362387869899304', 'POOL', 'SHARED', 20, 0, 6, 0, 'ACTIVE', current_timestamp, current_timestamp);
insert into schedule_slot_pools (id, revision, tenant_id, schedule_id, pool_code, slot_mode, quota_mode, total_count, held_count, occupied_count, frozen_count, status, created_at, updated_at)
values (362387869899305, 0, 362387869790209, 362387869899205, 'SP-362387869899305', 'POOL', 'SHARED', 25, 0, 8, 0, 'ACTIVE', current_timestamp, current_timestamp);
insert into schedule_slot_pools (id, revision, tenant_id, schedule_id, pool_code, slot_mode, quota_mode, total_count, held_count, occupied_count, frozen_count, status, created_at, updated_at)
values (362387869899306, 0, 362387869790209, 362387869899206, 'SP-362387869899306', 'POOL', 'SHARED', 25, 0, 4, 0, 'ACTIVE', current_timestamp, current_timestamp);
insert into schedule_slot_pools (id, revision, tenant_id, schedule_id, pool_code, slot_mode, quota_mode, total_count, held_count, occupied_count, frozen_count, status, created_at, updated_at)
values (362387869899307, 0, 362387869790209, 362387869899207, 'SP-362387869899307', 'POOL', 'SHARED', 20, 0, 11, 0, 'ACTIVE', current_timestamp, current_timestamp);
insert into schedule_slot_pools (id, revision, tenant_id, schedule_id, pool_code, slot_mode, quota_mode, total_count, held_count, occupied_count, frozen_count, status, created_at, updated_at)
values (362387869899308, 0, 362387869790209, 362387869899208, 'SP-362387869899308', 'POOL', 'SHARED', 15, 0, 13, 0, 'ACTIVE', current_timestamp, current_timestamp);
insert into schedule_slot_pools (id, revision, tenant_id, schedule_id, pool_code, slot_mode, quota_mode, total_count, held_count, occupied_count, frozen_count, status, created_at, updated_at)
values (362387869899309, 0, 362387869790209, 362387869899209, 'SP-362387869899309', 'POOL', 'SHARED', 15, 0, 5, 0, 'ACTIVE', current_timestamp, current_timestamp);
insert into schedule_slot_pools (id, revision, tenant_id, schedule_id, pool_code, slot_mode, quota_mode, total_count, held_count, occupied_count, frozen_count, status, created_at, updated_at)
values (362387869899310, 0, 362387869790209, 362387869899210, 'SP-362387869899310', 'POOL', 'SHARED', 20, 0, 7, 0, 'ACTIVE', current_timestamp, current_timestamp);
