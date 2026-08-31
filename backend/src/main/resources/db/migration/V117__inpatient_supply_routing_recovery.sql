-- Persist route discovery failures before a target pharmacy exists and recover the same factual run later.
alter table inpatient_med_supply_gen_runs
    add column medication_type_snapshot varchar(32) default '*' not null;
alter table inpatient_med_supply_gen_runs add column last_error_code varchar(64);

alter table inpatient_med_supply_gen_runs alter column stock_site_id drop not null;
alter table inpatient_med_supply_gen_runs alter column dispense_route_id drop not null;
alter table inpatient_med_supply_gen_runs alter column dispense_route_revision drop not null;

update inpatient_med_supply_gen_runs
   set last_error_code = 'INPATIENT_SUPPLY_GENERATION_FAILED'
 where status in ('FAILED', 'EXHAUSTED') and last_error_code is null;

alter table inpatient_med_supply_batches add column dispense_route_id bigint;
alter table inpatient_med_supply_batches add column dispense_route_revision bigint;
alter table inpatient_med_supply_batches add column medication_type_snapshot varchar(32);

update inpatient_med_supply_batches
   set dispense_route_id = (
           select max(gr.dispense_route_id)
             from inpatient_med_supply_gen_runs gr
            where gr.tenant_id = inpatient_med_supply_batches.tenant_id
              and gr.batch_id = inpatient_med_supply_batches.id
       ),
       dispense_route_revision = (
           select max(gr.dispense_route_revision)
             from inpatient_med_supply_gen_runs gr
            where gr.tenant_id = inpatient_med_supply_batches.tenant_id
              and gr.batch_id = inpatient_med_supply_batches.id
       ),
       medication_type_snapshot = (
           select max(gr.medication_type_snapshot)
             from inpatient_med_supply_gen_runs gr
            where gr.tenant_id = inpatient_med_supply_batches.tenant_id
              and gr.batch_id = inpatient_med_supply_batches.id
       )
 where generation_trigger = 'AUTO';

alter table inpatient_med_supply_batches add constraint fk_ipmsb_route
    foreign key (tenant_id, dispense_route_id) references dispense_routes(tenant_id, id);
alter table inpatient_med_supply_batches add constraint ck_ipmsb_route_snap check (
    (dispense_route_id is null and dispense_route_revision is null and medication_type_snapshot is null
        and generation_trigger = 'MANUAL')
    or (dispense_route_id is not null and dispense_route_revision is not null
        and medication_type_snapshot is not null)
);

alter table inpatient_med_supply_gen_runs drop constraint ck_ipmsgr_status;
alter table inpatient_med_supply_gen_runs drop constraint ck_ipmsgr_claim;
alter table inpatient_med_supply_gen_runs drop constraint ck_ipmsgr_result;

alter table inpatient_med_supply_gen_runs add constraint ck_ipmsgr_status check (status in (
    'PENDING', 'ROUTING_BLOCKED', 'RUNNING', 'SUCCEEDED', 'NO_DEMAND', 'FAILED', 'EXHAUSTED'
));
alter table inpatient_med_supply_gen_runs add constraint ck_ipmsgr_route_snap check (
    (status = 'ROUTING_BLOCKED' and stock_site_id is null and dispense_route_id is null
        and dispense_route_revision is null and last_error_code is not null)
    or (status <> 'ROUTING_BLOCKED' and stock_site_id is not null and dispense_route_id is not null
        and dispense_route_revision is not null)
);
alter table inpatient_med_supply_gen_runs add constraint ck_ipmsgr_claim check (
    (status = 'RUNNING' and claimed_by is not null and claimed_until is not null)
    or (status <> 'RUNNING' and claimed_by is null and claimed_until is null)
);
alter table inpatient_med_supply_gen_runs add constraint ck_ipmsgr_result check (
    (status = 'SUCCEEDED' and batch_id is not null and completed_at is not null)
    or (status = 'NO_DEMAND' and batch_id is null and completed_at is not null)
    or (status in ('PENDING', 'ROUTING_BLOCKED', 'RUNNING', 'FAILED', 'EXHAUSTED') and batch_id is null)
);
