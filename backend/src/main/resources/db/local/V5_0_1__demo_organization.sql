insert into organizations (
    id, tenant_id, parent_id, code, name, organization_kind, organization_type, status,
    valid_from, valid_to, created_at, updated_at, revision
) values (
    '362387869790211', '362387869790209', null,
    'QH-TOWN-HC', '青禾镇中心卫生院', 'LEGAL_ORGANIZATION',
    'TOWNSHIP_HEALTH_CENTER', 'ACTIVE', '2026-01-01', null,
    current_timestamp, current_timestamp, 0
);

insert into organizations (
    id, tenant_id, parent_id, code, name, organization_kind, organization_type, status,
    valid_from, valid_to, created_at, updated_at, revision
) values (
    '362387869790212', '362387869790209', '362387869790211',
    'GENERAL', '全科门诊', 'ORG_UNIT', 'CLINICAL_DEPARTMENT', 'ACTIVE',
    '2026-01-01', null, current_timestamp, current_timestamp, 0
);
