alter table charge_items drop constraint fk_charge_request;
alter table charge_items add constraint fk_charge_request
    foreign key (tenant_id, request_id) references care_requests(tenant_id, id);

update charge_items set request_id = source_id
 where source_type = 'SERVICE_REQUEST' and request_id is null;

create table diagnostic_execution_tasks (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    organization_id bigint not null,
    department_id bigint not null,
    resident_id bigint not null,
    encounter_id bigint not null,
    request_id bigint not null,
    settlement_id bigint,
    report_id bigint,
    task_no varchar(64) not null,
    request_type varchar(32) not null,
    item_code_snapshot varchar(128) not null,
    item_name_snapshot varchar(300) not null,
    specimen_type_snapshot varchar(64),
    examination_type_snapshot varchar(64),
    status varchar(32) not null,
    created_at timestamp with time zone not null,
    collected_at timestamp with time zone,
    collected_by bigint,
    specimen_no varchar(64),
    collection_note varchar(1000),
    started_at timestamp with time zone,
    started_by bigint,
    completed_at timestamp with time zone,
    completed_by bigint,
    completion_note varchar(1000),
    cancelled_at timestamp with time zone,
    exception_note varchar(1000),
    constraint fk_diag_task_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_diag_task_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_diag_task_dept foreign key (tenant_id, organization_id, department_id)
        references departments(tenant_id, organization_id, id),
    constraint fk_diag_task_resident foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_diag_task_encounter foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint fk_diag_task_request foreign key (tenant_id, request_id) references care_requests(tenant_id, id),
    constraint fk_diag_task_settlement foreign key (tenant_id, settlement_id) references settlements(tenant_id, id),
    constraint fk_diag_task_report foreign key (tenant_id, report_id) references diagnostic_reports(tenant_id, id),
    constraint fk_diag_task_collector foreign key (tenant_id, collected_by) references user_accounts(tenant_id, id),
    constraint fk_diag_task_starter foreign key (tenant_id, started_by) references user_accounts(tenant_id, id),
    constraint fk_diag_task_completer foreign key (tenant_id, completed_by) references user_accounts(tenant_id, id),
    constraint uk_diag_task_tenant_id unique (tenant_id, id),
    constraint uk_diag_task_request unique (tenant_id, request_id),
    constraint uk_diag_task_no unique (tenant_id, task_no),
    constraint ck_diag_task_type check (request_type in ('LABORATORY', 'EXAMINATION')),
    constraint ck_diag_task_status check (status in (
        'WAITING_SETTLEMENT', 'READY', 'COLLECTED', 'IN_PROGRESS',
        'COMPLETED', 'CANCELLED', 'EXCEPTION'
    )),
    constraint ck_diag_task_collection check (
        (collected_at is null and collected_by is null and specimen_no is null) or
        (request_type = 'LABORATORY' and collected_at is not null and collected_by is not null and specimen_no is not null)
    )
);

create index idx_diag_task_worklist on diagnostic_execution_tasks
    (tenant_id, organization_id, department_id, status, created_at);
create index idx_diag_task_encounter on diagnostic_execution_tasks (tenant_id, encounter_id, created_at);
