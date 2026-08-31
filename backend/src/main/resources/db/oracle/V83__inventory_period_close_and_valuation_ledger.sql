alter table inventory_periods add (previous_period_id number(19))
/
alter table inventory_periods add constraint uk_inv_period_site_id
    unique (tenant_id, stock_site_id, id)
/
alter table inventory_periods add constraint fk_inv_period_previous
    foreign key (tenant_id, stock_site_id, previous_period_id) references inventory_periods(tenant_id, stock_site_id, id)
/
alter table inventory_periods add constraint ck_inv_period_previous
    check (previous_period_id is null or previous_period_id <> id)
/
create unique index uk_inv_period_previous
    on inventory_periods (
        case when previous_period_id is not null then tenant_id end,
        case when previous_period_id is not null then stock_site_id end,
        case when previous_period_id is not null then previous_period_id end
    )
/
create index idx_inv_period_timeline
    on inventory_periods (tenant_id, stock_site_id, period_from, period_to, status)
/

alter table inventory_reconciliation_runs drop constraint ck_inv_rec_type
/
alter table inventory_reconciliation_runs add constraint ck_inv_rec_type
    check (run_type in ('MANUAL', 'SCHEDULED', 'PERIOD_CLOSE'))
/

alter table inventory_reconciliation_lines drop constraint ck_inv_rec_line_type
/
alter table inventory_reconciliation_lines add constraint ck_inv_rec_line_type
    check (issue_type in (
        'LEDGER_BALANCE', 'RESERVATION_BALANCE', 'OPEN_PACKAGE_BALANCE', 'TRACE_BALANCE',
        'PERIOD_OPENING', 'PERIOD_QUANTITY', 'PERIOD_VALUE', 'VALUATION_LEDGER'
    ))
/
alter table inventory_reconciliation_lines add (
    valuation_basis varchar2(32 char),
    currency_code varchar2(16 char),
    expected_amount number(30,6),
    actual_amount number(30,6),
    difference_amount number(30,6)
)
/
alter table inventory_reconciliation_lines add constraint ck_inv_rec_line_measure
    check (
        (issue_type in ('PERIOD_VALUE', 'VALUATION_LEDGER')
            and valuation_basis in ('COST', 'RETAIL') and currency_code is not null
            and expected_amount is not null and actual_amount is not null and difference_amount is not null
            and difference_amount = actual_amount - expected_amount)
        or (issue_type not in ('PERIOD_VALUE', 'VALUATION_LEDGER')
            and valuation_basis is null and currency_code is null
            and expected_amount is null and actual_amount is null and difference_amount is null)
    )
/

create table inventory_period_close_runs (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    organization_id number(19) not null,
    stock_site_id number(19) not null,
    inventory_period_id number(19) not null,
    previous_period_id number(19),
    reconciliation_run_id number(19),
    run_no varchar2(64 char) not null,
    request_code varchar2(128 char) not null,
    request_hash varchar2(64 char) not null,
    status varchar2(32 char) not null,
    dimension_count number(10) default 0 not null,
    difference_count number(10) default 0 not null,
    started_at timestamp with time zone not null,
    started_by number(19) not null,
    validated_at timestamp with time zone,
    validated_by number(19),
    posted_at timestamp with time zone,
    posted_by number(19),
    completed_at timestamp with time zone,
    failure_code varchar2(128 char),
    failure_message varchar2(1000 char),
    constraint fk_inv_close_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inv_close_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_inv_close_site foreign key (tenant_id, stock_site_id) references stock_sites(tenant_id, id),
    constraint fk_inv_close_period foreign key (tenant_id, stock_site_id, inventory_period_id) references inventory_periods(tenant_id, stock_site_id, id),
    constraint fk_inv_close_previous foreign key (tenant_id, stock_site_id, previous_period_id) references inventory_periods(tenant_id, stock_site_id, id),
    constraint fk_inv_close_reconcile foreign key (tenant_id, reconciliation_run_id) references inventory_reconciliation_runs(tenant_id, id),
    constraint uk_inv_close_tenant_id unique (tenant_id, id),
    constraint uk_inv_close_period_id unique (tenant_id, inventory_period_id, id),
    constraint uk_inv_close_no unique (tenant_id, run_no),
    constraint uk_inv_close_request unique (tenant_id, request_code),
    constraint ck_inv_close_status check (status in ('RUNNING', 'VALIDATED', 'POSTED', 'FAILED', 'VOID')),
    constraint ck_inv_close_previous check (previous_period_id is null or previous_period_id <> inventory_period_id),
    constraint ck_inv_close_counts check (dimension_count >= 0 and difference_count >= 0 and difference_count <= dimension_count),
    constraint ck_inv_close_result check (
        (status = 'POSTED' and difference_count = 0 and posted_at is not null and posted_by is not null)
        or status <> 'POSTED'
    )
)
/
create index idx_inv_close_period
    on inventory_period_close_runs (tenant_id, inventory_period_id, status, started_at)
