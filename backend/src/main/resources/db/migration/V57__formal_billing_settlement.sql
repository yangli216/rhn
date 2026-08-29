create table settlements (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    patient_account_id bigint not null,
    reverses_settlement_id bigint,
    legacy_invoice_id bigint,
    settlement_no varchar(128) not null,
    command_code varchar(128) not null,
    settlement_type varchar(32) not null,
    settlement_scene varchar(32) not null,
    terminal_scene varchar(32) not null,
    status varchar(32) not null,
    gross_amount decimal(24,6) not null,
    discount_amount decimal(24,6) not null,
    insurance_amount decimal(24,6) not null,
    patient_amount decimal(24,6) not null,
    other_amount decimal(24,6) not null,
    rounding_amount decimal(24,6) not null,
    net_amount decimal(24,6) not null,
    currency_code varchar(3) not null,
    terminal_code varchar(128),
    created_by bigint not null,
    created_at timestamp with time zone not null,
    finalized_by bigint,
    finalized_at timestamp with time zone,
    error_code varchar(64),
    error_message varchar(2000),
    constraint fk_settlement_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_settlement_account foreign key (tenant_id, patient_account_id)
        references patient_accounts(tenant_id, id),
    constraint uk_settlement_tenant_id unique (tenant_id, id),
    constraint fk_settlement_reverses foreign key (tenant_id, reverses_settlement_id)
        references settlements(tenant_id, id),
    constraint fk_settlement_invoice foreign key (tenant_id, legacy_invoice_id)
        references invoices(tenant_id, id),
    constraint uk_settlement_no unique (tenant_id, settlement_no),
    constraint uk_settlement_command unique (tenant_id, command_code),
    constraint uk_settlement_invoice unique (tenant_id, legacy_invoice_id),
    constraint ck_settlement_type check (settlement_type in ('NORMAL', 'REVERSAL', 'SUPPLEMENT')),
    constraint ck_settlement_scene check (settlement_scene in ('REGISTRATION', 'OUTPATIENT', 'INPATIENT', 'HOME_BED', 'PHARMACY')),
    constraint ck_settlement_terminal_scene check (terminal_scene in ('CASHIER', 'DOCTOR_STATION', 'SELF_SERVICE', 'MOBILE', 'ONLINE')),
    constraint ck_settlement_status check (status in ('DRAFT', 'PRICED', 'PAYMENT_PENDING', 'PARTIAL', 'SETTLED', 'REVERSING', 'REVERSED', 'FAILED')),
    constraint ck_settlement_amounts check (
        discount_amount >= 0 and insurance_amount >= 0 and patient_amount >= 0 and other_amount >= 0
        and ((settlement_type <> 'REVERSAL' and gross_amount >= 0 and net_amount >= 0)
          or (settlement_type = 'REVERSAL' and gross_amount <= 0 and net_amount <= 0)))
);
create index idx_settlement_account_status on settlements (tenant_id, patient_account_id, status, created_at);
create index idx_settlement_reverse on settlements (tenant_id, reverses_settlement_id);

create table settlement_lines (
    id bigint primary key,
    tenant_id bigint not null,
    settlement_id bigint not null,
    charge_item_id bigint not null,
    legacy_invoice_line_id bigint,
    line_no integer not null,
    settled_quantity decimal(28,8) not null,
    gross_amount decimal(24,6) not null,
    discount_amount decimal(24,6) not null,
    insurance_amount decimal(24,6) not null,
    patient_amount decimal(24,6) not null,
    other_amount decimal(24,6) not null,
    net_amount decimal(24,6) not null,
    constraint fk_stl_line_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_stl_line_settlement foreign key (tenant_id, settlement_id)
        references settlements(tenant_id, id),
    constraint fk_stl_line_charge foreign key (tenant_id, charge_item_id)
        references charge_items(tenant_id, id),
    constraint fk_stl_line_invoice_line foreign key (legacy_invoice_line_id) references invoice_lines(id),
    constraint uk_stl_line_order unique (tenant_id, settlement_id, line_no),
    constraint uk_stl_line_charge unique (tenant_id, settlement_id, charge_item_id),
    constraint uk_stl_line_invoice_line unique (legacy_invoice_line_id),
    constraint ck_stl_line_quantity check (settled_quantity <> 0)
);
create index idx_stl_line_charge on settlement_lines (tenant_id, charge_item_id);

