alter table user_role_assignments add constraint ck_user_role_data_scope
    check (
        (data_scope_type = 'TENANT' and organization_id is null and department_id is null) or
        (data_scope_type = 'ORGANIZATION' and organization_id is not null and department_id is null) or
        (data_scope_type = 'DEPARTMENT' and organization_id is not null and department_id is not null)
    );

create table iam_authorization_events (
    id bigint primary key,
    tenant_id bigint not null,
    event_type varchar(64) not null,
    target_type varchar(64) not null,
    target_id bigint not null,
    actor_id bigint,
    details_json text,
    occurred_at timestamp with time zone not null,
    constraint fk_iam_event_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_iam_event_actor_tenant foreign key (tenant_id, actor_id)
        references user_accounts(tenant_id, id)
);

create index idx_iam_event_target on iam_authorization_events
    (tenant_id, target_type, target_id, occurred_at);

create index idx_access_permission_module on access_permissions
    (tenant_id, management_module_id, status);
