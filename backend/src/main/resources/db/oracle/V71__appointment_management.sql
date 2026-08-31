alter table appointments modify checked_in_at null;
alter table appointments add booking_source varchar2(24 char) default 'WINDOW' not null;
alter table appointments add cancelled_at timestamp with time zone;
alter table appointments add cancellation_reason varchar2(500 char);
alter table appointments add rescheduled_from_id number(19);
alter table appointments add updated_at timestamp with time zone;
alter table appointments add updated_by number(19);

update appointments set updated_at = created_at, updated_by = created_by;
alter table appointments modify updated_at not null;
alter table appointments modify updated_by not null;

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
    id number(19) primary key,
    tenant_id number(19) not null,
    appointment_id number(19) not null,
    replacement_appointment_id number(19),
    event_type varchar2(32 char) not null,
    status_from varchar2(24 char),
    status_to varchar2(24 char) not null,
    command_code varchar2(128 char) not null,
    occurred_at timestamp with time zone not null,
    occurred_by number(19) not null,
    description varchar2(1000 char),
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

alter table registration_billing_intents add appointment_id number(19);
alter table registration_billing_intents add constraint fk_reg_bill_appointment
    foreign key (tenant_id, appointment_id) references appointments(tenant_id, id);
create index idx_reg_bill_appointment on registration_billing_intents
    (tenant_id, appointment_id, status, created_at);

alter table patient_registrations add constraint uk_registration_appointment
    unique (tenant_id, appointment_id);
