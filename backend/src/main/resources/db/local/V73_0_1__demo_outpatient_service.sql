insert into catalog_items (
    id, revision, tenant_id, code, name, item_type, unit_code, orderable, chargeable, stocked,
    status, valid_from, valid_to, created_at, created_by, updated_at, updated_by, item_type_id, item_master_id
) values
    (362387869795104, 0, 362387869790209, 'SRV-OPD-GP', '全科门诊诊查', 'SERVICE', '次',
     true, true, false, 'ACTIVE', '2026-01-01', null, current_timestamp, 362387869790222,
     current_timestamp, 362387869790222, 362387869797005, null);

insert into service_items (
    catalog_item_id, tenant_id, service_type, service_subtype, usage_type, medical_technology,
    combination_item, single_order, specimen_type, examination_type, accounting_category,
    pregnancy_alert, attention, examination_notes
) values (
    362387869795104, 362387869790209, 'PROCEDURE', 'OUTPATIENT_VISIT', 'OUTPATIENT', false,
    false, true, null, null, 'REGISTRATION', false, '用于基层全科门诊排班与挂号', null
);

insert into organization_catalog_items (
    id, revision, tenant_id, organization_id, catalog_item_id, default_department_id, local_code,
    local_name, orderable, executable, chargeable, purchasable, stocked, dispensable, returnable,
    status, valid_from, valid_to, created_at, created_by, updated_at, updated_by, replaces_adoption_id
) values
    (362387869795504, 0, 362387869790209, 362387869790211, 362387869795104,
     362387869790212, 'OPD-GP', '全科门诊', true, true, true, false, false, false, false,
     'ACTIVE', '2026-01-01', null, current_timestamp, 362387869790222,
     current_timestamp, 362387869790222, null);

insert into catalog_prices (
    id, revision, tenant_id, catalog_item_id, organization_id, package_id, price_type, price,
    currency_code, price_document_code, price_reason, valid_from, valid_to, status,
    created_at, created_by, updated_at, updated_by, replaces_price_id
) values
    (362387869795604, 0, 362387869790209, 362387869795104, 362387869790211, null,
     'SALE', 10.00, 'CNY', 'DEMO-PRICE-2026', '基层全科门诊体验挂号费', '2026-01-01', null,
     'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222, null);

insert into item_attribute_subjects
select 362387869797414, tenant_id, 'CATALOG_ITEM',
       'TENANT:' || tenant_id || '/CATALOG_ITEM:' || id,
       null, null, id, null, current_timestamp, 362387869790222
from catalog_items where id = 362387869795104;
