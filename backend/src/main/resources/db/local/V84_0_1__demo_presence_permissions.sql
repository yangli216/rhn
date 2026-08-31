insert into management_modules (id, tenant_id, parent_id, code, name, module_type, route_path,
    component_code, icon_code, sort_order, status, created_at, updated_at, version) values
(362387869896025, 362387869790209, 362387869896017, 'PRESENCE', '在线用户', 'MODULE',
 '/settings/presence', 'PresenceManagement', 'user', 67, 'ACTIVE', current_timestamp, current_timestamp, 0);

insert into access_permissions (id, tenant_id, management_module_id, code, name,
    action_code, resource_code, status) values
(362387869896129, 362387869790209, 362387869896025, 'PRESENCE.SUMMARY.READ',
 '查看在线人数', 'READ', 'PRESENCE_SUMMARY', 'ACTIVE'),
(362387869896130, 362387869790209, 362387869896025, 'PRESENCE.USER.READ',
 '查看在线用户', 'READ', 'PRESENCE_USER', 'ACTIVE');

insert into role_permission_assignments (id, tenant_id, role_id, permission_id,
    valid_from, valid_to, granted_by, created_at) values
(362387869896229, 362387869790209, 362387869796001, 362387869896129,
 current_timestamp, null, 362387869790222, current_timestamp),
(362387869896230, 362387869790209, 362387869796001, 362387869896130,
 current_timestamp, null, 362387869790222, current_timestamp);
