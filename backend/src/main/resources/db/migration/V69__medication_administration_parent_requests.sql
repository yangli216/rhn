alter table care_requests add column parent_request_id bigint;

alter table care_requests add constraint fk_care_request_parent
    foreign key (tenant_id, parent_request_id) references care_requests(tenant_id, id);

create index idx_care_request_parent
    on care_requests (tenant_id, parent_request_id, authored_at);
