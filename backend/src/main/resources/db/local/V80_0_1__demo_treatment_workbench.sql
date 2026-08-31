insert into catalog_items (
    id, revision, tenant_id, code, name, item_type, unit_code, orderable, chargeable, stocked,
    status, valid_from, valid_to, created_at, created_by, updated_at, updated_by, item_type_id, item_master_id
) values (
    362387869795105, 0, 362387869790209, 'SRV-OPD-INJ', '门诊肌内注射', 'SERVICE', '次',
    true, true, false, 'ACTIVE', '2026-01-01', null, current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869797006, null
);

insert into service_items (
    catalog_item_id, tenant_id, service_type, service_subtype, usage_type, medical_technology,
    combination_item, single_order, specimen_type, examination_type, accounting_category,
    pregnancy_alert, attention, examination_notes
) values (
    362387869795105, 362387869790209, 'TREATMENT', 'INJECTION', 'OUTPATIENT', false,
    false, true, null, null, 'TREATMENT', false, '执行前核对患者身份及用药信息', null
);

insert into organization_catalog_items (
    id, revision, tenant_id, organization_id, catalog_item_id, default_department_id, local_code,
    local_name, orderable, executable, chargeable, purchasable, stocked, dispensable, returnable,
    status, valid_from, valid_to, created_at, created_by, updated_at, updated_by, replaces_adoption_id
) values (
    362387869795505, 0, 362387869790209, 362387869790211, 362387869795105,
    362387869790212, 'OPD-INJ', '门诊注射', true, true, true, false, false, false, false,
    'ACTIVE', '2026-01-01', null, current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, null
);

insert into catalog_prices (
    id, revision, tenant_id, catalog_item_id, organization_id, package_id, price_type, price,
    currency_code, price_document_code, price_reason, valid_from, valid_to, status,
    created_at, created_by, updated_at, updated_by, replaces_price_id
) values (
    362387869795605, 0, 362387869790209, 362387869795105, 362387869790211, null,
    'SALE', 6.00, 'CNY', 'DEMO-PRICE-2026', '基层门诊治疗体验数据', '2026-01-01', null,
    'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222, null
);

insert into item_attribute_subjects
select 362387869797415, tenant_id, 'CATALOG_ITEM',
       'TENANT:' || tenant_id || '/CATALOG_ITEM:' || id,
       null, null, id, null, current_timestamp, 362387869790222
from catalog_items where id = 362387869795105;

-- A stocked injectable makes the complete prescription -> settlement -> pharmacy -> treatment flow directly testable.
insert into catalog_items (
    id, revision, tenant_id, code, name, item_type, unit_code, orderable, chargeable, stocked,
    status, valid_from, valid_to, created_at, created_by, updated_at, updated_by, item_type_id, item_master_id
) values (
    362387869795114, 0, 362387869790209, 'MED-VB1-INJ', '维生素B1注射液 100mg/2ml', 'MED_PRODUCT', '支',
    true, true, true, 'ACTIVE', '2026-01-01', null, current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869797007, null
);

insert into medications (
    id, revision, tenant_id, code, name, alias_name, medication_type, dose_form,
    preparation_spec, preparation_unit, strength_value, strength_unit, prescription_drug,
    essential_drug, antimicrobial, skin_test_required, default_dose, default_dose_unit,
    default_route, default_frequency, status, created_at, created_by, updated_at, updated_by,
    item_type_id, item_master_id
) values (
    362387869795204, 0, 362387869790209, 'DRUG-VB1-INJ', '维生素B1注射液', null,
    'WESTERN', 'INJECTION', '100mg/2ml', '支', 100, 'mg', true, true, false, false,
    100, 'mg', 'IM', 'QD', 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869797012, null
);

insert into medication_western (medication_id, tenant_id, active_ingredient, therapeutic_class, biologic, biosimilar)
values (362387869795204, 362387869790209, '维生素B1', 'VITAMIN', false, false);

insert into medication_products (
    catalog_item_id, tenant_id, medication_id, manufacturer_id, trade_name, approval_code,
    otc, central_purchase, import_allowed, trace_split_required, indication
) values (
    362387869795114, 362387869790209, 362387869795204, 362387869795301,
    '维生素B1注射液', '国药准字H00000004', false, false, false, false, '维生素B1缺乏的辅助治疗'
);

insert into item_packages (
    id, tenant_id, catalog_item_id, base_package_id, unit_code, unit_name, package_spec,
    quantity_factor, usage_type, barcode, default_purchase, default_sale, default_dispense,
    status, valid_from, valid_to
) values (
    362387869795404, 362387869790209, 362387869795114, null, 'AMP', '支', '2ml/支',
    1, 'DISPENSE', '6900000000014', true, true, true, 'ACTIVE', '2026-01-01', null
);

insert into organization_catalog_items (
    id, revision, tenant_id, organization_id, catalog_item_id, default_department_id, local_code,
    local_name, orderable, executable, chargeable, purchasable, stocked, dispensable, returnable,
    status, valid_from, valid_to, created_at, created_by, updated_at, updated_by, replaces_adoption_id
) values (
    362387869795514, 0, 362387869790209, 362387869790211, 362387869795114,
    362387869790212, 'P-VB1-INJ', '维生素B1注射液', true, false, true, true, true, true, true,
    'ACTIVE', '2026-01-01', null, current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, null
);

