alter table receipts add column external_receipt_no varchar(128);
alter table receipt_events add column action_reason varchar(500);

alter table receipts drop constraint ck_receipt_amount;
alter table receipts add constraint ck_receipt_amount check (receipt_amount <> 0);

create unique index uk_receipt_external_no
    on receipts (tenant_id, fiscal_authority_code, external_receipt_no);

create unique index uk_receipt_single_reversal
    on receipts (tenant_id, reverses_receipt_id);
