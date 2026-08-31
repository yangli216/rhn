-- Inpatient orders remain shared CareRequest facts. This migration only adds
-- inpatient workflow semantics, deterministic execution tasks and append-only events.
alter table care_requests add constraint ck_care_req_status_v101
    check (status in ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'));
alter table care_requests drop constraint ck_care_request_status;

create table inpatient_order_workflows (
    request_id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    episode_id bigint not null,
    duration_type varchar(32) not null,
    workflow_status varchar(32) not null,
    authored_practitioner_id bigint,
    signed_by bigint,
    signed_at timestamp with time zone,
    verified_by bigint,
    verified_at timestamp with time zone,
    stopped_by bigint,
    stopped_at timestamp with time zone,
    stop_reason varchar(1000),
    updated_by bigint not null,
    updated_at timestamp with time zone not null,
    constraint fk_ip_wf_request foreign key (tenant_id, request_id)
        references care_requests(tenant_id, id),
    constraint fk_ip_wf_episode foreign key (tenant_id, episode_id)
        references care_episodes(tenant_id, id),
    constraint uk_ip_wf_tenant_id unique (tenant_id, request_id),
    constraint ck_ip_wf_duration check (duration_type in ('LONG_TERM', 'TEMPORARY')),
    constraint ck_ip_wf_status check (workflow_status in ('DRAFT', 'SIGNED', 'ACTIVE', 'COMPLETED', 'STOPPED'))
);

create index idx_ip_wf_episode on inpatient_order_workflows (tenant_id, episode_id, workflow_status);

create table inpatient_order_tasks (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    request_id bigint not null,
    occurrence_no integer not null,
    scheduled_at timestamp with time zone not null,
    status varchar(32) not null,
    outcome_code varchar(64),
    execution_note varchar(1000),
    completed_at timestamp with time zone,
    completed_by bigint,
    cancelled_at timestamp with time zone,
    cancel_reason varchar(1000),
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_ip_task_request foreign key (tenant_id, request_id)
        references inpatient_order_workflows(tenant_id, request_id),
    constraint uk_ip_task_tenant_id unique (tenant_id, id),
    constraint uk_ip_task_occurrence unique (tenant_id, request_id, occurrence_no),
    constraint uk_ip_task_schedule unique (tenant_id, request_id, scheduled_at),
    constraint ck_ip_task_occurrence check (occurrence_no > 0),
    constraint ck_ip_task_status check (status in ('PLANNED', 'EXECUTED', 'SKIPPED', 'CANCELLED'))
);

create index idx_ip_task_worklist on inpatient_order_tasks (tenant_id, status, scheduled_at);

create table inpatient_order_events (
    id bigint primary key,
    tenant_id bigint not null,
    request_id bigint not null,
    task_id bigint,
    event_type varchar(32) not null,
    order_status_from varchar(32),
    order_status_to varchar(32),
    task_status_from varchar(32),
    task_status_to varchar(32),
    command_code varchar(128) not null,
    reason varchar(1000),
    actor_id bigint not null,
    occurred_at timestamp with time zone not null,
    constraint fk_ip_evt_request foreign key (tenant_id, request_id)
        references inpatient_order_workflows(tenant_id, request_id),
    constraint fk_ip_evt_task foreign key (tenant_id, task_id)
        references inpatient_order_tasks(tenant_id, id),
    constraint uk_ip_evt_tenant_id unique (tenant_id, id),
    constraint uk_ip_evt_command unique (tenant_id, command_code),
    constraint ck_ip_evt_type check (event_type in (
        'ORDER_CREATED', 'ORDER_SIGNED', 'ORDER_VERIFIED', 'TASKS_PLANNED',
        'TASK_EXECUTED', 'TASK_SKIPPED', 'ORDER_STOPPED'
    ))
);

create index idx_ip_evt_request on inpatient_order_events (tenant_id, request_id, occurred_at);
