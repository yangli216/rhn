insert into item_attribute_subjects (
    id, tenant_id, subject_type, subject_key, item_master_id, medication_id,
    catalog_item_id, service_variant_id, created_at, created_by
)
select 362387869797401, tenant_id, 'CATALOG_ITEM', 'TENANT:' || tenant_id || '/CATALOG_ITEM:' || id,
       null, null, id, null, current_timestamp, 362387869790222 from catalog_items where id = 362387869795101;
insert into item_attribute_subjects select 362387869797402, tenant_id, 'CATALOG_ITEM', 'TENANT:' || tenant_id || '/CATALOG_ITEM:' || id, null, null, id, null, current_timestamp, 362387869790222 from catalog_items where id = 362387869795102;
insert into item_attribute_subjects select 362387869797403, tenant_id, 'CATALOG_ITEM', 'TENANT:' || tenant_id || '/CATALOG_ITEM:' || id, null, null, id, null, current_timestamp, 362387869790222 from catalog_items where id = 362387869795103;
insert into item_attribute_subjects select 362387869797404, tenant_id, 'CATALOG_ITEM', 'TENANT:' || tenant_id || '/CATALOG_ITEM:' || id, null, null, id, null, current_timestamp, 362387869790222 from catalog_items where id = 362387869795111;
insert into item_attribute_subjects select 362387869797405, tenant_id, 'CATALOG_ITEM', 'TENANT:' || tenant_id || '/CATALOG_ITEM:' || id, null, null, id, null, current_timestamp, 362387869790222 from catalog_items where id = 362387869795112;
insert into item_attribute_subjects select 362387869797406, tenant_id, 'CATALOG_ITEM', 'TENANT:' || tenant_id || '/CATALOG_ITEM:' || id, null, null, id, null, current_timestamp, 362387869790222 from catalog_items where id = 362387869795113;
insert into item_attribute_subjects select 362387869797411, tenant_id, 'MEDICATION', 'TENANT:' || tenant_id || '/MEDICATION:' || id, null, id, null, null, current_timestamp, 362387869790222 from medications where id = 362387869795201;
insert into item_attribute_subjects select 362387869797412, tenant_id, 'MEDICATION', 'TENANT:' || tenant_id || '/MEDICATION:' || id, null, id, null, null, current_timestamp, 362387869790222 from medications where id = 362387869795202;
insert into item_attribute_subjects select 362387869797413, tenant_id, 'MEDICATION', 'TENANT:' || tenant_id || '/MEDICATION:' || id, null, id, null, null, current_timestamp, 362387869790222 from medications where id = 362387869795203;
insert into item_attribute_subjects select 362387869797421, tenant_id, 'SERVICE_VARIANT', 'TENANT:' || tenant_id || '/SERVICE_VARIANT:' || id, null, null, null, id, current_timestamp, 362387869790222 from service_variants where id = 362387869797303;
