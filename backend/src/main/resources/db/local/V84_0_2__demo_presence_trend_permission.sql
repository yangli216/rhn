insert into access_permissions (id, tenant_id, management_module_id, code, name,
    action_code, resource_code, status) values
(362387869896131, 362387869790209, 362387869896025, 'PRESENCE.TREND.READ',
 '查看在线趋势', 'READ', 'PRESENCE_TREND', 'ACTIVE');

insert into role_permission_assignments (id, tenant_id, role_id, permission_id,
    valid_from, valid_to, granted_by, created_at) values
(362387869896231, 362387869790209, 362387869796001, 362387869896131,
 current_timestamp, null, 362387869790222, current_timestamp);
