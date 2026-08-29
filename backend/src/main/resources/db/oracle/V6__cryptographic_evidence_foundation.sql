create table cryptographic_evidence (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    target_type varchar2(128 char) not null,
    target_id number(19,0) not null,
    target_version_no number(19,0),
    operation_code varchar2(64 char) not null,
    protection_profile varchar2(128 char) not null,
    protection_purpose varchar2(32 char) not null,
    content_schema varchar2(128 char) not null,
    content_digest_algorithm varchar2(64 char) not null,
    content_digest varchar2(512 char) not null,
    statement_version number(10,0) not null,
    statement_json clob not null,
    statement_digest_algorithm varchar2(64 char) not null,
    statement_digest varchar2(512 char) not null,
    previous_evidence_id number(19,0),
    provider_code varchar2(128 char) not null,
    provider_assurance varchar2(64 char) not null,
    signature_algorithm varchar2(128 char) not null,
    signature_value clob not null,
    key_id varchar2(256 char) not null,
    signer_type varchar2(32 char) not null,
    signer_subject_id number(19,0),
    signer_name varchar2(300 char) not null,
    verification_material clob,
    certificate_serial varchar2(256 char),
    certificate_issuer varchar2(500 char),
    signed_at timestamp with time zone not null,
    timestamp_authority varchar2(300 char),
    timestamp_token clob,
    correlation_id varchar2(64 char) not null,
    recorded_at timestamp with time zone not null,
    constraint fk_crypto_evidence_tenant foreign key (tenant_id) references tenants(id),
    constraint uk_crypto_evidence_tenant_id unique (tenant_id, id),
    constraint fk_crypto_evidence_previous_tenant foreign key (tenant_id, previous_evidence_id)
        references cryptographic_evidence(tenant_id, id),
    constraint ck_crypto_evidence_purpose
        check (protection_purpose in ('INTEGRITY', 'NON_REPUDIATION')),
    constraint ck_crypto_evidence_signer_type
        check (signer_type in ('PERSON', 'ORGANIZATION', 'SYSTEM'))
);

create index idx_crypto_evidence_target on cryptographic_evidence
    (tenant_id, target_type, target_id, recorded_at, id);
create index idx_crypto_evidence_signer on cryptographic_evidence
    (tenant_id, signer_subject_id, signed_at);
create index idx_crypto_evidence_key on cryptographic_evidence
    (provider_code, key_id, signed_at);

alter table clinical_document_versions add content_digest_algorithm varchar2(64 char);
alter table clinical_document_versions add content_digest varchar2(512 char);
alter table clinical_document_versions add integrity_evidence_id number(19,0);
alter table clinical_document_versions add signature_evidence_id number(19,0);

alter table clinical_document_versions add constraint fk_document_integrity_evidence_tenant
    foreign key (tenant_id, integrity_evidence_id) references cryptographic_evidence(tenant_id, id);
alter table clinical_document_versions add constraint fk_document_signature_evidence_tenant
    foreign key (tenant_id, signature_evidence_id) references cryptographic_evidence(tenant_id, id);

create unique index uk_document_integrity_evidence on clinical_document_versions (integrity_evidence_id);
create unique index uk_document_signature_evidence on clinical_document_versions (signature_evidence_id);
