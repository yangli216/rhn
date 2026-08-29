create table payment_orders (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    patient_account_id bigint not null,
    invoice_id bigint not null,
    original_payment_id bigint,
    order_no varchar(128) not null,
    idempotency_key varchar(128) not null,
    business_scene varchar(32) not null,
    payment_scene_code varchar(128) not null,
    payment_method_code varchar(128) not null,
    payment_method_name_snapshot varchar(300) not null,
    order_type varchar(32) not null,
    status varchar(32) not null,
    requested_amount decimal(24,6) not null,
    captured_amount decimal(24,6) not null,
    refunded_amount decimal(24,6) not null,
    currency_code varchar(3) not null,
    external_order_no varchar(128),
    correlation_id varchar(128),
    terminal_code varchar(128),
    expires_at timestamp with time zone,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    error_code varchar(64),
    error_message varchar(2000),
    constraint fk_pay_order_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_pay_order_account foreign key (tenant_id, patient_account_id)
        references patient_accounts(tenant_id, id),
    constraint fk_pay_order_invoice foreign key (tenant_id, invoice_id) references invoices(tenant_id, id),
    constraint fk_pay_order_original_payment foreign key (tenant_id, original_payment_id)
        references payments(tenant_id, id),
    constraint uk_pay_order_tenant_id unique (tenant_id, id),
    constraint uk_pay_order_no unique (tenant_id, order_no),
    constraint uk_pay_order_idempotency unique (tenant_id, idempotency_key),
    constraint ck_pay_order_type check (order_type in ('SETTLEMENT_PAY', 'REFUND', 'PREPAY_TOPUP', 'PREPAY_REFUND')),
    constraint ck_pay_order_status check (status in (
        'CREATED', 'PENDING', 'PROCESSING', 'PARTIAL', 'SUCCEEDED', 'FAILED',
        'CANCELLED', 'EXPIRED', 'REFUNDING', 'REFUNDED')),
    constraint ck_pay_order_amount check (
        requested_amount > 0 and captured_amount >= 0 and refunded_amount >= 0
        and ((order_type <> 'REFUND' and captured_amount <= requested_amount and refunded_amount <= captured_amount)
          or (order_type = 'REFUND' and captured_amount = 0 and refunded_amount <= requested_amount)))
);
create index idx_pay_order_invoice_status on payment_orders (tenant_id, invoice_id, status, created_at);
create index idx_pay_order_account on payment_orders (tenant_id, patient_account_id, created_at);
create index idx_pay_order_external on payment_orders (tenant_id, payment_method_code, external_order_no);
create index idx_pay_order_original_payment on payment_orders (tenant_id, original_payment_id, status, created_at);

create table payment_events (
    id bigint primary key,
    tenant_id bigint not null,
    payment_order_id bigint not null,
    external_message_id bigint,
    event_type varchar(32) not null,
    status_from varchar(32),
    status_to varchar(32) not null,
    command_code varchar(128) not null,
    external_transaction_no varchar(128),
    event_amount decimal(24,6),
    error_code varchar(64),
    error_message varchar(2000),
    actor_id bigint,
    occurred_at timestamp with time zone not null,
    constraint fk_pay_event_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_pay_event_order foreign key (tenant_id, payment_order_id)
        references payment_orders(tenant_id, id),
    constraint fk_pay_event_message foreign key (tenant_id, external_message_id)
        references external_messages(tenant_id, id),
    constraint uk_pay_event_command unique (tenant_id, payment_order_id, command_code),
    constraint ck_pay_event_type check (event_type in (
        'CREATE', 'SUBMIT', 'CALLBACK', 'QUERY', 'CAPTURE', 'PARTIAL_CAPTURE',
        'FAIL', 'CANCEL', 'EXPIRE', 'REFUND_REQUEST', 'REFUND_CALLBACK')),
    constraint ck_pay_event_amount check (event_amount is null or event_amount > 0)
);
create index idx_pay_event_order on payment_events (tenant_id, payment_order_id, occurred_at, id);
create index idx_pay_event_external_txn on payment_events (tenant_id, external_transaction_no);

alter table payments add column payment_order_id bigint;
alter table payments add column payment_scene_code varchar(128);
alter table payments add constraint fk_payment_order foreign key (tenant_id, payment_order_id)
    references payment_orders(tenant_id, id);
alter table payments add constraint uk_payment_order_fact unique (tenant_id, payment_order_id);
