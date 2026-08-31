alter table clinical_documents add column instance_key varchar(100) default 'DEFAULT' not null;

alter table clinical_documents add constraint uk_encounter_document_instance
    unique (tenant_id, encounter_id, document_type, instance_key);

alter table clinical_documents drop constraint uk_encounter_document_type;