/
create index idx_inv_close_site
    on inventory_period_close_runs (tenant_id, stock_site_id, started_at, status)
/

create table inventory_period_close_totals (
    id number(19) primary key,
    tenant_id number(19) not null,
    close_run_id number(19) not null,
    valuation_basis varchar2(32 char) not null,
    currency_code varchar2(16 char) not null,
    opening_value number(30,6) default 0 not null,
    movement_amount number(30,6) default 0 not null,
    valuation_adjustment_amount number(30,6) default 0 not null,
    rounding_adjustment_amount number(30,6) default 0 not null,
    closing_value number(30,6) default 0 not null,
    balance_value number(30,6) default 0 not null,
    value_difference number(30,6) default 0 not null,
    created_at timestamp with time zone not null,
    constraint fk_inv_close_total_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inv_close_total_run foreign key (tenant_id, close_run_id) references inventory_period_close_runs(tenant_id, id),
    constraint uk_inv_close_total_tenant_id unique (tenant_id, id),
    constraint uk_inv_close_total_basis unique (tenant_id, close_run_id, valuation_basis, currency_code),
    constraint ck_inv_close_total_basis check (valuation_basis in ('COST', 'RETAIL')),
    constraint ck_inv_close_total_equation check (
        closing_value = opening_value + movement_amount + valuation_adjustment_amount + rounding_adjustment_amount
        and value_difference = balance_value - closing_value
    )
)
/
create index idx_inv_close_total_run
    on inventory_period_close_totals (tenant_id, close_run_id, valuation_basis)
/

alter table inventory_periods add (closing_run_id number(19))
/
alter table inventory_periods add constraint fk_inv_period_closing_run
    foreign key (tenant_id, id, closing_run_id) references inventory_period_close_runs(tenant_id, inventory_period_id, id)
/
create unique index uk_inv_period_closing_run
    on inventory_periods (
        case when closing_run_id is not null then tenant_id end,
        case when closing_run_id is not null then closing_run_id end
    )
/

