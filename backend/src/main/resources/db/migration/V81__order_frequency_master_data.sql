create table order_frequencies (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    code varchar(64) not null,
    name varchar(160) not null,
    short_name varchar(64),
    description varchar(1000),
    rule_type varchar(32) not null,
    frequency_count integer,
    period_value decimal(12,3),
    period_unit varchar(16),
    anchor_type varchar(32) not null,
    default_execution_times varchar(256),
    outpatient_applicable boolean default true not null,
    inpatient_applicable boolean default true not null,
    emergency_applicable boolean default true not null,
    medication_applicable boolean default true not null,
    treatment_applicable boolean default true not null,
    nursing_applicable boolean default false not null,
    automatic_task_generation boolean default true not null,
    sort_order integer default 0 not null,
    status varchar(32) not null,
    valid_from date not null,
    valid_to date,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_order_freq_tenant foreign key (tenant_id) references tenants(id),
    constraint uk_order_freq_tenant_id unique (tenant_id, id),
    constraint uk_order_freq_code unique (tenant_id, code),
    constraint ck_order_freq_rule check (rule_type in ('ONCE', 'TIMES_PER_PERIOD', 'FIXED_INTERVAL', 'CALENDAR', 'PRN', 'CONTINUOUS')),
    constraint ck_order_freq_anchor check (anchor_type in ('ORDER_START', 'STANDARD_TIME', 'CALENDAR', 'EVENT')),
    constraint ck_order_freq_period_unit check (period_unit is null or period_unit in ('MIN', 'H', 'D', 'WK', 'MO')),
    constraint ck_order_freq_status check (status in ('ACTIVE', 'INACTIVE')),
    constraint ck_order_freq_period check (valid_to is null or valid_to >= valid_from),
    constraint ck_order_freq_count check (frequency_count is null or frequency_count > 0),
    constraint ck_order_freq_value check (period_value is null or period_value > 0)
);
create index idx_order_freq_lookup on order_frequencies (tenant_id, status, sort_order, name);

create table order_frequency_configs (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    organization_id bigint not null,
    department_id bigint,
    scope_key varchar(96) not null,
    frequency_id bigint not null,
    local_code varchar(64),
    local_name varchar(160),
    execution_times varchar(256),
    first_day_policy varchar(32) not null,
    enabled boolean default true not null,
    status varchar(32) not null,
    valid_from date not null,
    valid_to date,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_order_freq_cfg_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_order_freq_cfg_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_order_freq_cfg_dept foreign key (tenant_id, organization_id, department_id) references departments(tenant_id, organization_id, id),
    constraint fk_order_freq_cfg_freq foreign key (tenant_id, frequency_id) references order_frequencies(tenant_id, id),
    constraint uk_order_freq_cfg_tenant_id unique (tenant_id, id),
    constraint uk_order_freq_cfg_period unique (tenant_id, scope_key, frequency_id, valid_from),
    constraint ck_order_freq_cfg_policy check (first_day_policy in ('REMAINING_SLOTS', 'FULL_SCHEDULE', 'FROM_ORDER_TIME')),
    constraint ck_order_freq_cfg_status check (status in ('ACTIVE', 'INACTIVE')),
    constraint ck_order_freq_cfg_period check (valid_to is null or valid_to >= valid_from)
);
create index idx_order_freq_cfg_lookup on order_frequency_configs
    (tenant_id, organization_id, department_id, frequency_id, status, valid_from);

