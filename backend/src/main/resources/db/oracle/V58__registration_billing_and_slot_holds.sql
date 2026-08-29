alter table patient_accounts modify encounter_id null;
alter table patient_accounts drop constraint ck_pat_acct_type;
alter table patient_accounts add constraint ck_pat_acct_type
    check (account_type in ('REGISTRATION', 'OUTPATIENT', 'EMERGENCY', 'INPATIENT', 'HOME_CARE'));

alter table charge_items modify encounter_id null;
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
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    slot_pool_id number(19) not null,
    schedule_id number(19) not null,
    resident_id number(19) not null,
    idempotency_code varchar2(128 char) not null,
    quantity number(10) default 1 not null,
    status varchar2(32 char) not null,
    created_at timestamp with time zone not null,
    expires_at timestamp with time zone not null,
    closed_at timestamp with time zone,
    consumed_registration_id number(19),
    constraint fk_slot_hold_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_slot_hold_pool foreign key (tenant_id, slot_pool_id) references schedule_slot_pools(tenant_id, id),
    constraint fk_slot_hold_schedule foreign key (tenant_id, schedule_id) references service_schedules(tenant_id, id),
    constraint fk_slot_hold_resident foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_slot_hold_registration foreign key (tenant_id, consumed_registration_id) references patient_registrations(tenant_id, id),
    constraint uk_slot_hold_tenant_id unique (tenant_id, id),
    constraint uk_slot_hold_command unique (tenant_id, idempotency_code),
    constraint ck_slot_hold_quantity check (quantity = 1),
    constraint ck_slot_hold_status check (status in ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED')),
    constraint ck_slot_hold_expiry check (expires_at > created_at)
);
create index idx_slot_hold_pool_status on schedule_slot_holds (tenant_id, slot_pool_id, status, expires_at);
create index idx_slot_hold_resident on schedule_slot_holds (tenant_id, resident_id, status, created_at);
create index idx_slot_hold_schedule on schedule_slot_holds (tenant_id, schedule_id, status, expires_at);
create index idx_slot_hold_registration on schedule_slot_holds (tenant_id, consumed_registration_id);

alter table appointments add slot_hold_id number(19);
alter table appointments add constraint fk_appointment_slot_hold
    foreign key (tenant_id, slot_hold_id) references schedule_slot_holds(tenant_id, id);
alter table appointments add constraint uk_appointment_slot_hold unique (tenant_id, slot_hold_id);

create table registration_billing_intents (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    resident_id number(19) not null,
    organization_id number(19) not null,
    department_id number(19) not null,
    schedule_id number(19),
    catalog_item_id number(19),
    slot_hold_id number(19),
    patient_account_id number(19),
    settlement_id number(19),
    payment_order_id number(19),
    encounter_id number(19),
    idempotency_code varchar2(128 char) not null,
    registration_source varchar2(32 char) not null,
    visit_type varchar2(32 char) not null,
    status varchar2(32 char) not null,
    fee_amount number(24,6) not null,
    currency_code varchar2(3 char) not null,
    item_code_snapshot varchar2(128 char),
    item_name_snapshot varchar2(300 char),
    expires_at timestamp with time zone,
    completion_attempts number(10) default 0 not null,
    last_error_code varchar2(64 char),
    last_error_message varchar2(2000 char),
    created_at timestamp with time zone not null,
    created_by number(19) not null,
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
create index idx_reg_bill_status on registration_billing_intents (tenant_id, status, expires_at, created_at);
create index idx_reg_bill_resident on registration_billing_intents (tenant_id, resident_id, created_at);
create index idx_reg_bill_context on registration_billing_intents (tenant_id, organization_id, department_id, created_at);