create table inventory_period_balance_snapshots (
    id number(19) primary key,
    tenant_id number(19) not null,
    close_run_id number(19) not null,
    inventory_period_id number(19) not null,
    opening_source_snapshot_id number(19),
    inventory_balance_id number(19) not null,
    inventory_balance_revision number(19) not null,
    stock_site_id number(19) not null,
    stock_bin_id number(19) not null,
    stock_item_id number(19) not null,
    stock_lot_id number(19) not null,
    stock_status varchar2(32 char) not null,
    base_unit_code varchar2(64 char) not null,
    opening_quantity number(28,8) default 0 not null,
    movement_quantity number(28,8) default 0 not null,
    closing_quantity number(28,8) default 0 not null,
    balance_quantity number(28,8) default 0 not null,
    quantity_difference number(28,8) default 0 not null,
    snapshot_status varchar2(32 char) not null,
    created_at timestamp with time zone not null,
    created_by number(19) not null,
    constraint fk_inv_snap_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inv_snap_run foreign key (tenant_id, inventory_period_id, close_run_id) references inventory_period_close_runs(tenant_id, inventory_period_id, id),
    constraint fk_inv_snap_period foreign key (tenant_id, stock_site_id, inventory_period_id) references inventory_periods(tenant_id, stock_site_id, id),
    constraint fk_inv_snap_balance foreign key (tenant_id, inventory_balance_id) references inventory_balances(tenant_id, id),
    constraint fk_inv_snap_site foreign key (tenant_id, stock_site_id) references stock_sites(tenant_id, id),
    constraint fk_inv_snap_bin foreign key (tenant_id, stock_bin_id) references stock_bins(tenant_id, id),
    constraint fk_inv_snap_item foreign key (tenant_id, stock_item_id) references stock_items(tenant_id, id),
    constraint fk_inv_snap_lot foreign key (tenant_id, stock_lot_id) references stock_lots(tenant_id, id),
    constraint uk_inv_snap_tenant_id unique (tenant_id, id),
    constraint uk_inv_snap_dimension unique (tenant_id, close_run_id, stock_bin_id, stock_item_id, stock_lot_id, stock_status),
    constraint ck_inv_snap_status_code check (stock_status in ('AVAILABLE', 'PENDING', 'QUARANTINE', 'DAMAGED', 'EXPIRED')),
    constraint ck_inv_snap_result check (snapshot_status in ('RECONCILED', 'DIFFERENCE')),
    constraint ck_inv_snap_quantity_equation check (
        closing_quantity = opening_quantity + movement_quantity
        and quantity_difference = balance_quantity - closing_quantity
    ),
    constraint ck_inv_snap_reconciled check (
        (snapshot_status = 'RECONCILED' and quantity_difference = 0)
        or snapshot_status = 'DIFFERENCE'
    )
)
/
alter table inventory_period_balance_snapshots add constraint fk_inv_snap_opening
    foreign key (tenant_id, opening_source_snapshot_id) references inventory_period_balance_snapshots(tenant_id, id)
/
create index idx_inv_snap_period_item
    on inventory_period_balance_snapshots (tenant_id, inventory_period_id, stock_item_id, stock_bin_id, stock_lot_id)
/
create index idx_inv_snap_opening
    on inventory_period_balance_snapshots (tenant_id, opening_source_snapshot_id)
/

create table inventory_period_balance_values (
    id number(19) primary key,
    tenant_id number(19) not null,
    period_balance_snapshot_id number(19) not null,
    valuation_basis varchar2(32 char) not null,
    currency_code varchar2(16 char) not null,
    opening_unit_value number(24,6),
    closing_unit_value number(24,6),
    opening_value number(30,6) default 0 not null,
    movement_amount number(30,6) default 0 not null,
    valuation_adjustment_amount number(30,6) default 0 not null,
    rounding_adjustment_amount number(30,6) default 0 not null,
    closing_value number(30,6) default 0 not null,
    balance_value number(30,6) default 0 not null,
    value_difference number(30,6) default 0 not null,
    value_status varchar2(32 char) not null,
    created_at timestamp with time zone not null,
    constraint fk_inv_snap_value_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inv_snap_value_snapshot foreign key (tenant_id, period_balance_snapshot_id) references inventory_period_balance_snapshots(tenant_id, id),
    constraint uk_inv_snap_value_tenant_id unique (tenant_id, id),
    constraint uk_inv_snap_value_basis unique (tenant_id, period_balance_snapshot_id, valuation_basis, currency_code),
    constraint ck_inv_snap_value_basis check (valuation_basis in ('COST', 'RETAIL')),
    constraint ck_inv_snap_value_status check (value_status in ('RECONCILED', 'DIFFERENCE')),
    constraint ck_inv_snap_value_units check (
        (opening_unit_value is null or opening_unit_value >= 0)
        and (closing_unit_value is null or closing_unit_value >= 0)
    ),
    constraint ck_inv_snap_value_equation check (
        closing_value = opening_value + movement_amount + valuation_adjustment_amount + rounding_adjustment_amount
        and value_difference = balance_value - closing_value
    ),
    constraint ck_inv_snap_value_result check (
        (value_status = 'RECONCILED' and value_difference = 0)
        or value_status = 'DIFFERENCE'
    )
)
/
create index idx_inv_snap_value_snapshot
    on inventory_period_balance_values (tenant_id, period_balance_snapshot_id, valuation_basis)
