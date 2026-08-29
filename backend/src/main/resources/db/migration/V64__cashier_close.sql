create table cashier_closes (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    organization_id bigint not null,
    cashier_user_id bigint not null,
    reverses_close_id bigint,
    close_no varchar(128) not null,
    command_code varchar(128) not null,
    terminal_code varchar(128) not null,
    status varchar(32) not null,
    range_from timestamp with time zone not null,
    range_to timestamp with time zone not null,
    transaction_count int not null,
    expected_amount decimal(24,6) not null,
    actual_amount decimal(24,6) not null,
    difference_amount decimal(24,6) not null,
    currency_code varchar(3) not null,
    difference_reason varchar(1000),
    created_by bigint not null,
    created_at timestamp with time zone not null,
    confirmed_by bigint,
    confirmed_at timestamp with time zone,
    constraint uk_cash_close_tenant_id unique (tenant_id, id),
    constraint fk_cash_close_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_cash_close_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_cash_close_reverses foreign key (tenant_id, reverses_close_id) references cashier_closes(tenant_id, id),
    constraint uk_cash_close_no unique (tenant_id, close_no),
    constraint uk_cash_close_command unique (tenant_id, command_code),
    constraint ck_cash_close_status check (status in ('CALCULATED', 'CONFIRMED', 'REVERSED')),
    constraint ck_cash_close_range check (range_to > range_from),
    constraint ck_cash_close_count check (transaction_count >= 0),
    constraint ck_cash_close_difference check (difference_amount = actual_amount - expected_amount)
);
create index idx_cash_close_worklist on cashier_closes
    (tenant_id, organization_id, cashier_user_id, terminal_code, status, range_to);

create table cashier_close_lines (
    id bigint primary key,
    tenant_id bigint not null,
    cashier_close_id bigint not null,
    line_no int not null,
    payment_method_code varchar(128) not null,
    close_line_type varchar(32) not null,
    transaction_count int not null,
    expected_amount decimal(24,6) not null,
    actual_amount decimal(24,6) not null,
    difference_amount decimal(24,6) not null,
    currency_code varchar(3) not null,
    constraint fk_cash_close_line_close foreign key (tenant_id, cashier_close_id) references cashier_closes(tenant_id, id),
    constraint uk_cash_close_line_no unique (tenant_id, cashier_close_id, line_no),
    constraint ck_cash_close_line_type check (close_line_type in ('PAYMENT', 'REFUND')),
    constraint ck_cash_close_line_count check (transaction_count >= 0),
    constraint ck_cash_close_line_difference check (difference_amount = actual_amount - expected_amount)
);

create table cashier_close_items (
    id bigint primary key,
    tenant_id bigint not null,
    cashier_close_id bigint not null,
    payment_id bigint not null,
    item_no int not null,
    item_amount decimal(24,6) not null,
    currency_code varchar(3) not null,
    constraint fk_cash_close_item_close foreign key (tenant_id, cashier_close_id) references cashier_closes(tenant_id, id),
    constraint fk_cash_close_item_payment foreign key (tenant_id, payment_id) references payments(tenant_id, id),
    constraint uk_cash_close_item_no unique (tenant_id, cashier_close_id, item_no),
    constraint uk_cash_close_payment unique (tenant_id, payment_id)
);

create table cashier_close_events (
    id bigint primary key,
    tenant_id bigint not null,
    cashier_close_id bigint not null,
    event_type varchar(32) not null,
    status_from varchar(32),
    status_to varchar(32) not null,
    command_code varchar(128) not null,
    actor_id bigint not null,
    reason varchar(1000),
    occurred_at timestamp with time zone not null,
    constraint fk_cash_close_event_close foreign key (tenant_id, cashier_close_id) references cashier_closes(tenant_id, id),
    constraint uk_cash_close_event_command unique (tenant_id, cashier_close_id, command_code),
    constraint ck_cash_close_event_type check (event_type in ('CALCULATE', 'CONFIRM', 'REVERSE'))
);
create index idx_cash_close_event_order on cashier_close_events (tenant_id, cashier_close_id, occurred_at, id);
