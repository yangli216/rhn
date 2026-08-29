-- Primary-care scheduling slice. Simple and professional modes share these roots.

create table service_resources (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    organization_id bigint not null,
    department_id bigint not null,
    practitioner_id bigint not null,
    assignment_id bigint not null,
    catalog_item_id bigint not null,
    resource_code varchar(128) not null,
    resource_name varchar(300) not null,
    service_code_snapshot varchar(64) not null,
    service_name_snapshot varchar(300) not null,
    status varchar(32) not null,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_sched_resource_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_sched_resource_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_sched_resource_dept foreign key (tenant_id, organization_id, department_id)
        references departments(tenant_id, organization_id, id),
    constraint fk_sched_resource_pract foreign key (tenant_id, practitioner_id) references practitioners(tenant_id, id),
    constraint fk_sched_resource_asg foreign key (tenant_id, assignment_id) references staff_assignments(tenant_id, id),
    constraint fk_sched_resource_item foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint uk_sched_resource_tenant_id unique (tenant_id, id),
    constraint uk_sched_resource_code unique (tenant_id, resource_code),
    constraint uk_sched_resource_identity unique (
        tenant_id, organization_id, department_id, practitioner_id, catalog_item_id
    ),
    constraint ck_sched_resource_status check (status in ('ACTIVE', 'INACTIVE'))
);
create index idx_sched_resource_context on service_resources
    (tenant_id, organization_id, department_id, status, practitioner_id);

