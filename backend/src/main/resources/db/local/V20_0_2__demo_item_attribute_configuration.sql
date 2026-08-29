insert into item_attribute_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    data_type, cardinality, dictionary_id, unit_code, schema_json, default_json,
    variability, override_policy, allowed_scope_json, context_basis, storage_mode,
    projection_field, validation_rule_id, sensitivity, status,
    created_at, created_by, updated_at, updated_by
) values
    (362387869797501, 0, 'PLATFORM', 'PLATFORM', null, 'MED.SKIN_TEST.SOLUTION_MODE', '皮试液配置方式',
     '需要皮试时使用的皮试液配置方式。', 'ENUM', 'SINGLE', null, null,
     '{"type":"string","enum":["ORIGINAL_SOLUTION","DILUTED_SOLUTION"]}', '"ORIGINAL_SOLUTION"',
     'SCOPE_OVERRIDE', 'ANY', '["TENANT","ORGANIZATION","DEPARTMENT"]', 'ORDERING', 'EXTENSION',
     null, null, 'NORMAL', 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869797502, 0, 'PLATFORM', 'PLATFORM', null, 'MED.SKIN_TEST.REQUIRED', '是否需要皮试',
     '投影到药品强类型皮试标志，扩展值表不得保存副本。', 'BOOLEAN', 'SINGLE', null, null,
     '{"type":"boolean"}', 'false', 'BASE_ONLY', 'NO_OVERRIDE', '[]', 'NONE', 'PROJECTED',
     'medications.skin_test_required', null, 'MEDICAL_SAFETY', 'ACTIVE',
     current_timestamp, 362387869790222, current_timestamp, 362387869790222);

insert into item_type_attributes (
    id, revision, item_type_id, attribute_definition_id, required_value, default_json,
    widget_type, group_name, group_sort_order, attribute_sort_order,
    visible_condition_json, required_condition_json, searchable, list_display, status,
    created_at, created_by, updated_at, updated_by
) values
    (362387869797511, 0, 362387869797012, 362387869797501, false, null, 'RADIO', '用药安全', 10, 20,
     '{"field":"MED.SKIN_TEST.REQUIRED","equals":true}', null, false, false, 'ACTIVE',
     current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869797512, 0, 362387869797012, 362387869797502, false, null, 'SWITCH', '用药安全', 10, 10,
     null, null, true, true, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222);

insert into item_attribute_values (
    id, revision, scope_type, scope_code, tenant_id, attribute_subject_id,
    attribute_definition_id, value_json, valid_from, valid_to, status,
    created_at, created_by, updated_at, updated_by
) values (
    362387869797521, 0, 'TENANT', 'TENANT:362387869790209', 362387869790209,
    362387869797411, 362387869797501, '"ORIGINAL_SOLUTION"', '2026-01-01', null, 'ACTIVE',
    current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into item_attribute_overrides (
    id, revision, tenant_id, attribute_subject_id, attribute_definition_id,
    scope_type, scope_key, organization_id, department_id, value_mode, value_json,
    valid_from, valid_to, status, created_at, created_by, updated_at, updated_by
) values (
    362387869797531, 0, 362387869790209, 362387869797411, 362387869797501,
    'ORGANIZATION', 'TENANT:362387869790209/ORG:362387869790211', 362387869790211, null,
    'OVERRIDE', '"DILUTED_SOLUTION"', '2026-01-01', null, 'ACTIVE',
    current_timestamp, 362387869790222, current_timestamp, 362387869790222
);
