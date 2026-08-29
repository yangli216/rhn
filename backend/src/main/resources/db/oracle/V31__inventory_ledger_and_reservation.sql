create table stock_bins (
    id number(19) primary key, revision number(19) default 0 not null, tenant_id number(19) not null,
    stock_site_id number(19) not null, parent_bin_id number(19), code varchar2(64 char) not null,
    name varchar2(200 char) not null, bin_type varchar2(32 char) not null, stock_default varchar2(32 char) not null,
    receive_allowed number(1) not null, pick_allowed number(1) not null, count_allowed number(1) not null,
    sort_order number(10) not null, active number(1) not null, created_at timestamp with time zone not null,
    created_by number(19) not null,
    constraint fk_stock_bin_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_stock_bin_site foreign key (tenant_id, stock_site_id) references stock_sites(tenant_id, id),
    constraint uk_stock_bin_tenant_id unique (tenant_id, id),
    constraint uk_stock_bin_code unique (tenant_id, stock_site_id, code),
    constraint fk_stock_bin_parent foreign key (tenant_id, parent_bin_id) references stock_bins(tenant_id, id),
    constraint ck_stock_bin_type check (bin_type in ('ZONE', 'RACK', 'BIN', 'COUNTER', 'TRANSIT')),
    constraint ck_stock_bin_default check (stock_default in ('AVAILABLE', 'PENDING', 'QUARANTINE', 'DAMAGED', 'EXPIRED')),
    constraint ck_stock_bin_flags check (receive_allowed in (0,1) and pick_allowed in (0,1) and count_allowed in (0,1) and active in (0,1))
);
create index idx_stock_bin_site on stock_bins (tenant_id, stock_site_id, active, sort_order);

create table stock_lots (
    id number(19) primary key, revision number(19) default 0 not null, tenant_id number(19) not null,
    catalog_item_id number(19) not null, package_id number(19) not null, lot_no varchar2(128 char) not null,
    production_date date, expiry_date date, approval_code_snapshot varchar2(128 char),
    manufacturer_name_snapshot varchar2(300 char), quality_status varchar2(32 char) not null,
    quality_at timestamp with time zone not null, quality_user_id number(19) not null,
    status varchar2(32 char) not null, created_at timestamp with time zone not null, created_by number(19) not null,
    constraint fk_stock_lot_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_stock_lot_catalog foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint fk_stock_lot_package foreign key (tenant_id, package_id) references item_packages(tenant_id, id),
    constraint uk_stock_lot_tenant_id unique (tenant_id, id),
    constraint uk_stock_lot_business unique (tenant_id, catalog_item_id, package_id, lot_no),
    constraint ck_stock_lot_quality check (quality_status in ('PENDING', 'QUALIFIED', 'QUARANTINE', 'REJECTED', 'RECALLED')),
    constraint ck_stock_lot_status check (status in ('ACTIVE', 'CLOSED', 'RETIRED')),
    constraint ck_stock_lot_dates check (expiry_date is null or production_date is null or expiry_date >= production_date)
);
create index idx_stock_lot_issue on stock_lots (tenant_id, catalog_item_id, quality_status, status, expiry_date);

create table inventory_periods (
    id number(19) primary key, revision number(19) default 0 not null, tenant_id number(19) not null,
    stock_site_id number(19) not null, period_code varchar2(32 char) not null, period_from date not null,
    period_to date not null, status varchar2(32 char) not null, closed_at timestamp with time zone,
    closed_by number(19), description varchar2(1000 char), created_at timestamp with time zone not null,
    created_by number(19) not null,
    constraint fk_inv_period_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inv_period_site foreign key (tenant_id, stock_site_id) references stock_sites(tenant_id, id),
    constraint uk_inv_period_tenant_id unique (tenant_id, id),
    constraint uk_inv_period_code unique (tenant_id, stock_site_id, period_code),
    constraint ck_inv_period_status check (status in ('OPEN', 'CLOSING', 'CLOSED')),
    constraint ck_inv_period_dates check (period_to >= period_from)
);
create index idx_inv_period_open on inventory_periods (tenant_id, stock_site_id, status);

