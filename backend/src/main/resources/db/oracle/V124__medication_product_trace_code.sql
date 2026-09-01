alter table medication_products add trace_code varchar2(7 char);

create index idx_med_product_trace_code on medication_products (tenant_id, trace_code);
