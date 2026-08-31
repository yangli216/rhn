-- Oracle variant of db/migration/V116.
insert into parameter_categories values (
    362387869794030, null, 'INPATIENT', '住院医疗',
    '住院医嘱、护理、病区药品和费用等业务策略', 40, 1, 0,
    current_timestamp, 362387869790222, current_timestamp, 362387869790222
)
/
insert into parameter_categories values (
    362387869794031, 362387869794030, 'PHARMACY_INPATIENT_SUPPLY', '住院病区供药',
    '住院长期和临时药品医嘱按病区与班次形成供药批次的运行参数', 10, 1, 0,
    current_timestamp, 362387869790222, current_timestamp, 362387869790222
)
/

insert into parameter_definitions values (
    362387869795030, 362387869794031,
    'pharmacy.inpatient-supply.auto-generation.enabled', '启用住院供药批次自动生成',
    '默认关闭；启用后仅提前生成并提交病区供药批次，不自动代替药师接方、审方、配药或发药',
    'BOOLEAN', 'SWITCH', '{"type":"boolean"}', 'false', 'true', null, null,
    '["PLATFORM","TENANT","ORGANIZATION","DEPARTMENT"]', 'BUSINESS', 1, 1, 0,
    'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222
)
/
insert into parameter_definitions values (
    362387869795031, 362387869794031,
    'pharmacy.inpatient-supply.auto-generation.lead-time', '住院供药批次提前生成时间',
    '下一班次开始前多少分钟创建供药批次；仅在自动生成开关启用时生效',
    'NUMBER', 'NUMBER', '{"type":"integer","minimum":1,"maximum":480}', '120', '60', 'min', null,
    '["PLATFORM","TENANT","ORGANIZATION","DEPARTMENT"]', 'BUSINESS', 1, 1, 0,
    'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222
)
/

insert into parameter_changes (
    id, tenant_id, definition_id, value_id, target_type, change_type,
    before_json, after_json, change_reason, request_code, changed_at, changed_by
)
select 362387869796030 + row_number() over (order by id), null, id, null, 'DEFINITION', 'CREATE',
       null, to_clob('{"source":"PRODUCT_BASELINE","key":"' || parameter_key || '","status":"ACTIVE"}'),
       '初始化住院病区供药自动生成参数', 'baseline-v116:' || parameter_key,
       current_timestamp, 362387869790222
  from parameter_definitions
 where id between 362387869795030 and 362387869795031
/

alter table inpatient_med_supply_batches add (
    generation_trigger varchar2(16 char) default 'MANUAL' not null
)
/
alter table inpatient_med_supply_batches modify (created_by null)
/
alter table inpatient_med_supply_lines modify (created_by null)
/
alter table inpatient_med_supply_tasks modify (created_by null)
/
alter table inpatient_med_supply_batches drop constraint ck_ipmsb_submit
/
alter table inpatient_med_supply_lines drop constraint ck_ipmsl_submit
/
alter table inpatient_med_supply_batches add constraint ck_ipmsb_trigger
    check (generation_trigger in ('MANUAL', 'AUTO'))
/
alter table inpatient_med_supply_batches add constraint ck_ipmsb_actor
    check ((generation_trigger = 'MANUAL' and created_by is not null)
        or (generation_trigger = 'AUTO' and created_by is null))
/
alter table inpatient_med_supply_batches add constraint ck_ipmsb_submit check (
    (status = 'DRAFT' and submitted_at is null and submitted_by is null and submit_command_code is null
        and submit_payload_hash is null)
    or (status in ('SUBMITTED', 'CLOSED') and submitted_at is not null
        and submit_command_code is not null and submit_payload_hash is not null
        and ((generation_trigger = 'MANUAL' and submitted_by is not null)
            or (generation_trigger = 'AUTO' and submitted_by is null)))
    or (status = 'CANCELLED')
)
/
alter table inpatient_med_supply_lines add constraint ck_ipmsl_submit check (
    (status = 'DRAFT' and submitted_at is null and submitted_by is null)
    or (status in ('SUBMITTED', 'INTAKEN') and submitted_at is not null
        and ((created_by is not null and submitted_by is not null)
            or (created_by is null and submitted_by is null)))
    or (status = 'CANCELLED')
)
/

create table inpatient_med_supply_gen_runs (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    organization_id number(19) not null,
    stock_site_id number(19) not null,
    nursing_unit_department_id number(19) not null,
    dispense_route_id number(19) not null,
    dispense_route_revision number(19) not null,
    business_date date not null,
    shift_code varchar2(16 char) not null,
    window_start timestamp with time zone not null,
    window_end timestamp with time zone not null,
    job_key varchar2(128 char) not null,
    command_code varchar2(128 char) not null,
    trigger_type varchar2(16 char) not null,
    status varchar2(16 char) not null,
    attempt_count number(10) default 0 not null,
    next_attempt_at timestamp with time zone not null,
    claimed_by varchar2(100 char),
    claimed_until timestamp with time zone,
    batch_id number(19),
    last_error varchar2(1000 char),
    created_at timestamp with time zone not null,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone not null,
    constraint fk_ipmsgr_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_ipmsgr_org foreign key (tenant_id, organization_id)
        references organizations(tenant_id, id),
    constraint fk_ipmsgr_site foreign key (tenant_id, stock_site_id)
        references stock_sites(tenant_id, id),
    constraint fk_ipmsgr_dept foreign key (tenant_id, organization_id, nursing_unit_department_id)
        references departments(tenant_id, organization_id, id),
    constraint fk_ipmsgr_route foreign key (tenant_id, dispense_route_id)
        references dispense_routes(tenant_id, id),
    constraint fk_ipmsgr_batch foreign key (tenant_id, batch_id)
        references inpatient_med_supply_batches(tenant_id, id),
    constraint uk_ipmsgr_tenant_id unique (tenant_id, id),
    constraint uk_ipmsgr_job unique (tenant_id, job_key),
    constraint uk_ipmsgr_command unique (tenant_id, command_code),
    constraint ck_ipmsgr_shift check (shift_code in ('NIGHT', 'DAY', 'EVENING')),
    constraint ck_ipmsgr_trigger check (trigger_type in ('AUTO')),
    constraint ck_ipmsgr_status check (status in (
        'PENDING', 'RUNNING', 'SUCCEEDED', 'NO_DEMAND', 'FAILED', 'EXHAUSTED'
    )),
    constraint ck_ipmsgr_window check (window_end > window_start),
    constraint ck_ipmsgr_claim check (
        (claimed_by is null and claimed_until is null)
        or (claimed_by is not null and claimed_until is not null)
    ),
    constraint ck_ipmsgr_result check (
        (status = 'SUCCEEDED' and batch_id is not null and completed_at is not null)
        or (status = 'NO_DEMAND' and batch_id is null and completed_at is not null)
        or (status in ('PENDING', 'RUNNING', 'FAILED', 'EXHAUSTED') and batch_id is null)
    )
)
/
create index idx_ipmsgr_dispatch on inpatient_med_supply_gen_runs
    (status, next_attempt_at, claimed_until, created_at)
/
create index idx_ipmsgr_scope on inpatient_med_supply_gen_runs
    (tenant_id, organization_id, nursing_unit_department_id, business_date, shift_code)
/
