update stock_items
set controlled = 0,
    control_level = null,
    high_alert = 0,
    split_allowed = 1,
    updated_at = current_timestamp,
    updated_by = 362387869790222,
    revision = revision + 1
where tenant_id = 362387869790209
  and stock_site_id = 362387869799502
  and catalog_item_id = 362387869795113;
