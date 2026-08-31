alter table patient_accounts drop constraint uk_pat_acct_enc_currency;
create unique index uk_pat_acct_enc_nonnull on patient_accounts (
    case when encounter_id is not null then tenant_id end,
    case when encounter_id is not null then encounter_id end,
    case when encounter_id is not null then currency_code end
);

alter table ledger_entries drop constraint uk_ledger_payment;
create unique index uk_ledger_pay_nonnull on ledger_entries (
    case when payment_id is not null then tenant_id end,
    case when payment_id is not null then payment_id end
);

alter table payments drop constraint uk_payment_order_fact;
create unique index uk_payment_order_nonnull on payments (
    case when payment_order_id is not null then tenant_id end,
    case when payment_order_id is not null then payment_order_id end
);

alter table settlement_tenders drop constraint uk_stl_tender_payment;
create unique index uk_stl_tender_pay_nonnull on settlement_tenders (
    case when payment_id is not null then tenant_id end,
    case when payment_id is not null then payment_id end
);

alter table settlements drop constraint uk_settlement_invoice;
create unique index uk_stl_invoice_nonnull on settlements (
    case when legacy_invoice_id is not null then tenant_id end,
    case when legacy_invoice_id is not null then legacy_invoice_id end
);

alter table appointments drop constraint uk_appt_rescheduled_from;
create unique index uk_appt_resched_nonnull on appointments (
    case when rescheduled_from_id is not null then tenant_id end,
    case when rescheduled_from_id is not null then rescheduled_from_id end
);

alter table supply_items drop constraint uk_supply_udi;
create unique index uk_supply_udi_nonnull on supply_items (
    case when udi_di is not null then tenant_id end,
    case when udi_di is not null then udi_di end
);

alter table receipts drop constraint uk_receipt_fiscal;
create unique index uk_receipt_fiscal_nonnull on receipts (
    case when fiscal_authority_code is not null and fiscal_code is not null and fiscal_number is not null
        then tenant_id end,
    case when fiscal_authority_code is not null and fiscal_code is not null and fiscal_number is not null
        then fiscal_authority_code end,
    case when fiscal_authority_code is not null and fiscal_code is not null and fiscal_number is not null
        then fiscal_code end,
    case when fiscal_authority_code is not null and fiscal_code is not null and fiscal_number is not null
        then fiscal_number end
);
