-- Allow outpatient inventory to be owned by a department and assigned to a clinician at reception time.

alter table service_resources add (resource_type varchar2(24) default 'PRACTITIONER' not null);
alter table service_resources add (resource_key varchar2(128));
update service_resources set resource_key = 'PRACTITIONER:' || to_char(practitioner_id);
alter table service_resources modify (resource_key not null);
alter table service_resources modify (practitioner_id null, assignment_id null);
alter table service_resources add constraint ck_sched_resource_type
    check (resource_type in ('PRACTITIONER', 'DEPARTMENT'));
alter table service_resources add constraint ck_sched_resource_owner
    check ((resource_type = 'PRACTITIONER' and practitioner_id is not null and assignment_id is not null)
        or (resource_type = 'DEPARTMENT' and practitioner_id is null and assignment_id is null));
alter table service_resources add constraint uk_sched_resource_scope
    unique (tenant_id, organization_id, department_id, resource_key, catalog_item_id);

alter table service_schedules add (registration_scope varchar2(24) default 'PRACTITIONER' not null);
alter table service_schedules modify (practitioner_id null, assignment_id null, practitioner_name_snapshot null);
alter table service_schedules add constraint ck_service_schedule_reg_scope
    check (registration_scope in ('PRACTITIONER', 'DEPARTMENT'));
alter table service_schedules add constraint ck_service_schedule_owner
    check ((registration_scope = 'PRACTITIONER' and practitioner_id is not null and assignment_id is not null
            and practitioner_name_snapshot is not null)
        or (registration_scope = 'DEPARTMENT' and practitioner_id is null and assignment_id is null
            and practitioner_name_snapshot is null));

alter table appointments modify (practitioner_id null, practitioner_name_snapshot null);
