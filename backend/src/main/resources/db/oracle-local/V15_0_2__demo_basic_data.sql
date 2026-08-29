insert into code_systems (
    id, scope_type, scope_id, code, name, canonical_uri, version_code, status,
    effective_from, effective_to, created_at, system_type, publisher, description,
    source_type, revision, updated_at
) values (
    362387869795001, 'PRODUCT', 0, 'WHO.BD.CS.ICD10', 'ICD-10 疾病分类',
    'http://hl7.org/fhir/sid/icd-10', '2019', 'ACTIVE', date '2026-01-01', null,
    current_timestamp, 'DISEASE', '世界卫生组织', '本地体验用小规模疾病术语样例，正式环境应导入权威发布版',
    'EXTERNAL_IMPORT', 0, current_timestamp
);

insert all
    into concepts (id, code_system_id, code, display, definition, status, effective_from, effective_to, created_at, concept_type, short_display, chapter_code, chapter_name, search_code, source_type, replacement_concept_id, revision, updated_at)
        values (362387869795011, 362387869795001, 'I10', '原发性高血压', '以血压持续升高为主要表现的疾病', 'ACTIVE', date '2026-01-01', null, current_timestamp, 'DISEASE', '高血压', 'IX', '循环系统疾病', 'YFXGXY', 'EXTERNAL_IMPORT', null, 0, current_timestamp)
    into concepts (id, code_system_id, code, display, definition, status, effective_from, effective_to, created_at, concept_type, short_display, chapter_code, chapter_name, search_code, source_type, replacement_concept_id, revision, updated_at)
        values (362387869795012, 362387869795001, 'E11.9', '2型糖尿病，不伴并发症', '2型糖尿病且当前未记录并发症', 'ACTIVE', date '2026-01-01', null, current_timestamp, 'DISEASE', '2型糖尿病', 'IV', '内分泌、营养和代谢疾病', '2XTNB', 'EXTERNAL_IMPORT', null, 0, current_timestamp)
    into concepts (id, code_system_id, code, display, definition, status, effective_from, effective_to, created_at, concept_type, short_display, chapter_code, chapter_name, search_code, source_type, replacement_concept_id, revision, updated_at)
        values (362387869795013, 362387869795001, 'J06.9', '急性上呼吸道感染，未特指', null, 'ACTIVE', date '2026-01-01', null, current_timestamp, 'DISEASE', '上感', 'X', '呼吸系统疾病', 'JXSHDXGR', 'EXTERNAL_IMPORT', null, 0, current_timestamp)
    into concepts (id, code_system_id, code, display, definition, status, effective_from, effective_to, created_at, concept_type, short_display, chapter_code, chapter_name, search_code, source_type, replacement_concept_id, revision, updated_at)
        values (362387869795014, 362387869795001, 'R05', '咳嗽', null, 'ACTIVE', date '2026-01-01', null, current_timestamp, 'SYMPTOM', null, 'XVIII', '症状、体征和异常检查结果', 'KS', 'EXTERNAL_IMPORT', null, 0, current_timestamp)
    into concepts (id, code_system_id, code, display, definition, status, effective_from, effective_to, created_at, concept_type, short_display, chapter_code, chapter_name, search_code, source_type, replacement_concept_id, revision, updated_at)
        values (362387869795015, 362387869795001, 'R10.4', '其他和未特指的腹痛', null, 'ACTIVE', date '2026-01-01', null, current_timestamp, 'SYMPTOM', '腹痛', 'XVIII', '症状、体征和异常检查结果', 'FT', 'EXTERNAL_IMPORT', null, 0, current_timestamp)
select 1 from dual;

insert all
    into concept_aliases values (362387869795021, 362387869795011, 'SYNONYM', '高血压病', 'GXYB', 'ACTIVE')
    into concept_aliases values (362387869795022, 362387869795012, 'SHORT_NAME', '糖尿病', 'TNB', 'ACTIVE')
    into concept_aliases values (362387869795023, 362387869795013, 'SYNONYM', '上呼吸道感染', 'SHDXGR', 'ACTIVE')
    into concept_aliases values (362387869795024, 362387869795014, 'SYNONYM', '咳嗽症状', 'KSZZ', 'ACTIVE')
select 1 from dual;

insert all
    into catalog_items values (362387869795101, 0, 362387869790209, 'SRV-CBC', '血细胞分析', 'SERVICE', '次', 1, 1, 0, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222)
    into catalog_items values (362387869795102, 0, 362387869790209, 'SRV-GLU', '葡萄糖测定', 'SERVICE', '次', 1, 1, 0, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222)
    into catalog_items values (362387869795103, 0, 362387869790209, 'SRV-US-ABD', '腹部超声检查', 'SERVICE', '次', 1, 1, 0, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222)
    into catalog_items values (362387869795111, 0, 362387869790209, 'MED-AMOX-025', '阿莫西林胶囊 0.25g', 'MED_PRODUCT', '粒', 1, 1, 1, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222)
    into catalog_items values (362387869795112, 0, 362387869790209, 'MED-MET-050', '盐酸二甲双胍片 0.5g', 'MED_PRODUCT', '片', 1, 1, 1, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222)
    into catalog_items values (362387869795113, 0, 362387869790209, 'MED-AML-005', '苯磺酸氨氯地平片 5mg', 'MED_PRODUCT', '片', 1, 1, 1, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222)
