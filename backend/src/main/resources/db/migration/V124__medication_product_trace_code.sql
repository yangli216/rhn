alter table medication_products add column trace_code varchar(7);

create index idx_med_product_trace_code on medication_products (tenant_id, trace_code);
