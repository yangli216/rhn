-- Immutable fulfillment allocation ledger. It links a downstream administration
-- to the exact positive dispense lines without duplicating prescription or stock facts.
alter table inpatient_order_workflows add column medication_quantity_per_occurrence decimal(28,8);
alter table inpatient_order_workflows add column medication_quantity_unit varchar(64);
alter table inpatient_order_workflows add column medication_base_quantity_per_occurrence decimal(28,8);
alter table inpatient_order_workflows add column medication_base_unit varchar(64);
alter table inpatient_order_workflows add constraint ck_ip_wf_med_supply check (
    (medication_quantity_per_occurrence is null and medication_quantity_unit is null
        and medication_base_quantity_per_occurrence is null and medication_base_unit is null)
    or (medication_quantity_per_occurrence > 0 and medication_quantity_unit is not null
        and medication_base_quantity_per_occurrence > 0 and medication_base_unit is not null)
);

alter table inpatient_order_tasks add constraint uk_ip_task_id_req
    unique (tenant_id, id, request_id);
alter table dispense_task_lines add constraint uk_disp_line_id_req
    unique (tenant_id, id, request_id);
alter table medication_dispense_lines add constraint uk_med_disp_line_task_line
    unique (tenant_id, id, task_line_id);

create table inpatient_med_consumptions (
    id bigint primary key,
    tenant_id bigint not null,
    request_id bigint not null,
    consumer_type varchar(32) not null,
    order_task_id bigint not null,
    dispense_task_line_id bigint not null,
    dispense_id bigint not null,
    dispense_line_id bigint not null,
    consumed_quantity decimal(28,8) not null,
    dispense_unit_code varchar(64) not null,
    consumed_base_quantity decimal(28,8) not null,
    base_unit_code varchar(64) not null,
    command_code varchar(128) not null,
    consumed_at timestamp with time zone not null,
    consumed_by bigint not null,
    constraint fk_med_cons_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_med_cons_request foreign key (tenant_id, request_id) references care_requests(tenant_id, id),
    constraint fk_med_cons_task_req foreign key (tenant_id, order_task_id, request_id)
        references inpatient_order_tasks(tenant_id, id, request_id),
    constraint fk_med_cons_dtl_req foreign key (tenant_id, dispense_task_line_id, request_id)
        references dispense_task_lines(tenant_id, id, request_id),
    constraint fk_med_cons_dispense foreign key (tenant_id, dispense_id) references medication_dispenses(tenant_id, id),
    constraint fk_med_cons_line foreign key (tenant_id, dispense_line_id, dispense_task_line_id)
        references medication_dispense_lines(tenant_id, id, task_line_id),
    constraint uk_med_cons_tenant_id unique (tenant_id, id),
    constraint uk_med_cons_consumer_line unique (tenant_id, consumer_type, order_task_id, dispense_line_id),
    constraint uk_med_cons_command_line unique (tenant_id, command_code, dispense_line_id),
    constraint ck_med_consumer_type check (consumer_type in ('INPATIENT_ORDER_TASK')),
    constraint ck_med_cons_quantity check (consumed_quantity > 0 and consumed_base_quantity > 0)
);

create index idx_med_cons_dispense_line
    on inpatient_med_consumptions (tenant_id, dispense_line_id);
create index idx_med_cons_request
    on inpatient_med_consumptions (tenant_id, request_id, consumed_at);
