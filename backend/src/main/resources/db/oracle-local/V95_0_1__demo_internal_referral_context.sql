-- A second clinical department lets the Oracle development environment exercise coordination end to end.

insert into departments (
    id, tenant_id, organization_id, parent_id, merged_to_id, code, name, short_name, description,
    department_type, department_property, virtual, sort_order, status, valid_from, valid_to,
    created_at, created_by, updated_at, updated_by, revision
) values (
    362387869899001, 362387869790209, 362387869790211, null, null,
    'INTERNAL_MEDICINE', '内科门诊', '内科门诊', '承担基层常见内科疾病诊疗及院内协同',
    'CLIN_INTERNAL_MEDICINE', 'CLINICAL', 0, 20, 'ACTIVE', date '2026-01-01', null,
    current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0
);

insert into user_role_assignments (
    id, tenant_id, user_id, role_id, organization_id, department_id, data_scope_type,
    valid_from, valid_to, granted_by, created_at
) values (
    362387869899002, 362387869790209, 362387869790222, 362387869796001,
    362387869790211, 362387869899001, 'DEPARTMENT', current_timestamp, null,
    362387869790222, current_timestamp
);

insert into staff_assignments (
    id, tenant_id, employment_id, organization_id, department_id, position_id, code,
    assignment_type, specialty_code, primary_assignment, workload_percent, status,
    valid_from, valid_to, created_at, created_by, updated_at, updated_by, revision
) values (
    362387869899003, 362387869790209, 362387869799702, 362387869790211,
    362387869899001, 362387869799701, 'ASN-DEMO-IM', 'PART_TIME', 'INTERNAL_MEDICINE', 0, 50,
    'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 0
);
