create table patient_accounts (
    id number(19) primary key, revision number(19) default 0 not null, tenant_id number(19) not null,
    resident_id number(19) not null, encounter_id number(19) not null, organization_id number(19) not null,
    department_id number(19) not null, account_type varchar2(32 char) not null, currency_code varchar2(3 char) not null,
    status varchar2(32 char) not null, opened_at timestamp with time zone not null, closed_at timestamp with time zone,
    constraint fk_pat_acct_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_pat_acct_resident foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_pat_acct_encounter foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint fk_pat_acct_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_pat_acct_dept foreign key (tenant_id, department_id) references departments(tenant_id, id),
    constraint uk_pat_acct_tenant_id unique (tenant_id, id),
    constraint uk_pat_acct_enc_currency unique (tenant_id, encounter_id, currency_code),
    constraint ck_pat_acct_type check (account_type in ('OUTPATIENT', 'EMERGENCY', 'INPATIENT', 'HOME_CARE')),
    constraint ck_pat_acct_status check (status in ('OPEN', 'SETTLED', 'CLOSED'))
);
create index idx_pat_acct_resident on patient_accounts (tenant_id, resident_id, status, opened_at);
create index idx_pat_acct_org on patient_accounts (tenant_id, organization_id, opened_at);

create table charge_items (
    id number(19) primary key, tenant_id number(19) not null, patient_account_id number(19) not null,
    resident_id number(19) not null, encounter_id number(19) not null, request_id number(19), care_event_id number(19),
    catalog_item_id number(19) not null, source_type varchar2(32 char) not null, source_id number(19) not null,
    request_code varchar2(128 char) not null, status varchar2(32 char) not null, quantity number(28,8) not null,
    unit_code varchar2(64 char) not null, unit_price number(24,6) not null, total_amount number(24,6) not null,
    currency_code varchar2(3 char) not null, price_id number(19), price_revision number(19), price_type varchar2(32 char),
    item_code_snapshot varchar2(128 char) not null, item_name_snapshot varchar2(300 char) not null,
    occurred_at timestamp with time zone not null, entered_by number(19) not null, reverses_charge_item_id number(19),
    constraint fk_charge_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_charge_account foreign key (tenant_id, patient_account_id) references patient_accounts(tenant_id, id),
    constraint fk_charge_resident foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_charge_encounter foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint fk_charge_request foreign key (tenant_id, request_id) references medication_requests(tenant_id, request_id),
    constraint fk_charge_catalog foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint uk_charge_tenant_id unique (tenant_id, id),
    constraint fk_charge_reverses foreign key (tenant_id, reverses_charge_item_id) references charge_items(tenant_id, id),
    constraint uk_charge_source unique (tenant_id, source_type, source_id),
    constraint ck_charge_source check (source_type in ('MEDICATION_DISPENSE', 'MEDICATION_RETURN')),
    constraint ck_charge_status check (status in ('POSTED')), constraint ck_charge_quantity check (quantity <> 0),
    constraint ck_charge_unit_price check (unit_price >= 0),
    constraint ck_charge_sign check ((source_type = 'MEDICATION_DISPENSE' and quantity > 0 and total_amount >= 0 and reverses_charge_item_id is null) or (source_type = 'MEDICATION_RETURN' and quantity < 0 and total_amount <= 0 and reverses_charge_item_id is not null))
);
create index idx_charge_account on charge_items (tenant_id, patient_account_id, occurred_at);
create index idx_charge_encounter on charge_items (tenant_id, encounter_id, occurred_at);
create index idx_charge_request on charge_items (tenant_id, request_id);

create table charge_item_components (
    id number(19) primary key, tenant_id number(19) not null, charge_item_id number(19) not null,
    line_no number(10) not null, catalog_item_id number(19), item_code_snapshot varchar2(128 char),
    item_name_snapshot varchar2(300 char) not null, body_site_code varchar2(64 char), quantity number(28,8) not null,
    unit_code varchar2(64 char), unit_factor number(28,8), unit_price number(24,6) not null, amount number(24,6) not null,
    constraint fk_charge_comp_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_charge_comp_header foreign key (tenant_id, charge_item_id) references charge_items(tenant_id, id),
    constraint fk_charge_comp_catalog foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint uk_charge_comp_order unique (tenant_id, charge_item_id, line_no),
    constraint ck_charge_comp_quantity check (quantity <> 0), constraint ck_charge_comp_price check (unit_price >= 0),
    constraint ck_charge_comp_amount check ((quantity > 0 and amount >= 0) or (quantity < 0 and amount <= 0))
);

create table invoices (
    id number(19) primary key, tenant_id number(19) not null, patient_account_id number(19) not null,
    invoice_no varchar2(64 char) not null, invoice_type varchar2(32 char) not null, status varchar2(32 char) not null,
    currency_code varchar2(3 char) not null, gross_amount number(24,6) not null,
    discount_amount number(24,6) not null, net_amount number(24,6) not null,
    issued_at timestamp with time zone not null, issued_by number(19) not null,
    cancelled_at timestamp with time zone, cancellation_reason varchar2(1000 char),
    constraint fk_invoice_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_invoice_account foreign key (tenant_id, patient_account_id) references patient_accounts(tenant_id, id),
    constraint uk_invoice_tenant_id unique (tenant_id, id), constraint uk_invoice_no unique (tenant_id, invoice_no),
    constraint ck_invoice_type check (invoice_type in ('STANDARD', 'CREDIT')),
    constraint ck_invoice_status check (status in ('ISSUED', 'CANCELLED')),
    constraint ck_invoice_discount check (discount_amount >= 0),
    constraint ck_invoice_amount check ((invoice_type = 'STANDARD' and gross_amount >= 0 and net_amount >= 0) or (invoice_type = 'CREDIT' and gross_amount < 0 and net_amount < 0))
);
create index idx_invoice_account on invoices (tenant_id, patient_account_id, issued_at);

