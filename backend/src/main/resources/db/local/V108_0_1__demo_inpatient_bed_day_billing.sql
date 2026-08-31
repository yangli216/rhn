insert into catalog_items (
    id, revision, tenant_id, code, name, item_type, unit_code, orderable, chargeable, stocked,
    status, valid_from, valid_to, created_at, created_by, updated_at, updated_by, item_type_id, item_master_id
) values (
    362387869898520, 0, 362387869790209, 'BED-DAY-GENERAL', '普通床位费', 'SERVICE', '床日',
    false, true, false, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869797002, null
);

insert into service_items (
    catalog_item_id, tenant_id, service_type, service_subtype, usage_type, medical_technology,
    combination_item, single_order, accounting_category, pregnancy_alert
) values (
    362387869898520, 362387869790209, 'OTHER', 'BED_DAY', 'INPATIENT', false,
    false, true, 'BED', false
);

insert into organization_catalog_items (
    id, revision, tenant_id, organization_id, catalog_item_id, default_department_id, local_code,
    local_name, orderable, executable, chargeable, purchasable, stocked, dispensable, returnable,
    status, valid_from, valid_to, created_at, created_by, updated_at, updated_by, replaces_adoption_id
) values (
    362387869898521, 0, 362387869790209, 362387869790211, 362387869898520,
    362387869898501, 'BED-DAY', '普通床位费', false, false, true, false, false, false, false,
    'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, null
);

insert into catalog_prices (
    id, revision, tenant_id, catalog_item_id, organization_id, package_id, price_type, price,
    currency_code, price_document_code, price_reason, valid_from, valid_to, status,
    created_at, created_by, updated_at, updated_by, replaces_price_id
) values (
    362387869898522, 0, 362387869790209, 362387869898520, 362387869790211, null,
    'SALE', 20.00, 'CNY', 'DEMO-BED-PRICE-2026', '基层住院床日体验价格', date '2026-01-01', null,
    'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222, null
);

update inpatient_bed_profiles
   set charge_catalog_item_id = 362387869898520
 where tenant_id = 362387869790209;
