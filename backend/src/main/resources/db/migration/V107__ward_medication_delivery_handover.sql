-- PHA-DSP-019: inpatient medication leaves the pharmacy and reaches the ward
-- through an explicit, traceable handover. Dispense and ward receipt remain
-- separate facts so that in-transit and discrepancy states cannot be hidden.
create table ward_deliveries (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    organization_id bigint not null,
    stock_site_id bigint not null,
    nursing_unit_department_id bigint not null,
    delivery_no varchar(64) not null,
    status varchar(32) not null,
    stock_site_name_snapshot varchar(200) not null,
    nursing_unit_name_snapshot varchar(200) not null,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    dispatched_at timestamp with time zone,
    dispatched_by bigint,
    dispatch_note varchar(1000),
    received_at timestamp with time zone,
    received_by bigint,
    receipt_note varchar(1000),
    discrepancy_note varchar(1000),
    resolved_at timestamp with time zone,
    resolved_by bigint,
    resolution_code varchar(32),
    resolution_note varchar(1000),
    constraint fk_wd_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_wd_org foreign key (tenant_id, organization_id)
        references organizations(tenant_id, id),
    constraint fk_wd_site foreign key (tenant_id, stock_site_id)
        references stock_sites(tenant_id, id),
    constraint fk_wd_dept foreign key (tenant_id, organization_id, nursing_unit_department_id)
        references departments(tenant_id, organization_id, id),
    constraint uk_wd_tenant_id unique (tenant_id, id),
    constraint uk_wd_no unique (tenant_id, delivery_no),
    constraint ck_wd_status check (status in (
        'PENDING_DISPATCH', 'IN_TRANSIT', 'RECEIVED', 'DISCREPANCY', 'RESOLVED'
    )),
    constraint ck_wd_dispatch check (
        (status = 'PENDING_DISPATCH' and dispatched_at is null and dispatched_by is null)
        or (status <> 'PENDING_DISPATCH' and dispatched_at is not null and dispatched_by is not null)
    ),
    constraint ck_wd_receive check (
        (status in ('PENDING_DISPATCH', 'IN_TRANSIT') and received_at is null and received_by is null)
        or (status in ('RECEIVED', 'DISCREPANCY', 'RESOLVED') and received_at is not null and received_by is not null)
    ),
    constraint ck_wd_resolve check (
        (status <> 'RESOLVED' and resolved_at is null and resolved_by is null and resolution_code is null)
        or (status = 'RESOLVED' and resolved_at is not null and resolved_by is not null and resolution_code is not null)
    )
);

create index idx_wd_worklist on ward_deliveries
    (tenant_id, organization_id, nursing_unit_department_id, status, created_at);
create index idx_wd_site on ward_deliveries
    (tenant_id, stock_site_id, status, created_at);

create table ward_delivery_lines (
    id bigint primary key,
    tenant_id bigint not null,
    delivery_id bigint not null,
    dispense_id bigint not null,
    resident_id bigint not null,
    encounter_id bigint not null,
    resident_name_snapshot varchar(100) not null,
    medication_name_snapshot varchar(300) not null,
    expected_quantity decimal(28,8) not null,
    received_quantity decimal(28,8) default 0 not null,
    unit_code varchar(64) not null,
    status varchar(32) not null,
    discrepancy_code varchar(32),
    discrepancy_note varchar(1000),
    constraint fk_wdl_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_wdl_delivery foreign key (tenant_id, delivery_id)
        references ward_deliveries(tenant_id, id),
    constraint fk_wdl_dispense foreign key (tenant_id, dispense_id)
        references medication_dispenses(tenant_id, id),
    constraint fk_wdl_resident foreign key (tenant_id, resident_id)
        references residents(tenant_id, id),
    constraint fk_wdl_encounter foreign key (tenant_id, encounter_id)
        references encounters(tenant_id, id),
    constraint uk_wdl_tenant_id unique (tenant_id, id),
    constraint uk_wdl_dispense unique (tenant_id, dispense_id),
    constraint ck_wdl_status check (status in ('PENDING', 'MATCHED', 'SHORTAGE', 'REJECTED')),
    constraint ck_wdl_quantity check (
        expected_quantity > 0 and received_quantity >= 0 and received_quantity <= expected_quantity
    )
);

create index idx_wdl_encounter on ward_delivery_lines
    (tenant_id, encounter_id, delivery_id);

create table ward_delivery_events (
    id bigint primary key,
    tenant_id bigint not null,
    delivery_id bigint not null,
    event_type varchar(32) not null,
    from_status varchar(32),
    to_status varchar(32) not null,
    command_code varchar(128) not null,
    occurred_at timestamp with time zone not null,
    occurred_by bigint not null,
    note varchar(1000),
    constraint fk_wde_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_wde_delivery foreign key (tenant_id, delivery_id)
        references ward_deliveries(tenant_id, id),
    constraint uk_wde_tenant_id unique (tenant_id, id),
    constraint uk_wde_command unique (tenant_id, command_code),
    constraint ck_wde_type check (event_type in (
        'CREATED', 'DISPATCHED', 'RECEIVED', 'DISCREPANCY_RECORDED', 'RESOLVED'
    ))
);

create index idx_wde_delivery on ward_delivery_events
    (tenant_id, delivery_id, occurred_at);
