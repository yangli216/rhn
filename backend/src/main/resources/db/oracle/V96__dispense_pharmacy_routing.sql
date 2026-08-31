create table dispense_routes (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    organization_id number(19) not null,
    code varchar2(64 char) not null,
    name varchar2(200 char) not null,
    source_department_id number(19),
    medication_type varchar2(32 char),
    target_stock_site_id number(19) not null,
    active number(1) not null,
    valid_from date not null,
    valid_to date,
    description varchar2(1000 char),
    created_at timestamp with time zone not null,
    created_by number(19) not null,
    updated_at timestamp with time zone not null,
    updated_by number(19) not null,
    constraint fk_dispense_route_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_dispense_route_organization foreign key (tenant_id, organization_id)
        references organizations(tenant_id, id),
    constraint fk_dispense_route_source_department foreign key
        (tenant_id, organization_id, source_department_id)
        references departments(tenant_id, organization_id, id),
    constraint fk_dispense_route_target_site foreign key (tenant_id, target_stock_site_id)
        references stock_sites(tenant_id, id),
    constraint uk_dispense_route_tenant_id unique (tenant_id, id),
    constraint uk_dispense_route_code unique (tenant_id, organization_id, code),
    constraint ck_dispense_route_active check (active in (0, 1)),
    constraint ck_dispense_route_validity check (valid_to is null or valid_to >= valid_from)
)
/
create index idx_dispense_route_resolve on dispense_routes
    (tenant_id, organization_id, active, valid_from, valid_to)
/
create index idx_dispense_route_target on dispense_routes
    (tenant_id, target_stock_site_id, active)
/

alter table pharmacy_fulfillment_authorizations add (
    dispense_route_id number(19),
    dispense_route_revision number(19),
    routed_stock_site_id number(19),
    routed_at timestamp with time zone
)
/
alter table pharmacy_fulfillment_authorizations add constraint fk_pharm_auth_dispense_route
    foreign key (tenant_id, dispense_route_id) references dispense_routes(tenant_id, id)
/
alter table pharmacy_fulfillment_authorizations add constraint fk_pharm_auth_routed_site
    foreign key (tenant_id, routed_stock_site_id) references stock_sites(tenant_id, id)
/
alter table pharmacy_fulfillment_authorizations add constraint ck_pharm_auth_route_snapshot
    check (
        (dispense_route_id is null and dispense_route_revision is null
            and routed_stock_site_id is null and routed_at is null)
        or
        (dispense_route_id is not null and dispense_route_revision is not null
            and routed_stock_site_id is not null and routed_at is not null)
    )
/
create index idx_pharm_auth_routed_inbox on pharmacy_fulfillment_authorizations
    (tenant_id, organization_id, routed_stock_site_id, status, ready_at)
/
