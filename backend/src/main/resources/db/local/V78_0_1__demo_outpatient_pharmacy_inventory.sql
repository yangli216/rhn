insert into stock_items (
    id, revision, tenant_id, stock_site_id, catalog_item_id, base_package_id, base_unit_code,
    issue_policy, negative_allowed, lot_required, trace_required, split_allowed, cold_chain,
    controlled, control_level, high_alert, status, created_at, created_by, updated_at, updated_by
) values (
    362387869799601, 0, 362387869790209, 362387869799502, 362387869795113,
    362387869795403, '片', 'FEFO', false, true, false, true, false, false, null, false,
    'ACTIVE', current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into stock_bins (
    id, revision, tenant_id, stock_site_id, parent_bin_id, code, name, bin_type,
    stock_default, receive_allowed, pick_allowed, count_allowed, sort_order, active,
    created_at, created_by
) values (
    362387869799602, 0, 362387869790209, 362387869799502, null,
    'OP-COUNTER', '门诊药房发药柜台', 'COUNTER', 'AVAILABLE',
    true, true, true, 10, true, current_timestamp, 362387869790222
);

insert into stock_lots (
    id, revision, tenant_id, catalog_item_id, package_id, lot_no, production_date, expiry_date,
    approval_code_snapshot, manufacturer_name_snapshot, quality_status, quality_at,
    quality_user_id, status, created_at, created_by
) values (
    362387869799603, 0, 362387869790209, 362387869795113, 362387869795403,
    'DEMO-AML-202608', date '2026-01-01', date '2099-12-31', '国药准字H00000003',
    '演示药品生产企业', 'QUALIFIED', current_timestamp, 362387869790222,
    'ACTIVE', current_timestamp, 362387869790222
);

insert into inventory_periods (
    id, revision, tenant_id, stock_site_id, period_code, period_from, period_to, status,
    closed_at, closed_by, description, created_at, created_by
) values (
    362387869799604, 0, 362387869790209, 362387869799502, 'DEMO-OPEN',
    date '2026-01-01', date '2099-12-31', 'OPEN', null, null,
    '本地体验环境门诊药房开放期间', current_timestamp, 362387869790222
);

insert into inventory_transactions (
    id, tenant_id, inventory_period_id, reverses_transaction_id, transaction_no, request_code,
    transaction_type, source_type, source_code, occurred_at, posted_at, posted_by, description
) values (
    362387869799605, 362387869790209, 362387869799604, null,
    'DEMO-OPD-STOCK-202608', 'DEMO-OPD-STOCK-202608', 'RECEIPT', 'OPENING',
    'DEMO-OPD-STOCK', current_timestamp, current_timestamp, 362387869790222,
    '门诊药房演示药品期初入库'
);

insert into inventory_transaction_lines (
    id, tenant_id, inventory_transaction_id, sort_order, stock_site_id, stock_bin_id,
    stock_item_id, stock_lot_id, package_id, stock_status, operation_quantity,
    operation_unit_code, base_quantity_factor, quantity_delta, unit_cost, amount_delta
) values (
    362387869799606, 362387869790209, 362387869799605, 1, 362387869799502,
    362387869799602, 362387869799601, 362387869799603, 362387869795403,
    'AVAILABLE', 100, 'BOX', 14, 1400, 0.600000, 840.000000
);

insert into inventory_balances (
    id, revision, tenant_id, stock_site_id, stock_bin_id, stock_item_id, stock_lot_id,
    stock_status, base_unit_code, quantity_on_hand, quantity_reserved, quantity_frozen,
    quantity_available, average_unit_cost, projected_at
) values (
    362387869799607, 0, 362387869790209, 362387869799502, 362387869799602,
    362387869799601, 362387869799603, 'AVAILABLE', '片', 1400, 0, 0, 1400,
    0.600000, current_timestamp
);
