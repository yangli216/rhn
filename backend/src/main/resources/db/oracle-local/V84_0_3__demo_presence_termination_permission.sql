insert into access_permissions (id, tenant_id, management_module_id, code, name,
    action_code, resource_code, status) values
(362387869896132, 362387869790209, 362387869896025, 'PRESENCE.SESSION.TERMINATE',
 '强制在线用户下线', 'TERMINATE', 'PRESENCE_SESSION', 'ACTIVE');

insert into access_roles (id, tenant_id, code, name, role_type, status,
    created_at, updated_at, version) values
(362387869896140, 362387869790209, 'PRESENCE_ADMIN', '在线会话管理员',
 'ADMIN', 'ACTIVE', current_timestamp, current_timestamp, 0);

insert into user_role_assignments (id, tenant_id, user_id, role_id,
    organization_id, department_id, data_scope_type, valid_from, valid_to,
    granted_by, created_at) values
(362387869896240, 362387869790209, 362387869790222, 362387869896140,
 null, null, 'TENANT', current_timestamp, null, 362387869790222, current_timestamp);

insert into role_permission_assignments (id, tenant_id, role_id, permission_id,
    valid_from, valid_to, granted_by, created_at) values
(362387869896232, 362387869790209, 362387869896140, 362387869896132,
 current_timestamp, null, 362387869790222, current_timestamp);
