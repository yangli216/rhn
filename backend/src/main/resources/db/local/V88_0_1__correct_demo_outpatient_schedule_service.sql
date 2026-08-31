-- Correct the demo schedule that historically used the CBC laboratory item as
-- a registration service. This migration only targets the stable demo tenant
-- and identifiers; business data from other tenants is not rewritten.

update service_schedules
set catalog_item_id = 362387869795104,
    service_code_snapshot = 'SRV-OPD-GP',
    service_name_snapshot = '全科门诊诊查',
    updated_at = current_timestamp,
    updated_by = 362387869790222
where tenant_id = 362387869790209
  and catalog_item_id = 362387869795101;

update service_resources
set catalog_item_id = 362387869795104,
    service_code_snapshot = 'SRV-OPD-GP',
    service_name_snapshot = '全科门诊诊查',
    updated_at = current_timestamp,
    updated_by = 362387869790222
where tenant_id = 362387869790209
  and catalog_item_id = 362387869795101;
