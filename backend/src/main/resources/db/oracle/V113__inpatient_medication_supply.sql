-- Rolling inpatient medication supply demand. Shared clinical, pharmacy and stock
-- facts remain authoritative; identifiers intentionally stay within Oracle's 30-char limit.

create table inpatient_med_supply_batches (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    organization_id number(19) not null,
    stock_site_id number(19) not null,
    nursing_unit_department_id number(19) not null,
    batch_no varchar2(64 char) not null,
    batch_type varchar2(32 char) not null,
    supply_mode varchar2(32 char) not null,
    window_start timestamp with time zone not null,
    window_end timestamp with time zone not null,
    cutoff_at timestamp with time zone not null,
    status varchar2(32 char) not null,
    generation_command_code varchar2(128 char) not null,
    generation_payload_hash varchar2(64 char) not null,
    submit_command_code varchar2(128 char),
    submit_payload_hash varchar2(64 char),
    cancel_command_code varchar2(128 char),
    created_at timestamp with time zone not null,
    created_by number(19) not null,
    submitted_at timestamp with time zone,
    submitted_by number(19),
    cancelled_at timestamp with time zone,
    cancelled_by number(19),
    cancel_reason varchar2(1000 char),
    closed_at timestamp with time zone,
    closed_by number(19),
    constraint fk_ipmsb_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_ipmsb_org foreign key (tenant_id, organization_id)
        references organizations(tenant_id, id),
    constraint fk_ipmsb_site foreign key (tenant_id, stock_site_id)
        references stock_sites(tenant_id, id),
    constraint fk_ipmsb_dept foreign key (tenant_id, organization_id, nursing_unit_department_id)
        references departments(tenant_id, organization_id, id),
    constraint uk_ipmsb_tenant_id unique (tenant_id, id),
    constraint uk_ipmsb_batch_no unique (tenant_id, batch_no),
    constraint uk_ipmsb_gen_cmd unique (tenant_id, generation_command_code),
    constraint uk_ipmsb_submit_cmd unique (tenant_id, submit_command_code),
    constraint uk_ipmsb_cancel_cmd unique (tenant_id, cancel_command_code),
    constraint uk_ipmsb_window unique (tenant_id, generation_payload_hash),
    constraint ck_ipmsb_type check (batch_type in ('DAILY', 'AD_HOC')),
    constraint ck_ipmsb_mode check (supply_mode in ('UNIT_DOSE', 'WHOLE_PACKAGE', 'WARD_STOCK')),
    constraint ck_ipmsb_status check (status in ('DRAFT', 'SUBMITTED', 'CANCELLED', 'CLOSED')),
    constraint ck_ipmsb_window check (window_end > window_start and cutoff_at <= window_end),
    constraint ck_ipmsb_submit check (
        (status = 'DRAFT' and submitted_at is null and submitted_by is null and submit_command_code is null
            and submit_payload_hash is null)
        or (status in ('SUBMITTED', 'CLOSED') and submitted_at is not null and submitted_by is not null
            and submit_command_code is not null and submit_payload_hash is not null)
        or (status = 'CANCELLED')
    ),
    constraint ck_ipmsb_cancel check (
        (status <> 'CANCELLED' and cancelled_at is null and cancelled_by is null
            and cancel_command_code is null and cancel_reason is null)
        or (status = 'CANCELLED' and cancelled_at is not null and cancelled_by is not null
            and cancel_command_code is not null and cancel_reason is not null)
    ),
    constraint ck_ipmsb_close check (
        (status <> 'CLOSED' and closed_at is null and closed_by is null)
        or (status = 'CLOSED' and closed_at is not null and closed_by is not null)
    )
);

create index idx_ipmsb_worklist on inpatient_med_supply_batches
    (tenant_id, organization_id, nursing_unit_department_id, status, window_start);
create index idx_ipmsb_pharmacy on inpatient_med_supply_batches
    (tenant_id, stock_site_id, status, cutoff_at);

create table inpatient_med_supply_lines (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    supply_batch_id number(19) not null,
    request_id number(19) not null,
    encounter_id number(19) not null,
    resident_id number(19) not null,
    bed_no_snapshot varchar2(64 char) not null,
    resident_name_snapshot varchar2(200 char) not null,
    medication_code_snapshot varchar2(128 char) not null,
    medication_name_snapshot varchar2(500 char) not null,
    requested_quantity number(28,8) not null,
    quantity_unit_code varchar2(64 char) not null,
    requested_base_quantity number(28,8) not null,
    base_unit_code varchar2(64 char) not null,
    occurrence_count number(10) not null,
    status varchar2(32 char) not null,
    dispense_task_line_id number(19),
    created_at timestamp with time zone not null,
    created_by number(19) not null,
    submitted_at timestamp with time zone,
    submitted_by number(19),
    taken_at timestamp with time zone,
    taken_by number(19),
    cancelled_at timestamp with time zone,
    cancelled_by number(19),
    cancel_reason varchar2(1000 char),
    constraint fk_ipmsl_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_ipmsl_batch foreign key (tenant_id, supply_batch_id)
        references inpatient_med_supply_batches(tenant_id, id),
    constraint fk_ipmsl_request foreign key (tenant_id, request_id)
        references care_requests(tenant_id, id),
    constraint fk_ipmsl_enc foreign key (tenant_id, encounter_id)
        references encounters(tenant_id, id),
    constraint fk_ipmsl_resident foreign key (tenant_id, resident_id)
        references residents(tenant_id, id),
    constraint fk_ipmsl_disp_line foreign key (tenant_id, dispense_task_line_id)
        references dispense_task_lines(tenant_id, id),
    constraint uk_ipmsl_tenant_id unique (tenant_id, id),
    constraint uk_ipmsl_id_request unique (tenant_id, id, request_id),
    constraint uk_ipmsl_batch_req unique (tenant_id, supply_batch_id, request_id),
    constraint uk_ipmsl_disp_line unique (tenant_id, dispense_task_line_id),
    constraint ck_ipmsl_quantity check (
        requested_quantity > 0 and requested_base_quantity > 0 and occurrence_count > 0
    ),
    constraint ck_ipmsl_status check (status in ('DRAFT', 'SUBMITTED', 'INTAKEN', 'CANCELLED')),
    constraint ck_ipmsl_submit check (
        (status = 'DRAFT' and submitted_at is null and submitted_by is null)
        or (status in ('SUBMITTED', 'INTAKEN') and submitted_at is not null and submitted_by is not null)
        or (status = 'CANCELLED')
    ),
    constraint ck_ipmsl_intake check (
        (status <> 'INTAKEN' and dispense_task_line_id is null and taken_at is null and taken_by is null)
        or (status = 'INTAKEN' and dispense_task_line_id is not null and taken_at is not null
            and taken_by is not null)
    ),
    constraint ck_ipmsl_cancel check (
        (status <> 'CANCELLED' and cancelled_at is null and cancelled_by is null and cancel_reason is null)
        or (status = 'CANCELLED' and cancelled_at is not null and cancelled_by is not null
            and cancel_reason is not null)
    )
);

