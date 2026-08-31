insert into management_modules (id, tenant_id, parent_id, code, name, module_type, route_path,
    component_code, icon_code, sort_order, status, created_at, updated_at, version) values
(362387869896024, 362387869790209, 362387869896017, 'ANNOUNCEMENT', '系统公告', 'MODULE',
 '/settings/announcements', 'AnnouncementManagement', 'notification', 65, 'ACTIVE', current_timestamp, current_timestamp, 0);

insert into access_permissions (id, tenant_id, management_module_id, code, name,
    action_code, resource_code, status) values
(362387869896127, 362387869790209, 362387869896024, 'ANNOUNCEMENT.READ',
 '查看系统公告', 'READ', 'ANNOUNCEMENT', 'ACTIVE'),
(362387869896128, 362387869790209, 362387869896024, 'ANNOUNCEMENT.MANAGE',
 '管理系统公告', 'MANAGE', 'ANNOUNCEMENT', 'ACTIVE');

insert into role_permission_assignments (id, tenant_id, role_id, permission_id,
    valid_from, valid_to, granted_by, created_at) values
(362387869896227, 362387869790209, 362387869796001, 362387869896127,
 current_timestamp, null, 362387869790222, current_timestamp),
(362387869896228, 362387869790209, 362387869796001, 362387869896128,
 current_timestamp, null, 362387869790222, current_timestamp);
