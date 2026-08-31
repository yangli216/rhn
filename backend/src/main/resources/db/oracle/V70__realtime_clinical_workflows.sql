create table pharmacy_fulfillment_authorizations (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    organization_id number(19) not null,
    department_id number(19),
    medication_request_id number(19) not null,
    settlement_id number(19) not null,
    status varchar2(32 char) not null,
    ready_at timestamp with time zone not null,
    intake_started_at timestamp with time zone,
    revoked_at timestamp with time zone,
    updated_at timestamp with time zone not null,
    constraint fk_pharm_auth_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_pharm_auth_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_pharm_auth_dept foreign key (tenant_id, organization_id, department_id)
        references departments(tenant_id, organization_id, id),
    constraint fk_pharm_auth_request foreign key (tenant_id, medication_request_id)
        references medication_requests(tenant_id, request_id),
    constraint fk_pharm_auth_settlement foreign key (tenant_id, settlement_id) references settlements(tenant_id, id),
    constraint uk_pharm_auth_request_settlement unique (tenant_id, medication_request_id, settlement_id),
    constraint ck_pharm_auth_status check (status in ('READY_FOR_INTAKE', 'INTAKE_STARTED', 'REVOKED', 'EXCEPTION'))
);
create index idx_pharm_auth_inbox on pharmacy_fulfillment_authorizations
    (tenant_id, organization_id, department_id, status, ready_at);
create index idx_pharm_auth_request on pharmacy_fulfillment_authorizations
    (tenant_id, medication_request_id, ready_at);

create table critical_value_alerts (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    organization_id number(19) not null,
    department_id number(19) not null,
    report_id number(19) not null,
    observation_id number(19) not null,
    resident_id number(19) not null,
    encounter_id number(19) not null,
    request_id number(19) not null,
    recipient_user_id number(19) not null,
    severity varchar2(24 char) not null,
    rule_code varchar2(128 char) not null,
    rule_version number(10) not null,
    observation_code varchar2(128 char) not null,
    observation_name varchar2(300 char) not null,
    trigger_evidence varchar2(1000 char) not null,
    status varchar2(32 char) not null,
    detected_at timestamp with time zone not null,
    acknowledge_deadline_at timestamp with time zone not null,
    acknowledged_by number(19),
    acknowledged_at timestamp with time zone,
    acknowledge_note varchar2(1000 char),
    closed_by number(19),
    closed_at timestamp with time zone,
    disposition_code varchar2(64 char),
    close_note varchar2(1000 char),
    superseded_by_report_id number(19),
    escalation_level number(10) default 0 not null,
    updated_at timestamp with time zone not null,
    constraint fk_critical_alert_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_critical_alert_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint fk_critical_alert_dept foreign key (tenant_id, organization_id, department_id)
        references departments(tenant_id, organization_id, id),
    constraint fk_critical_alert_report foreign key (tenant_id, report_id) references diagnostic_reports(tenant_id, id),
    constraint fk_critical_alert_observation foreign key (tenant_id, observation_id) references observations(tenant_id, id),
    constraint fk_critical_alert_resident foreign key (tenant_id, resident_id) references residents(tenant_id, id),
    constraint fk_critical_alert_encounter foreign key (tenant_id, encounter_id) references encounters(tenant_id, id),
    constraint fk_critical_alert_request foreign key (tenant_id, request_id) references care_requests(tenant_id, id),
    constraint fk_critical_alert_recipient foreign key (tenant_id, recipient_user_id) references user_accounts(tenant_id, id),
    constraint fk_critical_alert_ack_user foreign key (tenant_id, acknowledged_by) references user_accounts(tenant_id, id),
    constraint fk_critical_alert_close_user foreign key (tenant_id, closed_by) references user_accounts(tenant_id, id),
    constraint fk_critical_alert_superseded foreign key (tenant_id, superseded_by_report_id)
        references diagnostic_reports(tenant_id, id),
    constraint uk_critical_alert_result unique (tenant_id, report_id, observation_id),
    constraint uk_critical_alert_tenant_id unique (tenant_id, id),
    constraint ck_critical_alert_status check (status in ('OPEN', 'ACKNOWLEDGED', 'CLOSED', 'ESCALATED', 'SUPERSEDED')),
    constraint ck_critical_alert_level check (escalation_level >= 0)
);
create index idx_critical_alert_inbox on critical_value_alerts
    (tenant_id, organization_id, department_id, status, detected_at);
create index idx_critical_alert_recipient on critical_value_alerts
    (tenant_id, recipient_user_id, status, acknowledge_deadline_at);

create table critical_value_alert_events (
    id number(19) primary key,
    tenant_id number(19) not null,
    alert_id number(19) not null,
    event_type varchar2(32 char) not null,
    status_from varchar2(32 char),
    status_to varchar2(32 char) not null,
    actor_id number(19),
    note_text varchar2(1000 char),
    correlation_id varchar2(128 char) not null,
    occurred_at timestamp with time zone not null,
    constraint fk_critical_event_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_critical_event_alert foreign key (tenant_id, alert_id) references critical_value_alerts(tenant_id, id),
    constraint fk_critical_event_actor foreign key (tenant_id, actor_id) references user_accounts(tenant_id, id)
);
create index idx_critical_event_alert on critical_value_alert_events (tenant_id, alert_id, occurred_at);