create table settlement_tenders (
    id bigint primary key,
    tenant_id bigint not null,
    settlement_id bigint not null,
    payment_id bigint,
    claim_response_id bigint,
    line_no integer not null,
    tender_type varchar(32) not null,
    payer_code varchar(128),
    payer_name_snapshot varchar(300),
    tender_amount decimal(24,6) not null,
    currency_code varchar(3) not null,
    constraint fk_stl_tender_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_stl_tender_settlement foreign key (tenant_id, settlement_id)
        references settlements(tenant_id, id),
    constraint fk_stl_tender_payment foreign key (tenant_id, payment_id)
        references payments(tenant_id, id),
    constraint uk_stl_tender_order unique (tenant_id, settlement_id, line_no),
    constraint uk_stl_tender_payment unique (tenant_id, payment_id),
    constraint ck_stl_tender_type check (tender_type in ('CASH', 'BANK_CARD', 'DIGITAL', 'INSURANCE_FUND', 'PERSONAL_ACCOUNT', 'COMMERCIAL_INSURANCE', 'PREPAYMENT', 'HOSPITAL_DISCOUNT', 'SUBSIDY', 'ROUNDING')),
    constraint ck_stl_tender_amount check (tender_amount <> 0)
);
create index idx_stl_tender_settlement on settlement_tenders (tenant_id, settlement_id, line_no);
create index idx_stl_tender_claim on settlement_tenders (tenant_id, claim_response_id);

create table settlement_events (
    id bigint primary key,
    tenant_id bigint not null,
    settlement_id bigint not null,
    event_type varchar(32) not null,
    status_from varchar(32),
    status_to varchar(32) not null,
    command_code varchar(128) not null,
    actor_id bigint,
    error_code varchar(64),
    error_message varchar(2000),
    occurred_at timestamp with time zone not null,
    constraint fk_stl_event_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_stl_event_settlement foreign key (tenant_id, settlement_id)
        references settlements(tenant_id, id),
    constraint uk_stl_event_command unique (tenant_id, settlement_id, command_code),
    constraint ck_stl_event_type check (event_type in ('CREATE', 'PRICE', 'REQUEST_PAYMENT', 'PARTIAL_PAY', 'FINALIZE', 'REVERSE_REQUEST', 'REVERSE_COMPLETE', 'FAIL'))
);
create index idx_stl_event_time on settlement_events (tenant_id, settlement_id, occurred_at, id);

create table settlement_category_summaries (
    id bigint primary key,
    tenant_id bigint not null,
    settlement_id bigint not null,
    category_code varchar(64) not null,
    category_name_snapshot varchar(300),
    category_amount decimal(24,6) not null,
    as_of timestamp with time zone not null,
    constraint fk_stl_cat_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_stl_cat_settlement foreign key (tenant_id, settlement_id)
        references settlements(tenant_id, id),
    constraint uk_stl_cat unique (tenant_id, settlement_id, category_code)
);

