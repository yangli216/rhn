-- AI-native clinical assistant sidecar storage. Suggestions are advisory artifacts only;
-- adoption events never point at, or mutate, clinical diagnosis/order records.
create table ai_suggestions (
    id number(19,0) primary key,
    revision number(19,0) default 0 not null,
    tenant_id number(19,0) not null,
    resident_id number(19,0) not null,
    encounter_id number(19,0) not null,
    organization_id number(19,0) not null,
    department_id number(19,0) not null,
    suggestion_code varchar2(128 char) not null,
    suggestion_type varchar2(64 char) not null,
    status varchar2(32 char) not null,
    risk_level varchar2(32 char) not null,
    schema_code varchar2(128 char) not null,
    schema_version varchar2(64 char) not null,
    client_context_fingerprint varchar2(128 char) not null,
    context_hash varchar2(128 char) not null,
    server_context_hash varchar2(128 char) not null,
    content_json clob not null,
    evidence_json clob not null,
    provider_code varchar2(128 char) not null,
    model_code varchar2(128 char),
    prompt_version varchar2(64 char) not null,
    knowledge_version varchar2(64 char),
    data_cutoff timestamp with time zone,
    generated_at timestamp with time zone not null,
    expires_at timestamp with time zone not null,
    invalidated_at timestamp with time zone,
    invalidation_reason varchar2(1000 char),
    requested_practitioner_id number(19,0) not null,
    requested_user_id number(19,0) not null,
    created_at timestamp with time zone not null,
    constraint fk_ai_suggestion_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_ai_suggestion_resident foreign key (tenant_id,resident_id)
        references residents(tenant_id,id),
    constraint fk_ai_suggestion_encounter foreign key (tenant_id,resident_id,encounter_id)
        references encounters(tenant_id,resident_id,id),
    constraint fk_ai_suggestion_org foreign key (tenant_id,organization_id)
        references organizations(tenant_id,id),
    constraint fk_ai_suggestion_dept foreign key (tenant_id,organization_id,department_id)
        references departments(tenant_id,organization_id,id),
    constraint fk_ai_suggestion_pract foreign key (tenant_id,requested_practitioner_id)
        references practitioners(tenant_id,id),
    constraint fk_ai_suggestion_user foreign key (tenant_id,requested_user_id)
        references user_accounts(tenant_id,id),
    constraint uk_ai_suggestion_tenant_id unique (tenant_id,id),
    constraint uk_ai_suggestion_code unique (tenant_id,suggestion_code),
    constraint ck_ai_suggestion_status check (status in (
        'GENERATING','GENERATED','PARTIALLY_ADOPTED','ADOPTED','IGNORED','EXPIRED','FAILED'
    )),
    constraint ck_ai_suggestion_risk check (risk_level in ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
    constraint ck_ai_suggestion_period check (expires_at > generated_at),
    constraint ck_ai_suggestion_expired check (
        status <> 'EXPIRED' or (invalidated_at is not null and invalidation_reason is not null)
    )
);

create index idx_ai_suggestion_encounter on ai_suggestions
    (tenant_id,encounter_id,status,generated_at desc);
create index idx_ai_suggestion_history on ai_suggestions
    (tenant_id,encounter_id,generated_at desc);
create index idx_ai_suggestion_encounter_fk on ai_suggestions
    (tenant_id,resident_id,encounter_id,generated_at desc);
create index idx_ai_suggestion_expiry on ai_suggestions
    (tenant_id,status,expires_at);
create index idx_ai_suggestion_org_dept on ai_suggestions
    (tenant_id,organization_id,department_id,generated_at desc);
create index idx_ai_suggestion_resident on ai_suggestions
    (tenant_id,resident_id,generated_at desc);
create index idx_ai_suggestion_pract on ai_suggestions
    (tenant_id,requested_practitioner_id,generated_at desc);
create index idx_ai_suggestion_user on ai_suggestions
    (tenant_id,requested_user_id,generated_at desc);

create table ai_suggestion_events (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    suggestion_id number(19,0) not null,
    event_type varchar2(32 char) not null,
    status_from varchar2(32 char),
    status_to varchar2(32 char),
    practitioner_id number(19,0) not null,
    user_id number(19,0) not null,
    section_code varchar2(64 char),
    context_hash varchar2(128 char) not null,
    command_code varchar2(128 char) not null,
    detail varchar2(1000 char),
    action_json clob not null,
    occurred_at timestamp with time zone not null,
    constraint fk_ai_event_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_ai_event_suggestion foreign key (tenant_id,suggestion_id)
        references ai_suggestions(tenant_id,id),
    constraint fk_ai_event_pract foreign key (tenant_id,practitioner_id)
        references practitioners(tenant_id,id),
    constraint fk_ai_event_user foreign key (tenant_id,user_id)
        references user_accounts(tenant_id,id),
    constraint uk_ai_event_tenant_id unique (tenant_id,id),
    constraint uk_ai_event_command unique (tenant_id,suggestion_id,command_code),
    constraint ck_ai_event_type check (event_type in (
        'GENERATED','VIEWED','ADOPTED','IGNORED',
        'FEEDBACK_POSITIVE','FEEDBACK_NEGATIVE','EXPIRED','FAILED'
    )),
    constraint ck_ai_event_status_from check (status_from in (
        'GENERATING','GENERATED','PARTIALLY_ADOPTED','ADOPTED','IGNORED','EXPIRED','FAILED'
    )),
    constraint ck_ai_event_status_to check (status_to in (
        'GENERATING','GENERATED','PARTIALLY_ADOPTED','ADOPTED','IGNORED','EXPIRED','FAILED'
    ))
);

create index idx_ai_event_timeline on ai_suggestion_events
    (tenant_id,suggestion_id,occurred_at);
create index idx_ai_event_type_time on ai_suggestion_events
    (tenant_id,event_type,occurred_at);
create index idx_ai_event_pract on ai_suggestion_events
    (tenant_id,practitioner_id,occurred_at);
create index idx_ai_event_user on ai_suggestion_events
    (tenant_id,user_id,occurred_at);