create table schedule_templates (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    resource_id bigint not null,
    template_code varchar(128) not null,
    template_name varchar(300) not null,
    management_mode varchar(32) not null,
    timezone_code varchar(64) not null,
    valid_from date not null,
    valid_to date,
    status varchar(32) not null,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_sched_template_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_sched_template_resource foreign key (tenant_id, resource_id) references service_resources(tenant_id, id),
    constraint uk_sched_template_tenant_id unique (tenant_id, id),
    constraint uk_sched_template_code unique (tenant_id, template_code),
    constraint ck_sched_template_mode check (management_mode in ('SIMPLE', 'PROFESSIONAL')),
    constraint ck_sched_template_status check (status in ('DRAFT', 'ACTIVE', 'INACTIVE')),
    constraint ck_sched_template_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_sched_template_resource on schedule_templates (tenant_id, resource_id, status, valid_from);

create table schedule_template_periods (
    id bigint primary key,
    tenant_id bigint not null,
    template_id bigint not null,
    day_of_week integer not null,
    day_part varchar(32) not null,
    minute_start integer not null,
    minute_end integer not null,
    default_capacity integer not null,
    slot_mode varchar(32) not null,
    active boolean default true not null,
    constraint fk_sched_period_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_sched_period_template foreign key (tenant_id, template_id) references schedule_templates(tenant_id, id),
    constraint uk_sched_period_tenant_id unique (tenant_id, id),
    constraint uk_sched_period_identity unique (tenant_id, template_id, day_of_week, day_part),
    constraint ck_sched_period_weekday check (day_of_week between 1 and 7),
    constraint ck_sched_period_day_part check (day_part in ('MORNING', 'AFTERNOON', 'EVENING', 'CUSTOM')),
    constraint ck_sched_period_time check (minute_start between 0 and 1439 and minute_end between 1 and 1440 and minute_end > minute_start),
    constraint ck_sched_period_capacity check (default_capacity > 0),
    constraint ck_sched_period_slot_mode check (slot_mode in ('POOL', 'TIMED'))
);
create index idx_sched_period_template on schedule_template_periods (tenant_id, template_id, active, day_of_week);

create table schedule_generation_runs (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    template_id bigint not null,
    idempotency_code varchar(128) not null,
    date_from date not null,
    date_to date not null,
    trigger_type varchar(32) not null,
    status varchar(32) not null,
    generated_count integer default 0 not null,
    skipped_count integer default 0 not null,
    request_json text not null,
    started_at timestamp with time zone not null,
    completed_at timestamp with time zone,
    error_message varchar(1000),
    triggered_by bigint not null,
    constraint fk_sched_run_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_sched_run_template foreign key (tenant_id, template_id) references schedule_templates(tenant_id, id),
    constraint uk_sched_run_tenant_id unique (tenant_id, id),
    constraint uk_sched_run_request unique (tenant_id, idempotency_code),
    constraint ck_sched_run_period check (date_to >= date_from),
    constraint ck_sched_run_trigger check (trigger_type in ('QUICK_CREATE', 'MANUAL', 'AUTOMATIC')),
    constraint ck_sched_run_status check (status in ('RUNNING', 'COMPLETED', 'FAILED')),
    constraint ck_sched_run_counts check (generated_count >= 0 and skipped_count >= 0)
);
create index idx_sched_run_template on schedule_generation_runs (tenant_id, template_id, started_at);

create table service_schedules (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    resource_id bigint not null,
    template_id bigint not null,
    template_period_id bigint not null,
    generation_run_id bigint not null,
    organization_id bigint not null,
    department_id bigint not null,
    practitioner_id bigint not null,
    assignment_id bigint not null,
    catalog_item_id bigint not null,
    schedule_code varchar(128) not null,
    management_mode varchar(32) not null,
    schedule_type varchar(32) not null,
    booking_policy varchar(32) not null,
    day_part varchar(32) not null,
    practitioner_name_snapshot varchar(100) not null,
    service_code_snapshot varchar(64) not null,
    service_name_snapshot varchar(300) not null,
    location_name varchar(200),
    timezone_code varchar(64) not null,
    service_date date not null,
    start_at timestamp with time zone not null,
    end_at timestamp with time zone not null,
    total_capacity integer not null,
    status varchar(32) not null,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_service_schedule_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_service_schedule_resource foreign key (tenant_id, resource_id) references service_resources(tenant_id, id),
    constraint fk_service_schedule_template foreign key (tenant_id, template_id) references schedule_templates(tenant_id, id),
    constraint fk_service_schedule_period foreign key (tenant_id, template_period_id) references schedule_template_periods(tenant_id, id),
    constraint fk_service_schedule_run foreign key (tenant_id, generation_run_id) references schedule_generation_runs(tenant_id, id),
    constraint fk_service_schedule_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_service_schedule_dept foreign key (tenant_id, organization_id, department_id)
        references departments(tenant_id, organization_id, id),
    constraint fk_service_schedule_pract foreign key (tenant_id, practitioner_id) references practitioners(tenant_id, id),
    constraint fk_service_schedule_asg foreign key (tenant_id, assignment_id) references staff_assignments(tenant_id, id),
    constraint fk_service_schedule_item foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint uk_service_schedule_tenant_id unique (tenant_id, id),
    constraint uk_service_schedule_code unique (tenant_id, schedule_code),
    constraint uk_service_schedule_time unique (tenant_id, resource_id, start_at, end_at),
    constraint ck_service_schedule_mode check (management_mode in ('SIMPLE', 'PROFESSIONAL')),
    constraint ck_service_schedule_type check (schedule_type in ('OUTPATIENT', 'HOME_VISIT', 'REMOTE')),
    constraint ck_service_schedule_policy check (booking_policy in ('SHARED', 'CHANNEL_QUOTA')),
    constraint ck_service_schedule_day_part check (day_part in ('MORNING', 'AFTERNOON', 'EVENING', 'CUSTOM')),
    constraint ck_service_schedule_time check (end_at > start_at),
    constraint ck_service_schedule_capacity check (total_capacity > 0),
    constraint ck_service_schedule_status check (status in ('PUBLISHED', 'SUSPENDED', 'CANCELLED', 'COMPLETED'))
);
create index idx_service_schedule_context on service_schedules
    (tenant_id, organization_id, department_id, service_date, status, start_at);
create index idx_service_schedule_pract on service_schedules
    (tenant_id, practitioner_id, service_date, start_at);
create index idx_service_schedule_run on service_schedules (tenant_id, generation_run_id, service_date, start_at);

create table schedule_slot_pools (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    schedule_id bigint not null,
    pool_code varchar(128) not null,
    slot_mode varchar(32) not null,
    quota_mode varchar(32) not null,
    total_count integer not null,
    held_count integer default 0 not null,
    occupied_count integer default 0 not null,
    frozen_count integer default 0 not null,
    status varchar(32) not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    constraint fk_sched_pool_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_sched_pool_schedule foreign key (tenant_id, schedule_id) references service_schedules(tenant_id, id),
    constraint uk_sched_pool_tenant_id unique (tenant_id, id),
    constraint uk_sched_pool_schedule unique (tenant_id, schedule_id),
    constraint uk_sched_pool_code unique (tenant_id, pool_code),
    constraint ck_sched_pool_slot_mode check (slot_mode in ('POOL', 'TIMED')),
    constraint ck_sched_pool_quota_mode check (quota_mode in ('SHARED', 'CHANNEL_QUOTA')),
    constraint ck_sched_pool_counts check (
        total_count > 0 and held_count >= 0 and occupied_count >= 0 and frozen_count >= 0
        and held_count + occupied_count + frozen_count <= total_count
    ),
    constraint ck_sched_pool_status check (status in ('ACTIVE', 'FROZEN', 'CLOSED'))
);
create index idx_sched_pool_status on schedule_slot_pools (tenant_id, status, schedule_id);

create table service_schedule_events (
    id bigint primary key,
    tenant_id bigint not null,
    schedule_id bigint not null,
    event_type varchar(32) not null,
    status_from varchar(32),
    status_to varchar(32) not null,
    command_code varchar(128) not null,
    actor_user_id bigint not null,
    occurred_at timestamp with time zone not null,
    description varchar(1000),
    constraint fk_sched_event_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_sched_event_schedule foreign key (tenant_id, schedule_id) references service_schedules(tenant_id, id),
    constraint fk_sched_event_user foreign key (tenant_id, actor_user_id) references user_accounts(tenant_id, id),
    constraint uk_sched_event_command unique (tenant_id, schedule_id, command_code),
    constraint ck_sched_event_type check (event_type in ('CREATED', 'PUBLISHED', 'SUSPENDED', 'CANCELLED', 'COMPLETED'))
);
create index idx_sched_event_time on service_schedule_events (tenant_id, schedule_id, occurred_at);

create table slot_events (
    id bigint primary key,
    tenant_id bigint not null,
    pool_id bigint not null,
    schedule_id bigint not null,
    event_type varchar(32) not null,
    sequence_no integer not null,
    total_delta integer default 0 not null,
    held_delta integer default 0 not null,
    occupied_delta integer default 0 not null,
    frozen_delta integer default 0 not null,
    command_code varchar(128) not null,
    actor_user_id bigint not null,
    occurred_at timestamp with time zone not null,
    description varchar(1000),
    constraint fk_slot_event_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_slot_event_pool foreign key (tenant_id, pool_id) references schedule_slot_pools(tenant_id, id),
    constraint fk_slot_event_schedule foreign key (tenant_id, schedule_id) references service_schedules(tenant_id, id),
    constraint fk_slot_event_user foreign key (tenant_id, actor_user_id) references user_accounts(tenant_id, id),
    constraint uk_slot_event_sequence unique (tenant_id, pool_id, sequence_no),
    constraint uk_slot_event_command unique (tenant_id, pool_id, command_code),
    constraint ck_slot_event_type check (event_type in ('INITIALIZED', 'CAPACITY_CHANGED', 'HELD', 'RELEASED', 'OCCUPIED', 'CANCELLED', 'FROZEN', 'UNFROZEN'))
);
create index idx_slot_event_time on slot_events (tenant_id, pool_id, occurred_at);

-- Product baseline: simple scheduling is the default for primary-care institutions.
insert into parameter_categories values (
    362387869794020, null, 'OUTPATIENT', '门诊医疗',
    '门诊服务、排班、预约、接诊和医嘱等业务策略', 30, true, 0,
    current_timestamp, 362387869790222, current_timestamp, 362387869790222
);
insert into parameter_categories values (
    362387869794021, 362387869794020, 'OUTPATIENT_SCHEDULING', '排班与号源',
    '基层简易排班与专业排班共用的模式、周期和默认时段参数', 10, true, 0,
    current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into parameter_definitions values (
    362387869795020, 362387869794021, 'outpatient.scheduling.management-mode', '排班管理模式',
    '基层机构默认使用简易模式；确有精细化管理需要时可按机构或科室切换专业模式',
    'STRING', 'SELECT', '{"type":"string","enum":["SIMPLE","PROFESSIONAL"]}', '"SIMPLE"', '"PROFESSIONAL"', null,
    'SC_SCHEDULE_MANAGEMENT_MODE', '["PLATFORM","TENANT","ORGANIZATION","DEPARTMENT"]', 'BUSINESS', true, true, false,
    'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222
);
insert into parameter_definitions values (
    362387869795021, 362387869794021, 'outpatient.scheduling.simple.default-capacity', '简易排班默认号源数',
    '快速排班新增时自动带出的单个时段号源数，允许机构或科室按日常接诊能力覆盖',
    'NUMBER', 'NUMBER', '{"type":"integer","minimum":1,"maximum":500}', '50', '30', 'count', null,
    '["PLATFORM","TENANT","ORGANIZATION","DEPARTMENT"]', 'BUSINESS', true, true, false,
    'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222
);
insert into parameter_definitions values (
    362387869795022, 362387869794021, 'outpatient.scheduling.simple.generate-days', '简易排班默认生成天数',
    '快速排班默认向后生成的自然日数量，避免基层用户反复维护短周期排班',
    'NUMBER', 'NUMBER', '{"type":"integer","minimum":1,"maximum":90}', '28', '14', 'd', null,
    '["PLATFORM","TENANT","ORGANIZATION"]', 'BUSINESS', true, true, false,
    'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222
);
insert into parameter_definitions values (
    362387869795023, 362387869794021, 'outpatient.scheduling.simple.morning-period', '上午默认时段',
    '简易排班选择上午时自动带出的起止时间',
    'JSON', 'JSON_EDITOR', '{"type":"object","required":["start","end"]}', '{"start":"08:00","end":"12:00"}',
    '{"start":"08:00","end":"11:30"}', null, null,
    '["PLATFORM","TENANT","ORGANIZATION","DEPARTMENT"]', 'BUSINESS', true, true, false,
    'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222
);
insert into parameter_definitions values (
    362387869795024, 362387869794021, 'outpatient.scheduling.simple.afternoon-period', '下午默认时段',
    '简易排班选择下午时自动带出的起止时间',
    'JSON', 'JSON_EDITOR', '{"type":"object","required":["start","end"]}', '{"start":"14:00","end":"17:00"}',
    '{"start":"13:30","end":"17:30"}', null, null,
    '["PLATFORM","TENANT","ORGANIZATION","DEPARTMENT"]', 'BUSINESS', true, true, false,
    'NORMAL', 'PLAIN', 'ACTIVE', 0, current_timestamp, 362387869790222, current_timestamp, 362387869790222
);

insert into parameter_changes (
    id, tenant_id, definition_id, value_id, target_type, change_type,
    before_json, after_json, change_reason, request_code, changed_at, changed_by
)
select 362387869796020 + row_number() over (order by id), null, id, null, 'DEFINITION', 'CREATE',
       null, '{"source":"PRODUCT_BASELINE","key":"' || parameter_key || '","status":"ACTIVE"}',
       '初始化基层医疗机构简易排班产品默认值', 'baseline-v36:' || parameter_key,
       current_timestamp, 362387869790222
from parameter_definitions
where id between 362387869795020 and 362387869795024;
