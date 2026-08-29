create table clinical_documents (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    resident_id number(19,0) not null,
    encounter_id number(19,0),
    organization_id number(19,0),
    department_id number(19,0),
    document_type varchar2(100 char) not null,
    title varchar2(300 char) not null,
    status varchar2(32 char) not null,
    current_version number(10,0) not null,
    created_by varchar2(100 char) not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    version number(19,0) default 0 not null,
    constraint fk_clinical_document_resident foreign key (resident_id) references residents(id),
    constraint fk_clinical_document_encounter foreign key (encounter_id) references encounters(id),
    constraint uk_encounter_document_type unique (tenant_id, encounter_id, document_type)
);

create index idx_clinical_document_resident on clinical_documents
    (tenant_id, resident_id, updated_at desc);

create table clinical_document_versions (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    document_id number(19,0) not null,
    version_number number(10,0) not null,
    content_json clob not null,
    content_schema varchar2(100 char) not null,
    change_type varchar2(32 char) not null,
    change_reason varchar2(500 char) not null,
    created_by varchar2(100 char) not null,
    created_at timestamp with time zone not null,
    signed_by varchar2(100 char),
    signed_at timestamp with time zone,
    signature_meaning varchar2(100 char),
    constraint fk_document_version_document foreign key (document_id) references clinical_documents(id),
    constraint uk_document_version unique (document_id, version_number)
);

create index idx_document_version_history on clinical_document_versions
    (tenant_id, document_id, version_number desc);
