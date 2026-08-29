create table stock_sites (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    organization_id bigint not null,
    department_id bigint,
    code varchar(64) not null,
    name varchar(200) not null,
    site_type varchar(32) not null,
    service_scope varchar(32) not null,
    active boolean not null,
    valid_from date not null,
    valid_to date,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_stock_site_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_stock_site_organization foreign key (tenant_id, organization_id)
        references organizations(tenant_id, id),
    constraint fk_stock_site_department foreign key (tenant_id, organization_id, department_id)
        references departments(tenant_id, organization_id, id),
    constraint uk_stock_site_tenant_id unique (tenant_id, id),
    constraint uk_stock_site_code unique (tenant_id, organization_id, code),
    constraint ck_stock_site_type check (site_type in ('WAREHOUSE', 'PHARMACY', 'DEPARTMENT_STORE', 'VIRTUAL')),
    constraint ck_stock_site_scope check (service_scope in ('OUTPATIENT', 'INPATIENT', 'EMERGENCY', 'COMMUNITY', 'MIXED')),
    constraint ck_stock_site_validity check (valid_to is null or valid_to >= valid_from)
);
create index idx_stock_site_route on stock_sites (tenant_id, organization_id, service_scope, active);

create table stock_items (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    stock_site_id bigint not null,
    catalog_item_id bigint not null,
    base_package_id bigint not null,
    base_unit_code varchar(64) not null,
    issue_policy varchar(32) not null,
    negative_allowed boolean not null,
    lot_required boolean not null,
    trace_required boolean not null,
    split_allowed boolean not null,
    cold_chain boolean not null,
    controlled boolean not null,
    control_level varchar(32),
    high_alert boolean not null,
    status varchar(32) not null,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_stock_item_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_stock_item_site foreign key (tenant_id, stock_site_id) references stock_sites(tenant_id, id),
    constraint fk_stock_item_catalog foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint fk_stock_item_package foreign key (tenant_id, base_package_id) references item_packages(tenant_id, id),
    constraint uk_stock_item_tenant_id unique (tenant_id, id),
    constraint uk_stock_item_site_catalog unique (tenant_id, stock_site_id, catalog_item_id),
    constraint ck_stock_item_issue_policy check (issue_policy in ('FEFO', 'FIFO', 'MANUAL')),
    constraint ck_stock_item_status check (status in ('ACTIVE', 'SUSPENDED', 'RETIRED')),
    constraint ck_stock_item_control check (controlled or control_level is null)
);
create index idx_stock_item_catalog on stock_items (tenant_id, catalog_item_id, status);

create table dispense_tasks (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    resident_id bigint not null,
    encounter_id bigint not null,
    stock_site_id bigint not null,
    latest_review_id bigint,
    task_no varchar(64) not null,
    task_type varchar(32) not null,
    priority varchar(32) not null,
    status varchar(32) not null,
    created_at timestamp with time zone not null,
    due_at timestamp with time zone,
    picked_at timestamp with time zone,
    assigned_practitioner_id bigint,
    description varchar(1000),
    constraint fk_dispense_task_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_dispense_task_resident foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_dispense_task_encounter foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint fk_dispense_task_site foreign key (tenant_id, stock_site_id) references stock_sites(tenant_id, id),
    constraint uk_dispense_task_tenant_id unique (tenant_id, id),
    constraint uk_dispense_task_no unique (tenant_id, task_no),
    constraint ck_dispense_task_type check (task_type in ('OUTPATIENT', 'INPATIENT', 'EMERGENCY', 'DELIVERY')),
    constraint ck_dispense_task_priority check (priority in ('ROUTINE', 'URGENT', 'STAT')),
    constraint ck_dispense_task_status check (status in (
        'PENDING_REVIEW', 'INTERVENTION', 'READY_TO_PICK', 'PICKING',
        'READY_TO_DISPENSE', 'COMPLETED', 'REJECTED', 'CANCELLED'))
);
create index idx_dispense_task_queue on dispense_tasks (tenant_id, stock_site_id, status, priority, created_at);
create index idx_dispense_task_resident on dispense_tasks (tenant_id, resident_id, created_at);

create table dispense_task_lines (
    id bigint primary key,
    tenant_id bigint not null,
    task_id bigint not null,
    request_id bigint not null,
    sort_order int not null,
    stock_item_id bigint not null,
    package_id bigint not null,
    requested_quantity decimal(28,8) not null,
    planned_quantity decimal(28,8) not null,
    dispensed_quantity decimal(28,8) default 0 not null,
    returned_quantity decimal(28,8) default 0 not null,
    dispense_unit_code varchar(64) not null,
    base_quantity_factor decimal(28,8) not null,
    split boolean not null,
    trace_required boolean not null,
    status varchar(32) not null,
    product_code_snapshot varchar(64) not null,
    product_name_snapshot varchar(300) not null,
    package_spec_snapshot varchar(300),
    item_attribute_snapshot text not null,
    item_attribute_hash varchar(64) not null,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    constraint fk_dispense_line_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_dispense_line_task foreign key (tenant_id, task_id) references dispense_tasks(tenant_id, id),
    constraint fk_dispense_line_request foreign key (tenant_id, request_id) references care_requests(tenant_id, id),
    constraint fk_dispense_line_stock_item foreign key (tenant_id, stock_item_id) references stock_items(tenant_id, id),
    constraint fk_dispense_line_package foreign key (tenant_id, package_id) references item_packages(tenant_id, id),
    constraint uk_dispense_line_tenant_id unique (tenant_id, id),
    constraint uk_dispense_line_request unique (tenant_id, request_id),
    constraint uk_dispense_line_order unique (tenant_id, task_id, sort_order),
    constraint ck_dispense_line_quantities check (
        requested_quantity > 0 and planned_quantity > 0 and dispensed_quantity >= 0 and returned_quantity >= 0),
    constraint ck_dispense_line_factor check (base_quantity_factor > 0),
    constraint ck_dispense_line_status check (status in ('PENDING', 'READY', 'PICKING', 'PARTIAL', 'COMPLETED', 'CANCELLED'))
);
create index idx_dispense_line_stock_item on dispense_task_lines (tenant_id, stock_item_id, status);

create table pharmacy_reviews (
    id bigint primary key,
    tenant_id bigint not null,
    request_id bigint not null,
    task_id bigint not null,
    review_no varchar(64) not null,
    result varchar(32) not null,
    reason_code varchar(64),
    description varchar(2000),
    pharmacist_practitioner_id bigint not null,
    reviewer_user_id bigint not null,
    reviewer_assignment_id bigint not null,
    reviewed_at timestamp with time zone not null,
    constraint fk_pharmacy_review_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_pharmacy_review_request foreign key (tenant_id, request_id) references care_requests(tenant_id, id),
    constraint fk_pharmacy_review_task foreign key (tenant_id, task_id) references dispense_tasks(tenant_id, id),
    constraint uk_pharmacy_review_tenant_id unique (tenant_id, id),
    constraint uk_pharmacy_review_no unique (tenant_id, review_no),
    constraint ck_pharmacy_review_result check (result in ('PASS', 'REJECT', 'INTERVENE', 'OVERRIDE')),
    constraint ck_pharmacy_review_reason check (
        (result = 'PASS') or (reason_code is not null and description is not null))
);
create index idx_pharmacy_review_request on pharmacy_reviews (tenant_id, request_id, reviewed_at);

alter table dispense_tasks add constraint fk_dispense_task_latest_review
    foreign key (tenant_id, latest_review_id) references pharmacy_reviews(tenant_id, id);
