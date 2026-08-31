-- A base-unit sale price lets ward orders and split dispensing share one pricing unit.
insert into catalog_prices (
    id, revision, tenant_id, catalog_item_id, organization_id, package_id,
    price_type, price, currency_code, price_document_code, price_reason,
    valid_from, valid_to, status, created_at, created_by, updated_at, updated_by
) values (
    362387869898702, 0, 362387869790209, 362387869795111, 362387869790211, null,
    'SALE', 0.533333, 'CNY', 'DEMO-IP-PRICE-2026', '住院拆零体验价',
    date '2026-01-01', null, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222
);

insert into staff_assignments (
    id, tenant_id, employment_id, organization_id, department_id, position_id, code,
    assignment_type, specialty_code, primary_assignment, workload_percent, status,
    valid_from, valid_to, created_at, created_by, updated_at, updated_by, revision
) values (
    362387869898701, 362387869790209, 362387869799302, 362387869790211,
    362387869799104, 362387869799202, 'ASN-DEMO-INPATIENT-PHARM', 'PART_TIME', null,
    false, 20, 'ACTIVE', date '2026-01-01', null, current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 0
);

insert into stock_items (
    id, revision, tenant_id, stock_site_id, catalog_item_id, base_package_id, base_unit_code,
    issue_policy, negative_allowed, lot_required, trace_required, split_allowed, cold_chain,
    controlled, control_level, high_alert, status, created_at, created_by, updated_at, updated_by
) values (
    362387869898703, 0, 362387869790209, 362387869799503, 362387869795111,
    362387869795401, '粒', 'FEFO', false, true, false, true, false, false, null, false,
    'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into stock_bins (
    id, revision, tenant_id, stock_site_id, parent_bin_id, code, name, bin_type,
    stock_default, receive_allowed, pick_allowed, count_allowed, sort_order, active,
    created_at, created_by
) values (
    362387869898704, 0, 362387869790209, 362387869799503, null,
    'IP-DISPENSE', '住院药房发药位', 'COUNTER', 'AVAILABLE',
    true, true, true, 10, true, current_timestamp, 362387869790222
);

insert into stock_lots (
    id, revision, tenant_id, catalog_item_id, package_id, lot_no, production_date, expiry_date,
    approval_code_snapshot, manufacturer_name_snapshot, quality_status, quality_at,
    quality_user_id, status, created_at, created_by
) values (
    362387869898705, 0, 362387869790209, 362387869795111, 362387869795401,
    'DEMO-IP-AMOX-202608', date '2026-01-01', date '2099-12-31', '国药准字H00000001',
    '示范制药有限公司', 'QUALIFIED', current_timestamp, 362387869790222,
    'ACTIVE', current_timestamp, 362387869790222
);

insert into inventory_periods (
    id, revision, tenant_id, stock_site_id, period_code, period_from, period_to, status,
    closed_at, closed_by, description, created_at, created_by
) values (
    362387869898706, 0, 362387869790209, 362387869799503, 'DEMO-IP-OPEN',
    date '2026-01-01', date '2099-12-31', 'OPEN', null, null,
    '本地体验环境住院药房开放期间', current_timestamp, 362387869790222
);

insert into inventory_transactions (
    id, tenant_id, inventory_period_id, reverses_transaction_id, transaction_no, request_code,
    transaction_type, source_type, source_code, occurred_at, posted_at, posted_by, description
) values (
    362387869898707, 362387869790209, 362387869898706, null,
    'DEMO-IP-STOCK-202608', 'DEMO-IP-STOCK-202608', 'RECEIPT', 'OPENING',
    'DEMO-IP-STOCK', current_timestamp, current_timestamp, 362387869790222,
    '住院药房阿莫西林期初入库'
);

insert into inventory_transaction_lines (
    id, tenant_id, inventory_transaction_id, sort_order, stock_site_id, stock_bin_id,
    stock_item_id, stock_lot_id, package_id, stock_status, operation_quantity,
    operation_unit_code, base_quantity_factor, quantity_delta, unit_cost, amount_delta
) values (
    362387869898708, 362387869790209, 362387869898707, 1, 362387869799503,
    362387869898704, 362387869898703, 362387869898705, 362387869795401,
    'AVAILABLE', 10, 'BOX', 24, 240, 0.400000, 96.000000
);

insert into inventory_balances (
    id, revision, tenant_id, stock_site_id, stock_bin_id, stock_item_id, stock_lot_id,
    stock_status, base_unit_code, quantity_on_hand, quantity_reserved, quantity_frozen,
    quantity_available, average_unit_cost, projected_at
) values (
    362387869898709, 0, 362387869790209, 362387869799503, 362387869898704,
    362387869898703, 362387869898705, 'AVAILABLE', '粒', 240, 0, 0, 240,
    0.400000, current_timestamp
);
