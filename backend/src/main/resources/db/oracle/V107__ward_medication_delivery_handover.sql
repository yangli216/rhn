-- PHA-DSP-019: explicit inpatient pharmacy-to-ward handover.
create table ward_deliveries (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    organization_id number(19) not null,
    stock_site_id number(19) not null,
    nursing_unit_department_id number(19) not null,
    delivery_no varchar2(64 char) not null,
    status varchar2(32 char) not null,
    stock_site_name_snapshot varchar2(200 char) not null,
    nursing_unit_name_snapshot varchar2(200 char) not null,
    created_at timestamp with time zone not null,
    created_by number(19) not null,
    dispatched_at timestamp with time zone,
    dispatched_by number(19),
    dispatch_note varchar2(1000 char),
    received_at timestamp with time zone,
    received_by number(19),
    receipt_note varchar2(1000 char),
    discrepancy_note varchar2(1000 char),
    resolved_at timestamp with time zone,
    resolved_by number(19),
    resolution_code varchar2(32 char),
    resolution_note varchar2(1000 char),
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
    id number(19) primary key,
    tenant_id number(19) not null,
    delivery_id number(19) not null,
    dispense_id number(19) not null,
    resident_id number(19) not null,
    encounter_id number(19) not null,
    resident_name_snapshot varchar2(100 char) not null,
    medication_name_snapshot varchar2(300 char) not null,
    expected_quantity number(28,8) not null,
    received_quantity number(28,8) default 0 not null,
    unit_code varchar2(64 char) not null,
    status varchar2(32 char) not null,
    discrepancy_code varchar2(32 char),
    discrepancy_note varchar2(1000 char),
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
    id number(19) primary key,
    tenant_id number(19) not null,
    delivery_id number(19) not null,
    event_type varchar2(32 char) not null,
    from_status varchar2(32 char),
    to_status varchar2(32 char) not null,
    command_code varchar2(128 char) not null,
    occurred_at timestamp with time zone not null,
    occurred_by number(19) not null,
    note varchar2(1000 char),
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
