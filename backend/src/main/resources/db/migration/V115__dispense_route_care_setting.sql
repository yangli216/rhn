-- A route belongs to one clinical care setting. Without this dimension a generic
-- outpatient default can be selected for inpatient medication workflows.
alter table dispense_routes add column care_setting varchar(32);
update dispense_routes set care_setting = 'OUTPATIENT' where care_setting is null;
alter table dispense_routes alter column care_setting set not null;
alter table dispense_routes add constraint ck_disp_route_care_setting
    check (care_setting in ('OUTPATIENT', 'EMERGENCY', 'INPATIENT', 'HOME_CARE'));

drop index idx_dispense_route_resolve;
create index idx_dispense_route_resolve on dispense_routes
    (tenant_id, organization_id, care_setting, active, valid_from, valid_to);

insert into dispense_routes (
    id, revision, tenant_id, organization_id, code, name, care_setting,
    source_department_id, medication_type, target_stock_site_id, active, valid_from, valid_to,
    description, created_at, created_by, updated_at, updated_by
) select
    362387869899603, 0, 362387869790209, 362387869790211,
    'INPATIENT-GENERAL-WARD', '住院病区默认发药药房', 'INPATIENT',
    362387869898501, null, 362387869799503, true, date '2026-01-01', null,
    '综合病区住院医嘱统一流向住院药房；可按病区继续补充专项规则',
    current_timestamp, 362387869790222, current_timestamp, 362387869790222
where exists (select 1 from tenants where id = 362387869790209)
  and not exists (
      select 1 from dispense_routes
       where tenant_id = 362387869790209
         and organization_id = 362387869790211
         and code = 'INPATIENT-GENERAL-WARD'
  );
