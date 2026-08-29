alter table ledger_entries add column claim_response_id bigint;
alter table ledger_entries add constraint fk_ledger_claim_response
    foreign key (tenant_id, claim_response_id) references insurance_claim_responses(tenant_id, id);
alter table ledger_entries drop constraint ck_ledger_type;
alter table ledger_entries add constraint ck_ledger_type check (entry_type in (
    'CHARGE', 'CHARGE_REVERSAL', 'PAYMENT', 'PAYMENT_REFUND',
    'INSURANCE_FUND', 'PERSONAL_ACCOUNT', 'OTHER_FUND'));
alter table ledger_entries drop constraint ck_ledger_source;
alter table ledger_entries add constraint ck_ledger_source check (
    (case when charge_item_id is null then 0 else 1 end)
  + (case when payment_id is null then 0 else 1 end)
  + (case when claim_response_id is null then 0 else 1 end) = 1);
create unique index uk_ledger_claim_type
    on ledger_entries (tenant_id, claim_response_id, entry_type);
create index idx_ledger_claim_response on ledger_entries (tenant_id, claim_response_id);
