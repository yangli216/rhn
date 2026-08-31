create table order_frequencies (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    code varchar2(64 char) not null,
    name varchar2(160 char) not null,
    short_name varchar2(64 char),
    description varchar2(1000 char),
    rule_type varchar2(32 char) not null,
    frequency_count number(10),
    period_value number(12,3),
    period_unit varchar2(16 char),
    anchor_type varchar2(32 char) not null,
    default_execution_times varchar2(256 char),
    outpatient_applicable number(1) default 1 not null,
    inpatient_applicable number(1) default 1 not null,
    emergency_applicable number(1) default 1 not null,
    medication_applicable number(1) default 1 not null,
    treatment_applicable number(1) default 1 not null,
    nursing_applicable number(1) default 0 not null,
    automatic_task_generation number(1) default 1 not null,
    sort_order number(10) default 0 not null,
    status varchar2(32 char) not null,
    valid_from date not null,
    valid_to date,
    created_at timestamp with time zone not null,
    created_by number(19) not null,
    updated_at timestamp with time zone not null,
    updated_by number(19) not null,
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
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    organization_id number(19) not null,
    department_id number(19),
    scope_key varchar2(96 char) not null,
    frequency_id number(19) not null,
    local_code varchar2(64 char),
    local_name varchar2(160 char),
    execution_times varchar2(256 char),
    first_day_policy varchar2(32 char) not null,
    enabled number(1) default 1 not null,
    status varchar2(32 char) not null,
    valid_from date not null,
    valid_to date,
    created_at timestamp with time zone not null,
    created_by number(19) not null,
    updated_at timestamp with time zone not null,
    updated_by number(19) not null,
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
create index idx_order_freq_cfg_lookup on order_frequency_configs (tenant_id, organization_id, department_id, frequency_id, status, valid_from);

insert all
    into order_frequencies values (362387869881001,0,362387869790209,'ONCE','单次','单次','仅执行一次','ONCE',1,null,null,'ORDER_START',null,1,1,1,1,1,1,1,10,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222)
    into order_frequencies values (362387869881002,0,362387869790209,'STAT','立即','立即','立即执行一次','ONCE',1,null,null,'ORDER_START',null,1,1,1,1,1,1,1,20,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222)
    into order_frequencies values (362387869881003,0,362387869790209,'QD','每日一次','QD','每日在标准时间执行一次','TIMES_PER_PERIOD',1,1,'D','STANDARD_TIME','08:00',1,1,1,1,1,1,1,30,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222)
    into order_frequencies values (362387869881004,0,362387869790209,'BID','每日两次','BID','每日在标准时间执行两次','TIMES_PER_PERIOD',2,1,'D','STANDARD_TIME','08:00,20:00',1,1,1,1,1,1,1,40,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222)
    into order_frequencies values (362387869881005,0,362387869790209,'TID','每日三次','TID','每日在标准时间执行三次','TIMES_PER_PERIOD',3,1,'D','STANDARD_TIME','08:00,14:00,20:00',1,1,1,1,1,1,1,50,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222)
    into order_frequencies values (362387869881006,0,362387869790209,'QID','每日四次','QID','每日在标准时间执行四次','TIMES_PER_PERIOD',4,1,'D','STANDARD_TIME','06:00,12:00,18:00,22:00',1,1,1,1,1,1,1,60,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222)
    into order_frequencies values (362387869881007,0,362387869790209,'Q4H','每4小时一次','Q4H','从医嘱开始时间起每4小时执行','FIXED_INTERVAL',1,4,'H','ORDER_START',null,1,1,1,1,1,1,1,70,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222)
    into order_frequencies values (362387869881008,0,362387869790209,'Q6H','每6小时一次','Q6H','从医嘱开始时间起每6小时执行','FIXED_INTERVAL',1,6,'H','ORDER_START',null,1,1,1,1,1,1,1,80,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222)
    into order_frequencies values (362387869881009,0,362387869790209,'Q8H','每8小时一次','Q8H','从医嘱开始时间起每8小时执行','FIXED_INTERVAL',1,8,'H','ORDER_START',null,1,1,1,1,1,1,1,90,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222)
    into order_frequencies values (362387869881010,0,362387869790209,'Q12H','每12小时一次','Q12H','从医嘱开始时间起每12小时执行','FIXED_INTERVAL',1,12,'H','ORDER_START',null,1,1,1,1,1,1,1,100,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222)
    into order_frequencies values (362387869881011,0,362387869790209,'QOD','隔日一次','QOD','每两天执行一次','FIXED_INTERVAL',1,2,'D','ORDER_START',null,1,1,1,1,1,1,1,110,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222)
    into order_frequencies values (362387869881012,0,362387869790209,'PRN','必要时','PRN','按需执行，不预生成固定执行时点','PRN',null,null,null,'EVENT',null,1,1,1,1,1,1,0,120,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222)
    into order_frequencies values (362387869881013,0,362387869790209,'CONTINUOUS','持续','持续','持续执行或持续输注','CONTINUOUS',null,null,null,'ORDER_START',null,0,1,1,1,1,1,0,130,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222)
select 1 from dual;

insert all
    into order_frequency_configs values (362387869881101,0,362387869790209,362387869790211,null,'ORG:362387869790211',362387869881003,'QD','每日一次','08:00','REMAINING_SLOTS',1,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222)
    into order_frequency_configs values (362387869881102,0,362387869790209,362387869790211,null,'ORG:362387869790211',362387869881004,'BID','每日两次','08:00,20:00','REMAINING_SLOTS',1,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222)
    into order_frequency_configs values (362387869881103,0,362387869790209,362387869790211,null,'ORG:362387869790211',362387869881005,'TID','每日三次','08:00,14:00,20:00','REMAINING_SLOTS',1,'ACTIVE',date '2026-01-01',null,current_timestamp,362387869790222,current_timestamp,362387869790222)
select 1 from dual;

alter table medications add default_frequency_id number(19);
update medications m set default_frequency_id = (select f.id from order_frequencies f where f.tenant_id = m.tenant_id and f.code = m.default_frequency) where m.default_frequency is not null;
alter table medications add constraint fk_medication_default_freq foreign key (tenant_id, default_frequency_id) references order_frequencies(tenant_id, id);

alter table medication_requests add frequency_id number(19);
alter table medication_requests add frequency_name_snapshot varchar2(160 char);
alter table medication_requests add frequency_rule_snapshot clob;
update medication_requests m set frequency_id = (select f.id from order_frequencies f where f.tenant_id = m.tenant_id and f.code = m.frequency_code) where m.frequency_code is not null;
update medication_requests m set frequency_name_snapshot = (select f.name from order_frequencies f where f.tenant_id = m.tenant_id and f.id = m.frequency_id) where m.frequency_id is not null;
alter table medication_requests add constraint fk_med_request_frequency foreign key (tenant_id, frequency_id) references order_frequencies(tenant_id, id);

alter table treatment_execution_items add frequency_id number(19);
alter table treatment_execution_items add frequency_name_snapshot varchar2(160 char);
alter table treatment_execution_items add frequency_rule_snapshot clob;
alter table treatment_execution_items add constraint fk_treat_item_frequency foreign key (tenant_id, frequency_id) references order_frequencies(tenant_id, id);
