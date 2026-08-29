insert into positions (
    id, tenant_id, code, name, position_type, duty_description, status,
    created_at, created_by, updated_at, updated_by, revision
) values (
    362387869799701, 362387869790209, 'GENERAL_PRACTITIONER', '全科医生', 'CLINICAL',
    '承担基层常见病、多发病诊疗和连续健康管理', 'ACTIVE',
    current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0
);

insert into employments (
    id, tenant_id, practitioner_id, organization_id, code, employment_type, primary_employment,
    hire_date, leave_date, status, created_at, created_by, updated_at, updated_by, revision
) values (
    362387869799702, 362387869790209, 362387869790223, 362387869790211,
    'EMP-DEMO-GP', 'PERMANENT', true, date '2026-01-01', null, 'ACTIVE',
    current_timestamp, 362387869790222, current_timestamp, 362387869790222, 0
);

insert into staff_assignments (
    id, tenant_id, employment_id, organization_id, department_id, position_id, code,
    assignment_type, specialty_code, primary_assignment, workload_percent, status,
    valid_from, valid_to, created_at, created_by, updated_at, updated_by, revision
) values (
    362387869799703, 362387869790209, 362387869799702, 362387869790211,
    362387869790212, 362387869799701, 'ASN-DEMO-GP', 'PRIMARY', 'GENERAL_MEDICINE', true, 100,
    'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 0
);
