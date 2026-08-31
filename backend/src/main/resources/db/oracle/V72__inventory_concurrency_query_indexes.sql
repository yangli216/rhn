create index idx_inv_line_item_history
    on inventory_transaction_lines (tenant_id, stock_site_id, stock_item_id, inventory_transaction_id)
/

create index idx_inv_line_reconcile
    on inventory_transaction_lines (tenant_id, stock_site_id, stock_item_id, stock_bin_id, stock_lot_id, stock_status)
/

create index idx_inv_rsv_due
    on inventory_reservations (status, expires_at, tenant_id, request_id)
/
