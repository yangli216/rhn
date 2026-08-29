alter table medication_requests add administration_group_no varchar2(64 char);

create index idx_med_req_admin_group
    on medication_requests (tenant_id, administration_group_no);
