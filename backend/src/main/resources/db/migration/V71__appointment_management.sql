-- Independent appointment management reuses the existing schedule inventory aggregate.

alter table appointments alter column checked_in_at drop not null;
alter table appointments add column booking_source varchar(24) default 'WINDOW' not null;
alter table appointments add column cancelled_at timestamp with time zone;
alter table appointments add column cancellation_reason varchar(500);
alter table appointments add column rescheduled_from_id bigint;
alter table appointments add column updated_at timestamp with time zone;
alter table appointments add column updated_by bigint;

update appointments set updated_at = created_at, updated_by = created_by;
alter table appointments alter column updated_at set not null;
alter table appointments alter column updated_by set not null;

alter table appointments drop constraint ck_appointment_status;
alter table appointments add constraint ck_appointment_status
    check (status in ('BOOKED', 'REGISTERED', 'VISITED', 'CANCELLED', 'NO_SHOW'));
alter table appointments add constraint ck_appt_booking_source
    check (booking_source in ('WINDOW', 'PHONE', 'INTERNAL', 'PATIENT_APP', 'WECHAT', 'THIRD_PARTY'));
alter table appointments add constraint fk_appt_updated_by
    foreign key (tenant_id, updated_by) references user_accounts(tenant_id, id);
alter table appointments add constraint fk_appt_rescheduled_from
    foreign key (tenant_id, rescheduled_from_id) references appointments(tenant_id, id);
alter table appointments add constraint uk_appt_rescheduled_from
    unique (tenant_id, rescheduled_from_id);

create table appointment_events (
    id bigint primary key,
    tenant_id bigint not null,
    appointment_id bigint not null,
    replacement_appointment_id bigint,
    event_type varchar(32) not null,
    status_from varchar(24),
    status_to varchar(24) not null,
    command_code varchar(128) not null,
    occurred_at timestamp with time zone not null,
    occurred_by bigint not null,
    description varchar(1000),
    constraint uk_appt_evt_tenant_id unique (tenant_id, id),
    constraint uk_appt_evt_command unique (tenant_id, appointment_id, command_code),
    constraint fk_appt_evt_appointment foreign key (tenant_id, appointment_id)
        references appointments(tenant_id, id),
    constraint fk_appt_evt_replacement foreign key (tenant_id, replacement_appointment_id)
        references appointments(tenant_id, id),
    constraint fk_appt_evt_user foreign key (tenant_id, occurred_by)
        references user_accounts(tenant_id, id),
    constraint ck_appt_evt_type check (event_type in (
        'BOOKED', 'CANCELLED', 'RESCHEDULED', 'REGISTERED', 'VISITED', 'NO_SHOW'
    )),
    constraint ck_appt_evt_status_to check (status_to in (
        'BOOKED', 'REGISTERED', 'VISITED', 'CANCELLED', 'NO_SHOW'
    ))
);
create index idx_appt_evt_time on appointment_events (tenant_id, appointment_id, occurred_at);
create index idx_appt_source_status on appointments (tenant_id, booking_source, status, start_at);

alter table registration_billing_intents add column appointment_id bigint;
alter table registration_billing_intents add constraint fk_reg_bill_appointment
    foreign key (tenant_id, appointment_id) references appointments(tenant_id, id);
create index idx_reg_bill_appointment on registration_billing_intents
    (tenant_id, appointment_id, status, created_at);

alter table patient_registrations add constraint uk_registration_appointment
    unique (tenant_id, appointment_id);
