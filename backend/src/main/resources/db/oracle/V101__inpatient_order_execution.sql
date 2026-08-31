-- Inpatient orders remain shared CareRequest facts. This migration only adds
-- inpatient workflow semantics, deterministic execution tasks and append-only events.
alter table care_requests add constraint ck_care_req_status_v101
    check (status in ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'));
alter table care_requests drop constraint ck_care_request_status;

create table inpatient_order_workflows (
    request_id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    episode_id number(19) not null,
    duration_type varchar2(32 char) not null,
    workflow_status varchar2(32 char) not null,
    authored_practitioner_id number(19),
    signed_by number(19),
    signed_at timestamp with time zone,
    verified_by number(19),
    verified_at timestamp with time zone,
    stopped_by number(19),
    stopped_at timestamp with time zone,
    stop_reason varchar2(1000 char),
    updated_by number(19) not null,
    updated_at timestamp with time zone not null,
    constraint fk_ip_wf_request foreign key (tenant_id, request_id) references care_requests(tenant_id, id),
    constraint fk_ip_wf_episode foreign key (tenant_id, episode_id) references care_episodes(tenant_id, id),
    constraint uk_ip_wf_tenant_id unique (tenant_id, request_id),
    constraint ck_ip_wf_duration check (duration_type in ('LONG_TERM', 'TEMPORARY')),
    constraint ck_ip_wf_status check (workflow_status in ('DRAFT', 'SIGNED', 'ACTIVE', 'COMPLETED', 'STOPPED'))
);

create index idx_ip_wf_episode on inpatient_order_workflows (tenant_id, episode_id, workflow_status);

create table inpatient_order_tasks (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    request_id number(19) not null,
    occurrence_no number(10) not null,
    scheduled_at timestamp with time zone not null,
    status varchar2(32 char) not null,
    outcome_code varchar2(64 char),
    execution_note varchar2(1000 char),
    completed_at timestamp with time zone,
    completed_by number(19),
    cancelled_at timestamp with time zone,
    cancel_reason varchar2(1000 char),
    created_at timestamp with time zone not null,
    created_by number(19) not null,
    updated_at timestamp with time zone not null,
    updated_by number(19) not null,
    constraint fk_ip_task_request foreign key (tenant_id, request_id) references inpatient_order_workflows(tenant_id, request_id),
    constraint uk_ip_task_tenant_id unique (tenant_id, id),
    constraint uk_ip_task_occurrence unique (tenant_id, request_id, occurrence_no),
    constraint ck_ip_task_occurrence check (occurrence_no > 0),
    constraint ck_ip_task_status check (status in ('PLANNED', 'EXECUTED', 'SKIPPED', 'CANCELLED'))
);

-- Oracle cannot use TIMESTAMP WITH TIME ZONE directly in a unique key. Normalize
-- the instant to UTC for the same deterministic schedule uniqueness semantics.
create unique index uk_ip_task_schedule on inpatient_order_tasks
    (tenant_id, request_id, sys_extract_utc(scheduled_at));
create index idx_ip_task_worklist on inpatient_order_tasks (tenant_id, status, scheduled_at);

create table inpatient_order_events (
    id number(19) primary key,
    tenant_id number(19) not null,
    request_id number(19) not null,
    task_id number(19),
    event_type varchar2(32 char) not null,
    order_status_from varchar2(32 char),
    order_status_to varchar2(32 char),
    task_status_from varchar2(32 char),
    task_status_to varchar2(32 char),
    command_code varchar2(128 char) not null,
    reason varchar2(1000 char),
    actor_id number(19) not null,
    occurred_at timestamp with time zone not null,
    constraint fk_ip_evt_request foreign key (tenant_id, request_id) references inpatient_order_workflows(tenant_id, request_id),
    constraint fk_ip_evt_task foreign key (tenant_id, task_id) references inpatient_order_tasks(tenant_id, id),
    constraint uk_ip_evt_tenant_id unique (tenant_id, id),
    constraint uk_ip_evt_command unique (tenant_id, command_code),
    constraint ck_ip_evt_type check (event_type in (
        'ORDER_CREATED', 'ORDER_SIGNED', 'ORDER_VERIFIED', 'TASKS_PLANNED',
        'TASK_EXECUTED', 'TASK_SKIPPED', 'ORDER_STOPPED'
    ))
);

create index idx_ip_evt_request on inpatient_order_events (tenant_id, request_id, occurred_at);
