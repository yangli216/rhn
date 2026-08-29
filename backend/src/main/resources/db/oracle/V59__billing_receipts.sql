create table receipts (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    settlement_id number(19) not null,
    reverses_receipt_id number(19),
    receipt_no varchar2(128 char) not null,
    command_code varchar2(128 char) not null,
    receipt_type varchar2(32 char) not null,
    status varchar2(32 char) not null,
    fiscal_authority_code varchar2(128 char),
    fiscal_code varchar2(128 char),
    fiscal_number varchar2(128 char),
    verification_code varchar2(256 char),
    controlled_object_reference varchar2(512 char),
    receipt_amount number(24,6) not null,
    currency_code varchar2(3 char) not null,
    issue_channel varchar2(32 char) not null,
    payer_name_snapshot varchar2(300 char),
    payer_identity_digest varchar2(256 char),
    correlation_id varchar2(128 char),
    created_by number(19),
    created_at timestamp with time zone not null,
    issued_at timestamp with time zone,
    updated_at timestamp with time zone not null,
    error_code varchar2(64 char),
    error_message varchar2(2000 char),
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
    id number(19) primary key,
    tenant_id number(19) not null,
    receipt_id number(19) not null,
    external_message_id number(19),
    event_type varchar2(32 char) not null,
    status_from varchar2(32 char),
    status_to varchar2(32 char) not null,
    command_code varchar2(128 char) not null,
    actor_id number(19),
    error_code varchar2(64 char),
    error_message varchar2(2000 char),
    occurred_at timestamp with time zone not null,
    constraint fk_receipt_event_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_receipt_event_receipt foreign key (tenant_id, receipt_id) references receipts(tenant_id, id),
    constraint fk_receipt_event_message foreign key (tenant_id, external_message_id) references external_messages(tenant_id, id),
    constraint uk_receipt_event_command unique (tenant_id, receipt_id, command_code),
    constraint ck_receipt_event_type check (event_type in ('REQUEST', 'ISSUE', 'PRINT', 'DELIVER', 'FAIL', 'VOID', 'RED_FLUSH'))
);
create index idx_receipt_event_time on receipt_events (tenant_id, receipt_id, occurred_at, id);
create index idx_receipt_event_message on receipt_events (tenant_id, external_message_id);