insert into catalog_prices (
    id, revision, tenant_id, catalog_item_id, organization_id, package_id, price_type, price,
    currency_code, price_document_code, price_reason, valid_from, valid_to, status,
    created_at, created_by, updated_at, updated_by, replaces_price_id
) values (
    362387869795614, 0, 362387869790209, 362387869795114, 362387869790211, 362387869795404,
    'SALE', 1.20, 'CNY', 'DEMO-PRICE-2026', '基层门诊治疗体验数据', '2026-01-01', null,
    'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222, null
);

insert into item_attribute_subjects
select 362387869797416, tenant_id, 'CATALOG_ITEM',
       'TENANT:' || tenant_id || '/CATALOG_ITEM:' || id,
       null, null, id, null, current_timestamp, 362387869790222
from catalog_items where id = 362387869795114;

insert into item_attribute_subjects
select 362387869797417, tenant_id, 'MEDICATION',
       'TENANT:' || tenant_id || '/MEDICATION:' || id,
       null, id, null, null, current_timestamp, 362387869790222
from medications where id = 362387869795204;

insert into stock_items (
    id, revision, tenant_id, stock_site_id, catalog_item_id, base_package_id, base_unit_code,
    issue_policy, negative_allowed, lot_required, trace_required, split_allowed, cold_chain,
    controlled, control_level, high_alert, status, created_at, created_by, updated_at, updated_by
) values (
    362387869799608, 0, 362387869790209, 362387869799502, 362387869795114,
    362387869795404, '支', 'FEFO', false, true, false, false, false, false, null, false,
    'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into stock_lots (
    id, revision, tenant_id, catalog_item_id, package_id, lot_no, production_date, expiry_date,
    approval_code_snapshot, manufacturer_name_snapshot, quality_status, quality_at,
    quality_user_id, status, created_at, created_by
) values (
    362387869799609, 0, 362387869790209, 362387869795114, 362387869795404,
    'DEMO-VB1-202608', date '2026-01-01', date '2099-12-31', '国药准字H00000004',
    '示范制药有限公司', 'QUALIFIED', current_timestamp, 362387869790222,
    'ACTIVE', current_timestamp, 362387869790222
);

insert into inventory_transactions (
    id, tenant_id, inventory_period_id, reverses_transaction_id, transaction_no, request_code,
    transaction_type, source_type, source_code, occurred_at, posted_at, posted_by, description
) values (
    362387869799610, 362387869790209, 362387869799604, null,
    'DEMO-OPD-VB1-202608', 'DEMO-OPD-VB1-202608', 'RECEIPT', 'OPENING',
    'DEMO-OPD-VB1', current_timestamp, current_timestamp, 362387869790222,
    '门诊注射体验药品期初入库'
);

insert into inventory_transaction_lines (
    id, tenant_id, inventory_transaction_id, sort_order, stock_site_id, stock_bin_id,
    stock_item_id, stock_lot_id, package_id, stock_status, operation_quantity,
    operation_unit_code, base_quantity_factor, quantity_delta, unit_cost, amount_delta
) values (
    362387869799611, 362387869790209, 362387869799610, 1, 362387869799502,
    362387869799602, 362387869799608, 362387869799609, 362387869795404,
    'AVAILABLE', 100, 'AMP', 1, 100, 0.800000, 80.000000
);

insert into inventory_balances (
    id, revision, tenant_id, stock_site_id, stock_bin_id, stock_item_id, stock_lot_id,
    stock_status, base_unit_code, quantity_on_hand, quantity_reserved, quantity_frozen,
    quantity_available, average_unit_cost, projected_at
) values (
    362387869799612, 0, 362387869790209, 362387869799502, 362387869799602,
    362387869799608, 362387869799609, 'AVAILABLE', '支', 100, 0, 0, 100,
    0.800000, current_timestamp
);

insert into management_modules (id, tenant_id, parent_id, code, name, module_type, route_path,
    component_code, icon_code, sort_order, status, created_at, updated_at, version) values
(362387869896023, 362387869790209, 362387869896001, 'TREATMENT_EXECUTION', '治疗执行', 'MODULE',
 '/treatments', 'TreatmentExecutionWorkspace', 'clinical', 25, 'ACTIVE', current_timestamp, current_timestamp, 0);

update management_modules set sort_order = 26
 where tenant_id = 362387869790209 and code = 'BILLING';

insert into access_permissions (id, tenant_id, management_module_id, code, name,
    action_code, resource_code, status) values
(362387869896126, 362387869790209, 362387869896023, 'TREATMENT.ACCESS',
 '访问治疗执行工作台', 'ACCESS', 'TREATMENT_EXECUTION', 'ACTIVE');

insert into role_permission_assignments (id, tenant_id, role_id, permission_id,
    valid_from, valid_to, granted_by, created_at) values
(362387869896226, 362387869790209, 362387869796001, 362387869896126,
 current_timestamp, null, 362387869790222, current_timestamp);
