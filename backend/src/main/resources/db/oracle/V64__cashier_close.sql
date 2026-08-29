create table cashier_closes (
    id number(19) primary key, revision number(19) default 0 not null, tenant_id number(19) not null,
    organization_id number(19) not null, cashier_user_id number(19) not null, reverses_close_id number(19),
    close_no varchar2(128 char) not null, command_code varchar2(128 char) not null,
    terminal_code varchar2(128 char) not null, status varchar2(32 char) not null,
    range_from timestamp with time zone not null, range_to timestamp with time zone not null,
    transaction_count number(10) not null, expected_amount number(24,6) not null,
    actual_amount number(24,6) not null, difference_amount number(24,6) not null,
    currency_code varchar2(3 char) not null, difference_reason varchar2(1000 char),
    created_by number(19) not null, created_at timestamp with time zone not null,
    confirmed_by number(19), confirmed_at timestamp with time zone,
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
    id number(19) primary key, tenant_id number(19) not null, cashier_close_id number(19) not null,
    line_no number(10) not null, payment_method_code varchar2(128 char) not null,
    close_line_type varchar2(32 char) not null, transaction_count number(10) not null,
    expected_amount number(24,6) not null, actual_amount number(24,6) not null,
    difference_amount number(24,6) not null, currency_code varchar2(3 char) not null,
    constraint fk_cash_close_line_close foreign key (tenant_id, cashier_close_id) references cashier_closes(tenant_id, id),
    constraint uk_cash_close_line_no unique (tenant_id, cashier_close_id, line_no),
    constraint ck_cash_close_line_type check (close_line_type in ('PAYMENT', 'REFUND')),
    constraint ck_cash_close_line_count check (transaction_count >= 0),
    constraint ck_cash_close_line_difference check (difference_amount = actual_amount - expected_amount)
);

create table cashier_close_items (
    id number(19) primary key, tenant_id number(19) not null, cashier_close_id number(19) not null,
    payment_id number(19) not null, item_no number(10) not null, item_amount number(24,6) not null,
    currency_code varchar2(3 char) not null,
    constraint fk_cash_close_item_close foreign key (tenant_id, cashier_close_id) references cashier_closes(tenant_id, id),
    constraint fk_cash_close_item_payment foreign key (tenant_id, payment_id) references payments(tenant_id, id),
    constraint uk_cash_close_item_no unique (tenant_id, cashier_close_id, item_no),
    constraint uk_cash_close_payment unique (tenant_id, payment_id)
);

create table cashier_close_events (
    id number(19) primary key, tenant_id number(19) not null, cashier_close_id number(19) not null,
    event_type varchar2(32 char) not null, status_from varchar2(32 char), status_to varchar2(32 char) not null,
    command_code varchar2(128 char) not null, actor_id number(19) not null, reason varchar2(1000 char),
    occurred_at timestamp with time zone not null,
    constraint fk_cash_close_event_close foreign key (tenant_id, cashier_close_id) references cashier_closes(tenant_id, id),
    constraint uk_cash_close_event_command unique (tenant_id, cashier_close_id, command_code),
    constraint ck_cash_close_event_type check (event_type in ('CALCULATE', 'CONFIRM', 'REVERSE'))
);
create index idx_cash_close_event_order on cashier_close_events (tenant_id, cashier_close_id, occurred_at, id);
