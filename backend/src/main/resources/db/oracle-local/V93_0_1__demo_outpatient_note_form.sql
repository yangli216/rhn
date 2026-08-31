insert into outpatient_note_form_versions (
    id, tenant_id, organization_id, department_id, form_code, version_number,
    specialty_code, form_name, description, definition_schema, definition_json,
    status, published_by, published_at, retired_at
) values (
    362387869799930, 362387869790209, 362387869790211, 362387869790212,
    'HYPERTENSION_FOLLOW_UP', 1, 'GENERAL_PRACTICE', '高血压复诊评估',
    '基层高血压患者复诊时使用；基础病历字段仍按普通门诊方式书写。',
    'RHN.OUTPATIENT_NOTE_FORM_DEFINITION.V1',
    '{"sections":[{"code":"bloodPressureReview","title":"血压与用药评估","description":"记录近期家庭血压及治疗依从性。","fields":[{"code":"homeSystolic","label":"家庭收缩压","type":"NUMBER","required":true,"unit":"mmHg","placeholder":null,"maxLength":null,"minimum":40,"maximum":300,"options":[]},{"code":"homeDiastolic","label":"家庭舒张压","type":"NUMBER","required":true,"unit":"mmHg","placeholder":null,"maxLength":null,"minimum":20,"maximum":200,"options":[]},{"code":"medicationAdherence","label":"服药依从性","type":"SELECT","required":true,"unit":null,"placeholder":null,"maxLength":null,"minimum":null,"maximum":null,"options":[{"value":"GOOD","label":"良好"},{"value":"PARTIAL","label":"部分依从"},{"value":"POOR","label":"较差"}]},{"code":"adverseEffects","label":"药物不良反应","type":"TEXTAREA","required":false,"unit":null,"placeholder":"无不适可填写“无”","maxLength":500,"minimum":null,"maximum":null,"options":[]}]},{"code":"riskReview","title":"危险因素复核","description":null,"fields":[{"code":"smoking","label":"目前吸烟","type":"BOOLEAN","required":true,"unit":null,"placeholder":null,"maxLength":null,"minimum":null,"maximum":null,"options":[]},{"code":"saltIntake","label":"日常盐摄入","type":"SELECT","required":false,"unit":null,"placeholder":null,"maxLength":null,"minimum":null,"maximum":null,"options":[{"value":"LOW","label":"偏低"},{"value":"MODERATE","label":"适中"},{"value":"HIGH","label":"偏高"}]}]}]}',
    'PUBLISHED', 362387869790222, current_timestamp, null
);
