-- Registration billing starts before an encounter exists. Keep the financial facts tied to
-- a durable registration intent, then bind the resulting encounter after successful payment.
alter table patient_accounts alter column encounter_id drop not null;
alter table patient_accounts drop constraint ck_pat_acct_type;
alter table patient_accounts add constraint ck_pat_acct_type
    check (account_type in ('REGISTRATION', 'OUTPATIENT', 'EMERGENCY', 'INPATIENT', 'HOME_CARE'));

alter table charge_items alter column encounter_id drop not null;
alter table charge_items drop constraint ck_charge_source;
alter table charge_items add constraint ck_charge_source
    check (source_type in ('REGISTRATION', 'MEDICATION_DISPENSE', 'MEDICATION_RETURN'));
alter table charge_items drop constraint ck_charge_sign;
alter table charge_items add constraint ck_charge_sign check (
       (source_type = 'REGISTRATION' and quantity > 0 and total_amount >= 0 and reverses_charge_item_id is null)
    or (source_type = 'MEDICATION_DISPENSE' and quantity > 0 and total_amount >= 0 and reverses_charge_item_id is null)
    or (source_type = 'MEDICATION_RETURN' and quantity < 0 and total_amount <= 0 and reverses_charge_item_id is not null)
);

create table schedule_slot_holds (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    slot_pool_id bigint not null,
    schedule_id bigint not null,
    resident_id bigint not null,
    idempotency_code varchar(128) not null,
    quantity integer default 1 not null,
    status varchar(32) not null,
    created_at timestamp with time zone not null,
    expires_at timestamp with time zone not null,
    closed_at timestamp with time zone,
    consumed_registration_id bigint,
    constraint fk_slot_hold_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_slot_hold_pool foreign key (tenant_id, slot_pool_id)
        references schedule_slot_pools(tenant_id, id),
    constraint fk_slot_hold_schedule foreign key (tenant_id, schedule_id)
        references service_schedules(tenant_id, id),
    constraint fk_slot_hold_resident foreign key (tenant_id, resident_id)
        references residents(tenant_id, id),
    constraint fk_slot_hold_registration foreign key (tenant_id, consumed_registration_id)
        references patient_registrations(tenant_id, id),
    constraint uk_slot_hold_tenant_id unique (tenant_id, id),
    constraint uk_slot_hold_command unique (tenant_id, idempotency_code),
    constraint ck_slot_hold_quantity check (quantity = 1),
    constraint ck_slot_hold_status check (status in ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED')),
    constraint ck_slot_hold_expiry check (expires_at > created_at)
);
create index idx_slot_hold_pool_status on schedule_slot_holds
    (tenant_id, slot_pool_id, status, expires_at);
create index idx_slot_hold_resident on schedule_slot_holds
    (tenant_id, resident_id, status, created_at);
create index idx_slot_hold_schedule on schedule_slot_holds
    (tenant_id, schedule_id, status, expires_at);
create index idx_slot_hold_registration on schedule_slot_holds
    (tenant_id, consumed_registration_id);

alter table appointments add column slot_hold_id bigint;
alter table appointments add constraint fk_appointment_slot_hold
    foreign key (tenant_id, slot_hold_id) references schedule_slot_holds(tenant_id, id);
alter table appointments add constraint uk_appointment_slot_hold unique (tenant_id, slot_hold_id);

create table registration_billing_intents (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    resident_id bigint not null,
    organization_id bigint not null,
    department_id bigint not null,
    schedule_id bigint,
    catalog_item_id bigint,
    slot_hold_id bigint,
    patient_account_id bigint,
    settlement_id bigint,
    payment_order_id bigint,
    encounter_id bigint,
    idempotency_code varchar(128) not null,
    registration_source varchar(32) not null,
    visit_type varchar(32) not null,
    status varchar(32) not null,
    fee_amount decimal(24,6) not null,
    currency_code varchar(3) not null,
    item_code_snapshot varchar(128),
    item_name_snapshot varchar(300),
    expires_at timestamp with time zone,
    completion_attempts integer default 0 not null,
    last_error_code varchar(64),
    last_error_message varchar(2000),
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    completed_at timestamp with time zone,
    constraint fk_reg_bill_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_reg_bill_resident foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_reg_bill_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_reg_bill_dept foreign key (tenant_id, department_id) references departments(tenant_id, id),
    constraint fk_reg_bill_schedule foreign key (tenant_id, schedule_id) references service_schedules(tenant_id, id),
    constraint fk_reg_bill_catalog foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint fk_reg_bill_hold foreign key (tenant_id, slot_hold_id) references schedule_slot_holds(tenant_id, id),
    constraint fk_reg_bill_account foreign key (tenant_id, patient_account_id) references patient_accounts(tenant_id, id),
    constraint fk_reg_bill_settlement foreign key (tenant_id, settlement_id) references settlements(tenant_id, id),
    constraint fk_reg_bill_pay_order foreign key (tenant_id, payment_order_id) references payment_orders(tenant_id, id),
    constraint fk_reg_bill_encounter foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint uk_reg_bill_tenant_id unique (tenant_id, id),
    constraint uk_reg_bill_command unique (tenant_id, idempotency_code),
    constraint uk_reg_bill_hold unique (tenant_id, slot_hold_id),
    constraint uk_reg_bill_account unique (tenant_id, patient_account_id),
    constraint uk_reg_bill_settlement unique (tenant_id, settlement_id),
    constraint uk_reg_bill_payment unique (tenant_id, payment_order_id),
    constraint ck_reg_bill_source check (registration_source in ('WINDOW', 'WALK_IN', 'DIRECT', 'EMERGENCY')),
    constraint ck_reg_bill_visit check (visit_type in ('GENERAL', 'FOLLOW_UP', 'EMERGENCY')),
    constraint ck_reg_bill_status check (status in ('PAYMENT_PENDING', 'PAID', 'COMPLETING', 'COMPLETED', 'COMPLETION_FAILED', 'CANCELLED', 'EXPIRED')),
    constraint ck_reg_bill_fee check (fee_amount >= 0),
    constraint ck_reg_bill_attempts check (completion_attempts >= 0),
    constraint ck_reg_bill_finance check (
        (fee_amount = 0 and patient_account_id is null and settlement_id is null)
        or (fee_amount > 0 and patient_account_id is not null and settlement_id is not null)
    )
);
create index idx_reg_bill_status on registration_billing_intents
    (tenant_id, status, expires_at, created_at);
create index idx_reg_bill_resident on registration_billing_intents
    (tenant_id, resident_id, created_at);
create index idx_reg_bill_context on registration_billing_intents
    (tenant_id, organization_id, department_id, created_at);
