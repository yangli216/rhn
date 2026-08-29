-- Patient allergy facts aligned with nextgen vis.allergy_intolerance.
alter table encounters add constraint uk_encounter_tenant_resident_id
    unique (tenant_id, resident_id, id);
create table allergy_intolerances (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    resident_id bigint not null,
    encounter_id bigint,
    assertion_type varchar(32) not null,
    category_code varchar(32),
    clinical_status varchar(32) not null,
    verification_status varchar(32) not null,
    criticality_code varchar(32),
    reaction_severity varchar(32),
    information_source varchar(32) not null,
    substance_code_system_uri varchar(300),
    substance_code varchar(128),
    substance_display varchar(300),
    reaction_text varchar(1000),
    onset_at timestamp with time zone,
    recorded_at timestamp with time zone not null,
    recorder_practitioner_id bigint,
    recorder_user_id bigint not null,
    verified_at timestamp with time zone,
    verifier_practitioner_id bigint,
    inactivated_at timestamp with time zone,
    inactivated_by bigint,
    inactivation_reason varchar(1000),
    constraint fk_allergy_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_allergy_resident foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_allergy_encounter foreign key (tenant_id, resident_id, encounter_id)
        references encounters(tenant_id, resident_id, id),
    constraint fk_allergy_rec_pract foreign key (tenant_id, recorder_practitioner_id) references practitioners(tenant_id, id),
    constraint fk_allergy_rec_user foreign key (tenant_id, recorder_user_id) references user_accounts(tenant_id, id),
    constraint fk_allergy_ver_pract foreign key (tenant_id, verifier_practitioner_id) references practitioners(tenant_id, id),
    constraint fk_allergy_inact_user foreign key (tenant_id, inactivated_by) references user_accounts(tenant_id, id),
    constraint uk_allergy_tenant_id unique (tenant_id, id),
    constraint ck_allergy_assertion check (assertion_type in ('ALLERGY', 'NO_KNOWN_ALLERGY', 'NO_KNOWN_DRUG_ALLERGY')),
    constraint ck_allergy_category check (category_code is null or category_code in ('DRUG', 'FOOD', 'ENVIRONMENT', 'BIOLOGIC', 'OTHER')),
    constraint ck_allergy_clinical check (clinical_status in ('ACTIVE', 'INACTIVE')),
    constraint ck_allergy_verification check (verification_status in ('UNCONFIRMED', 'CONFIRMED', 'REFUTED', 'ENTERED_IN_ERROR')),
    constraint ck_allergy_criticality check (criticality_code is null or criticality_code in ('LOW', 'HIGH', 'UNABLE_TO_ASSESS')),
    constraint ck_allergy_severity check (reaction_severity is null or reaction_severity in ('MILD', 'MODERATE', 'SEVERE')),
    constraint ck_allergy_source check (information_source in ('PATIENT', 'FAMILY', 'MEDICAL_RECORD', 'CLINICIAN')),
    constraint ck_allergy_active_state check (
        (clinical_status = 'ACTIVE' and inactivated_at is null and inactivated_by is null and inactivation_reason is null) or
        (clinical_status = 'INACTIVE' and inactivated_at is not null and inactivated_by is not null and inactivation_reason is not null)
    )
);
create index idx_allergy_resident_active on allergy_intolerances
    (tenant_id, resident_id, clinical_status, recorded_at);
create index idx_allergy_substance on allergy_intolerances
    (tenant_id, resident_id, category_code, substance_code);
