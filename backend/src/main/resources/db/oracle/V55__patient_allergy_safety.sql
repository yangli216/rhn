alter table encounters add constraint uk_encounter_tenant_resident_id unique (tenant_id,resident_id,id);

create table allergy_intolerances (
 id number(19,0) primary key, revision number(19,0) default 0 not null,
 tenant_id number(19,0) not null, resident_id number(19,0) not null, encounter_id number(19,0),
 assertion_type varchar2(32 char) not null, category_code varchar2(32 char),
 clinical_status varchar2(32 char) not null, verification_status varchar2(32 char) not null,
 criticality_code varchar2(32 char), reaction_severity varchar2(32 char), information_source varchar2(32 char) not null,
 substance_code_system_uri varchar2(300 char), substance_code varchar2(128 char), substance_display varchar2(300 char),
 reaction_text varchar2(1000 char), onset_at timestamp with time zone, recorded_at timestamp with time zone not null,
 recorder_practitioner_id number(19,0), recorder_user_id number(19,0) not null,
 verified_at timestamp with time zone, verifier_practitioner_id number(19,0),
 inactivated_at timestamp with time zone, inactivated_by number(19,0), inactivation_reason varchar2(1000 char),
 constraint fk_allergy_tenant foreign key (tenant_id) references tenants(id),
 constraint fk_allergy_resident foreign key (tenant_id,resident_id) references residents(tenant_id,id),
 constraint fk_allergy_encounter foreign key (tenant_id,resident_id,encounter_id) references encounters(tenant_id,resident_id,id),
 constraint fk_allergy_rec_pract foreign key (tenant_id,recorder_practitioner_id) references practitioners(tenant_id,id),
 constraint fk_allergy_rec_user foreign key (tenant_id,recorder_user_id) references user_accounts(tenant_id,id),
 constraint fk_allergy_ver_pract foreign key (tenant_id,verifier_practitioner_id) references practitioners(tenant_id,id),
 constraint fk_allergy_inact_user foreign key (tenant_id,inactivated_by) references user_accounts(tenant_id,id),
 constraint uk_allergy_tenant_id unique (tenant_id,id),
 constraint ck_allergy_assertion check (assertion_type in ('ALLERGY','NO_KNOWN_ALLERGY','NO_KNOWN_DRUG_ALLERGY')),
 constraint ck_allergy_category check (category_code is null or category_code in ('DRUG','FOOD','ENVIRONMENT','BIOLOGIC','OTHER')),
 constraint ck_allergy_clinical check (clinical_status in ('ACTIVE','INACTIVE')),
 constraint ck_allergy_verification check (verification_status in ('UNCONFIRMED','CONFIRMED','REFUTED','ENTERED_IN_ERROR')),
 constraint ck_allergy_criticality check (criticality_code is null or criticality_code in ('LOW','HIGH','UNABLE_TO_ASSESS')),
 constraint ck_allergy_severity check (reaction_severity is null or reaction_severity in ('MILD','MODERATE','SEVERE')),
 constraint ck_allergy_source check (information_source in ('PATIENT','FAMILY','MEDICAL_RECORD','CLINICIAN')),
 constraint ck_allergy_active_state check ((clinical_status='ACTIVE' and inactivated_at is null and inactivated_by is null and inactivation_reason is null) or (clinical_status='INACTIVE' and inactivated_at is not null and inactivated_by is not null and inactivation_reason is not null))
);
create index idx_allergy_resident_active on allergy_intolerances(tenant_id,resident_id,clinical_status,recorded_at);
create index idx_allergy_substance on allergy_intolerances(tenant_id,resident_id,category_code,substance_code);