create table inventory_transactions (
    id number(19) primary key, tenant_id number(19) not null, inventory_period_id number(19) not null,
    reverses_transaction_id number(19), transaction_no varchar2(64 char) not null,
    request_code varchar2(128 char) not null, transaction_type varchar2(32 char) not null,
    source_type varchar2(32 char) not null, source_code varchar2(128 char) not null,
    occurred_at timestamp with time zone not null, posted_at timestamp with time zone not null,
    posted_by number(19) not null, description varchar2(1000 char),
    constraint fk_inv_txn_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inv_txn_period foreign key (tenant_id, inventory_period_id) references inventory_periods(tenant_id, id),
    constraint uk_inv_txn_tenant_id unique (tenant_id, id), constraint uk_inv_txn_no unique (tenant_id, transaction_no),
    constraint uk_inv_txn_request unique (tenant_id, request_code),
    constraint fk_inv_txn_reverses foreign key (tenant_id, reverses_transaction_id) references inventory_transactions(tenant_id, id),
    constraint ck_inv_txn_type check (transaction_type in ('RECEIPT', 'ISSUE', 'TRANSFER', 'COUNT', 'DISPENSE', 'RETURN', 'QUALITY', 'REVERSAL'))
);
create index idx_inv_txn_source on inventory_transactions (tenant_id, source_type, source_code);
create index idx_inv_txn_period on inventory_transactions (tenant_id, inventory_period_id, posted_at);

create table inventory_transaction_lines (
    id number(19) primary key, tenant_id number(19) not null, inventory_transaction_id number(19) not null,
    sort_order number(10) not null, stock_site_id number(19) not null, stock_bin_id number(19) not null,
    stock_item_id number(19) not null, stock_lot_id number(19) not null, package_id number(19) not null,
    stock_status varchar2(32 char) not null, operation_quantity number(28,8) not null,
    operation_unit_code varchar2(64 char) not null, base_quantity_factor number(28,8) not null,
    quantity_delta number(28,8) not null, unit_cost number(24,6), amount_delta number(24,6),
    constraint fk_inv_line_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inv_line_txn foreign key (tenant_id, inventory_transaction_id) references inventory_transactions(tenant_id, id),
    constraint fk_inv_line_site foreign key (tenant_id, stock_site_id) references stock_sites(tenant_id, id),
    constraint fk_inv_line_bin foreign key (tenant_id, stock_bin_id) references stock_bins(tenant_id, id),
    constraint fk_inv_line_item foreign key (tenant_id, stock_item_id) references stock_items(tenant_id, id),
    constraint fk_inv_line_lot foreign key (tenant_id, stock_lot_id) references stock_lots(tenant_id, id),
    constraint fk_inv_line_package foreign key (tenant_id, package_id) references item_packages(tenant_id, id),
    constraint uk_inv_line_tenant_id unique (tenant_id, id),
    constraint uk_inv_line_order unique (tenant_id, inventory_transaction_id, sort_order),
    constraint ck_inv_line_status check (stock_status in ('AVAILABLE', 'PENDING', 'QUARANTINE', 'DAMAGED', 'EXPIRED')),
    constraint ck_inv_line_quantity check (operation_quantity > 0 and base_quantity_factor > 0 and quantity_delta <> 0)
);
create index idx_inv_line_balance on inventory_transaction_lines (tenant_id, stock_bin_id, stock_item_id, stock_lot_id, stock_status);

