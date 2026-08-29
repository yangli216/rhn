alter table service_schedule_events drop constraint ck_sched_event_type;
alter table service_schedule_events add constraint ck_sched_event_type
    check (event_type in ('CREATED', 'PUBLISHED', 'UPDATED', 'SUSPENDED', 'CANCELLED', 'COMPLETED'));
