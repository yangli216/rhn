alter table insurance_claims add column reversal_reason varchar(500);
alter table insurance_claims add column reversed_at timestamp with time zone;

alter table insurance_claims add constraint ck_ins_claim_reversal_fact check (
    (status = 'REVERSED' and reversal_reason is not null and reversed_at is not null)
 or (status = 'REVERSAL_PENDING' and reversal_reason is not null and reversed_at is null)
 or (status not in ('REVERSAL_PENDING', 'REVERSED') and reversed_at is null)
);
