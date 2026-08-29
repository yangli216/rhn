alter table medication_requests add column administration_group_no varchar(64);

create index idx_medication_request_administration_group
    on medication_requests (tenant_id, administration_group_no);
