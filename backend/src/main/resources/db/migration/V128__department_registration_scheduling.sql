-- Allow outpatient inventory to be owned by a department and assigned to a clinician at reception time.

alter table service_resources add column resource_type varchar(24) default 'PRACTITIONER' not null;
alter table service_resources add column resource_key varchar(128);
update service_resources set resource_key = 'PRACTITIONER:' || cast(practitioner_id as varchar(64));
alter table service_resources alter column resource_key set not null;
alter table service_resources alter column practitioner_id drop not null;
alter table service_resources alter column assignment_id drop not null;
alter table service_resources add constraint ck_sched_resource_type
    check (resource_type in ('PRACTITIONER', 'DEPARTMENT'));
alter table service_resources add constraint ck_sched_resource_owner
    check ((resource_type = 'PRACTITIONER' and practitioner_id is not null and assignment_id is not null)
        or (resource_type = 'DEPARTMENT' and practitioner_id is null and assignment_id is null));
alter table service_resources add constraint uk_sched_resource_scope
    unique (tenant_id, organization_id, department_id, resource_key, catalog_item_id);

alter table service_schedules add column registration_scope varchar(24) default 'PRACTITIONER' not null;
alter table service_schedules alter column practitioner_id drop not null;
alter table service_schedules alter column assignment_id drop not null;
alter table service_schedules alter column practitioner_name_snapshot drop not null;
alter table service_schedules add constraint ck_service_schedule_reg_scope
    check (registration_scope in ('PRACTITIONER', 'DEPARTMENT'));
alter table service_schedules add constraint ck_service_schedule_owner
    check ((registration_scope = 'PRACTITIONER' and practitioner_id is not null and assignment_id is not null
            and practitioner_name_snapshot is not null)
        or (registration_scope = 'DEPARTMENT' and practitioner_id is null and assignment_id is null
            and practitioner_name_snapshot is null));

alter table appointments alter column practitioner_id drop not null;
alter table appointments alter column practitioner_name_snapshot drop not null;
