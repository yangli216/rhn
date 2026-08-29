create table reconciliation_batches (
    id number(19) primary key, revision number(19) default 0 not null, tenant_id number(19) not null,
    organization_id number(19) not null, external_message_id number(19), batch_no varchar2(128 char) not null,
    command_code varchar2(128 char) not null, reconciliation_type varchar2(32 char) not null,
    status varchar2(32 char) not null, source_code varchar2(128 char) not null,
    payment_method_code varchar2(128 char), external_batch_no varchar2(128 char), business_date date not null,
    local_count number(10) not null, external_count number(10) not null, difference_count number(10) not null,
    local_amount number(24,6) not null, external_amount number(24,6) not null,
    difference_amount number(24,6) not null, currency_code varchar2(3 char) not null,
    created_by number(19) not null, created_at timestamp with time zone not null,
    completed_by number(19), completed_at timestamp with time zone,
    constraint uk_recon_batch_tenant_id unique (tenant_id, id),
    constraint fk_recon_batch_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_recon_batch_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_recon_batch_message foreign key (tenant_id, external_message_id) references external_messages(tenant_id, id),
    constraint uk_recon_batch_no unique (tenant_id, batch_no), constraint uk_recon_batch_command unique (tenant_id, command_code),
    constraint uk_recon_batch_scope unique (tenant_id, organization_id, reconciliation_type, source_code, business_date, currency_code),
    constraint ck_recon_batch_type check (reconciliation_type in ('PAYMENT_CHANNEL', 'CASHIER_CLOSE', 'FINANCIAL_RECEIPT')),
    constraint ck_recon_batch_status check (status in ('IMPORTED', 'MATCHED', 'DIFFERENCE', 'RESOLVED', 'FAILED')),
    constraint ck_recon_batch_counts check (local_count >= 0 and external_count >= 0 and difference_count >= 0)
);
create index idx_recon_batch_worklist on reconciliation_batches (tenant_id, organization_id, status, business_date, source_code);

create table reconciliation_items (
    id number(19) primary key, revision number(19) default 0 not null, tenant_id number(19) not null,
    reconciliation_batch_id number(19) not null, payment_id number(19), cashier_close_id number(19), receipt_id number(19),
    external_transaction_no varchar2(128 char), match_type varchar2(32 char) not null, status varchar2(32 char) not null,
    local_amount number(24,6) not null, external_amount number(24,6) not null,
    difference_amount number(24,6) not null, currency_code varchar2(3 char) not null,
    owner_id number(19), resolved_by number(19), resolved_at timestamp with time zone, resolution varchar2(2000 char),
    constraint uk_recon_item_tenant_id unique (tenant_id, id),
    constraint fk_recon_item_batch foreign key (tenant_id, reconciliation_batch_id) references reconciliation_batches(tenant_id, id),
    constraint fk_recon_item_payment foreign key (tenant_id, payment_id) references payments(tenant_id, id),
    constraint fk_recon_item_close foreign key (tenant_id, cashier_close_id) references cashier_closes(tenant_id, id),
    constraint fk_recon_item_receipt foreign key (tenant_id, receipt_id) references receipts(tenant_id, id),
    constraint ck_recon_item_match check (match_type in ('MATCHED', 'LOCAL_ONLY', 'EXTERNAL_ONLY', 'AMOUNT_DIFFERENCE', 'STATUS_DIFFERENCE', 'DUPLICATE')),
    constraint ck_recon_item_status check (status in ('OPEN', 'RESOLVED', 'IGNORED')),
    constraint ck_recon_item_difference check (difference_amount = external_amount - local_amount)
);
create index idx_recon_item_worklist on reconciliation_items (tenant_id, reconciliation_batch_id, status, match_type);
create index idx_recon_item_external on reconciliation_items (tenant_id, external_transaction_no);

create table reconciliation_item_events (
    id number(19) primary key, tenant_id number(19) not null, reconciliation_item_id number(19) not null,
    event_type varchar2(32 char) not null, status_from varchar2(32 char), status_to varchar2(32 char) not null,
    command_code varchar2(128 char) not null, actor_id number(19), reason varchar2(2000 char),
    occurred_at timestamp with time zone not null,
    constraint fk_recon_event_item foreign key (tenant_id, reconciliation_item_id) references reconciliation_items(tenant_id, id),
    constraint uk_recon_event_command unique (tenant_id, reconciliation_item_id, command_code),
    constraint ck_recon_event_type check (event_type in ('DETECT', 'RESOLVE', 'IGNORE', 'REOPEN'))
);
create index idx_recon_event_order on reconciliation_item_events (tenant_id, reconciliation_item_id, occurred_at, id);
