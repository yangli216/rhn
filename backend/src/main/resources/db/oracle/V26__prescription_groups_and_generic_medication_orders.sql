create table request_groups (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    resident_id number(19) not null,
    encounter_id number(19) not null,
    group_no varchar2(64 char) not null,
    group_type varchar2(32 char) not null,
    category_code varchar2(64 char),
    status varchar2(32 char) not null,
    performer_organization_id number(19) not null,
    performer_department_id number(19) not null,
    authored_at timestamp with time zone not null,
    authored_by number(19) not null,
    submitted_at timestamp with time zone,
    submitted_by number(19),
    cancelled_at timestamp with time zone,
    cancelled_by number(19),
    cancel_reason varchar2(1000 char),
    note varchar2(2000 char),
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

alter table care_requests add request_group_id number(19);
alter table care_requests add constraint fk_care_request_group
    foreign key (tenant_id, request_group_id) references request_groups(tenant_id, id);
create index idx_care_request_group on care_requests (tenant_id, request_group_id, status);

alter table care_requests modify catalog_item_id null;
alter table care_requests modify adoption_id null;
alter table care_requests modify adoption_revision null;
alter table care_requests drop constraint ck_care_request_status;
alter table care_requests add constraint ck_care_request_status check (status in ('DRAFT', 'ACTIVE', 'CANCELLED'));
