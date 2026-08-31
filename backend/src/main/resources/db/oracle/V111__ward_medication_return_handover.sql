-- Reverse ward-to-pharmacy handover for unused inpatient medication.
-- Formal stock return, inventory and billing facts remain in the shared pharmacy tables.
create table ward_med_return_requests (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    organization_id number(19) not null,
    stock_site_id number(19) not null,
    nursing_unit_department_id number(19) not null,
    resident_id number(19) not null,
    encounter_id number(19) not null,
    request_no varchar2(64 char) not null,
    status varchar2(32 char) not null,
    requested_at timestamp with time zone not null,
    requested_by number(19) not null,
    request_note varchar2(1000 char),
    handed_over_at timestamp with time zone,
    handed_over_by number(19),
    handover_note varchar2(1000 char),
    received_at timestamp with time zone,
    received_by number(19),
    processor_practitioner_id number(19),
    processor_assignment_id number(19),
    receipt_note varchar2(1000 char),
    constraint fk_wmr_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_wmr_org foreign key (tenant_id, organization_id)
        references organizations(tenant_id, id),
    constraint fk_wmr_site foreign key (tenant_id, stock_site_id)
        references stock_sites(tenant_id, id),
    constraint fk_wmr_dept foreign key (tenant_id, organization_id, nursing_unit_department_id)
        references departments(tenant_id, organization_id, id),
    constraint fk_wmr_resident foreign key (tenant_id, resident_id)
        references residents(tenant_id, id),
    constraint fk_wmr_encounter foreign key (tenant_id, encounter_id)
        references encounters(tenant_id, id),
    constraint uk_wmr_tenant_id unique (tenant_id, id),
    constraint uk_wmr_no unique (tenant_id, request_no),
    constraint ck_wmr_status check (status in ('REQUESTED', 'IN_TRANSIT', 'RECEIVED')),
    constraint ck_wmr_handover check (
        (status = 'REQUESTED' and handed_over_at is null and handed_over_by is null)
        or (status in ('IN_TRANSIT', 'RECEIVED') and handed_over_at is not null and handed_over_by is not null)
    ),
    constraint ck_wmr_receive check (
        (status in ('REQUESTED', 'IN_TRANSIT') and received_at is null and received_by is null
            and processor_practitioner_id is null and processor_assignment_id is null)
        or (status = 'RECEIVED' and received_at is not null and received_by is not null
            and processor_practitioner_id is not null and processor_assignment_id is not null)
    )
);

create index idx_wmr_ward_worklist on ward_med_return_requests
    (tenant_id, organization_id, nursing_unit_department_id, status, requested_at);
create index idx_wmr_pharm_worklist on ward_med_return_requests
    (tenant_id, stock_site_id, status, handed_over_at);
create index idx_wmr_encounter on ward_med_return_requests
    (tenant_id, encounter_id, requested_at);

create table ward_med_return_lines (
    id number(19) primary key,
    tenant_id number(19) not null,
    return_request_id number(19) not null,
    request_id number(19) not null,
    original_dispense_id number(19) not null,
    original_dispense_line_id number(19) not null,
    dispense_task_line_id number(19) not null,
    medication_name_snapshot varchar2(300 char) not null,
    requested_quantity number(28,8) not null,
    unit_code varchar2(64 char) not null,
    requested_base_quantity number(28,8) not null,
    base_unit_code varchar2(64 char) not null,
    disposition varchar2(32 char),
    stock_return_id number(19),
    return_dispense_id number(19),
    constraint fk_wmrl_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_wmrl_request foreign key (tenant_id, return_request_id)
        references ward_med_return_requests(tenant_id, id),
    constraint fk_wmrl_care_req foreign key (tenant_id, request_id)
        references care_requests(tenant_id, id),
    constraint fk_wmrl_disp foreign key (tenant_id, original_dispense_id)
        references medication_dispenses(tenant_id, id),
    constraint fk_wmrl_disp_line foreign key (tenant_id, original_dispense_line_id)
        references medication_dispense_lines(tenant_id, id),
    constraint fk_wmrl_task_line foreign key (tenant_id, dispense_task_line_id)
        references dispense_task_lines(tenant_id, id),
    constraint fk_wmrl_stock_ret foreign key (tenant_id, stock_return_id)
        references stock_returns(tenant_id, id),
    constraint fk_wmrl_ret_disp foreign key (tenant_id, return_dispense_id)
        references medication_dispenses(tenant_id, id),
    constraint uk_wmrl_tenant_id unique (tenant_id, id),
    constraint uk_wmrl_request_line unique (tenant_id, return_request_id, original_dispense_line_id),
    constraint ck_wmrl_quantity check (requested_quantity > 0 and requested_base_quantity > 0),
    constraint ck_wmrl_disposition check (disposition is null or disposition in ('RESTOCK', 'QUARANTINE', 'DESTROY')),
    constraint ck_wmrl_result check (
        (stock_return_id is null and return_dispense_id is null and disposition is null)
        or (stock_return_id is not null and return_dispense_id is not null and disposition is not null)
    )
);

create index idx_wmrl_disp_line on ward_med_return_lines
    (tenant_id, original_dispense_line_id, return_request_id);

create table ward_med_return_events (
    id number(19) primary key,
    tenant_id number(19) not null,
    return_request_id number(19) not null,
    event_type varchar2(32 char) not null,
    from_status varchar2(32 char),
    to_status varchar2(32 char) not null,
    command_code varchar2(128 char) not null,
    payload_hash varchar2(64 char) not null,
    occurred_at timestamp with time zone not null,
    occurred_by number(19) not null,
    note varchar2(1000 char),
    constraint fk_wmre_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_wmre_request foreign key (tenant_id, return_request_id)
        references ward_med_return_requests(tenant_id, id),
    constraint uk_wmre_tenant_id unique (tenant_id, id),
    constraint uk_wmre_command unique (tenant_id, command_code),
    constraint ck_wmre_type check (event_type in ('CREATED', 'HANDED_OVER', 'RECEIVED'))
);

create index idx_wmre_request on ward_med_return_events
    (tenant_id, return_request_id, occurred_at);
