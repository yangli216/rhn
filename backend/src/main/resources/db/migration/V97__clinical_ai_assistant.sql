-- AI-native clinical assistant sidecar storage. Suggestions are advisory artifacts only;
-- adoption events never point at, or mutate, clinical diagnosis/order records.
create table ai_suggestions (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    resident_id bigint not null,
    encounter_id bigint not null,
    organization_id bigint not null,
    department_id bigint not null,
    suggestion_code varchar(128) not null,
    suggestion_type varchar(64) not null,
    status varchar(32) not null,
    risk_level varchar(32) not null,
    schema_code varchar(128) not null,
    schema_version varchar(64) not null,
    client_context_fingerprint varchar(128) not null,
    context_hash varchar(128) not null,
    server_context_hash varchar(128) not null,
    content_json text not null,
    evidence_json text not null,
    provider_code varchar(128) not null,
    model_code varchar(128),
    prompt_version varchar(64) not null,
    knowledge_version varchar(64),
    data_cutoff timestamp with time zone,
    generated_at timestamp with time zone not null,
    expires_at timestamp with time zone not null,
    invalidated_at timestamp with time zone,
    invalidation_reason varchar(1000),
    requested_practitioner_id bigint not null,
    requested_user_id bigint not null,
    created_at timestamp with time zone not null,
    constraint fk_ai_suggestion_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_ai_suggestion_resident foreign key (tenant_id, resident_id)
        references residents(tenant_id, id),
    constraint fk_ai_suggestion_encounter foreign key (tenant_id, resident_id, encounter_id)
        references encounters(tenant_id, resident_id, id),
    constraint fk_ai_suggestion_org foreign key (tenant_id, organization_id)
        references organizations(tenant_id, id),
    constraint fk_ai_suggestion_dept foreign key (tenant_id, organization_id, department_id)
        references departments(tenant_id, organization_id, id),
    constraint fk_ai_suggestion_pract foreign key (tenant_id, requested_practitioner_id)
        references practitioners(tenant_id, id),
    constraint fk_ai_suggestion_user foreign key (tenant_id, requested_user_id)
        references user_accounts(tenant_id, id),
    constraint uk_ai_suggestion_tenant_id unique (tenant_id, id),
    constraint uk_ai_suggestion_code unique (tenant_id, suggestion_code),
    constraint ck_ai_suggestion_status check (status in (
        'GENERATING', 'GENERATED', 'PARTIALLY_ADOPTED', 'ADOPTED', 'IGNORED', 'EXPIRED', 'FAILED'
    )),
    constraint ck_ai_suggestion_risk check (risk_level in ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    constraint ck_ai_suggestion_period check (expires_at > generated_at),
    constraint ck_ai_suggestion_expired check (
        status <> 'EXPIRED' or (invalidated_at is not null and invalidation_reason is not null)
    )
);

create index idx_ai_suggestion_encounter on ai_suggestions
    (tenant_id, encounter_id, status, generated_at desc);
create index idx_ai_suggestion_history on ai_suggestions
    (tenant_id, encounter_id, generated_at desc);
create index idx_ai_suggestion_encounter_fk on ai_suggestions
    (tenant_id, resident_id, encounter_id, generated_at desc);
create index idx_ai_suggestion_expiry on ai_suggestions
    (tenant_id, status, expires_at);
create index idx_ai_suggestion_org_dept on ai_suggestions
    (tenant_id, organization_id, department_id, generated_at desc);
create index idx_ai_suggestion_resident on ai_suggestions
    (tenant_id, resident_id, generated_at desc);
create index idx_ai_suggestion_pract on ai_suggestions
    (tenant_id, requested_practitioner_id, generated_at desc);
create index idx_ai_suggestion_user on ai_suggestions
    (tenant_id, requested_user_id, generated_at desc);

create table ai_suggestion_events (
    id bigint primary key,
    tenant_id bigint not null,
    suggestion_id bigint not null,
    event_type varchar(32) not null,
    status_from varchar(32),
    status_to varchar(32),
    practitioner_id bigint not null,
    user_id bigint not null,
    section_code varchar(64),
    context_hash varchar(128) not null,
    command_code varchar(128) not null,
    detail varchar(1000),
    action_json text not null,
    occurred_at timestamp with time zone not null,
    constraint fk_ai_event_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_ai_event_suggestion foreign key (tenant_id, suggestion_id)
        references ai_suggestions(tenant_id, id),
    constraint fk_ai_event_pract foreign key (tenant_id, practitioner_id)
        references practitioners(tenant_id, id),
    constraint fk_ai_event_user foreign key (tenant_id, user_id)
        references user_accounts(tenant_id, id),
    constraint uk_ai_event_tenant_id unique (tenant_id, id),
    constraint uk_ai_event_command unique (tenant_id, suggestion_id, command_code),
    constraint ck_ai_event_type check (event_type in (
        'GENERATED', 'VIEWED', 'ADOPTED', 'IGNORED',
        'FEEDBACK_POSITIVE', 'FEEDBACK_NEGATIVE', 'EXPIRED', 'FAILED'
    )),
    constraint ck_ai_event_status_from check (status_from in (
        'GENERATING', 'GENERATED', 'PARTIALLY_ADOPTED', 'ADOPTED', 'IGNORED', 'EXPIRED', 'FAILED'
    )),
    constraint ck_ai_event_status_to check (status_to in (
        'GENERATING', 'GENERATED', 'PARTIALLY_ADOPTED', 'ADOPTED', 'IGNORED', 'EXPIRED', 'FAILED'
    ))
);

create index idx_ai_event_timeline on ai_suggestion_events
    (tenant_id, suggestion_id, occurred_at);
create index idx_ai_event_type_time on ai_suggestion_events
    (tenant_id, event_type, occurred_at);
create index idx_ai_event_pract on ai_suggestion_events
    (tenant_id, practitioner_id, occurred_at);
create index idx_ai_event_user on ai_suggestion_events
    (tenant_id, user_id, occurred_at);