create table inventory_balances (
    id number(19) primary key, revision number(19) default 0 not null, tenant_id number(19) not null,
    stock_site_id number(19) not null, stock_bin_id number(19) not null, stock_item_id number(19) not null,
    stock_lot_id number(19) not null, stock_status varchar2(32 char) not null,
    base_unit_code varchar2(64 char) not null, quantity_on_hand number(28,8) not null,
    quantity_reserved number(28,8) not null, quantity_frozen number(28,8) not null,
    quantity_available number(28,8) not null, average_unit_cost number(24,6),
    projected_at timestamp with time zone not null,
    constraint fk_inv_bal_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inv_bal_site foreign key (tenant_id, stock_site_id) references stock_sites(tenant_id, id),
    constraint fk_inv_bal_bin foreign key (tenant_id, stock_bin_id) references stock_bins(tenant_id, id),
    constraint fk_inv_bal_item foreign key (tenant_id, stock_item_id) references stock_items(tenant_id, id),
    constraint fk_inv_bal_lot foreign key (tenant_id, stock_lot_id) references stock_lots(tenant_id, id),
    constraint uk_inv_bal_tenant_id unique (tenant_id, id),
    constraint uk_inv_bal_dimension unique (tenant_id, stock_bin_id, stock_item_id, stock_lot_id, stock_status),
    constraint ck_inv_bal_status check (stock_status in ('AVAILABLE', 'PENDING', 'QUARANTINE', 'DAMAGED', 'EXPIRED')),
    constraint ck_inv_bal_quantities check (quantity_on_hand >= 0 and quantity_reserved >= 0 and quantity_frozen >= 0 and quantity_available = quantity_on_hand - quantity_reserved - quantity_frozen and quantity_available >= 0)
);
create index idx_inv_bal_item on inventory_balances (tenant_id, stock_site_id, stock_item_id, stock_status, projected_at);

create table inventory_reservations (
    id number(19) primary key, revision number(19) default 0 not null, tenant_id number(19) not null,
    stock_site_id number(19) not null, stock_bin_id number(19) not null, stock_item_id number(19) not null,
    stock_lot_id number(19) not null, request_id number(19) not null,
    reservation_group_code varchar2(128 char) not null, reservation_type varchar2(32 char) not null,
    status varchar2(32 char) not null, quantity_reserved number(28,8) not null,
    quantity_consumed number(28,8) not null, base_unit_code varchar2(64 char) not null,
    created_at timestamp with time zone not null, created_by number(19) not null,
    expires_at timestamp with time zone, consumed_at timestamp with time zone, consumed_by number(19),
    released_at timestamp with time zone, released_by number(19), release_reason varchar2(1000 char),
    constraint fk_inv_rsv_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inv_rsv_site foreign key (tenant_id, stock_site_id) references stock_sites(tenant_id, id),
    constraint fk_inv_rsv_bin foreign key (tenant_id, stock_bin_id) references stock_bins(tenant_id, id),
    constraint fk_inv_rsv_item foreign key (tenant_id, stock_item_id) references stock_items(tenant_id, id),
    constraint fk_inv_rsv_lot foreign key (tenant_id, stock_lot_id) references stock_lots(tenant_id, id),
    constraint fk_inv_rsv_request foreign key (tenant_id, request_id) references care_requests(tenant_id, id),
    constraint uk_inv_rsv_tenant_id unique (tenant_id, id),
    constraint uk_inv_rsv_dimension unique (tenant_id, reservation_group_code, stock_bin_id, stock_item_id, stock_lot_id),
    constraint ck_inv_rsv_type check (reservation_type in ('ORDER', 'DISPENSE', 'TRANSFER', 'OTHER')),
    constraint ck_inv_rsv_status check (status in ('ACTIVE', 'PARTIAL', 'CONSUMED', 'RELEASED', 'EXPIRED')),
    constraint ck_inv_rsv_quantities check (quantity_reserved > 0 and quantity_consumed >= 0 and quantity_consumed <= quantity_reserved)
);
create index idx_inv_rsv_request on inventory_reservations (tenant_id, request_id, status);
create index idx_inv_rsv_expire on inventory_reservations (tenant_id, expires_at, status);