select 1 from dual;

insert all
    into service_items (catalog_item_id, tenant_id, service_type, service_subtype, usage_type, medical_technology, combination_item, single_order, specimen_type, examination_type, accounting_category, pregnancy_alert, attention, examination_notes)
        values (362387869795101, 362387869790209, 'LABORATORY', 'HEMATOLOGY', 'COMMON', 1, 0, 1, 'WHOLE_BLOOD', null, 'LABORATORY', 0, '采集抗凝全血', '按检验科采样规范送检')
    into service_items (catalog_item_id, tenant_id, service_type, service_subtype, usage_type, medical_technology, combination_item, single_order, specimen_type, examination_type, accounting_category, pregnancy_alert, attention, examination_notes)
        values (362387869795102, 362387869790209, 'LABORATORY', 'BIOCHEMISTRY', 'COMMON', 1, 0, 1, 'SERUM', null, 'LABORATORY', 0, '空腹标本按临床需要采集', null)
    into service_items (catalog_item_id, tenant_id, service_type, service_subtype, usage_type, medical_technology, combination_item, single_order, specimen_type, examination_type, accounting_category, pregnancy_alert, attention, examination_notes)
        values (362387869795103, 362387869790209, 'EXAMINATION', 'ULTRASOUND', 'COMMON', 1, 0, 1, null, 'ULTRASOUND', 'IMAGING', 0, '检查前按申请要求空腹', '包含肝胆胰脾等腹部脏器检查')
select 1 from dual;

insert all
    into manufacturers (id, revision, tenant_id, code, name, short_name, manufacturer_type, country_code, status, created_at, created_by, updated_at, updated_by)
        values (362387869795301, 0, 362387869790209, 'MFR-DEMO-A', '示范制药有限公司', '示范制药', 'DRUG', 'CN', 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222)
    into manufacturers (id, revision, tenant_id, code, name, short_name, manufacturer_type, country_code, status, created_at, created_by, updated_at, updated_by)
        values (362387869795302, 0, 362387869790209, 'MFR-DEMO-B', '青禾医药股份有限公司', '青禾医药', 'DRUG', 'CN', 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222)
select 1 from dual;

insert all
    into medications (id, revision, tenant_id, code, name, alias_name, medication_type, dose_form, preparation_spec, preparation_unit, strength_value, strength_unit, prescription_drug, essential_drug, antimicrobial, skin_test_required, default_route, default_frequency, status, created_at, created_by, updated_at, updated_by)
        values (362387869795201, 0, 362387869790209, 'DRUG-AMOX', '阿莫西林', null, 'WESTERN', 'CAPSULE', '0.25g', '粒', 250, 'mg', 1, 1, 1, 1, 'ORAL', 'TID', 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222)
    into medications (id, revision, tenant_id, code, name, alias_name, medication_type, dose_form, preparation_spec, preparation_unit, strength_value, strength_unit, prescription_drug, essential_drug, antimicrobial, skin_test_required, default_route, default_frequency, status, created_at, created_by, updated_at, updated_by)
        values (362387869795202, 0, 362387869790209, 'DRUG-MET', '二甲双胍', '盐酸二甲双胍', 'WESTERN', 'TABLET', '0.5g', '片', 500, 'mg', 1, 1, 0, 0, 'ORAL', 'BID', 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222)
    into medications (id, revision, tenant_id, code, name, alias_name, medication_type, dose_form, preparation_spec, preparation_unit, strength_value, strength_unit, prescription_drug, essential_drug, antimicrobial, skin_test_required, default_route, default_frequency, status, created_at, created_by, updated_at, updated_by)
        values (362387869795203, 0, 362387869790209, 'DRUG-AML', '氨氯地平', '苯磺酸氨氯地平', 'WESTERN', 'TABLET', '5mg', '片', 5, 'mg', 1, 1, 0, 0, 'ORAL', 'QD', 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222)
select 1 from dual;

