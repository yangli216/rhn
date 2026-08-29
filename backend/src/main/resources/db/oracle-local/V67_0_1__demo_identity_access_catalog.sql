insert into management_modules (
    id, tenant_id, parent_id, code, name, module_type, route_path, component_code,
    icon_code, sort_order, status, created_at, updated_at, version
) values (
    362387869896021, 362387869790209, null, 'IAM', '角色与权限', 'MODULE',
    '/settings/access-control', 'AccessControlManagement', 'settings', 64, 'ACTIVE',
    current_timestamp, current_timestamp, 0
);

insert into access_permissions (
    id, tenant_id, management_module_id, code, name, action_code, resource_code, status
) values (
    362387869896117, 362387869790209, 362387869896021, 'IAM.MANAGE',
    '管理角色与授权', 'MANAGE', 'IAM', 'ACTIVE'
);

insert into role_permission_assignments (
    id, tenant_id, role_id, permission_id, valid_from, valid_to, granted_by, created_at
) values (
    362387869896217, 362387869790209, 362387869796001, 362387869896117,
    current_timestamp, null, 362387869790222, current_timestamp
);
