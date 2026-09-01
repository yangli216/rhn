insert into disease_management_rules (
    id, program_id, inclusion_mode, diagnosis_domain, code_system_id, concept_type,
    chapter_code, code_from, code_to, note, created_at
) values
    (362387870127001, 362387870123001, 'INCLUDE', 'WESTERN_MEDICINE', 362387869795001, 'DISEASE',
     null, 'I10', 'I15.9', '按 ICD-10 编码范围识别高血压相关疾病', current_timestamp),
    (362387870127002, 362387870123002, 'INCLUDE', 'WESTERN_MEDICINE', 362387869795001, 'DISEASE',
     null, 'E10', 'E14.9', '按 ICD-10 编码范围识别糖尿病相关疾病', current_timestamp);

