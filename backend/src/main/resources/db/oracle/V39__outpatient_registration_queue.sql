-- Oracle variant of the primary-care reception chain.

create table appointments (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    schedule_id number(19) not null,
    slot_pool_id number(19) not null,
    resident_id number(19) not null,
    appointment_no varchar2(32 char) not null,
    idempotency_code varchar2(128 char) not null,
    status varchar2(24 char) not null,
    service_code varchar2(64 char) not null,
    service_name_snapshot varchar2(300 char) not null,
    practitioner_id number(19) not null,
    practitioner_name_snapshot varchar2(100 char) not null,
    start_at timestamp with time zone not null,
    end_at timestamp with time zone not null,
    quantity number(10) default 1 not null,
    confirmed_at timestamp with time zone not null,
    checked_in_at timestamp with time zone not null,
    created_at timestamp with time zone not null,
    created_by number(19) not null,
    constraint uk_appointment_tenant_id unique (tenant_id, id),
    constraint uk_appointment_no unique (tenant_id, appointment_no),
    constraint uk_appointment_idempotency unique (tenant_id, idempotency_code),
    constraint fk_appointment_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_appointment_schedule foreign key (tenant_id, schedule_id)
        references service_schedules(tenant_id, id),
    constraint fk_appointment_pool foreign key (tenant_id, slot_pool_id)
        references schedule_slot_pools(tenant_id, id),
    constraint fk_appointment_resident foreign key (tenant_id, resident_id)
        references residents(tenant_id, id),
    constraint fk_appointment_practitioner foreign key (tenant_id, practitioner_id)
        references practitioners(tenant_id, id),
    constraint fk_appointment_user foreign key (tenant_id, created_by)
        references user_accounts(tenant_id, id),
    constraint ck_appointment_status check (status in ('REGISTERED', 'VISITED', 'CANCELLED', 'NO_SHOW')),
    constraint ck_appointment_time check (end_at > start_at),
    constraint ck_appointment_quantity check (quantity > 0)
);
create index idx_appointment_resident on appointments (tenant_id, resident_id, start_at, status);
create index idx_appointment_schedule on appointments (tenant_id, schedule_id, status, start_at);

create table patient_registrations (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    appointment_id number(19),
    schedule_id number(19),
    resident_id number(19) not null,
    organization_id number(19) not null,
    department_id number(19) not null,
    encounter_id number(19) not null,
    registration_no varchar2(32 char) not null,
    idempotency_code varchar2(128 char) not null,
    registration_source varchar2(24 char) not null,
    visit_type varchar2(24 char) not null,
    status varchar2(24 char) not null,
    registered_at timestamp with time zone not null,
    registered_by number(19) not null,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    constraint uk_registration_tenant_id unique (tenant_id, id),
    constraint uk_registration_no unique (tenant_id, registration_no),
    constraint uk_registration_idempotency unique (tenant_id, idempotency_code),
    constraint uk_registration_encounter unique (tenant_id, encounter_id),
    constraint fk_registration_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_registration_appointment foreign key (tenant_id, appointment_id)
        references appointments(tenant_id, id),
    constraint fk_registration_schedule foreign key (tenant_id, schedule_id)
        references service_schedules(tenant_id, id),
    constraint fk_registration_resident foreign key (tenant_id, resident_id)
        references residents(tenant_id, id),
    constraint fk_registration_organization foreign key (tenant_id, organization_id)
        references organizations(tenant_id, id),
    constraint fk_registration_department foreign key (tenant_id, organization_id, department_id)
        references departments(tenant_id, organization_id, id),
    constraint fk_registration_user foreign key (tenant_id, registered_by)
        references user_accounts(tenant_id, id),
    constraint ck_registration_source check (registration_source in ('WINDOW', 'WALK_IN', 'DIRECT', 'EMERGENCY')),
    constraint ck_registration_visit_type check (visit_type in ('GENERAL', 'FOLLOW_UP', 'EMERGENCY')),
    constraint ck_registration_status check (status in ('WAITING', 'IN_SERVICE', 'COMPLETED', 'CANCELLED'))
);
create index idx_registration_resident on patient_registrations (tenant_id, resident_id, registered_at, status);
create index idx_registration_context on patient_registrations (tenant_id, organization_id, department_id, registered_at, status);

create table queue_counters (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    queue_code varchar2(100 char) not null,
    queue_date date not null,
    next_sequence number(10) default 1 not null,
    constraint uk_queue_counter_context unique (tenant_id, queue_code, queue_date),
    constraint fk_queue_counter_tenant foreign key (tenant_id) references tenants(id),
    constraint ck_queue_counter_next check (next_sequence > 0)
);

create table queue_tickets (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    registration_id number(19) not null,
    idempotency_code varchar2(128 char) not null,
    queue_code varchar2(100 char) not null,
    queue_date date not null,
    ticket_no varchar2(32 char) not null,
    sequence_no number(10) not null,
    priority number(10) default 0 not null,
    status varchar2(24 char) not null,
    queued_at timestamp with time zone not null,
    called_at timestamp with time zone,
    completed_at timestamp with time zone,
    constraint uk_queue_ticket_tenant_id unique (tenant_id, id),
    constraint uk_queue_ticket_registration unique (tenant_id, registration_id),
    constraint uk_queue_ticket_idempotency unique (tenant_id, idempotency_code),
    constraint uk_queue_ticket_sequence unique (tenant_id, queue_code, queue_date, sequence_no),
    constraint uk_queue_ticket_no unique (tenant_id, ticket_no),
    constraint fk_queue_ticket_registration foreign key (tenant_id, registration_id)
        references patient_registrations(tenant_id, id),
    constraint ck_queue_ticket_priority check (priority >= 0),
    constraint ck_queue_ticket_status check (status in ('WAITING', 'IN_SERVICE', 'COMPLETED', 'CANCELLED'))
);
create index idx_queue_ticket_current on queue_tickets (tenant_id, queue_code, queue_date, status, priority, sequence_no);

create table queue_ticket_events (
    id number(19) primary key,
    tenant_id number(19) not null,
    queue_ticket_id number(19) not null,
    event_type varchar2(24 char) not null,
    status_from varchar2(24 char),
    status_to varchar2(24 char) not null,
    command_code varchar2(128 char) not null,
    occurred_at timestamp with time zone not null,
    occurred_by number(19) not null,
    description varchar2(500 char),
    constraint uk_queue_event_command unique (tenant_id, queue_ticket_id, command_code),
    constraint fk_queue_event_ticket foreign key (tenant_id, queue_ticket_id)
        references queue_tickets(tenant_id, id),
    constraint fk_queue_event_user foreign key (tenant_id, occurred_by)
        references user_accounts(tenant_id, id),
    constraint ck_queue_event_type check (event_type in ('ENQUEUED', 'STARTED', 'COMPLETED', 'CANCELLED'))
);
create index idx_queue_event_time on queue_ticket_events (tenant_id, queue_ticket_id, occurred_at);

alter table encounters add registration_id number(19);
alter table encounters add schedule_id number(19);
alter table encounters add appointment_id number(19);
alter table encounters add registration_source varchar2(24 char);
alter table encounters add visit_type varchar2(24 char);
alter table encounters add constraint fk_encounter_registration foreign key (tenant_id, registration_id)
    references patient_registrations(tenant_id, id);
alter table encounters add constraint fk_encounter_schedule foreign key (tenant_id, schedule_id)
    references service_schedules(tenant_id, id);
alter table encounters add constraint fk_encounter_appointment foreign key (tenant_id, appointment_id)
    references appointments(tenant_id, id);