/

create table inventory_valuation_entries (
    id number(19) primary key,
    tenant_id number(19) not null,
    inventory_period_id number(19) not null,
    inventory_balance_id number(19) not null,
    stock_site_id number(19) not null,
    stock_bin_id number(19) not null,
    stock_item_id number(19) not null,
    stock_lot_id number(19) not null,
    stock_status varchar2(32 char) not null,
    valuation_basis varchar2(32 char) not null,
    entry_type varchar2(32 char) not null,
    source_type varchar2(64 char) not null,
    source_id number(19),
    source_no varchar2(128 char) not null,
    request_code varchar2(128 char) not null,
    reverses_entry_id number(19),
    quantity_snapshot number(28,8) not null,
    unit_price_before number(24,6) not null,
    unit_price_after number(24,6) not null,
    value_before number(30,6) not null,
    value_after number(30,6) not null,
    amount_delta number(30,6) not null,
    currency_code varchar2(16 char) not null,
    occurred_at timestamp with time zone not null,
    posted_at timestamp with time zone not null,
    posted_by number(19) not null,
    description varchar2(1000 char),
    constraint fk_inv_val_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inv_val_period foreign key (tenant_id, stock_site_id, inventory_period_id) references inventory_periods(tenant_id, stock_site_id, id),
    constraint fk_inv_val_balance foreign key (tenant_id, inventory_balance_id) references inventory_balances(tenant_id, id),
    constraint fk_inv_val_site foreign key (tenant_id, stock_site_id) references stock_sites(tenant_id, id),
    constraint fk_inv_val_bin foreign key (tenant_id, stock_bin_id) references stock_bins(tenant_id, id),
    constraint fk_inv_val_item foreign key (tenant_id, stock_item_id) references stock_items(tenant_id, id),
    constraint fk_inv_val_lot foreign key (tenant_id, stock_lot_id) references stock_lots(tenant_id, id),
    constraint uk_inv_val_tenant_id unique (tenant_id, id),
    constraint uk_inv_val_request unique (tenant_id, request_code),
    constraint ck_inv_val_status check (stock_status in ('AVAILABLE', 'PENDING', 'QUARANTINE', 'DAMAGED', 'EXPIRED')),
    constraint ck_inv_val_basis check (valuation_basis in ('COST', 'RETAIL')),
    constraint ck_inv_val_type check (entry_type in ('PRICE_ADJUSTMENT', 'COST_REVALUE', 'ROUNDING', 'REVERSAL')),
    constraint ck_inv_val_reversal check (reverses_entry_id is null or reverses_entry_id <> id),
    constraint ck_inv_val_quantity check (quantity_snapshot >= 0),
    constraint ck_inv_val_prices check (unit_price_before >= 0 and unit_price_after >= 0),
    constraint ck_inv_val_equation check (amount_delta = value_after - value_before)
)
/
alter table inventory_valuation_entries add constraint fk_inv_val_reverses
    foreign key (tenant_id, reverses_entry_id) references inventory_valuation_entries(tenant_id, id)
/
create index idx_inv_val_period_item
    on inventory_valuation_entries (tenant_id, inventory_period_id, stock_item_id, posted_at)
/
create index idx_inv_val_source
    on inventory_valuation_entries (tenant_id, source_type, source_id, posted_at)
/
create index idx_inv_val_dimension
    on inventory_valuation_entries (tenant_id, stock_bin_id, stock_item_id, stock_lot_id, stock_status, posted_at)
/

