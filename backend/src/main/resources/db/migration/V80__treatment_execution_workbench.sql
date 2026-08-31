create table treatment_execution_tasks (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    organization_id bigint not null,
    department_id bigint not null,
    resident_id bigint not null,
    encounter_id bigint not null,
    source_group_id bigint not null,
    task_no varchar(64) not null,
    task_type varchar(32) not null,
    status varchar(32) not null,
    created_at timestamp with time zone not null,
    started_at timestamp with time zone,
    started_by bigint,
    verification_method varchar(32),
    execution_site varchar(128),
    start_note varchar(1000),
    completed_at timestamp with time zone,
    completed_by bigint,
    result_code varchar(32),
    completion_note varchar(2000),
    adverse_reaction boolean default false not null,
    adverse_reaction_detail varchar(2000),
    exception_note varchar(1000),
    constraint fk_treat_task_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_treat_task_org foreign key (tenant_id, organization_id)
        references organizations(tenant_id, id),
    constraint fk_treat_task_dept foreign key (tenant_id, organization_id, department_id)
        references departments(tenant_id, organization_id, id),
    constraint fk_treat_task_resident foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_treat_task_encounter foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint fk_treat_task_source foreign key (tenant_id, source_group_id) references care_requests(tenant_id, id),
    constraint fk_treat_task_starter foreign key (tenant_id, started_by) references user_accounts(tenant_id, id),
    constraint fk_treat_task_completer foreign key (tenant_id, completed_by) references user_accounts(tenant_id, id),
    constraint uk_treat_task_tenant_id unique (tenant_id, id),
    constraint uk_treat_task_group unique (tenant_id, task_type, source_group_id),
    constraint uk_treat_task_no unique (tenant_id, task_no),
    constraint ck_treat_task_type check (task_type in ('SERVICE', 'MEDICATION')),
    constraint ck_treat_task_status check (status in (
        'WAITING_SETTLEMENT', 'WAITING_DISPENSE', 'READY', 'IN_PROGRESS',
        'COMPLETED', 'CANCELLED', 'EXCEPTION'
    )),
    constraint ck_treat_task_result check (result_code is null or result_code in (
        'COMPLETED', 'INTERRUPTED', 'NOT_COMPLETED'
    )),
    constraint ck_treat_task_reaction check (
        adverse_reaction = false or adverse_reaction_detail is not null
    )
);

create table treatment_execution_items (
    id bigint primary key,
    tenant_id bigint not null,
    task_id bigint not null,
    source_type varchar(32) not null,
    source_id bigint not null,
    parent_source_id bigint,
    request_no varchar(64) not null,
    item_code_snapshot varchar(128) not null,
    item_name_snapshot varchar(300) not null,
    dose_value numeric(28,8),
    dose_unit varchar(64),
    route_code varchar(64),
    frequency_code varchar(64),
    duration_value numeric(12,3),
    duration_unit varchar(32),
    skin_test_required boolean default false not null,
    settlement_required boolean default false not null,
    settlement_id bigint,
    fulfillment_required boolean default false not null,
    fulfillment_id bigint,
    fulfillment_status varchar(32),
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone not null,
    constraint fk_treat_item_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_treat_item_task foreign key (tenant_id, task_id)
        references treatment_execution_tasks(tenant_id, id),
    constraint fk_treat_item_source foreign key (tenant_id, source_id) references care_requests(tenant_id, id),
    constraint fk_treat_item_parent foreign key (tenant_id, parent_source_id) references care_requests(tenant_id, id),
    constraint fk_treat_item_settle foreign key (tenant_id, settlement_id) references settlements(tenant_id, id),
    constraint uk_treat_item_tenant_id unique (tenant_id, id),
    constraint uk_treat_item_source unique (tenant_id, source_type, source_id),
    constraint ck_treat_item_source check (source_type in ('SERVICE_REQUEST', 'MEDICATION_REQUEST')),
    constraint ck_treat_item_settle check (settlement_required = true or settlement_id is null),
    constraint ck_treat_item_fulfill check (fulfillment_required = true or fulfillment_id is null)
);

create index idx_treat_task_worklist on treatment_execution_tasks
    (tenant_id, organization_id, department_id, status, created_at);
create index idx_treat_task_encounter on treatment_execution_tasks (tenant_id, encounter_id, created_at);
create index idx_treat_item_task on treatment_execution_items (tenant_id, task_id, created_at);
