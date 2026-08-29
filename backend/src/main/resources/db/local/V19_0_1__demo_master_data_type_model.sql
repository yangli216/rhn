update laboratory_services set laboratory_method = 'HEMATOLOGY'
where catalog_item_id = 362387869795101;
update laboratory_services set laboratory_method = 'BIOCHEMISTRY', fasting_required = true
where catalog_item_id = 362387869795102;

insert into laboratory_service_specimens (
    id, tenant_id, catalog_item_id, specimen_item_id, container_item_id,
    minimum_quantity, minimum_quantity_unit, default_specimen, required_specimen,
    sort_order, collection_description, status
) values
    (362387869797301, 362387869790209, 362387869795101, 362387869797111, 362387869797121, 2, 'mL', true, true, 10, '采集抗凝全血并充分混匀。', 'ACTIVE'),
    (362387869797302, 362387869790209, 362387869795102, 362387869797112, 362387869797122, 2, 'mL', true, true, 10, '按临床要求空腹采集血清。', 'ACTIVE');

update examination_services
set examination_type = 'ULTRASOUND', body_site_required = true, preparation_description = '检查前按申请要求空腹。'
where catalog_item_id = 362387869795103;

insert into service_variants (
    id, tenant_id, catalog_item_id, body_site_concept_id, code, name, method_type,
    body_site_required, mutual_recognition_code, sort_order, status
) values (
    362387869797303, 362387869790209, 362387869795103, null, 'ABDOMEN', '腹部',
    'STANDARD', true, null, 10, 'ACTIVE'
);
