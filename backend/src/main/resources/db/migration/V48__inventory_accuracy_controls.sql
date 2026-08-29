create table inventory_open_packages (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    organization_id bigint not null,
    stock_site_id bigint not null,
    stock_bin_id bigint not null,
    stock_item_id bigint not null,
    stock_lot_id bigint not null,
    package_id bigint not null,
    trace_code_id bigint,
    request_code varchar(128) not null,
    source_unit_code varchar(64) not null,
    base_unit_code varchar(64) not null,
    package_factor decimal(28,8) not null,
    opened_base_quantity decimal(28,8) not null,
    remaining_base_quantity decimal(28,8) not null,
    status varchar(32) not null,
    opened_at timestamp with time zone not null,
    opened_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    closed_at timestamp with time zone,
    constraint fk_open_pkg_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_open_pkg_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_open_pkg_site foreign key (tenant_id, stock_site_id) references stock_sites(tenant_id, id),
    constraint fk_open_pkg_bin foreign key (tenant_id, stock_bin_id) references stock_bins(tenant_id, id),
    constraint fk_open_pkg_item foreign key (tenant_id, stock_item_id) references stock_items(tenant_id, id),
    constraint fk_open_pkg_lot foreign key (tenant_id, stock_lot_id) references stock_lots(tenant_id, id),
    constraint fk_open_pkg_package foreign key (tenant_id, package_id) references item_packages(tenant_id, id),
    constraint fk_open_pkg_trace foreign key (tenant_id, trace_code_id) references inventory_trace_codes(tenant_id, id),
    constraint uk_open_pkg_tenant_id unique (tenant_id, id),
    constraint uk_open_pkg_request unique (tenant_id, request_code),
    constraint uk_open_pkg_trace unique (tenant_id, trace_code_id),
    constraint ck_open_pkg_quantity check (package_factor > 0 and opened_base_quantity > 0
        and remaining_base_quantity >= 0 and remaining_base_quantity <= opened_base_quantity),
    constraint ck_open_pkg_status check (status in ('OPEN', 'CONSUMED', 'VOID'))
);
create index idx_open_pkg_dimension on inventory_open_packages
    (tenant_id, stock_site_id, stock_bin_id, stock_item_id, stock_lot_id, status, opened_at);

create table inventory_split_events (
    id bigint primary key,
    tenant_id bigint not null,
    open_package_id bigint not null,
    event_type varchar(32) not null,
    source_type varchar(64) not null,
    source_id bigint,
    source_no varchar(128) not null,
    quantity_delta decimal(28,8) not null,
    balance_after decimal(28,8) not null,
    occurred_at timestamp with time zone not null,
    occurred_by bigint not null,
    description varchar(1000),
    constraint fk_split_evt_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_split_evt_package foreign key (tenant_id, open_package_id) references inventory_open_packages(tenant_id, id),
    constraint uk_split_evt_tenant_id unique (tenant_id, id),
    constraint ck_split_evt_type check (event_type in ('OPEN', 'CONSUME', 'RETURN', 'ADJUST', 'VOID')),
    constraint ck_split_evt_quantity check (quantity_delta <> 0 and balance_after >= 0)
);
create index idx_split_evt_package on inventory_split_events (tenant_id, open_package_id, occurred_at);
create index idx_split_evt_source on inventory_split_events (tenant_id, source_type, source_id, occurred_at);

create table inventory_reconciliation_runs (
    id bigint primary key,
    tenant_id bigint not null,
    organization_id bigint not null,
    stock_site_id bigint not null,
    run_no varchar(64) not null,
    run_type varchar(32) not null,
    status varchar(32) not null,
    business_date date not null,
    started_at timestamp with time zone not null,
    completed_at timestamp with time zone,
    run_by bigint,
    dimension_count integer default 0 not null,
    issue_count integer default 0 not null,
    constraint fk_inv_rec_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inv_rec_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_inv_rec_site foreign key (tenant_id, stock_site_id) references stock_sites(tenant_id, id),
    constraint uk_inv_rec_tenant_id unique (tenant_id, id),
    constraint uk_inv_rec_no unique (tenant_id, run_no),
    constraint ck_inv_rec_type check (run_type in ('MANUAL', 'SCHEDULED')),
    constraint ck_inv_rec_status check (status in ('RUNNING', 'PASSED', 'ISSUES', 'FAILED')),
    constraint ck_inv_rec_counts check (dimension_count >= 0 and issue_count >= 0)
);
create index idx_inv_rec_site on inventory_reconciliation_runs (tenant_id, stock_site_id, started_at);

create table inventory_reconciliation_lines (
    id bigint primary key,
    tenant_id bigint not null,
    reconciliation_run_id bigint not null,
    stock_bin_id bigint,
    stock_item_id bigint,
    stock_lot_id bigint,
    stock_status varchar(32),
    issue_type varchar(32) not null,
    expected_quantity decimal(28,8) not null,
    actual_quantity decimal(28,8) not null,
    difference_quantity decimal(28,8) not null,
    severity varchar(16) not null,
    description varchar(1000) not null,
    constraint fk_inv_rec_line_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inv_rec_line_run foreign key (tenant_id, reconciliation_run_id) references inventory_reconciliation_runs(tenant_id, id),
    constraint uk_inv_rec_line_tenant_id unique (tenant_id, id),
    constraint ck_inv_rec_line_type check (issue_type in ('LEDGER_BALANCE', 'RESERVATION_BALANCE', 'OPEN_PACKAGE_BALANCE', 'TRACE_BALANCE')),
    constraint ck_inv_rec_line_severity check (severity in ('WARNING', 'ERROR'))
);
create index idx_inv_rec_line_run on inventory_reconciliation_lines (tenant_id, reconciliation_run_id, severity, issue_type);