insert into settlements (
    id, revision, tenant_id, patient_account_id, legacy_invoice_id, settlement_no, command_code,
    settlement_type, settlement_scene, terminal_scene, status, gross_amount, discount_amount,
    insurance_amount, patient_amount, other_amount, rounding_amount, net_amount, currency_code,
    created_by, created_at, finalized_by, finalized_at
)
select i.id, 0, i.tenant_id, i.patient_account_id, i.id, i.invoice_no,
       'LEGACY-INVOICE-' || cast(i.id as varchar),
       case when i.invoice_type = 'CREDIT' then 'REVERSAL' else 'NORMAL' end,
       'OUTPATIENT', 'CASHIER',
       case when i.invoice_type = 'STANDARD' and coalesce((select sum(case when p.payment_type = 'PAYMENT' then p.amount else -p.amount end)
              from payments p where p.tenant_id = i.tenant_id and p.invoice_id = i.id), 0) >= i.net_amount
            then 'SETTLED'
            when coalesce((select sum(case when p.payment_type = 'PAYMENT' then p.amount else -p.amount end)
              from payments p where p.tenant_id = i.tenant_id and p.invoice_id = i.id), 0) > 0 then 'PARTIAL'
            else 'PRICED' end,
       i.gross_amount, i.discount_amount, 0, abs(i.net_amount), 0, 0, i.net_amount,
       i.currency_code, i.issued_by, i.issued_at,
       case when i.invoice_type = 'STANDARD' and coalesce((select sum(case when p.payment_type = 'PAYMENT' then p.amount else -p.amount end)
              from payments p where p.tenant_id = i.tenant_id and p.invoice_id = i.id), 0) >= i.net_amount then i.issued_by else null end,
       case when i.invoice_type = 'STANDARD' and coalesce((select sum(case when p.payment_type = 'PAYMENT' then p.amount else -p.amount end)
              from payments p where p.tenant_id = i.tenant_id and p.invoice_id = i.id), 0) >= i.net_amount then i.issued_at else null end
from invoices i;

insert into settlement_lines (
    id, tenant_id, settlement_id, charge_item_id, legacy_invoice_line_id, line_no,
    settled_quantity, gross_amount, discount_amount, insurance_amount, patient_amount,
    other_amount, net_amount
)
select il.id, il.tenant_id, il.invoice_id, il.charge_item_id, il.id, il.line_no,
       c.quantity, il.amount, 0, 0, abs(il.amount), 0, il.amount
from invoice_lines il join charge_items c on c.tenant_id = il.tenant_id and c.id = il.charge_item_id;

insert into settlement_category_summaries (
    id, tenant_id, settlement_id, category_code, category_name_snapshot, category_amount, as_of
)
select s.id, s.tenant_id, s.invoice_id, s.category_code, s.category_name_snapshot, s.amount, current_timestamp
from invoice_category_summaries s;

insert into settlement_events (
    id, tenant_id, settlement_id, event_type, status_from, status_to, command_code, actor_id, occurred_at
)
select i.id, i.tenant_id, i.id, 'CREATE', null,
       case when st.status = 'SETTLED' then 'SETTLED' when st.status = 'PARTIAL' then 'PARTIAL' else 'PRICED' end,
       'LEGACY-EVENT-' || cast(i.id as varchar), i.issued_by, i.issued_at
from invoices i join settlements st on st.tenant_id = i.tenant_id and st.id = i.id;

insert into settlement_tenders (
    id, tenant_id, settlement_id, payment_id, line_no, tender_type, payer_code,
    payer_name_snapshot, tender_amount, currency_code
)
select p.id, p.tenant_id, p.invoice_id, p.id,
       row_number() over (partition by p.tenant_id, p.invoice_id order by p.paid_at, p.id),
       case when p.payment_method_code = 'CASH' then 'CASH'
            when p.payment_method_code = 'BANK_CARD' then 'BANK_CARD'
            when p.payment_method_code in ('WECHAT', 'ALIPAY') then 'DIGITAL'
            when p.payment_method_code = 'MEDICAL_INSURANCE' then 'PERSONAL_ACCOUNT'
            else 'COMMERCIAL_INSURANCE' end,
       p.payment_method_code, p.payment_method_code,
       case when p.payment_type = 'REFUND' then -p.amount else p.amount end,
       p.currency_code
from payments p where p.invoice_id is not null;
