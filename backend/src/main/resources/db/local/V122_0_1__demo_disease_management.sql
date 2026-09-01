update code_systems set diagnosis_domain = 'WESTERN_MEDICINE'
where code = 'WHO.BD.CS.ICD10';

insert into code_systems (
    id, scope_type, scope_id, code, name, canonical_uri, version_code, status,
    effective_from, effective_to, created_at, system_type, publisher, description,
    source_type, revision, updated_at, authority_type, source_uri, content_hash, diagnosis_domain
) values
    (362387870125001, 'PRODUCT', 0, 'RHN.BD.CS.TCM_DISEASE', '中医病名示例目录',
     'urn:rhn:codesystem:tcm-disease', '2026.09', 'ACTIVE', '2026-01-01', null, current_timestamp,
     'DISEASE', 'RHN', '本地体验用中医病名样例，正式环境应导入适用的权威发布版',
     'MANUAL', 0, current_timestamp, 'INTERNAL', null, null, 'TCM_DISEASE'),
    (362387870125002, 'PRODUCT', 0, 'RHN.BD.CS.TCM_SYNDROME', '中医证候示例目录',
     'urn:rhn:codesystem:tcm-syndrome', '2026.09', 'ACTIVE', '2026-01-01', null, current_timestamp,
     'DISEASE', 'RHN', '本地体验用中医证候样例，正式环境应导入适用的权威发布版',
     'MANUAL', 0, current_timestamp, 'INTERNAL', null, null, 'TCM_SYNDROME');

insert into concepts (
    id, code_system_id, code, display, definition, status, effective_from, effective_to, created_at,
    concept_type, short_display, chapter_code, chapter_name, search_code, source_type,
    replacement_concept_id, revision, updated_at
) values
    (362387870126001, 362387870125001, 'XK_BING', '消渴病', '本地体验用中医病名样例', 'ACTIVE', '2026-01-01', null,
     current_timestamp, 'DISEASE', '消渴', null, '中医内科病名', 'XKB', 'MANUAL', null, 0, current_timestamp),
    (362387870126002, 362387870125001, 'XY_BING', '眩晕病', '本地体验用中医病名样例', 'ACTIVE', '2026-01-01', null,
     current_timestamp, 'DISEASE', '眩晕', null, '中医内科病名', 'XYB', 'MANUAL', null, 0, current_timestamp),
    (362387870126011, 362387870125002, 'QY_LX_ZHENG', '气阴两虚证', '本地体验用中医证候样例', 'ACTIVE', '2026-01-01', null,
     current_timestamp, 'SYNDROME', null, null, '中医证候', 'QYLXZ', 'MANUAL', null, 0, current_timestamp),
    (362387870126012, 362387870125002, 'GY_SK_ZHENG', '肝阳上亢证', '本地体验用中医证候样例', 'ACTIVE', '2026-01-01', null,
     current_timestamp, 'SYNDROME', null, null, '中医证候', 'GYSKZ', 'MANUAL', null, 0, current_timestamp),
    (362387870126021, 362387869795001, 'A00', '霍乱', '本地体验用疾病报告配置样例', 'ACTIVE', '2026-01-01', null,
     current_timestamp, 'DISEASE', null, 'I', '某些传染病和寄生虫病', 'HL', 'EXTERNAL_IMPORT', null, 0, current_timestamp);

insert into disease_management_programs (
    id, revision, scope_type, scope_id, code, name, management_type, trigger_action, description,
    report_card_type, report_deadline_hours, status, effective_from, effective_to, created_at, updated_at
) values
    (362387870123001, 0, 'PRODUCT', 0, 'CHRONIC_HYPERTENSION', '高血压慢病管理', 'CHRONIC_CARE',
     'CREATE_FOLLOW_UP_TASK', '确诊后提示进入高血压慢病管理候选；是否正式纳入仍需临床或公卫人员确认',
     null, null, 'ACTIVE', '2026-01-01', null, current_timestamp, current_timestamp),
    (362387870123002, 0, 'PRODUCT', 0, 'CHRONIC_DIABETES', '糖尿病慢病管理', 'CHRONIC_CARE',
     'CREATE_FOLLOW_UP_TASK', '确诊后提示进入糖尿病慢病管理候选；避免重复建档',
     null, null, 'ACTIVE', '2026-01-01', null, current_timestamp, current_timestamp),
    (362387870123003, 0, 'PRODUCT', 0, 'NOTIFIABLE_DISEASE', '疾病报卡', 'DISEASE_REPORT',
     'CREATE_REPORT_DRAFT', '命中后创建待医生确认的疾病报卡草稿，具体时限由适用规则配置',
     'INFECTIOUS_DISEASE', null, 'ACTIVE', '2026-01-01', null, current_timestamp, current_timestamp);

insert into disease_management_members (
    id, program_id, concept_id, status, effective_from, effective_to, note, created_at
) values
    (362387870124001, 362387870123001, 362387869795011, 'ACTIVE', '2026-01-01', null, 'ICD-10 I10 示例', current_timestamp),
    (362387870124002, 362387870123002, 362387869795012, 'ACTIVE', '2026-01-01', null, 'ICD-10 E11.9 示例', current_timestamp),
    (362387870124003, 362387870123003, 362387870126021, 'ACTIVE', '2026-01-01', null, '疾病报告演示成员', current_timestamp);
