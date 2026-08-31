-- Reuse the append-only nursing fact stream for structured admission nursing assessments.
alter table inpatient_nursing_records add assessment_json clob;

alter table inpatient_nursing_records drop constraint ck_inr_type;
alter table inpatient_nursing_records add constraint ck_inr_type check (record_type in (
    'ASSESSMENT', 'ROUTINE', 'CONDITION', 'INTERVENTION', 'MEDICATION', 'SAFETY', 'EDUCATION', 'OTHER'
));

alter table inpatient_nursing_records add constraint ck_inr_assessment check (
    (record_type = 'ASSESSMENT' and assessment_json is not null)
    or (record_type <> 'ASSESSMENT' and assessment_json is null)
);