create table inventory_price_adjustments (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    organization_id number(19) not null,
    stock_site_id number(19) not null,
    inventory_period_id number(19),
    catalog_change_batch_id number(19),
    reversal_of_id number(19),
    adjustment_no varchar2(64 char) not null,
    request_code varchar2(128 char) not null,
    request_hash varchar2(64 char) not null,
    adjustment_type varchar2(32 char) not null,
    price_type varchar2(32 char),
    business_date date not null,
    currency_code varchar2(16 char) not null,
    price_document_code varchar2(128 char),
    reason varchar2(1000 char) not null,
    status varchar2(32 char) not null,
    line_count number(10) default 0 not null,
    total_value_before number(30,6) default 0 not null,
    total_value_after number(30,6) default 0 not null,
    total_adjustment_amount number(30,6) default 0 not null,
    created_at timestamp with time zone not null,
    created_by number(19) not null,
    updated_at timestamp with time zone not null,
    updated_by number(19) not null,
    submitted_at timestamp with time zone,
    submitted_by number(19),
    approved_at timestamp with time zone,
    approved_by number(19),
    posted_at timestamp with time zone,
    posted_by number(19),
    reversed_at timestamp with time zone,
    reversed_by number(19),
    cancelled_at timestamp with time zone,
    cancelled_by number(19),
    constraint fk_inv_price_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inv_price_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_inv_price_site foreign key (tenant_id, stock_site_id) references stock_sites(tenant_id, id),
    constraint fk_inv_price_period foreign key (tenant_id, stock_site_id, inventory_period_id) references inventory_periods(tenant_id, stock_site_id, id),
    constraint fk_inv_price_batch foreign key (tenant_id, catalog_change_batch_id) references catalog_change_batches(tenant_id, id),
    constraint uk_inv_price_tenant_id unique (tenant_id, id),
    constraint uk_inv_price_no unique (tenant_id, adjustment_no),
    constraint uk_inv_price_request unique (tenant_id, request_code),
    constraint ck_inv_price_type check (adjustment_type in ('SALE_PRICE', 'COST_REVALUE', 'SALE_AND_COST')),
    constraint ck_inv_price_reversal check (reversal_of_id is null or reversal_of_id <> id),
    constraint ck_inv_price_scope check (adjustment_type = 'COST_REVALUE' or price_type is not null),
    constraint ck_inv_price_status check (status in ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTING', 'POSTED', 'REVERSED', 'CANCELLED', 'FAILED')),
    constraint ck_inv_price_counts check (line_count >= 0),
    constraint ck_inv_price_equation check (total_adjustment_amount = total_value_after - total_value_before),
    constraint ck_inv_price_posted check (
        (status in ('POSTED', 'REVERSED') and inventory_period_id is not null and posted_at is not null and posted_by is not null)
        or status not in ('POSTED', 'REVERSED')
    )
)
/
alter table inventory_price_adjustments add constraint fk_inv_price_reversal
    foreign key (tenant_id, reversal_of_id) references inventory_price_adjustments(tenant_id, id)
/
create index idx_inv_price_site
    on inventory_price_adjustments (tenant_id, stock_site_id, business_date, status)
/
create index idx_inv_price_period
    on inventory_price_adjustments (tenant_id, inventory_period_id, status, posted_at)
/

create table inventory_price_adjustment_lines (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    adjustment_id number(19) not null,
    line_no number(10) not null,
    stock_item_id number(19) not null,
    catalog_item_id number(19) not null,
    package_id number(19) not null,
    old_catalog_price_id number(19),
    old_catalog_price_revision number(19),
    new_catalog_price_id number(19),
    new_catalog_price_revision number(19),
    old_sale_price number(24,6),
    new_sale_price number(24,6),
    old_unit_cost number(24,6),
    new_unit_cost number(24,6),
    quantity_snapshot number(28,8) default 0 not null,
    value_before number(30,6) default 0 not null,
    value_after number(30,6) default 0 not null,
    adjustment_amount number(30,6) default 0 not null,
    rounding_amount number(30,6) default 0 not null,
    line_status varchar2(32 char) not null,
    error_code varchar2(128 char),
    error_message varchar2(1000 char),
    constraint fk_inv_price_line_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inv_price_line_header foreign key (tenant_id, adjustment_id) references inventory_price_adjustments(tenant_id, id),
    constraint fk_inv_price_line_item foreign key (tenant_id, stock_item_id) references stock_items(tenant_id, id),
    constraint fk_inv_price_line_catalog foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint fk_inv_price_line_package foreign key (tenant_id, package_id) references item_packages(tenant_id, id),
    constraint fk_inv_price_line_old foreign key (tenant_id, old_catalog_price_id) references catalog_prices(tenant_id, id),
    constraint fk_inv_price_line_new foreign key (tenant_id, new_catalog_price_id) references catalog_prices(tenant_id, id),
    constraint uk_inv_price_line_tenant_id unique (tenant_id, id),
    constraint uk_inv_price_line_no unique (tenant_id, adjustment_id, line_no),
    constraint uk_inv_price_line_item unique (tenant_id, adjustment_id, stock_item_id),
    constraint ck_inv_price_line_values check (
        quantity_snapshot >= 0
        and (old_sale_price is null or old_sale_price >= 0)
        and (new_sale_price is null or new_sale_price >= 0)
        and (old_unit_cost is null or old_unit_cost >= 0)
        and (new_unit_cost is null or new_unit_cost >= 0)
        and adjustment_amount = value_after - value_before
    ),
    constraint ck_inv_price_line_status check (line_status in ('PENDING', 'READY', 'POSTED', 'FAILED', 'REVERSED'))
)
/
create index idx_inv_price_line_item
    on inventory_price_adjustment_lines (tenant_id, stock_item_id, adjustment_id)
/

create table inventory_price_adjustment_details (
    id number(19) primary key,
    tenant_id number(19) not null,
    adjustment_line_id number(19) not null,
    inventory_balance_id number(19) not null,
    inventory_balance_revision number(19) not null,
    stock_bin_id number(19) not null,
    stock_lot_id number(19) not null,
    stock_status varchar2(32 char) not null,
    quantity_snapshot number(28,8) not null,
    unit_price_before number(24,6) not null,
    unit_price_after number(24,6) not null,
    value_before number(30,6) not null,
    value_after number(30,6) not null,
    adjustment_amount number(30,6) not null,
    rounding_amount number(30,6) default 0 not null,
    valuation_entry_id number(19),
    created_at timestamp with time zone not null,
    constraint fk_inv_price_detail_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_inv_price_detail_line foreign key (tenant_id, adjustment_line_id) references inventory_price_adjustment_lines(tenant_id, id),
    constraint fk_inv_price_detail_balance foreign key (tenant_id, inventory_balance_id) references inventory_balances(tenant_id, id),
    constraint fk_inv_price_detail_bin foreign key (tenant_id, stock_bin_id) references stock_bins(tenant_id, id),
    constraint fk_inv_price_detail_lot foreign key (tenant_id, stock_lot_id) references stock_lots(tenant_id, id),
    constraint fk_inv_price_detail_value foreign key (tenant_id, valuation_entry_id) references inventory_valuation_entries(tenant_id, id),
    constraint uk_inv_price_detail_tenant_id unique (tenant_id, id),
    constraint uk_inv_price_detail_balance unique (tenant_id, adjustment_line_id, inventory_balance_id),
    constraint ck_inv_price_detail_status check (stock_status in ('AVAILABLE', 'PENDING', 'QUARANTINE', 'DAMAGED', 'EXPIRED')),
    constraint ck_inv_price_detail_values check (
        quantity_snapshot >= 0 and unit_price_before >= 0 and unit_price_after >= 0
        and adjustment_amount = value_after - value_before
    )
)
/
create unique index uk_inv_price_detail_value
    on inventory_price_adjustment_details (
        case when valuation_entry_id is not null then tenant_id end,
        case when valuation_entry_id is not null then valuation_entry_id end
    )
/
create index idx_inv_price_detail_dimension
    on inventory_price_adjustment_details (tenant_id, inventory_balance_id, adjustment_line_id)
/
