alter table encounter_diagnoses add column diagnosis_stage varchar(32) default 'ENCOUNTER' not null;
alter table encounter_diagnoses add constraint ck_enc_diag_stage
    check (diagnosis_stage in ('ENCOUNTER', 'ADMISSION', 'DISCHARGE'));
create index idx_enc_diag_stage_current on encounter_diagnoses
    (tenant_id, encounter_id, diagnosis_stage, diagnosis_status, diagnosis_type, recorded_at);

alter table encounter_diagnosis_revisions add column diagnosis_stage varchar(32) default 'ENCOUNTER' not null;
alter table encounter_diagnosis_revisions add constraint ck_enc_diag_rev_stage
    check (diagnosis_stage in ('ENCOUNTER', 'ADMISSION', 'DISCHARGE'));
