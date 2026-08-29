create table clinical_documents (
    id bigint primary key,
    tenant_id bigint not null,
    resident_id bigint not null,
    encounter_id bigint,
    organization_id bigint,
    department_id bigint,
    document_type varchar(100) not null,
    title varchar(300) not null,
    status varchar(32) not null,
    current_version integer not null,
    created_by varchar(100) not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    version bigint not null default 0,
    constraint fk_clinical_document_resident foreign key (resident_id) references residents(id),
    constraint fk_clinical_document_encounter foreign key (encounter_id) references encounters(id),
    constraint uk_encounter_document_type unique (tenant_id, encounter_id, document_type)
);

create index idx_clinical_document_resident on clinical_documents
    (tenant_id, resident_id, updated_at desc);

create table clinical_document_versions (
    id bigint primary key,
    tenant_id bigint not null,
    document_id bigint not null,
    version_number integer not null,
    content_json text not null,
    content_schema varchar(100) not null,
    change_type varchar(32) not null,
    change_reason varchar(500) not null,
    created_by varchar(100) not null,
    created_at timestamp with time zone not null,
    signed_by varchar(100),
    signed_at timestamp with time zone,
    signature_meaning varchar(100),
    constraint fk_document_version_document foreign key (document_id) references clinical_documents(id),
    constraint uk_document_version unique (document_id, version_number)
);

create index idx_document_version_history on clinical_document_versions
    (tenant_id, document_id, version_number desc);
