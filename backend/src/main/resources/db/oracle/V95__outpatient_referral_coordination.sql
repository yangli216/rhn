-- Oracle variant: internal consultation and department transfer coordination.

create table outpatient_referral_requests (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    encounter_id number(19) not null,
    resident_id number(19) not null,
    request_no varchar2(64 char) not null,
    referral_type varchar2(32 char) not null,
    target_organization_id number(19) not null,
    target_department_id number(19) not null,
    target_practitioner_id number(19),
    urgency varchar2(32 char) not null,
    referral_reason varchar2(2000 char) not null,
    clinical_summary varchar2(4000 char) not null,
    expected_at timestamp with time zone,
    status varchar2(24 char) not null,
    target_registration_id number(19),
    target_encounter_id number(19),
    requested_by number(19) not null,
    requested_at timestamp with time zone not null,
    accepted_by number(19),
    accepted_at timestamp with time zone,
    completed_by number(19),
    completed_at timestamp with time zone,
    outcome_text varchar2(4000 char),
    rejection_reason varchar2(1000 char),
    create_command_code varchar2(128 char) not null,
    constraint fk_ref_req_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_ref_req_enc foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint fk_ref_req_res foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_ref_req_org foreign key (tenant_id, target_organization_id) references organizations(tenant_id, id),
    constraint fk_ref_req_dept foreign key (tenant_id, target_organization_id, target_department_id)
        references departments(tenant_id, organization_id, id),
    constraint fk_ref_req_pract foreign key (tenant_id, target_practitioner_id) references practitioners(tenant_id, id),
    constraint fk_ref_req_target_enc foreign key (tenant_id, target_encounter_id) references encounters(tenant_id, id),
    constraint fk_ref_req_target_reg foreign key (tenant_id, target_registration_id) references patient_registrations(tenant_id, id),
    constraint uk_ref_req_tenant_id unique (tenant_id, id),
    constraint uk_ref_req_no unique (tenant_id, request_no),
    constraint uk_ref_req_command unique (tenant_id, create_command_code),
    constraint ck_ref_req_type check (referral_type in ('INTERNAL_CONSULT', 'DEPARTMENT_TRANSFER')),
    constraint ck_ref_req_urgency check (urgency in ('ROUTINE', 'URGENT')),
    constraint ck_ref_req_status check (status in ('REQUESTED', 'ACCEPTED', 'COMPLETED', 'REJECTED', 'CANCELLED'))
);

create index idx_ref_req_source on outpatient_referral_requests
    (tenant_id, encounter_id, status, requested_at);
create index idx_ref_req_inbox on outpatient_referral_requests
    (tenant_id, target_organization_id, target_department_id, status, requested_at);

create table outpatient_referral_events (
    id number(19) primary key,
    tenant_id number(19) not null,
    referral_request_id number(19) not null,
    status_from varchar2(24 char),
    status_to varchar2(24 char) not null,
    action_code varchar2(32 char) not null,
    command_code varchar2(128 char) not null,
    actor_id number(19) not null,
    reason varchar2(1000 char),
    occurred_at timestamp with time zone not null,
    constraint fk_ref_evt_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_ref_evt_request foreign key (tenant_id, referral_request_id)
        references outpatient_referral_requests(tenant_id, id),
    constraint uk_ref_evt_command unique (tenant_id, referral_request_id, command_code),
    constraint ck_ref_evt_status check (status_to in ('REQUESTED', 'ACCEPTED', 'COMPLETED', 'REJECTED', 'CANCELLED')),
    constraint ck_ref_evt_action check (action_code in ('CREATE', 'ACCEPT', 'COMPLETE', 'REJECT', 'CANCEL'))
);

create index idx_ref_evt_request on outpatient_referral_events
    (tenant_id, referral_request_id, occurred_at);

alter table queue_tickets drop constraint ck_queue_ticket_status;
alter table queue_tickets add constraint ck_queue_ticket_status
    check (status in ('WAITING', 'IN_SERVICE', 'SUSPENDED', 'COMPLETED', 'TRANSFERRED', 'TERMINATED', 'CANCELLED'));

alter table queue_ticket_events drop constraint ck_queue_event_type;
alter table queue_ticket_events add constraint ck_queue_event_type
    check (event_type in ('ENQUEUED', 'STARTED', 'SUSPENDED', 'RESUMED', 'COMPLETED', 'TRANSFERRED', 'TERMINATED', 'CANCELLED'));

alter table patient_registrations drop constraint ck_registration_source;
alter table patient_registrations add constraint ck_registration_source
    check (registration_source in ('WINDOW', 'WALK_IN', 'DIRECT', 'EMERGENCY', 'TRANSFER'));
alter table patient_registrations drop constraint ck_registration_visit_type;
alter table patient_registrations add constraint ck_registration_visit_type
    check (visit_type in ('GENERAL', 'FOLLOW_UP', 'EMERGENCY', 'TRANSFER'));
