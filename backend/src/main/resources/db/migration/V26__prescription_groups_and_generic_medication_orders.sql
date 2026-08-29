create table request_groups (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    resident_id bigint not null,
    encounter_id bigint not null,
    group_no varchar(64) not null,
    group_type varchar(32) not null,
    category_code varchar(64),
    status varchar(32) not null,
    performer_organization_id bigint not null,
    performer_department_id bigint not null,
    authored_at timestamp with time zone not null,
    authored_by bigint not null,
    submitted_at timestamp with time zone,
    submitted_by bigint,
    cancelled_at timestamp with time zone,
    cancelled_by bigint,
    cancel_reason varchar(1000),
    note varchar(2000),
    constraint fk_request_group_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_request_group_resident foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_request_group_encounter foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint fk_request_group_org foreign key (tenant_id, performer_organization_id) references organizations(tenant_id, id),
    constraint fk_request_group_dept foreign key (tenant_id, performer_organization_id, performer_department_id)
        references departments(tenant_id, organization_id, id),
    constraint uk_request_group_tenant_id unique (tenant_id, id),
    constraint uk_request_group_no unique (tenant_id, group_no),
    constraint ck_request_group_type check (group_type in ('ORDER_SET', 'PRESCRIPTION', 'HERBAL_PRESCRIPTION')),
    constraint ck_request_group_status check (status in ('DRAFT', 'ACTIVE', 'CANCELLED')),
    constraint ck_request_group_submit check (
        (status = 'DRAFT' and submitted_at is null and submitted_by is null and cancelled_at is null and cancelled_by is null)
        or (status = 'ACTIVE' and submitted_at is not null and submitted_by is not null and cancelled_at is null and cancelled_by is null)
        or (status = 'CANCELLED' and cancelled_at is not null and cancelled_by is not null)
    )
);
create index idx_request_group_encounter on request_groups (tenant_id, encounter_id, group_type, authored_at);

alter table care_requests add column request_group_id bigint;
alter table care_requests add constraint fk_care_request_group
    foreign key (tenant_id, request_group_id) references request_groups(tenant_id, id);
create index idx_care_request_group on care_requests (tenant_id, request_group_id, status);

alter table care_requests alter column catalog_item_id drop not null;
alter table care_requests alter column adoption_id drop not null;
alter table care_requests alter column adoption_revision drop not null;
alter table care_requests drop constraint ck_care_request_status;
alter table care_requests add constraint ck_care_request_status check (status in ('DRAFT', 'ACTIVE', 'CANCELLED'));
