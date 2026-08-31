-- Oracle variant: explicit clinical termination after service has started.

alter table encounters add termination_code varchar2(32 char);
alter table encounters add termination_reason varchar2(500 char);
alter table encounters add terminated_at timestamp with time zone;
alter table encounters add terminated_by number(19);

alter table queue_tickets drop constraint ck_queue_ticket_status;
alter table queue_tickets add constraint ck_queue_ticket_status
    check (status in ('WAITING', 'IN_SERVICE', 'SUSPENDED', 'COMPLETED', 'TERMINATED', 'CANCELLED'));

alter table queue_ticket_events drop constraint ck_queue_event_type;
alter table queue_ticket_events add constraint ck_queue_event_type
    check (event_type in ('ENQUEUED', 'STARTED', 'SUSPENDED', 'RESUMED', 'COMPLETED', 'TERMINATED', 'CANCELLED'));

create index idx_encounter_termination on encounters (tenant_id, status, terminated_at);
