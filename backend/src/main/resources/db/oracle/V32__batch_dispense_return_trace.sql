alter table dispense_tasks add (picked_by_user_id number(19), picked_assignment_id number(19), pick_description varchar2(1000 char));
alter table dispense_tasks drop constraint ck_dispense_task_status;
alter table dispense_tasks add constraint ck_dispense_task_status check (status in (
    'PENDING_REVIEW', 'INTERVENTION', 'READY_TO_PICK', 'PICKING', 'READY_TO_DISPENSE',
    'PARTIALLY_DISPENSED', 'COMPLETED', 'PARTIALLY_RETURNED', 'RETURNED', 'REJECTED', 'CANCELLED'));
alter table dispense_task_lines drop constraint ck_dispense_line_status;
alter table dispense_task_lines add constraint ck_dispense_line_status check (
    status in ('PENDING', 'READY', 'PICKING', 'READY_TO_DISPENSE', 'PARTIAL', 'COMPLETED', 'RETURNED', 'CANCELLED'));

create table medication_dispenses (
    id number(19) primary key, tenant_id number(19) not null, task_id number(19) not null,
    resident_id number(19) not null, encounter_id number(19) not null, stock_site_id number(19) not null,
    original_dispense_id number(19), dispense_no varchar2(64 char) not null, dispense_type varchar2(32 char) not null,
    occurred_at timestamp with time zone not null, dispenser_practitioner_id number(19) not null,
    dispenser_user_id number(19) not null, dispenser_assignment_id number(19) not null,
    checker_practitioner_id number(19), checker_user_id number(19), checker_assignment_id number(19),
    checked_at timestamp with time zone, operation_quantity number(28,8) not null,
    operation_unit_code varchar2(64 char) not null, description varchar2(1000 char),
    constraint fk_med_disp_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_med_disp_task foreign key (tenant_id, task_id) references dispense_tasks(tenant_id, id),
    constraint fk_med_disp_resident foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_med_disp_encounter foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint fk_med_disp_site foreign key (tenant_id, stock_site_id) references stock_sites(tenant_id, id),
    constraint uk_med_disp_tenant_id unique (tenant_id, id), constraint uk_med_disp_no unique (tenant_id, dispense_no),
    constraint fk_med_disp_original foreign key (tenant_id, original_dispense_id) references medication_dispenses(tenant_id, id),
    constraint ck_med_disp_type check (dispense_type in ('DISPENSE', 'RETURN', 'REDISPENSE')),
    constraint ck_med_disp_quantity check (operation_quantity > 0),
    constraint ck_med_disp_checker check ((checker_practitioner_id is null and checker_user_id is null and checker_assignment_id is null and checked_at is null) or (checker_practitioner_id is not null and checker_user_id is not null and checker_assignment_id is not null and checked_at is not null))
);
create index idx_med_disp_task on medication_dispenses (tenant_id, task_id, occurred_at);
create index idx_med_disp_resident on medication_dispenses (tenant_id, resident_id, occurred_at);

create table medication_dispense_lines (
    id number(19) primary key, tenant_id number(19) not null, medication_dispense_id number(19) not null,
    task_line_id number(19) not null, original_dispense_line_id number(19), sort_order number(10) not null,
    stock_bin_id number(19) not null, stock_item_id number(19) not null, stock_lot_id number(19) not null,
    inventory_transaction_line_id number(19) not null, quantity_dispensed number(28,8) not null,
    dispense_unit_code varchar2(64 char) not null, base_quantity_factor number(28,8) not null,
    constraint fk_med_disp_line_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_med_disp_line_header foreign key (tenant_id, medication_dispense_id) references medication_dispenses(tenant_id, id),
    constraint fk_med_disp_line_task foreign key (tenant_id, task_line_id) references dispense_task_lines(tenant_id, id),
    constraint uk_med_disp_line_tenant_id unique (tenant_id, id),
    constraint fk_med_disp_line_original foreign key (tenant_id, original_dispense_line_id) references medication_dispense_lines(tenant_id, id),
    constraint fk_med_disp_line_bin foreign key (tenant_id, stock_bin_id) references stock_bins(tenant_id, id),
    constraint fk_med_disp_line_item foreign key (tenant_id, stock_item_id) references stock_items(tenant_id, id),
    constraint fk_med_disp_line_lot foreign key (tenant_id, stock_lot_id) references stock_lots(tenant_id, id),
    constraint fk_med_disp_line_inv foreign key (tenant_id, inventory_transaction_line_id) references inventory_transaction_lines(tenant_id, id),
    constraint uk_med_disp_line_order unique (tenant_id, medication_dispense_id, sort_order),
    constraint uk_med_disp_line_inv unique (tenant_id, inventory_transaction_line_id),
    constraint ck_med_disp_line_quantity check (quantity_dispensed > 0 and base_quantity_factor > 0)
);
create index idx_med_disp_line_task on medication_dispense_lines (tenant_id, task_line_id, stock_lot_id);
create index idx_med_disp_line_original on medication_dispense_lines (tenant_id, original_dispense_line_id);

