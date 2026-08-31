-- A suspended consultation remains an active encounter but no longer occupies an active doctor work session.

alter table queue_tickets drop constraint ck_queue_ticket_status;
alter table queue_tickets add constraint ck_queue_ticket_status
    check (status in ('WAITING', 'IN_SERVICE', 'SUSPENDED', 'COMPLETED', 'CANCELLED'));

alter table queue_ticket_events drop constraint ck_queue_event_type;
alter table queue_ticket_events add constraint ck_queue_event_type
    check (event_type in ('ENQUEUED', 'STARTED', 'SUSPENDED', 'RESUMED', 'COMPLETED', 'CANCELLED'));
