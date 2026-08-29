alter table residents add constraint uk_resident_tenant_id unique (tenant_id, id);
alter table encounters add constraint uk_encounter_tenant_id unique (tenant_id, id);
alter table encounter_diagnoses add constraint uk_encounter_diagnosis_tenant_id unique (tenant_id, id);
alter table health_events add constraint uk_health_event_tenant_id unique (tenant_id, id);
alter table resident_identifiers add constraint uk_resident_identifier_tenant_id unique (tenant_id, id);
alter table resident_source_records add constraint uk_resident_source_tenant_id unique (tenant_id, id);
alter table resident_match_candidates add constraint uk_resident_candidate_tenant_id unique (tenant_id, id);
alter table resident_merge_history add constraint uk_resident_merge_tenant_id unique (tenant_id, id);
alter table resident_split_history add constraint uk_resident_split_tenant_id unique (tenant_id, id);
alter table clinical_documents add constraint uk_clinical_document_tenant_id unique (tenant_id, id);
alter table clinical_document_versions add constraint uk_clinical_document_version_tenant_id
    unique (tenant_id, id);

alter table residents add constraint fk_resident_tenant
    foreign key (tenant_id) references tenants (id);
alter table encounters add constraint fk_encounter_tenant
    foreign key (tenant_id) references tenants (id);
alter table encounter_diagnoses add constraint fk_diagnosis_tenant
    foreign key (tenant_id) references tenants (id);
alter table health_events add constraint fk_health_event_tenant
    foreign key (tenant_id) references tenants (id);
alter table resident_identifiers add constraint fk_resident_identifier_tenant
    foreign key (tenant_id) references tenants (id);
alter table resident_source_records add constraint fk_resident_source_tenant
    foreign key (tenant_id) references tenants (id);
alter table resident_match_candidates add constraint fk_resident_candidate_tenant
    foreign key (tenant_id) references tenants (id);
alter table resident_merge_history add constraint fk_resident_merge_tenant
    foreign key (tenant_id) references tenants (id);
alter table resident_split_history add constraint fk_resident_split_tenant
    foreign key (tenant_id) references tenants (id);
alter table clinical_documents add constraint fk_clinical_document_tenant
    foreign key (tenant_id) references tenants (id);
alter table clinical_document_versions add constraint fk_clinical_document_version_tenant
    foreign key (tenant_id) references tenants (id);
alter table concept_mappings add constraint fk_concept_mapping_tenant
    foreign key (tenant_id) references tenants (id);
alter table outbox_events add constraint fk_outbox_event_tenant
    foreign key (tenant_id) references tenants (id);
alter table audit_logs modify tenant_id not null;
alter table audit_logs add constraint fk_audit_log_tenant
    foreign key (tenant_id) references tenants (id);

alter table encounters add constraint fk_encounter_resident_tenant
    foreign key (tenant_id, resident_id) references residents (tenant_id, id);
alter table encounters add constraint fk_encounter_organization_tenant
    foreign key (tenant_id, organization_id) references organizations (tenant_id, id);
alter table encounters add constraint fk_encounter_department_tenant
    foreign key (tenant_id, department_id) references organizations (tenant_id, id);
alter table encounter_diagnoses add constraint fk_diagnosis_encounter_tenant
    foreign key (tenant_id, encounter_id) references encounters (tenant_id, id);
alter table health_events add constraint fk_health_event_resident_tenant
    foreign key (tenant_id, resident_id) references residents (tenant_id, id);
alter table health_events add constraint fk_health_event_encounter_tenant
    foreign key (tenant_id, encounter_id) references encounters (tenant_id, id);
alter table residents add constraint fk_resident_merged_into_tenant
    foreign key (tenant_id, merged_into_id) references residents (tenant_id, id);
alter table resident_identifiers add constraint fk_identifier_resident_tenant
    foreign key (tenant_id, resident_id) references residents (tenant_id, id);
alter table resident_identifiers add constraint fk_identifier_source_organization_tenant
    foreign key (tenant_id, source_organization_id) references organizations (tenant_id, id);
alter table resident_source_records add constraint fk_source_record_resident_tenant
    foreign key (tenant_id, resident_id) references residents (tenant_id, id);
alter table resident_source_records add constraint fk_source_record_organization_tenant
    foreign key (tenant_id, source_organization_id) references organizations (tenant_id, id);
alter table resident_match_candidates add constraint fk_match_candidate_source_tenant
    foreign key (tenant_id, source_record_id) references resident_source_records (tenant_id, id);
alter table resident_match_candidates add constraint fk_match_candidate_resident_tenant
    foreign key (tenant_id, candidate_resident_id) references residents (tenant_id, id);
alter table resident_merge_history add constraint fk_merge_survivor_tenant
    foreign key (tenant_id, surviving_resident_id) references residents (tenant_id, id);
alter table resident_merge_history add constraint fk_merge_duplicate_tenant
    foreign key (tenant_id, merged_resident_id) references residents (tenant_id, id);
alter table resident_split_history add constraint fk_split_merge_tenant
    foreign key (tenant_id, merge_history_id) references resident_merge_history (tenant_id, id);
alter table resident_split_history add constraint fk_split_resident_tenant
    foreign key (tenant_id, restored_resident_id) references residents (tenant_id, id);
alter table clinical_documents add constraint fk_clinical_document_resident_tenant
    foreign key (tenant_id, resident_id) references residents (tenant_id, id);
alter table clinical_documents add constraint fk_clinical_document_encounter_tenant
    foreign key (tenant_id, encounter_id) references encounters (tenant_id, id);
alter table clinical_documents add constraint fk_clinical_document_organization_tenant
    foreign key (tenant_id, organization_id) references organizations (tenant_id, id);
