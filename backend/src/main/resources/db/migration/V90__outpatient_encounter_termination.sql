-- Preserve an explicit clinical termination fact without reusing pre-service registration cancellation.

alter table encounters add column termination_code varchar(32);
alter table encounters add column termination_reason varchar(500);
alter table encounters add column terminated_at timestamp with time zone;
alter table encounters add column terminated_by bigint;

alter table queue_tickets drop constraint ck_queue_ticket_status;
alter table queue_tickets add constraint ck_queue_ticket_status
    check (status in ('WAITING', 'IN_SERVICE', 'SUSPENDED', 'COMPLETED', 'TERMINATED', 'CANCELLED'));

alter table queue_ticket_events drop constraint ck_queue_event_type;
alter table queue_ticket_events add constraint ck_queue_event_type
    check (event_type in ('ENQUEUED', 'STARTED', 'SUSPENDED', 'RESUMED', 'COMPLETED', 'TERMINATED', 'CANCELLED'));

create index idx_encounter_termination on encounters (tenant_id, status, terminated_at);
