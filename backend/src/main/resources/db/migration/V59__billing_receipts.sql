create table receipts (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    settlement_id bigint not null,
    reverses_receipt_id bigint,
    receipt_no varchar(128) not null,
    command_code varchar(128) not null,
    receipt_type varchar(32) not null,
    status varchar(32) not null,
    fiscal_authority_code varchar(128),
    fiscal_code varchar(128),
    fiscal_number varchar(128),
    verification_code varchar(256),
    controlled_object_reference varchar(512),
    receipt_amount decimal(24,6) not null,
    currency_code varchar(3) not null,
    issue_channel varchar(32) not null,
    payer_name_snapshot varchar(300),
    payer_identity_digest varchar(256),
    correlation_id varchar(128),
    created_by bigint,
    created_at timestamp with time zone not null,
    issued_at timestamp with time zone,
    updated_at timestamp with time zone not null,
    error_code varchar(64),
    error_message varchar(2000),
    constraint fk_receipt_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_receipt_settlement foreign key (tenant_id, settlement_id) references settlements(tenant_id, id),
    constraint uk_receipt_tenant_id unique (tenant_id, id),
    constraint fk_receipt_reverses foreign key (tenant_id, reverses_receipt_id) references receipts(tenant_id, id),
    constraint uk_receipt_no unique (tenant_id, receipt_no),
    constraint uk_receipt_command unique (tenant_id, command_code),
    constraint uk_receipt_fiscal unique (tenant_id, fiscal_authority_code, fiscal_code, fiscal_number),
    constraint ck_receipt_type check (receipt_type in ('MEDICAL_E_INVOICE', 'PAPER_INVOICE', 'RECEIPT', 'VIRTUAL')),
    constraint ck_receipt_status check (status in ('REQUESTED', 'ISSUED', 'FAILED', 'VOIDED', 'RED_FLUSHED')),
    constraint ck_receipt_channel check (issue_channel in ('CASHIER', 'SELF_SERVICE', 'MOBILE', 'ONLINE')),
    constraint ck_receipt_amount check (receipt_amount > 0)
);
create index idx_receipt_settlement_status on receipts (tenant_id, settlement_id, status, created_at);
create index idx_receipt_worklist on receipts (tenant_id, status, updated_at, id);
create index idx_receipt_reverse on receipts (tenant_id, reverses_receipt_id);

create table receipt_events (
    id bigint primary key,
    tenant_id bigint not null,
    receipt_id bigint not null,
    external_message_id bigint,
    event_type varchar(32) not null,
    status_from varchar(32),
    status_to varchar(32) not null,
    command_code varchar(128) not null,
    actor_id bigint,
    error_code varchar(64),
    error_message varchar(2000),
    occurred_at timestamp with time zone not null,
    constraint fk_receipt_event_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_receipt_event_receipt foreign key (tenant_id, receipt_id) references receipts(tenant_id, id),
    constraint fk_receipt_event_message foreign key (tenant_id, external_message_id) references external_messages(tenant_id, id),
    constraint uk_receipt_event_command unique (tenant_id, receipt_id, command_code),
    constraint ck_receipt_event_type check (event_type in ('REQUEST', 'ISSUE', 'PRINT', 'DELIVER', 'FAIL', 'VOID', 'RED_FLUSH'))
);
create index idx_receipt_event_time on receipt_events (tenant_id, receipt_id, occurred_at, id);
create index idx_receipt_event_message on receipt_events (tenant_id, external_message_id);
