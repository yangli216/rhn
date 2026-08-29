-- Primary-care reception chain: schedule inventory -> appointment snapshot -> registration -> queue -> encounter.

create table appointments (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    schedule_id bigint not null,
    slot_pool_id bigint not null,
    resident_id bigint not null,
    appointment_no varchar(32) not null,
    idempotency_code varchar(128) not null,
    status varchar(24) not null,
    service_code varchar(64) not null,
    service_name_snapshot varchar(300) not null,
    practitioner_id bigint not null,
    practitioner_name_snapshot varchar(100) not null,
    start_at timestamp with time zone not null,
    end_at timestamp with time zone not null,
    quantity integer default 1 not null,
    confirmed_at timestamp with time zone not null,
    checked_in_at timestamp with time zone not null,
    created_at timestamp with time zone not null,
    created_by bigint not null,
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
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    appointment_id bigint,
    schedule_id bigint,
    resident_id bigint not null,
    organization_id bigint not null,
    department_id bigint not null,
    encounter_id bigint not null,
    registration_no varchar(32) not null,
    idempotency_code varchar(128) not null,
    registration_source varchar(24) not null,
    visit_type varchar(24) not null,
    status varchar(24) not null,
    registered_at timestamp with time zone not null,
    registered_by bigint not null,
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
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    queue_code varchar(100) not null,
    queue_date date not null,
    next_sequence integer default 1 not null,
    constraint uk_queue_counter_context unique (tenant_id, queue_code, queue_date),
    constraint fk_queue_counter_tenant foreign key (tenant_id) references tenants(id),
    constraint ck_queue_counter_next check (next_sequence > 0)
);

create table queue_tickets (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    registration_id bigint not null,
    idempotency_code varchar(128) not null,
    queue_code varchar(100) not null,
    queue_date date not null,
    ticket_no varchar(32) not null,
    sequence_no integer not null,
    priority integer default 0 not null,
    status varchar(24) not null,
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
    id bigint primary key,
    tenant_id bigint not null,
    queue_ticket_id bigint not null,
    event_type varchar(24) not null,
    status_from varchar(24),
    status_to varchar(24) not null,
    command_code varchar(128) not null,
    occurred_at timestamp with time zone not null,
    occurred_by bigint not null,
    description varchar(500),
    constraint uk_queue_event_command unique (tenant_id, queue_ticket_id, command_code),
    constraint fk_queue_event_ticket foreign key (tenant_id, queue_ticket_id)
        references queue_tickets(tenant_id, id),
    constraint fk_queue_event_user foreign key (tenant_id, occurred_by)
        references user_accounts(tenant_id, id),
    constraint ck_queue_event_type check (event_type in ('ENQUEUED', 'STARTED', 'COMPLETED', 'CANCELLED'))
);
create index idx_queue_event_time on queue_ticket_events (tenant_id, queue_ticket_id, occurred_at);

alter table encounters add column registration_id bigint;
alter table encounters add column schedule_id bigint;
alter table encounters add column appointment_id bigint;
alter table encounters add column registration_source varchar(24);
alter table encounters add column visit_type varchar(24);
alter table encounters add constraint fk_encounter_registration foreign key (tenant_id, registration_id)
    references patient_registrations(tenant_id, id);
alter table encounters add constraint fk_encounter_schedule foreign key (tenant_id, schedule_id)
    references service_schedules(tenant_id, id);
alter table encounters add constraint fk_encounter_appointment foreign key (tenant_id, appointment_id)
    references appointments(tenant_id, id);
