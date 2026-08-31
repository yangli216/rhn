alter table clinical_documents add (instance_key varchar2(100 char) default 'DEFAULT' not null);

alter table clinical_documents add constraint uk_encounter_document_instance
    unique (tenant_id, encounter_id, document_type, instance_key);

alter table clinical_documents drop constraint uk_encounter_document_type;
