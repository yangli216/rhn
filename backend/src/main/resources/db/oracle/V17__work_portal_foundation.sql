alter table outbox_events add (next_attempt_at timestamp with time zone);
alter table outbox_events add (claimed_by varchar2(100));
alter table outbox_events add (claimed_until timestamp with time zone);
update outbox_events set next_attempt_at = recorded_at where next_attempt_at is null;
alter table outbox_events modify (next_attempt_at not null);
create index idx_outbox_dispatch on outbox_events (publication_status, next_attempt_at, recorded_at);

create table event_consumptions (
    id number(19) primary key,
    tenant_id number(19) not null,
    consumer_name varchar2(128) not null,
    event_id number(19) not null,
    status varchar2(24) not null,
    processed_at timestamp with time zone not null,
    last_error varchar2(1000),
    constraint fk_event_consumption_tenant foreign key (tenant_id) references tenants(id),
    constraint uk_event_consumption unique (consumer_name, event_id)
);

create table work_tasks (
    id number(19) primary key,
    tenant_id number(19) not null,
    organization_id number(19),
    department_id number(19),
    task_type varchar2(64) not null,
    title varchar2(200) not null,
    summary varchar2(1000),
    priority varchar2(24) not null,
    status varchar2(24) not null,
    assignee_type varchar2(24) not null,
    assignee_id number(19),
    resident_id number(19),
    encounter_id number(19),
    source_type varchar2(80) not null,
    source_id number(19) not null,
    route_path varchar2(500),
    dedup_key varchar2(240) not null,
    due_at timestamp with time zone,
    claimed_by number(19),
    claimed_at timestamp with time zone,
    completed_by number(19),
    completed_at timestamp with time zone,
    created_by number(19),
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    revision number(19) default 0 not null,
    constraint fk_work_task_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_work_task_organization foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_work_task_department foreign key (tenant_id, department_id) references departments(tenant_id, id),
    constraint fk_work_task_resident foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_work_task_encounter foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint fk_work_task_assignee foreign key (tenant_id, assignee_id) references user_accounts(tenant_id, id),
    constraint fk_work_task_claimed_by foreign key (tenant_id, claimed_by) references user_accounts(tenant_id, id),
    constraint fk_work_task_completed_by foreign key (tenant_id, completed_by) references user_accounts(tenant_id, id),
    constraint fk_work_task_created_by foreign key (tenant_id, created_by) references user_accounts(tenant_id, id),
    constraint uk_work_task_tenant_id unique (tenant_id, id),
    constraint uk_work_task_dedup unique (tenant_id, dedup_key)
);
create index idx_work_task_queue on work_tasks (tenant_id, organization_id, department_id, status, priority, due_at);
create index idx_work_task_assignee on work_tasks (tenant_id, assignee_type, assignee_id, status);

create table work_task_history (
    id number(19) primary key,
    tenant_id number(19) not null,
    task_id number(19) not null,
    action varchar2(32) not null,
    from_status varchar2(24),
    to_status varchar2(24) not null,
    actor_id number(19),
    comment_text varchar2(1000),
    correlation_id varchar2(64) not null,
    occurred_at timestamp with time zone not null,
    constraint fk_work_task_history_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_work_task_history_task foreign key (tenant_id, task_id) references work_tasks(tenant_id, id),
    constraint fk_work_task_history_actor foreign key (tenant_id, actor_id) references user_accounts(tenant_id, id)
);
create index idx_work_task_history on work_task_history (tenant_id, task_id, occurred_at);

create table portal_notifications (
    id number(19) primary key,
    tenant_id number(19) not null,
    organization_id number(19),
    department_id number(19),
    recipient_user_id number(19),
    category varchar2(40) not null,
    severity varchar2(24) not null,
    title varchar2(200) not null,
    message varchar2(1000) not null,
    status varchar2(24) not null,
    route_path varchar2(500),
    source_type varchar2(80) not null,
    source_id number(19) not null,
    dedup_key varchar2(240) not null,
    created_at timestamp with time zone not null,
    read_at timestamp with time zone,
    archived_at timestamp with time zone,
    revision number(19) default 0 not null,
    constraint fk_portal_notification_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_portal_notification_organization foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_portal_notification_department foreign key (tenant_id, department_id) references departments(tenant_id, id),
    constraint fk_portal_notification_recipient foreign key (tenant_id, recipient_user_id) references user_accounts(tenant_id, id),
    constraint uk_portal_notification_dedup unique (tenant_id, dedup_key)
);
create index idx_portal_notification_inbox on portal_notifications (tenant_id, recipient_user_id, status, created_at);
create index idx_portal_notification_context on portal_notifications (tenant_id, organization_id, department_id, status, created_at);

create table portal_user_workspaces (
    id number(19) primary key,
    tenant_id number(19) not null,
    user_id number(19) not null,
    default_organization_id number(19),
    default_department_id number(19),
    favorites_json clob not null,
    tabs_json clob not null,
    layout_json clob not null,
    updated_at timestamp with time zone not null,
    revision number(19) default 0 not null,
    constraint fk_portal_workspace_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_portal_workspace_user foreign key (tenant_id, user_id) references user_accounts(tenant_id, id),
    constraint fk_portal_workspace_organization foreign key (tenant_id, default_organization_id) references organizations(tenant_id, id),
    constraint fk_portal_workspace_department foreign key (tenant_id, default_department_id) references departments(tenant_id, id),
    constraint uk_portal_workspace_user unique (tenant_id, user_id)
);