insert into order_frequencies values
    (362387869881001,0,362387869790209,'ONCE','单次','单次','仅执行一次','ONCE',1,null,null,'ORDER_START',null,true,true,true,true,true,true,true,10,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222),
    (362387869881002,0,362387869790209,'STAT','立即','立即','立即执行一次','ONCE',1,null,null,'ORDER_START',null,true,true,true,true,true,true,true,20,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222),
    (362387869881003,0,362387869790209,'QD','每日一次','QD','每日在标准时间执行一次','TIMES_PER_PERIOD',1,1,'D','STANDARD_TIME','08:00',true,true,true,true,true,true,true,30,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222),
    (362387869881004,0,362387869790209,'BID','每日两次','BID','每日在标准时间执行两次','TIMES_PER_PERIOD',2,1,'D','STANDARD_TIME','08:00,20:00',true,true,true,true,true,true,true,40,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222),
    (362387869881005,0,362387869790209,'TID','每日三次','TID','每日在标准时间执行三次','TIMES_PER_PERIOD',3,1,'D','STANDARD_TIME','08:00,14:00,20:00',true,true,true,true,true,true,true,50,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222),
    (362387869881006,0,362387869790209,'QID','每日四次','QID','每日在标准时间执行四次','TIMES_PER_PERIOD',4,1,'D','STANDARD_TIME','06:00,12:00,18:00,22:00',true,true,true,true,true,true,true,60,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222),
    (362387869881007,0,362387869790209,'Q4H','每4小时一次','Q4H','从医嘱开始时间起每4小时执行','FIXED_INTERVAL',1,4,'H','ORDER_START',null,true,true,true,true,true,true,true,70,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222),
    (362387869881008,0,362387869790209,'Q6H','每6小时一次','Q6H','从医嘱开始时间起每6小时执行','FIXED_INTERVAL',1,6,'H','ORDER_START',null,true,true,true,true,true,true,true,80,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222),
    (362387869881009,0,362387869790209,'Q8H','每8小时一次','Q8H','从医嘱开始时间起每8小时执行','FIXED_INTERVAL',1,8,'H','ORDER_START',null,true,true,true,true,true,true,true,90,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222),
    (362387869881010,0,362387869790209,'Q12H','每12小时一次','Q12H','从医嘱开始时间起每12小时执行','FIXED_INTERVAL',1,12,'H','ORDER_START',null,true,true,true,true,true,true,true,100,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222),
    (362387869881011,0,362387869790209,'QOD','隔日一次','QOD','每两天执行一次','FIXED_INTERVAL',1,2,'D','ORDER_START',null,true,true,true,true,true,true,true,110,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222),
    (362387869881012,0,362387869790209,'PRN','必要时','PRN','按需执行，不预生成固定执行时点','PRN',null,null,null,'EVENT',null,true,true,true,true,true,true,false,120,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222),
    (362387869881013,0,362387869790209,'CONTINUOUS','持续','持续','持续执行或持续输注','CONTINUOUS',null,null,null,'ORDER_START',null,false,true,true,true,true,true,false,130,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222);

insert into order_frequency_configs values
    (362387869881101,0,362387869790209,362387869790211,null,'ORG:362387869790211',362387869881003,'QD','每日一次','08:00','REMAINING_SLOTS',true,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222),
    (362387869881102,0,362387869790209,362387869790211,null,'ORG:362387869790211',362387869881004,'BID','每日两次','08:00,20:00','REMAINING_SLOTS',true,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222),
    (362387869881103,0,362387869790209,362387869790211,null,'ORG:362387869790211',362387869881005,'TID','每日三次','08:00,14:00,20:00','REMAINING_SLOTS',true,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222);

alter table medications add column default_frequency_id bigint;
update medications m set default_frequency_id = (
    select f.id from order_frequencies f where f.tenant_id = m.tenant_id and f.code = m.default_frequency
) where m.default_frequency is not null;
alter table medications add constraint fk_medication_default_freq foreign key (tenant_id, default_frequency_id)
    references order_frequencies(tenant_id, id);

alter table medication_requests add column frequency_id bigint;
alter table medication_requests add column frequency_name_snapshot varchar(160);
alter table medication_requests add column frequency_rule_snapshot text;
update medication_requests m set frequency_id = (
    select f.id from order_frequencies f where f.tenant_id = m.tenant_id and f.code = m.frequency_code
) where m.frequency_code is not null;
update medication_requests m set frequency_name_snapshot = (
    select f.name from order_frequencies f where f.tenant_id = m.tenant_id and f.id = m.frequency_id
) where m.frequency_id is not null;
alter table medication_requests add constraint fk_med_request_frequency foreign key (tenant_id, frequency_id)
    references order_frequencies(tenant_id, id);

alter table treatment_execution_items add column frequency_id bigint;
alter table treatment_execution_items add column frequency_name_snapshot varchar(160);
alter table treatment_execution_items add column frequency_rule_snapshot text;
alter table treatment_execution_items add constraint fk_treat_item_frequency foreign key (tenant_id, frequency_id)
    references order_frequencies(tenant_id, id);
