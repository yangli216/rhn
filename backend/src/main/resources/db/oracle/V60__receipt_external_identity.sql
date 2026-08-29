alter table receipts add (external_receipt_no varchar2(128 char));
alter table receipt_events add (action_reason varchar2(500 char));

alter table receipts drop constraint ck_receipt_amount;
alter table receipts add constraint ck_receipt_amount check (receipt_amount <> 0);

create unique index uk_receipt_external_no
    on receipts (tenant_id, fiscal_authority_code, external_receipt_no);

drop index idx_receipt_reverse;
create unique index uk_receipt_single_reversal
    on receipts (tenant_id, reverses_receipt_id);