create table invoice_lines (
    id number(19) primary key, tenant_id number(19) not null, invoice_id number(19) not null,
    charge_item_id number(19) not null, line_no number(10) not null, amount number(24,6) not null,
    constraint fk_invoice_line_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_invoice_line_header foreign key (tenant_id, invoice_id) references invoices(tenant_id, id),
    constraint fk_invoice_line_charge foreign key (tenant_id, charge_item_id) references charge_items(tenant_id, id),
    constraint uk_invoice_line_order unique (tenant_id, invoice_id, line_no),
    constraint uk_invoice_line_charge unique (tenant_id, charge_item_id),
    constraint ck_invoice_line_amount check (amount = amount)
);
create table invoice_category_summaries (
    id number(19) primary key, tenant_id number(19) not null, invoice_id number(19) not null,
    category_code varchar2(64 char) not null, category_name_snapshot varchar2(300 char), amount number(24,6) not null,
    constraint fk_invoice_cat_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_invoice_cat_header foreign key (tenant_id, invoice_id) references invoices(tenant_id, id),
    constraint uk_invoice_cat unique (tenant_id, invoice_id, category_code),
    constraint ck_invoice_cat_amount check (amount = amount)
);

create table payments (
    id number(19) primary key, tenant_id number(19) not null, patient_account_id number(19) not null,
    invoice_id number(19), payment_no varchar2(64 char) not null, payment_type varchar2(32 char) not null,
    payment_method_code varchar2(64 char) not null, status varchar2(32 char) not null, amount number(24,6) not null,
    currency_code varchar2(3 char) not null, paid_at timestamp with time zone not null,
    external_transaction_no varchar2(128 char), reverses_payment_id number(19), entered_by number(19) not null,
    description varchar2(1000 char),
    constraint fk_payment_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_payment_account foreign key (tenant_id, patient_account_id) references patient_accounts(tenant_id, id),
    constraint fk_payment_invoice foreign key (tenant_id, invoice_id) references invoices(tenant_id, id),
    constraint uk_payment_tenant_id unique (tenant_id, id), constraint uk_payment_no unique (tenant_id, payment_no),
    constraint fk_payment_reverses foreign key (tenant_id, reverses_payment_id) references payments(tenant_id, id),
    constraint ck_payment_type check (payment_type in ('PAYMENT', 'REFUND')),
    constraint ck_payment_status check (status in ('COMPLETED')), constraint ck_payment_amount check (amount > 0),
    constraint ck_payment_reversal check ((payment_type = 'PAYMENT' and reverses_payment_id is null) or (payment_type = 'REFUND' and reverses_payment_id is not null))
);
create index idx_payment_account on payments (tenant_id, patient_account_id, paid_at);
create index idx_payment_invoice on payments (tenant_id, invoice_id, paid_at);

create table ledger_entries (
    id number(19) primary key, tenant_id number(19) not null, patient_account_id number(19) not null,
    entry_type varchar2(32 char) not null, direction varchar2(8 char) not null, amount number(24,6) not null,
    currency_code varchar2(3 char) not null, charge_item_id number(19), invoice_id number(19), payment_id number(19),
    reverses_ledger_entry_id number(19), occurred_at timestamp with time zone not null,
    recorded_at timestamp with time zone not null, recorded_by number(19) not null,
    constraint fk_ledger_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_ledger_account foreign key (tenant_id, patient_account_id) references patient_accounts(tenant_id, id),
    constraint fk_ledger_charge foreign key (tenant_id, charge_item_id) references charge_items(tenant_id, id),
    constraint fk_ledger_invoice foreign key (tenant_id, invoice_id) references invoices(tenant_id, id),
    constraint fk_ledger_payment foreign key (tenant_id, payment_id) references payments(tenant_id, id),
    constraint uk_ledger_tenant_id unique (tenant_id, id),
    constraint fk_ledger_reverses foreign key (tenant_id, reverses_ledger_entry_id) references ledger_entries(tenant_id, id),
    constraint uk_ledger_charge unique (tenant_id, charge_item_id), constraint uk_ledger_payment unique (tenant_id, payment_id),
    constraint ck_ledger_type check (entry_type in ('CHARGE', 'CHARGE_REVERSAL', 'PAYMENT', 'PAYMENT_REFUND')),
    constraint ck_ledger_direction check (direction in ('DEBIT', 'CREDIT')), constraint ck_ledger_amount check (amount > 0),
    constraint ck_ledger_source check ((charge_item_id is not null and payment_id is null) or (charge_item_id is null and payment_id is not null))
);
create index idx_ledger_account on ledger_entries (tenant_id, patient_account_id, occurred_at, id);