create index idx_ipmsl_batch on inpatient_med_supply_lines
    (tenant_id, supply_batch_id, status, id);
create index idx_ipmsl_request on inpatient_med_supply_lines
    (tenant_id, request_id, status, id);

create table inpatient_med_supply_tasks (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    supply_line_id number(19) not null,
    request_id number(19) not null,
    order_task_id number(19) not null,
    scheduled_at timestamp with time zone not null,
    required_quantity number(28,8) not null,
    quantity_unit_code varchar2(64 char) not null,
    required_base_quantity number(28,8) not null,
    base_unit_code varchar2(64 char) not null,
    status varchar2(32 char) not null,
    active_slot number(5),
    created_at timestamp with time zone not null,
    created_by number(19) not null,
    cancelled_at timestamp with time zone,
    cancelled_by number(19),
    cancel_reason varchar2(1000 char),
    constraint fk_ipmst_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_ipmst_line_req foreign key (tenant_id, supply_line_id, request_id)
        references inpatient_med_supply_lines(tenant_id, id, request_id),
    constraint fk_ipmst_task_req foreign key (tenant_id, order_task_id, request_id)
        references inpatient_order_tasks(tenant_id, id, request_id),
    constraint uk_ipmst_tenant_id unique (tenant_id, id),
    constraint uk_ipmst_line_task unique (tenant_id, supply_line_id, order_task_id),
    constraint uk_ipmst_active_task unique (tenant_id, order_task_id, active_slot),
    constraint ck_ipmst_quantity check (required_quantity > 0 and required_base_quantity > 0),
    constraint ck_ipmst_status check (status in ('ACTIVE', 'CANCELLED')),
    constraint ck_ipmst_active check (
        (status = 'ACTIVE' and active_slot = 1 and cancelled_at is null and cancelled_by is null
            and cancel_reason is null)
        or (status = 'CANCELLED' and active_slot is null and cancelled_at is not null
            and cancelled_by is not null and cancel_reason is not null)
    )
);

create index idx_ipmst_line on inpatient_med_supply_tasks
    (tenant_id, supply_line_id, status, scheduled_at);
create index idx_ipmst_task on inpatient_med_supply_tasks
    (tenant_id, order_task_id, status);

alter table dispense_task_lines add (
    fulfillment_source_type varchar2(32 char),
    fulfillment_source_id number(19)
);
update dispense_task_lines
   set fulfillment_source_type = 'MEDICATION_REQUEST', fulfillment_source_id = request_id;
alter table dispense_task_lines modify (
    fulfillment_source_type not null,
    fulfillment_source_id not null
);
alter table dispense_task_lines drop constraint fk_dispense_line_request;
alter table dispense_task_lines drop constraint uk_dispense_line_request;
alter table dispense_task_lines add constraint uk_dtl_fulfill_source
    unique (tenant_id, fulfillment_source_type, fulfillment_source_id);
alter table dispense_task_lines add constraint ck_dtl_fulfill_source
    check (fulfillment_source_type in ('MEDICATION_REQUEST', 'INPATIENT_SUPPLY_LINE'));
create index idx_dtl_request on dispense_task_lines (tenant_id, request_id, status);
alter table dispense_task_lines add constraint fk_dispense_line_request
    foreign key (tenant_id, request_id) references care_requests(tenant_id, id);

alter table inventory_reservations add (dispense_task_line_id number(19));
update inventory_reservations r
   set dispense_task_line_id = (
       select l.id from dispense_task_lines l
        where l.tenant_id = r.tenant_id and l.request_id = r.request_id
          and l.fulfillment_source_type = 'MEDICATION_REQUEST'
   );
alter table inventory_reservations modify (dispense_task_line_id not null);
alter table inventory_reservations add constraint fk_inv_rsv_disp_line
    foreign key (tenant_id, dispense_task_line_id) references dispense_task_lines(tenant_id, id);
alter table inventory_reservations drop constraint uk_inv_rsv_dimension;
alter table inventory_reservations add constraint uk_inv_rsv_line_dim unique (
    tenant_id, dispense_task_line_id, reservation_group_code, stock_bin_id, stock_item_id, stock_lot_id
);
create index idx_inv_rsv_disp_line on inventory_reservations
    (tenant_id, dispense_task_line_id, status);
