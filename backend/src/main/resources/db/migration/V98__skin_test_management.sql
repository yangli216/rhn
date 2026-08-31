alter table treatment_execution_tasks drop constraint ck_treat_task_status;
alter table treatment_execution_tasks add constraint ck_treat_task_status check (status in (
    'WAITING_SETTLEMENT', 'WAITING_DISPENSE', 'WAITING_SKIN_TEST', 'READY', 'IN_PROGRESS',
    'COMPLETED', 'CANCELLED', 'EXCEPTION'
));

create table skin_test_events (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    organization_id bigint not null,
    department_id bigint not null,
    resident_id bigint not null,
    encounter_id bigint not null,
    medication_request_id bigint not null,
    medication_id bigint not null,
    attempt_no integer not null,
    medication_code_snapshot varchar(128) not null,
    medication_name_snapshot varchar(300) not null,
    status varchar(32) not null,
    test_method varchar(32) not null,
    original_solution boolean default false not null,
    solution_catalog_item_id bigint,
    solution_name_snapshot varchar(300),
    stock_lot_id bigint,
    lot_no_snapshot varchar(128),
    concentration numeric(28,8),
    concentration_unit varchar(64),
    body_site varchar(128),
    verification_method varchar(32) not null,
    observation_minutes integer not null,
    started_at timestamp with time zone not null,
    completed_at timestamp with time zone,
    result varchar(32),
    wheal_diameter_mm numeric(8,2),
    flare_diameter_mm numeric(8,2),
    reaction_description varchar(1000),
    early_read_reason varchar(1000),
    performed_by_user_id bigint not null,
    performed_by_practitioner_id bigint,
    read_by_user_id bigint,
    read_by_practitioner_id bigint,
    cancelled_at timestamp with time zone,
    cancelled_by bigint,
    cancel_reason varchar(1000),
    created_at timestamp with time zone not null,
    constraint fk_skin_test_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_skin_test_org foreign key (tenant_id, organization_id)
        references organizations(tenant_id, id),
    constraint fk_skin_test_dept foreign key (tenant_id, organization_id, department_id)
        references departments(tenant_id, organization_id, id),
    constraint fk_skin_test_resident foreign key (tenant_id, resident_id)
        references residents(tenant_id, id),
    constraint fk_skin_test_encounter foreign key (tenant_id, encounter_id)
        references encounters(tenant_id, id),
    constraint fk_skin_test_request foreign key (tenant_id, medication_request_id)
        references medication_requests(tenant_id, request_id),
    constraint fk_skin_test_medication foreign key (tenant_id, medication_id)
        references medications(tenant_id, id),
    constraint fk_skin_test_solution foreign key (tenant_id, solution_catalog_item_id)
        references catalog_items(tenant_id, id),
    constraint fk_skin_test_stock_lot foreign key (tenant_id, stock_lot_id)
        references stock_lots(tenant_id, id),
    constraint fk_skin_test_performer_user foreign key (tenant_id, performed_by_user_id)
        references user_accounts(tenant_id, id),
    constraint fk_skin_test_performer_pract foreign key (tenant_id, performed_by_practitioner_id)
        references practitioners(tenant_id, id),
    constraint fk_skin_test_reader_user foreign key (tenant_id, read_by_user_id)
        references user_accounts(tenant_id, id),
    constraint fk_skin_test_reader_pract foreign key (tenant_id, read_by_practitioner_id)
        references practitioners(tenant_id, id),
    constraint fk_skin_test_canceller foreign key (tenant_id, cancelled_by)
        references user_accounts(tenant_id, id),
    constraint uk_skin_test_tenant_id unique (tenant_id, id),
    constraint uk_skin_test_attempt unique (tenant_id, medication_request_id, attempt_no),
    constraint ck_skin_test_status check (status in ('IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    constraint ck_skin_test_method check (test_method in ('INTRADERMAL', 'PRICK', 'OTHER')),
    constraint ck_skin_test_verification check (verification_method in ('NAME_AND_IDENTIFIER', 'CARD', 'MANUAL')),
    constraint ck_skin_test_result check (result is null or result in ('NEGATIVE', 'POSITIVE', 'UNCERTAIN', 'INVALID')),
    constraint ck_skin_test_concentration check (
        (concentration is null and concentration_unit is null)
        or (concentration > 0 and concentration_unit is not null)
    ),
    constraint ck_skin_test_observation check (observation_minutes between 1 and 120),
    constraint ck_skin_test_measurements check (
        (wheal_diameter_mm is null or wheal_diameter_mm >= 0)
        and (flare_diameter_mm is null or flare_diameter_mm >= 0)
    ),
    constraint ck_skin_test_lifecycle check (
        (status = 'IN_PROGRESS' and completed_at is null and result is null and cancelled_at is null)
        or (status = 'COMPLETED' and completed_at is not null and result is not null and cancelled_at is null)
        or (status = 'CANCELLED' and completed_at is null and result is null and cancelled_at is not null
            and cancel_reason is not null)
    ),
    constraint ck_skin_test_positive_reaction check (result <> 'POSITIVE' or reaction_description is not null)
);

create index idx_skin_test_worklist on skin_test_events
    (tenant_id, organization_id, department_id, status, started_at);
create index idx_skin_test_encounter on skin_test_events
    (tenant_id, encounter_id, started_at);
