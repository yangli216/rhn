alter table ledger_entries drop constraint uk_ledger_charge;

create unique index uk_ledger_charge_nonnull on ledger_entries (
    case when charge_item_id is not null then tenant_id end,
    case when charge_item_id is not null then charge_item_id end
);
