alter table encounter_diagnoses add (diagnosis_stage varchar2(32 char) default 'ENCOUNTER' not null);
alter table encounter_diagnoses add constraint ck_enc_diag_stage
    check (diagnosis_stage in ('ENCOUNTER','ADMISSION','DISCHARGE'));
create index idx_enc_diag_stage_curr on encounter_diagnoses
    (tenant_id,encounter_id,diagnosis_stage,diagnosis_status,diagnosis_type,recorded_at);

alter table encounter_diagnosis_revisions add (diagnosis_stage varchar2(32 char) default 'ENCOUNTER' not null);
alter table encounter_diagnosis_revisions add constraint ck_enc_diag_rev_stage
    check (diagnosis_stage in ('ENCOUNTER','ADMISSION','DISCHARGE'));
