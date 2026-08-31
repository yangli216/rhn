-- Registration must preserve the selected responsibility route before an encounter exists.
-- A medical-insurance route references the resident's active coverage; patient payment methods
-- remain a later, independent choice for the personal-pay portion.
alter table registration_billing_intents add column settlement_mode varchar(32) default 'SELF_PAY' not null;
alter table registration_billing_intents add column coverage_id bigint;
alter table registration_billing_intents add column coverage_type_code_snapshot varchar(64);
alter table registration_billing_intents add column coverage_payer_name_snapshot varchar(200);

alter table registration_billing_intents add constraint fk_reg_bill_coverage
    foreign key (tenant_id, coverage_id) references resident_coverages(tenant_id, id);
alter table registration_billing_intents add constraint ck_reg_bill_settlement_mode
    check (settlement_mode in ('SELF_PAY', 'MEDICAL_INSURANCE'));
alter table registration_billing_intents add constraint ck_reg_bill_coverage_mode check (
       (settlement_mode = 'SELF_PAY' and coverage_id is null
        and coverage_type_code_snapshot is null and coverage_payer_name_snapshot is null)
    or (settlement_mode = 'MEDICAL_INSURANCE' and coverage_id is not null
        and coverage_type_code_snapshot is not null and coverage_payer_name_snapshot is not null)
);

create index idx_reg_bill_coverage on registration_billing_intents
    (tenant_id, coverage_id, status, created_at);
