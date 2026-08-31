-- A compact primary-care ward and four beds make admission/transfer/discharge directly testable.
insert into departments (
    id, tenant_id, organization_id, parent_id, merged_to_id, code, name, short_name, description,
    department_type, department_property, virtual, sort_order, status, valid_from, valid_to,
    created_at, created_by, updated_at, updated_by, revision
) values (
    362387869898501, 362387869790209, 362387869790211, null, null,
    'GENERAL_WARD', '综合病区', '综合病区', '基层住院综合护理单元',
    'NUR_INPATIENT_WARD', 'NURSING', false, 30, 'ACTIVE', date '2026-01-01', null,
    current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0
);

insert into user_role_assignments (
    id, tenant_id, user_id, role_id, organization_id, department_id, data_scope_type,
    valid_from, valid_to, granted_by, created_at
) values (
    362387869898502, 362387869790209, 362387869790222, 362387869796001,
    362387869790211, 362387869898501, 'DEPARTMENT', current_timestamp, null,
    362387869790222, current_timestamp
);

insert into staff_assignments (
    id, tenant_id, employment_id, organization_id, department_id, position_id, code,
    assignment_type, specialty_code, primary_assignment, workload_percent, status,
    valid_from, valid_to, created_at, created_by, updated_at, updated_by, revision
) values (
    362387869898503, 362387869790209, 362387869799702, 362387869790211,
    362387869898501, 362387869799701, 'ASN-DEMO-WARD', 'PART_TIME', 'GENERAL_MEDICINE', false, 50,
    'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 0
);

insert into service_locations (
    id, revision, tenant_id, organization_id, department_id, parent_id, code, name,
    location_type, sort_order, status, valid_from, valid_to, created_at, created_by, updated_at, updated_by
) values
(362387869898510, 0, 362387869790209, 362387869790211, 362387869898501, null,
 'WARD-GENERAL', '综合病区', 'WARD', 10, 'ACTIVE', date '2026-01-01', null,
 current_timestamp, 362387869790222, current_timestamp, 362387869790222),
(362387869898511, 0, 362387869790209, 362387869790211, 362387869898501, 362387869898510,
 'WARD-GENERAL-R01', '101病房', 'ROOM', 10, 'ACTIVE', date '2026-01-01', null,
 current_timestamp, 362387869790222, current_timestamp, 362387869790222),
(362387869898512, 0, 362387869790209, 362387869790211, 362387869898501, 362387869898511,
 'WARD-GENERAL-R01-B01', '01床', 'BED', 10, 'ACTIVE', date '2026-01-01', null,
 current_timestamp, 362387869790222, current_timestamp, 362387869790222),
(362387869898513, 0, 362387869790209, 362387869790211, 362387869898501, 362387869898511,
 'WARD-GENERAL-R01-B02', '02床', 'BED', 20, 'ACTIVE', date '2026-01-01', null,
 current_timestamp, 362387869790222, current_timestamp, 362387869790222),
(362387869898514, 0, 362387869790209, 362387869790211, 362387869898501, 362387869898511,
 'WARD-GENERAL-R01-B03', '03床', 'BED', 30, 'ACTIVE', date '2026-01-01', null,
 current_timestamp, 362387869790222, current_timestamp, 362387869790222),
(362387869898515, 0, 362387869790209, 362387869790211, 362387869898501, 362387869898511,
 'WARD-GENERAL-R01-B04', '04床', 'BED', 40, 'ACTIVE', date '2026-01-01', null,
 current_timestamp, 362387869790222, current_timestamp, 362387869790222);

insert into inpatient_bed_profiles (
    bed_location_id, revision, tenant_id, bed_type, gender_restriction, operational_status,
    nursing_group_code, responsible_nurse_id, daily_bed_rate, updated_at, updated_by
) values
(362387869898512, 0, 362387869790209, 'PHYSICAL', 'ANY', 'AVAILABLE', 'GENERAL-A', null, 20.00, current_timestamp, 362387869790222),
(362387869898513, 0, 362387869790209, 'PHYSICAL', 'ANY', 'AVAILABLE', 'GENERAL-A', null, 20.00, current_timestamp, 362387869790222),
(362387869898514, 0, 362387869790209, 'PHYSICAL', 'ANY', 'AVAILABLE', 'GENERAL-A', null, 20.00, current_timestamp, 362387869790222),
(362387869898515, 0, 362387869790209, 'EXTRA', 'ANY', 'AVAILABLE', 'GENERAL-A', null, 15.00, current_timestamp, 362387869790222);

insert into management_modules (id, tenant_id, parent_id, code, name, module_type, route_path,
    component_code, icon_code, sort_order, status, created_at, updated_at, version) values
(362387869896027, 362387869790209, null, 'INPATIENT', '住院管理', 'MODULE',
 '/inpatient', 'InpatientWorkspace', 'clinical', 27, 'ACTIVE', current_timestamp, current_timestamp, 0);

insert into access_permissions (id, tenant_id, management_module_id, code, name,
    action_code, resource_code, status) values
(362387869896135, 362387869790209, 362387869896027, 'INPATIENT.ACCESS', '访问住院管理', 'ACCESS', 'INPATIENT', 'ACTIVE'),
(362387869896136, 362387869790209, 362387869896027, 'INPATIENT.ADMIT', '办理入院', 'ADMIT', 'INPATIENT', 'ACTIVE'),
(362387869896137, 362387869790209, 362387869896027, 'INPATIENT.TRANSFER', '办理转床', 'TRANSFER', 'INPATIENT', 'ACTIVE'),
(362387869896138, 362387869790209, 362387869896027, 'INPATIENT.DISCHARGE', '办理出院', 'DISCHARGE', 'INPATIENT', 'ACTIVE'),
(362387869896139, 362387869790209, 362387869896027, 'INPATIENT.BED_MANAGE', '维护床位状态', 'MANAGE', 'INPATIENT_BED', 'ACTIVE');

insert into role_permission_assignments (id, tenant_id, role_id, permission_id,
    valid_from, valid_to, granted_by, created_at) values
(362387869896235, 362387869790209, 362387869796001, 362387869896135, current_timestamp, null, 362387869790222, current_timestamp),
(362387869896236, 362387869790209, 362387869796001, 362387869896136, current_timestamp, null, 362387869790222, current_timestamp),
(362387869896237, 362387869790209, 362387869796001, 362387869896137, current_timestamp, null, 362387869790222, current_timestamp),
(362387869896238, 362387869790209, 362387869796001, 362387869896138, current_timestamp, null, 362387869790222, current_timestamp),
(362387869896239, 362387869790209, 362387869796001, 362387869896139, current_timestamp, null, 362387869790222, current_timestamp);
