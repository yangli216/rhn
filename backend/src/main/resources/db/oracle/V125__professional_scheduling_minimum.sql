alter table schedule_template_periods add (slot_minutes number(4));
alter table schedule_template_periods add constraint ck_sched_period_slot_minutes
    check (slot_minutes is null or slot_minutes between 5 and 120);

create table schedule_exceptions (
    id number(19) primary key,
    tenant_id number(19) not null,
    template_id number(19) not null,
    exception_date date not null,
    exception_type varchar2(32 char) not null,
    minute_start number(4),
    minute_end number(4),
    capacity number(5),
    slot_minutes number(4),
    reason varchar2(500 char) not null,
    created_at timestamp with time zone not null,
    created_by number(19) not null,
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

-- Oracle already creates an index for uk_sched_exception_date on the same columns.