create table stock_returns (
    id number(19) primary key, revision number(19) default 0 not null, tenant_id number(19) not null,
    stock_site_id number(19) not null, resident_id number(19) not null, original_dispense_id number(19) not null,
    return_dispense_id number(19) not null, return_no varchar2(64 char) not null,
    return_type varchar2(32 char) not null, status varchar2(32 char) not null, reason_code varchar2(64 char) not null,
    requested_at timestamp with time zone not null, requested_by number(19) not null,
    confirmed_at timestamp with time zone not null, confirmed_by number(19) not null, description varchar2(1000 char),
    constraint fk_stock_ret_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_stock_ret_site foreign key (tenant_id, stock_site_id) references stock_sites(tenant_id, id),
    constraint fk_stock_ret_resident foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_stock_ret_original foreign key (tenant_id, original_dispense_id) references medication_dispenses(tenant_id, id),
    constraint fk_stock_ret_event foreign key (tenant_id, return_dispense_id) references medication_dispenses(tenant_id, id),
    constraint uk_stock_ret_tenant_id unique (tenant_id, id), constraint uk_stock_ret_no unique (tenant_id, return_no),
    constraint uk_stock_ret_event unique (tenant_id, return_dispense_id),
    constraint ck_stock_ret_type check (return_type in ('PATIENT', 'SUPPLIER')),
    constraint ck_stock_ret_status check (status in ('REQUESTED', 'CONFIRMED', 'REJECTED', 'CANCELLED'))
);
create index idx_stock_ret_site on stock_returns (tenant_id, stock_site_id, status, requested_at);
create index idx_stock_ret_resident on stock_returns (tenant_id, resident_id, requested_at);

create table stock_return_lines (
    id number(19) primary key, tenant_id number(19) not null, stock_return_id number(19) not null,
    original_dispense_line_id number(19) not null, sort_order number(10) not null,
    stock_bin_id number(19) not null, stock_item_id number(19) not null, stock_lot_id number(19) not null,
    inventory_transaction_line_id number(19) not null, quantity_requested number(28,8) not null,
    quantity_accepted number(28,8) not null, return_unit_code varchar2(64 char) not null,
    base_quantity_factor number(28,8) not null, disposition varchar2(32 char) not null,
    exception_description varchar2(1000 char),
    constraint fk_stock_ret_line_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_stock_ret_line_header foreign key (tenant_id, stock_return_id) references stock_returns(tenant_id, id),
    constraint fk_stock_ret_line_original foreign key (tenant_id, original_dispense_line_id) references medication_dispense_lines(tenant_id, id),
    constraint fk_stock_ret_line_bin foreign key (tenant_id, stock_bin_id) references stock_bins(tenant_id, id),
    constraint fk_stock_ret_line_item foreign key (tenant_id, stock_item_id) references stock_items(tenant_id, id),
    constraint fk_stock_ret_line_lot foreign key (tenant_id, stock_lot_id) references stock_lots(tenant_id, id),
    constraint fk_stock_ret_line_inv foreign key (tenant_id, inventory_transaction_line_id) references inventory_transaction_lines(tenant_id, id),
    constraint uk_stock_ret_line_tenant_id unique (tenant_id, id),
    constraint uk_stock_ret_line_order unique (tenant_id, stock_return_id, sort_order),
    constraint uk_stock_ret_line_inv unique (tenant_id, inventory_transaction_line_id),
    constraint ck_stock_ret_line_quantity check (quantity_requested > 0 and quantity_accepted > 0 and quantity_accepted <= quantity_requested and base_quantity_factor > 0),
    constraint ck_stock_ret_line_disposition check (disposition in ('RESTOCK', 'QUARANTINE', 'DESTROY', 'RETURN_SUPPLIER'))
);
create index idx_stock_ret_line_item on stock_return_lines (tenant_id, stock_item_id, stock_lot_id);
