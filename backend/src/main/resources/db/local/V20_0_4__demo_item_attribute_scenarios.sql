insert into item_attribute_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    data_type, cardinality, dictionary_id, unit_code, schema_json, default_json,
    variability, override_policy, allowed_scope_json, context_basis, storage_mode,
    projection_field, validation_rule_id, sensitivity, status,
    created_at, created_by, updated_at, updated_by
) values
    (362387869797503, 0, 'PLATFORM', 'PLATFORM', null,
     'LAB.SPECIMEN.TRANSPORT_TEMPERATURE', '标本运输温度', '标本从采集到接收过程允许的建议运输温度。',
     'DECIMAL', 'SINGLE', null, '°C', '{"type":"number","minimum":2,"maximum":25}', '4',
     'SCOPE_OVERRIDE', 'ANY', '["TENANT","ORGANIZATION","DEPARTMENT"]', 'EXECUTING', 'EXTENSION',
     null, null, 'MEDICAL_SAFETY', 'ACTIVE', current_timestamp, 362387869790222,
     current_timestamp, 362387869790222),
    (362387869797504, 0, 'PLATFORM', 'PLATFORM', null,
     'EXAM.VARIANT.PREPARATION_NOTE', '检查部位准备要求', '检查部位或实施方式特有的准备要求。',
     'TEXT', 'SINGLE', null, null, '{"type":"string","minLength":2,"maxLength":200}', '"按检查协议准备"',
     'SCOPE_OVERRIDE', 'ANY', '["TENANT","ORGANIZATION","DEPARTMENT"]', 'EXECUTING', 'EXTENSION',
     null, null, 'NORMAL', 'ACTIVE', current_timestamp, 362387869790222,
     current_timestamp, 362387869790222);

insert into item_type_attributes (
    id, revision, item_type_id, attribute_definition_id, required_value, default_json,
    widget_type, group_name, group_sort_order, attribute_sort_order,
    visible_condition_json, required_condition_json, searchable, list_display, status,
    created_at, created_by, updated_at, updated_by
) values
    (362387869797513, 0, 362387869797003, 362387869797503, true, null,
     'NUMBER', '标本与送检', 20, 10, null, null, false, true, 'ACTIVE',
     current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869797514, 0, 362387869797004, 362387869797504, false, null,
     'TEXT', '检查部位参数', 20, 10, null, null, false, false, 'ACTIVE',
     current_timestamp, 362387869790222, current_timestamp, 362387869790222);

insert into item_attribute_values (
    id, revision, scope_type, scope_code, tenant_id, attribute_subject_id,
    attribute_definition_id, value_json, valid_from, valid_to, status,
    created_at, created_by, updated_at, updated_by
) values
    (362387869797522, 0, 'TENANT', 'TENANT:362387869790209', 362387869790209,
     362387869797401, 362387869797503, '4', '2026-01-01', null, 'ACTIVE',
     current_timestamp, 362387869790222, current_timestamp, 362387869790222),
    (362387869797523, 0, 'TENANT', 'TENANT:362387869790209', 362387869790209,
     362387869797421, 362387869797504, '"检查前保持空腹"', '2026-01-01', null, 'ACTIVE',
     current_timestamp, 362387869790222, current_timestamp, 362387869790222);
