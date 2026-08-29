-- Oracle variant: ticket numbers restart for every department queue and business date.

alter table queue_tickets drop constraint uk_queue_ticket_no;
alter table queue_tickets add constraint uk_queue_ticket_no_context
    unique (tenant_id, queue_code, queue_date, ticket_no);
