drop index uk_ledger_claim_type;

create unique index uk_ledger_claim_nonnull on ledger_entries (
    case when claim_response_id is not null then tenant_id end,
    case when claim_response_id is not null then claim_response_id end,
    case when claim_response_id is not null then entry_type end
);
