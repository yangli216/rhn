alter table dispense_tasks add column picked_by_user_id bigint;
alter table dispense_tasks add column picked_assignment_id bigint;
alter table dispense_tasks add column pick_description varchar(1000);
alter table dispense_tasks drop constraint ck_dispense_task_status;
alter table dispense_tasks add constraint ck_dispense_task_status check (status in (
    'PENDING_REVIEW', 'INTERVENTION', 'READY_TO_PICK', 'PICKING', 'READY_TO_DISPENSE',
    'PARTIALLY_DISPENSED', 'COMPLETED', 'PARTIALLY_RETURNED', 'RETURNED', 'REJECTED', 'CANCELLED'));

alter table dispense_task_lines drop constraint ck_dispense_line_status;
alter table dispense_task_lines add constraint ck_dispense_line_status check (
    status in ('PENDING', 'READY', 'PICKING', 'READY_TO_DISPENSE', 'PARTIAL', 'COMPLETED', 'RETURNED', 'CANCELLED'));

create table medication_dispenses (
    id bigint primary key,
    tenant_id bigint not null,
    task_id bigint not null,
    resident_id bigint not null,
    encounter_id bigint not null,
    stock_site_id bigint not null,
    original_dispense_id bigint,
    dispense_no varchar(64) not null,
    dispense_type varchar(32) not null,
    occurred_at timestamp with time zone not null,
    dispenser_practitioner_id bigint not null,
    dispenser_user_id bigint not null,
    dispenser_assignment_id bigint not null,
    checker_practitioner_id bigint,
    checker_user_id bigint,
    checker_assignment_id bigint,
    checked_at timestamp with time zone,
    operation_quantity decimal(28,8) not null,
    operation_unit_code varchar(64) not null,
    description varchar(1000),
    constraint fk_med_disp_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_med_disp_task foreign key (tenant_id, task_id) references dispense_tasks(tenant_id, id),
    constraint fk_med_disp_resident foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_med_disp_encounter foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint fk_med_disp_site foreign key (tenant_id, stock_site_id) references stock_sites(tenant_id, id),
    constraint uk_med_disp_tenant_id unique (tenant_id, id),
    constraint uk_med_disp_no unique (tenant_id, dispense_no),
    constraint fk_med_disp_original foreign key (tenant_id, original_dispense_id) references medication_dispenses(tenant_id, id),
    constraint ck_med_disp_type check (dispense_type in ('DISPENSE', 'RETURN', 'REDISPENSE')),
    constraint ck_med_disp_quantity check (operation_quantity > 0),
    constraint ck_med_disp_checker check (
        (checker_practitioner_id is null and checker_user_id is null and checker_assignment_id is null and checked_at is null)
        or (checker_practitioner_id is not null and checker_user_id is not null and checker_assignment_id is not null and checked_at is not null))
);
create index idx_med_disp_task on medication_dispenses (tenant_id, task_id, occurred_at);
create index idx_med_disp_resident on medication_dispenses (tenant_id, resident_id, occurred_at);

create table medication_dispense_lines (
    id bigint primary key,
    tenant_id bigint not null,
    medication_dispense_id bigint not null,
    task_line_id bigint not null,
    original_dispense_line_id bigint,
    sort_order int not null,
    stock_bin_id bigint not null,
    stock_item_id bigint not null,
    stock_lot_id bigint not null,
    inventory_transaction_line_id bigint not null,
    quantity_dispensed decimal(28,8) not null,
    dispense_unit_code varchar(64) not null,
    base_quantity_factor decimal(28,8) not null,
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
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    stock_site_id bigint not null,
    resident_id bigint not null,
    original_dispense_id bigint not null,
    return_dispense_id bigint not null,
    return_no varchar(64) not null,
    return_type varchar(32) not null,
    status varchar(32) not null,
    reason_code varchar(64) not null,
    requested_at timestamp with time zone not null,
    requested_by bigint not null,
    confirmed_at timestamp with time zone not null,
    confirmed_by bigint not null,
    description varchar(1000),
    constraint fk_stock_ret_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_stock_ret_site foreign key (tenant_id, stock_site_id) references stock_sites(tenant_id, id),
    constraint fk_stock_ret_resident foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_stock_ret_original foreign key (tenant_id, original_dispense_id) references medication_dispenses(tenant_id, id),
    constraint fk_stock_ret_event foreign key (tenant_id, return_dispense_id) references medication_dispenses(tenant_id, id),
    constraint uk_stock_ret_tenant_id unique (tenant_id, id),
    constraint uk_stock_ret_no unique (tenant_id, return_no),
    constraint uk_stock_ret_event unique (tenant_id, return_dispense_id),
    constraint ck_stock_ret_type check (return_type in ('PATIENT', 'SUPPLIER')),
    constraint ck_stock_ret_status check (status in ('REQUESTED', 'CONFIRMED', 'REJECTED', 'CANCELLED'))
);
create index idx_stock_ret_site on stock_returns (tenant_id, stock_site_id, status, requested_at);
create index idx_stock_ret_resident on stock_returns (tenant_id, resident_id, requested_at);

create table stock_return_lines (
    id bigint primary key,
    tenant_id bigint not null,
    stock_return_id bigint not null,
    original_dispense_line_id bigint not null,
    sort_order int not null,
    stock_bin_id bigint not null,
    stock_item_id bigint not null,
    stock_lot_id bigint not null,
    inventory_transaction_line_id bigint not null,
    quantity_requested decimal(28,8) not null,
    quantity_accepted decimal(28,8) not null,
    return_unit_code varchar(64) not null,
    base_quantity_factor decimal(28,8) not null,
    disposition varchar(32) not null,
    exception_description varchar(1000),
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
