create table cryptographic_evidence (
    id bigint primary key,
    tenant_id bigint not null,
    target_type varchar(128) not null,
    target_id bigint not null,
    target_version_no bigint,
    operation_code varchar(64) not null,
    protection_profile varchar(128) not null,
    protection_purpose varchar(32) not null,
    content_schema varchar(128) not null,
    content_digest_algorithm varchar(64) not null,
    content_digest varchar(512) not null,
    statement_version integer not null,
    statement_json text not null,
    statement_digest_algorithm varchar(64) not null,
    statement_digest varchar(512) not null,
    previous_evidence_id bigint,
    provider_code varchar(128) not null,
    provider_assurance varchar(64) not null,
    signature_algorithm varchar(128) not null,
    signature_value text not null,
    key_id varchar(256) not null,
    signer_type varchar(32) not null,
    signer_subject_id bigint,
    signer_name varchar(300) not null,
    verification_material text,
    certificate_serial varchar(256),
    certificate_issuer varchar(500),
    signed_at timestamp with time zone not null,
    timestamp_authority varchar(300),
    timestamp_token text,
    correlation_id varchar(64) not null,
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

alter table clinical_document_versions add column content_digest_algorithm varchar(64);
alter table clinical_document_versions add column content_digest varchar(512);
alter table clinical_document_versions add column integrity_evidence_id bigint;
alter table clinical_document_versions add column signature_evidence_id bigint;

alter table clinical_document_versions add constraint fk_document_integrity_evidence_tenant
    foreign key (tenant_id, integrity_evidence_id) references cryptographic_evidence(tenant_id, id);
alter table clinical_document_versions add constraint fk_document_signature_evidence_tenant
    foreign key (tenant_id, signature_evidence_id) references cryptographic_evidence(tenant_id, id);

create unique index uk_document_integrity_evidence on clinical_document_versions (integrity_evidence_id);
create unique index uk_document_signature_evidence on clinical_document_versions (signature_evidence_id);
