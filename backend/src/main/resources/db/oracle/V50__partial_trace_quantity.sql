alter table inventory_trace_codes add remaining_base_quantity number(28,8) default 0 not null;
update inventory_trace_codes
set remaining_base_quantity = case when status in ('ISSUED', 'VOID') then 0 else base_quantity end;

alter table inventory_trace_codes drop constraint ck_trace_quantity;
alter table inventory_trace_codes add constraint ck_trace_quantity check (
    package_quantity > 0 and base_quantity > 0
    and remaining_base_quantity >= 0 and remaining_base_quantity <= base_quantity
);
alter table inventory_trace_codes drop constraint ck_trace_status;
alter table inventory_trace_codes add constraint ck_trace_status check (status in (
    'PENDING_RECEIPT', 'AVAILABLE', 'OPENED', 'PARTIALLY_ISSUED', 'RESERVED', 'IN_TRANSIT',
    'ISSUED', 'RETURNED', 'QUARANTINED', 'DAMAGED', 'RECALLED', 'VOID'
));

alter table inventory_trace_events add quantity_delta number(28,8) default 0 not null;
alter table inventory_trace_events add balance_after number(28,8) default 0 not null;
alter table inventory_trace_events add constraint ck_trace_evt_quantity check (balance_after >= 0);