alter table clinical_documents add constraint fk_clinical_document_department_tenant
    foreign key (tenant_id, department_id) references organizations (tenant_id, id);
alter table clinical_documents add constraint ck_clinical_document_department_organization
    check (department_id is null or organization_id is not null);
alter table clinical_document_versions add constraint fk_document_version_tenant
    foreign key (tenant_id, document_id) references clinical_documents (tenant_id, id);

create table user_accounts (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    practitioner_id number(19,0),
    username varchar2(128 char) not null,
    password_hash varchar2(512 char) not null,
    status varchar2(24 char) not null,
    password_changed_at timestamp with time zone,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    version number(19,0) default 0 not null,
    constraint fk_user_account_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_user_account_practitioner_tenant foreign key (tenant_id, practitioner_id)
        references practitioners(tenant_id, id),
    constraint uk_user_account_tenant_id unique (tenant_id, id),
    constraint uk_user_account_username unique (tenant_id, username)
);

create table access_roles (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    code varchar2(64 char) not null,
    name varchar2(128 char) not null,
    role_type varchar2(24 char) not null,
    status varchar2(24 char) not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    version number(19,0) default 0 not null,
    constraint fk_access_role_tenant foreign key (tenant_id) references tenants(id),
    constraint uk_access_role_tenant_id unique (tenant_id, id),
    constraint uk_access_role_code unique (tenant_id, code)
);

create table management_modules (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    parent_id number(19,0),
    code varchar2(64 char) not null,
    name varchar2(128 char) not null,
    module_type varchar2(24 char) not null,
    route_path varchar2(300 char),
    component_code varchar2(128 char),
    icon_code varchar2(64 char),
    sort_order number(10,0) not null,
    status varchar2(24 char) not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    version number(19,0) default 0 not null,
    constraint fk_management_module_tenant foreign key (tenant_id) references tenants(id),
    constraint uk_management_module_tenant_id unique (tenant_id, id),
    constraint fk_management_module_parent_tenant foreign key (tenant_id, parent_id)
        references management_modules(tenant_id, id),
    constraint uk_management_module_code unique (tenant_id, code)
);

create table access_permissions (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    management_module_id number(19,0),
    code varchar2(128 char) not null,
    name varchar2(128 char) not null,
    action_code varchar2(64 char) not null,
    resource_code varchar2(128 char) not null,
    status varchar2(24 char) not null,
    constraint fk_access_permission_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_access_permission_module_tenant foreign key (tenant_id, management_module_id)
        references management_modules(tenant_id, id),
    constraint uk_access_permission_tenant_id unique (tenant_id, id),
    constraint uk_access_permission_code unique (tenant_id, code),
    constraint uk_access_permission_action unique (tenant_id, resource_code, action_code)
);

create table user_role_assignments (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    user_id number(19,0) not null,
    role_id number(19,0) not null,
    organization_id number(19,0),
    department_id number(19,0),
    data_scope_type varchar2(24 char) not null,
    valid_from timestamp with time zone not null,
    valid_to timestamp with time zone,
    granted_by number(19,0),
    created_at timestamp with time zone not null,
    constraint fk_user_role_user_tenant foreign key (tenant_id, user_id)
        references user_accounts(tenant_id, id),
    constraint fk_user_role_role_tenant foreign key (tenant_id, role_id)
        references access_roles(tenant_id, id),
    constraint fk_user_role_organization_tenant foreign key (tenant_id, organization_id)
        references organizations(tenant_id, id),
    constraint fk_user_role_department_tenant foreign key (tenant_id, department_id)
        references organizations(tenant_id, id),
    constraint ck_user_role_department_organization
        check (department_id is null or organization_id is not null)
);

create unique index uk_user_role_period on user_role_assignments
    (tenant_id, user_id, role_id, organization_id, department_id, sys_extract_utc(valid_from));
create index idx_user_role_current on user_role_assignments (tenant_id, user_id, valid_from, valid_to);

create table role_permission_assignments (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    role_id number(19,0) not null,
    permission_id number(19,0) not null,
    valid_from timestamp with time zone not null,
    valid_to timestamp with time zone,
    granted_by number(19,0),
    created_at timestamp with time zone not null,
    constraint fk_role_permission_role_tenant foreign key (tenant_id, role_id)
        references access_roles(tenant_id, id),
    constraint fk_role_permission_permission_tenant foreign key (tenant_id, permission_id)
        references access_permissions(tenant_id, id)
);

create unique index uk_role_permission_period on role_permission_assignments
    (tenant_id, role_id, permission_id, sys_extract_utc(valid_from));
create index idx_role_permission_current on role_permission_assignments
    (tenant_id, role_id, valid_from, valid_to);

create table idempotency_records (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    operation_code varchar2(128 char) not null,
    idempotency_key varchar2(200 char) not null,
    request_hash varchar2(128 char) not null,
    resource_type varchar2(128 char),
    resource_id number(19,0),
    status varchar2(24 char) not null,
    response_status number(10,0),
    response_json clob,
    created_at timestamp with time zone not null,
    completed_at timestamp with time zone,
    expires_at timestamp with time zone not null,
    constraint fk_idempotency_tenant foreign key (tenant_id) references tenants(id),
    constraint uk_idempotency_operation unique (tenant_id, operation_code, idempotency_key)
);

create index idx_idempotency_expiry on idempotency_records (expires_at);

alter table user_role_assignments add constraint fk_user_role_granted_by_tenant
    foreign key (tenant_id, granted_by) references user_accounts (tenant_id, id);
alter table role_permission_assignments add constraint fk_role_permission_granted_by_tenant
    foreign key (tenant_id, granted_by) references user_accounts (tenant_id, id);