insert all
    into medication_products (catalog_item_id, tenant_id, medication_id, manufacturer_id, trade_name, approval_code, otc, central_purchase, import_allowed, trace_split_required, indication)
        values (362387869795111, 362387869790209, 362387869795201, 362387869795301, '阿莫西林胶囊', '国药准字H00000001', 0, 0, 0, 1, '敏感菌所致感染')
    into medication_products (catalog_item_id, tenant_id, medication_id, manufacturer_id, trade_name, approval_code, otc, central_purchase, import_allowed, trace_split_required, indication)
        values (362387869795112, 362387869790209, 362387869795202, 362387869795302, '二甲双胍片', '国药准字H00000002', 0, 1, 0, 1, '2型糖尿病')
    into medication_products (catalog_item_id, tenant_id, medication_id, manufacturer_id, trade_name, approval_code, otc, central_purchase, import_allowed, trace_split_required, indication)
        values (362387869795113, 362387869790209, 362387869795203, 362387869795301, '氨氯地平片', '国药准字H00000003', 0, 1, 0, 1, '高血压')
select 1 from dual;

insert all
    into item_packages (id, tenant_id, catalog_item_id, base_package_id, unit_code, unit_name, package_spec, quantity_factor, usage_type, barcode, default_purchase, default_sale, default_dispense, status, valid_from, valid_to) values (362387869795401, 362387869790209, 362387869795111, null, 'BOX', '盒', '24粒/盒', 24, 'SALE', '6900000000011', 1, 1, 0, 'ACTIVE', date '2026-01-01', null)
    into item_packages (id, tenant_id, catalog_item_id, base_package_id, unit_code, unit_name, package_spec, quantity_factor, usage_type, barcode, default_purchase, default_sale, default_dispense, status, valid_from, valid_to) values (362387869795402, 362387869790209, 362387869795112, null, 'BOX', '盒', '20片/盒', 20, 'SALE', '6900000000012', 1, 1, 0, 'ACTIVE', date '2026-01-01', null)
    into item_packages (id, tenant_id, catalog_item_id, base_package_id, unit_code, unit_name, package_spec, quantity_factor, usage_type, barcode, default_purchase, default_sale, default_dispense, status, valid_from, valid_to) values (362387869795403, 362387869790209, 362387869795113, null, 'BOX', '盒', '14片/盒', 14, 'SALE', '6900000000013', 1, 1, 0, 'ACTIVE', date '2026-01-01', null)
select 1 from dual;

insert all
    into organization_catalog_items values (362387869795501, 0, 362387869790209, 362387869790211, 362387869795101, 362387869790212, 'LAB-CBC', '血常规', 1, 1, 1, 0, 0, 0, 0, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222)
    into organization_catalog_items values (362387869795502, 0, 362387869790209, 362387869790211, 362387869795102, 362387869790212, 'LAB-GLU', null, 1, 1, 1, 0, 0, 0, 0, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222)
    into organization_catalog_items values (362387869795503, 0, 362387869790209, 362387869790211, 362387869795103, 362387869790212, 'US-ABD', null, 1, 1, 1, 0, 0, 0, 0, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222)
    into organization_catalog_items values (362387869795511, 0, 362387869790209, 362387869790211, 362387869795111, 362387869790212, 'P-AMOX', null, 1, 0, 1, 1, 1, 1, 1, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222)
    into organization_catalog_items values (362387869795512, 0, 362387869790209, 362387869790211, 362387869795112, 362387869790212, 'P-MET', null, 1, 0, 1, 1, 1, 1, 1, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222)
    into organization_catalog_items values (362387869795513, 0, 362387869790209, 362387869790211, 362387869795113, 362387869790212, 'P-AML', null, 1, 0, 1, 1, 1, 1, 1, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222, current_timestamp, 362387869790222)
select 1 from dual;

insert all
    into catalog_prices values (362387869795601, 0, 362387869790209, 362387869795101, 362387869790211, null, 'SALE', 18.00, 'CNY', 'DEMO-PRICE-2026', '体验数据', date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222)
    into catalog_prices values (362387869795602, 0, 362387869790209, 362387869795102, 362387869790211, null, 'SALE', 8.00, 'CNY', 'DEMO-PRICE-2026', '体验数据', date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222)
    into catalog_prices values (362387869795603, 0, 362387869790209, 362387869795103, 362387869790211, null, 'SALE', 65.00, 'CNY', 'DEMO-PRICE-2026', '体验数据', date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222)
    into catalog_prices values (362387869795611, 0, 362387869790209, 362387869795111, 362387869790211, 362387869795401, 'SALE', 12.80, 'CNY', 'DEMO-PRICE-2026', '体验数据', date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222)
    into catalog_prices values (362387869795612, 0, 362387869790209, 362387869795112, 362387869790211, 362387869795402, 'SALE', 6.50, 'CNY', 'DEMO-PRICE-2026', '体验数据', date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222)
    into catalog_prices values (362387869795613, 0, 362387869790209, 362387869795113, 362387869790211, 362387869795403, 'SALE', 18.60, 'CNY', 'DEMO-PRICE-2026', '体验数据', date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222)
select 1 from dual;
