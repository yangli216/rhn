alter table schedule_template_periods add column slot_minutes integer;
alter table schedule_template_periods add constraint ck_sched_period_slot_minutes
    check (slot_minutes is null or slot_minutes between 5 and 120);

create table schedule_exceptions (
    id bigint primary key,
    tenant_id bigint not null,
    template_id bigint not null,
    exception_date date not null,
    exception_type varchar(32) not null,
    minute_start integer,
    minute_end integer,
    capacity integer,
    slot_minutes integer,
    reason varchar(500) not null,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    constraint fk_sched_exception_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_sched_exception_template foreign key (tenant_id, template_id)
        references schedule_templates(tenant_id, id),
    constraint fk_sched_exception_user foreign key (tenant_id, created_by)
        references user_accounts(tenant_id, id),
    constraint uk_sched_exception_tenant_id unique (tenant_id, id),
    constraint uk_sched_exception_date unique (tenant_id, template_id, exception_date),
    constraint ck_sched_exception_type check (exception_type in ('CLOSED', 'OVERRIDE')),
    constraint ck_sched_exception_values check (
        (exception_type = 'CLOSED' and minute_start is null and minute_end is null
            and capacity is null and slot_minutes is null)
        or (exception_type = 'OVERRIDE' and minute_start between 0 and 1439
            and minute_end between 1 and 1439 and minute_end > minute_start
            and capacity between 1 and 500
            and (slot_minutes is null or slot_minutes between 5 and 120))
    )
);

create index idx_sched_exception_template on schedule_exceptions
    (tenant_id, template_id, exception_date);
