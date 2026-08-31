create table pharmacy_fulfillment_authorizations (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    organization_id bigint not null,
    department_id bigint,
    medication_request_id bigint not null,
    settlement_id bigint not null,
    status varchar(32) not null,
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
    constraint ck_pharm_auth_status check (status in (
        'READY_FOR_INTAKE', 'INTAKE_STARTED', 'REVOKED', 'EXCEPTION'))
);
create index idx_pharm_auth_inbox on pharmacy_fulfillment_authorizations
    (tenant_id, organization_id, department_id, status, ready_at);
create index idx_pharm_auth_request on pharmacy_fulfillment_authorizations
    (tenant_id, medication_request_id, ready_at);

create table critical_value_alerts (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    organization_id bigint not null,
    department_id bigint not null,
    report_id bigint not null,
    observation_id bigint not null,
    resident_id bigint not null,
    encounter_id bigint not null,
    request_id bigint not null,
    recipient_user_id bigint not null,
    severity varchar(24) not null,
    rule_code varchar(128) not null,
    rule_version int not null,
    observation_code varchar(128) not null,
    observation_name varchar(300) not null,
    trigger_evidence varchar(1000) not null,
    status varchar(32) not null,
    detected_at timestamp with time zone not null,
    acknowledge_deadline_at timestamp with time zone not null,
    acknowledged_by bigint,
    acknowledged_at timestamp with time zone,
    acknowledge_note varchar(1000),
    closed_by bigint,
    closed_at timestamp with time zone,
    disposition_code varchar(64),
    close_note varchar(1000),
    superseded_by_report_id bigint,
    escalation_level int default 0 not null,
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
    id bigint primary key,
    tenant_id bigint not null,
    alert_id bigint not null,
    event_type varchar(32) not null,
    status_from varchar(32),
    status_to varchar(32) not null,
    actor_id bigint,
    note_text varchar(1000),
    correlation_id varchar(128) not null,
    occurred_at timestamp with time zone not null,
    constraint fk_critical_event_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_critical_event_alert foreign key (tenant_id, alert_id) references critical_value_alerts(tenant_id, id),
    constraint fk_critical_event_actor foreign key (tenant_id, actor_id) references user_accounts(tenant_id, id)
);
create index idx_critical_event_alert on critical_value_alert_events (tenant_id, alert_id, occurred_at);
